import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionCapability } from '@prisma/client';

import type { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseSchedulePublicationSnapshot } from './schedule-publications.service';

export type ScheduleAcknowledgementStatus =
  | 'ACKNOWLEDGED'
  | 'NOT_ACKNOWLEDGED'
  | 'NO_ACTIVE_ACCOUNT';

@Injectable()
export class ScheduleAcknowledgementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async acknowledge(
    user: AuthUserContext,
    publicationId: string,
  ) {
    const employee = await this.requireCurrentEmployee(user);
    const publication = await this.requirePublication(publicationId);
    const snapshot = parseSchedulePublicationSnapshot(publication.snapshot);

    if (!snapshot) {
      throw new ConflictException('Published schedule snapshot is invalid');
    }

    if (!snapshot.employees.some(candidate => candidate.id === employee.id)) {
      throw new ForbiddenException(
        'Employee is not part of this published schedule',
      );
    }

    const acknowledgement = await this.prisma.scheduleAcknowledgement.upsert({
      where: {
        publicationId_employeeId: {
          publicationId: publication.id,
          employeeId: employee.id,
        },
      },
      create: {
        publicationId: publication.id,
        employeeId: employee.id,
        acknowledgedByUserId: user.id,
      },
      update: {},
      select: {
        id: true,
        publicationId: true,
        employeeId: true,
        acknowledgedAt: true,
      },
    });

    return {
      ...acknowledgement,
      acknowledgedAt: acknowledgement.acknowledgedAt.toISOString(),
    };
  }

  async getOwnStatus(
    user: AuthUserContext,
    publicationId: string,
  ) {
    const employee = await this.requireCurrentEmployee(user);
    const publication = await this.requirePublication(publicationId);
    const snapshot = parseSchedulePublicationSnapshot(publication.snapshot);

    if (!snapshot) {
      throw new ConflictException('Published schedule snapshot is invalid');
    }

    if (!snapshot.employees.some(candidate => candidate.id === employee.id)) {
      throw new ForbiddenException(
        'Employee is not part of this published schedule',
      );
    }

    const acknowledgement =
      await this.prisma.scheduleAcknowledgement.findUnique({
        where: {
          publicationId_employeeId: {
            publicationId: publication.id,
            employeeId: employee.id,
          },
        },
        select: { acknowledgedAt: true },
      });

    return {
      publicationId: publication.id,
      employeeId: employee.id,
      status: acknowledgement
        ? ('ACKNOWLEDGED' as const)
        : ('NOT_ACKNOWLEDGED' as const),
      acknowledgedAt: acknowledgement?.acknowledgedAt.toISOString() ?? null,
    };
  }

  async listPublicationStatuses(
    admin: AuthUserContext,
    publicationId: string,
  ) {
    const publication = await this.requirePublication(publicationId);

    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_READ,
      publication.departmentId,
    );

    const snapshot = parseSchedulePublicationSnapshot(publication.snapshot);
    if (!snapshot) {
      throw new ConflictException('Published schedule snapshot is invalid');
    }

    const employeeIds = snapshot.employees.map(employee => employee.id);
    const [currentEmployees, acknowledgements] = await Promise.all([
      employeeIds.length === 0
        ? Promise.resolve([])
        : this.prisma.employee.findMany({
            where: { id: { in: employeeIds } },
            select: {
              id: true,
              isActive: true,
              userId: true,
              user: { select: { isActive: true } },
            },
          }),
      this.prisma.scheduleAcknowledgement.findMany({
        where: { publicationId: publication.id },
        select: {
          employeeId: true,
          acknowledgedAt: true,
        },
      }),
    ]);

    const currentByEmployee = new Map(
      currentEmployees.map(employee => [employee.id, employee]),
    );
    const acknowledgementByEmployee = new Map(
      acknowledgements.map(item => [item.employeeId, item.acknowledgedAt]),
    );

    return {
      publicationId: publication.id,
      departmentId: publication.departmentId,
      version: publication.version,
      employees: snapshot.employees.map(employee => {
        const acknowledgedAt = acknowledgementByEmployee.get(employee.id);
        const current = currentByEmployee.get(employee.id);
        const hasActiveAccount = Boolean(
          current?.isActive &&
            current.userId &&
            current.user?.isActive,
        );

        const status: ScheduleAcknowledgementStatus = acknowledgedAt
          ? 'ACKNOWLEDGED'
          : hasActiveAccount
            ? 'NOT_ACKNOWLEDGED'
            : 'NO_ACTIVE_ACCOUNT';

        return {
          employeeId: employee.id,
          displayName: employee.displayName,
          status,
          acknowledgedAt: acknowledgedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  private async requireCurrentEmployee(user: AuthUserContext) {
    if (!user.employee) {
      throw new ConflictException(
        'Account is not linked to an employee profile',
      );
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: user.employee.id,
        userId: user.id,
        isActive: true,
        user: { isActive: true },
      },
      select: { id: true },
    });

    if (!employee) {
      throw new ForbiddenException('Active linked employee required');
    }

    return employee;
  }

  private async requirePublication(publicationId: string) {
    const publication = await this.prisma.schedulePublication.findUnique({
      where: { id: publicationId },
      select: {
        id: true,
        departmentId: true,
        version: true,
        snapshot: true,
      },
    });

    if (!publication) {
      throw new NotFoundException('Published schedule version not found');
    }

    return publication;
  }
}
