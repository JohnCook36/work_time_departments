import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AbsenceType,
  AuditAction,
  AuditEntityType,
  PermissionCapability,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import type { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMENT_MAX = 240;

function parseDateOnly(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new BadRequestException(field + ' must use YYYY-MM-DD');
  }

  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(field + ' must be a valid calendar date');
  }
  return date;
}

function normalizeType(value: unknown): AbsenceType {
  if (
    typeof value !== 'string' ||
    !Object.values(AbsenceType).includes(value as AbsenceType)
  ) {
    throw new BadRequestException('unsupported absence type');
  }
  return value as AbsenceType;
}

function normalizeComment(value: unknown, type: AbsenceType): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestException('comment must be a string');
  }

  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > COMMENT_MAX) {
    throw new BadRequestException('comment is too long');
  }
  if (type === AbsenceType.SICK) {
    throw new BadRequestException(
      'SICK absence does not accept free-text medical details',
    );
  }
  return normalized;
}

function serialize(absence: {
  id: string;
  employeeId: string;
  type: AbsenceType;
  startDate: Date;
  endDate: Date;
  comment: string | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: absence.id,
    employeeId: absence.employeeId,
    type: absence.type,
    startDate: absence.startDate.toISOString().slice(0, 10),
    endDate: absence.endDate.toISOString().slice(0, 10),
    comment: absence.comment,
    status: absence.canceledAt ? ('CANCELED' as const) : ('ACTIVE' as const),
    canceledAt: absence.canceledAt?.toISOString() ?? null,
    createdAt: absence.createdAt.toISOString(),
    updatedAt: absence.updatedAt.toISOString(),
  };
}

@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async listDepartment(
    admin: AuthUserContext,
    departmentId: string,
    from?: string,
    to?: string,
  ) {
    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_READ,
      departmentId,
    );

    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { id: true },
    });
    if (!department) throw new NotFoundException('Department not found');

    const start = from ? parseDateOnly(from, 'from') : undefined;
    const end = to ? parseDateOnly(to, 'to') : undefined;
    if (start && end && end < start) {
      throw new BadRequestException('to must be on or after from');
    }

    const items = await this.prisma.absence.findMany({
      where: {
        employee: { departmentId, isActive: true },
        ...(start || end
          ? {
              AND: [
                ...(end ? [{ startDate: { lte: end } }] : []),
                ...(start ? [{ endDate: { gte: start } }] : []),
              ],
            }
          : {}),
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        employeeId: true,
        type: true,
        startDate: true,
        endDate: true,
        comment: true,
        canceledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return items.map(serialize);
  }

  async create(
    admin: AuthUserContext,
    input: {
      employeeId?: unknown;
      type?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      comment?: unknown;
    },
  ) {
    if (typeof input.employeeId !== 'string' || !input.employeeId.trim()) {
      throw new BadRequestException('employeeId is required');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId.trim(), isActive: true },
      select: { id: true, departmentId: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_EDIT,
      employee.departmentId,
    );

    const type = normalizeType(input.type);
    const startDate = parseDateOnly(input.startDate, 'startDate');
    const endDate = parseDateOnly(input.endDate, 'endDate');
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    const comment = normalizeComment(input.comment, type);

    return this.prisma.$transaction(async tx => {
      const duplicate = await tx.absence.findFirst({
        where: {
          employeeId: employee.id,
          type,
          startDate,
          endDate,
          canceledAt: null,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Same active absence already exists');
      }

      const created = await tx.absence.create({
        data: {
          employeeId: employee.id,
          type,
          startDate,
          endDate,
          comment,
          createdByUserId: admin.id,
          updatedByUserId: admin.id,
        },
        select: {
          id: true,
          employeeId: true,
          type: true,
          startDate: true,
          endDate: true,
          comment: true,
          canceledAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await appendAuditLog(tx, {
        actorUserId: admin.id,
        action: AuditAction.ABSENCE_CREATED,
        entityType: AuditEntityType.ABSENCE,
        entityId: created.id,
        departmentId: employee.departmentId,
      });

      return serialize(created);
    });
  }

  async update(
    admin: AuthUserContext,
    absenceId: string,
    input: {
      type?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      comment?: unknown;
      expectedUpdatedAt?: unknown;
    },
  ) {
    const current = await this.prisma.absence.findUnique({
      where: { id: absenceId },
      select: {
        id: true,
        employeeId: true,
        type: true,
        startDate: true,
        endDate: true,
        comment: true,
        canceledAt: true,
        updatedAt: true,
        employee: { select: { departmentId: true, isActive: true } },
      },
    });
    if (!current || !current.employee.isActive) {
      throw new NotFoundException('Absence not found');
    }
    if (current.canceledAt) {
      throw new ConflictException('Canceled absence cannot be edited');
    }

    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_EDIT,
      current.employee.departmentId,
    );

    if (
      typeof input.expectedUpdatedAt !== 'string' ||
      Number.isNaN(Date.parse(input.expectedUpdatedAt))
    ) {
      throw new BadRequestException('expectedUpdatedAt is required');
    }

    const type =
      input.type === undefined ? current.type : normalizeType(input.type);
    const startDate =
      input.startDate === undefined
        ? current.startDate
        : parseDateOnly(input.startDate, 'startDate');
    const endDate =
      input.endDate === undefined
        ? current.endDate
        : parseDateOnly(input.endDate, 'endDate');
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    const comment =
      input.comment === undefined
        ? current.comment
        : normalizeComment(input.comment, type);

    return this.prisma.$transaction(async tx => {
      const changed = await tx.absence.updateMany({
        where: {
          id: current.id,
          canceledAt: null,
          updatedAt: new Date(input.expectedUpdatedAt as string),
        },
        data: {
          type,
          startDate,
          endDate,
          comment,
          updatedByUserId: admin.id,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Absence changed since it was loaded');
      }

      const updated = await tx.absence.findUniqueOrThrow({
        where: { id: current.id },
        select: {
          id: true,
          employeeId: true,
          type: true,
          startDate: true,
          endDate: true,
          comment: true,
          canceledAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await appendAuditLog(tx, {
        actorUserId: admin.id,
        action: AuditAction.ABSENCE_UPDATED,
        entityType: AuditEntityType.ABSENCE,
        entityId: current.id,
        departmentId: current.employee.departmentId,
      });

      return serialize(updated);
    });
  }

  async cancel(
    admin: AuthUserContext,
    absenceId: string,
    expectedUpdatedAt: string,
  ) {
    if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
      throw new BadRequestException('expectedUpdatedAt is required');
    }

    const current = await this.prisma.absence.findUnique({
      where: { id: absenceId },
      select: {
        id: true,
        canceledAt: true,
        employee: { select: { departmentId: true, isActive: true } },
      },
    });
    if (!current || !current.employee.isActive) {
      throw new NotFoundException('Absence not found');
    }

    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_EDIT,
      current.employee.departmentId,
    );

    if (current.canceledAt) {
      return { status: 'ok' as const, absenceId };
    }

    await this.prisma.$transaction(async tx => {
      const changed = await tx.absence.updateMany({
        where: {
          id: absenceId,
          canceledAt: null,
          updatedAt: new Date(expectedUpdatedAt),
        },
        data: {
          canceledAt: new Date(),
          updatedByUserId: admin.id,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Absence changed since it was loaded');
      }

      await appendAuditLog(tx, {
        actorUserId: admin.id,
        action: AuditAction.ABSENCE_CANCELED,
        entityType: AuditEntityType.ABSENCE,
        entityId: absenceId,
        departmentId: current.employee.departmentId,
      });
    });

    return { status: 'ok' as const, absenceId };
  }
}
