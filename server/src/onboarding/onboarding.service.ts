import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OnboardingRequestStatus,
  OnboardingRequestType,
  RoleType,
} from '@prisma/client';

import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async listDepartments(user: AuthUserContext) {
    this.assertUserIsUnlinked(user);

    return this.prisma.department.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        kind: true,
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async findCandidates(
    user: AuthUserContext,
    departmentId: string,
    rawQuery: string,
  ) {
    this.assertUserIsUnlinked(user);

    const query = rawQuery.trim();
    if (query.length < 3) {
      throw new BadRequestException(
        'Enter at least 3 characters of the employee name',
      );
    }

    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { id: true },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return this.prisma.employee.findMany({
      where: {
        departmentId,
        isActive: true,
        userId: null,
        displayName: {
          contains: query,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        displayName: true,
        departmentId: true,
      },
      orderBy: [{ position: 'asc' }, { displayName: 'asc' }],
      take: 10,
    });
  }

  async requestExistingEmployeeLink(
    user: AuthUserContext,
    employeeId: string,
  ) {
    this.assertUserIsUnlinked(user);
    await this.assertNoPendingRequest(user.id);

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        isActive: true,
      },
      select: {
        id: true,
        displayName: true,
        departmentId: true,
        userId: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (employee.userId) {
      throw new ConflictException(
        'This employee profile is already linked to an account',
      );
    }

    return this.prisma.onboardingRequest.create({
      data: {
        userId: user.id,
        type: OnboardingRequestType.LINK_EXISTING,
        departmentId: employee.departmentId,
        employeeId: employee.id,
      },
      select: this.requestSelect(),
    });
  }

  async requestNewEmployeeRegistration(
    user: AuthUserContext,
    rawDisplayName: string,
    departmentId: string,
  ) {
    this.assertUserIsUnlinked(user);
    await this.assertNoPendingRequest(user.id);

    const displayName = rawDisplayName.trim().replace(/\s+/g, ' ');
    if (displayName.length < 3 || displayName.length > 160) {
      throw new BadRequestException(
        'Employee display name must be between 3 and 160 characters',
      );
    }

    const department = await this.prisma.department.findFirst({
      where: {
        id: departmentId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return this.prisma.onboardingRequest.create({
      data: {
        userId: user.id,
        type: OnboardingRequestType.CREATE_EMPLOYEE,
        departmentId,
        requestedDisplayName: displayName,
      },
      select: this.requestSelect(),
    });
  }

  async getMyStatus(user: AuthUserContext) {
    return this.prisma.onboardingRequest.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: this.requestSelect(),
    });
  }

  async cancelMyPendingRequest(user: AuthUserContext) {
    const pending = await this.prisma.onboardingRequest.findFirst({
      where: {
        userId: user.id,
        status: OnboardingRequestStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pending) {
      throw new NotFoundException('Pending onboarding request not found');
    }

    return this.prisma.onboardingRequest.update({
      where: { id: pending.id },
      data: { status: OnboardingRequestStatus.CANCELED },
      select: this.requestSelect(),
    });
  }

  async listAdminDepartments(admin: AuthUserContext) {
    const isSuperAdmin = admin.memberships.some(
      (membership) => membership.role === RoleType.SUPER_ADMIN,
    );

    const departmentIds = Array.from(
      new Set(
        admin.memberships
          .filter(
            (membership) =>
              membership.role === RoleType.DEPARTMENT_ADMIN &&
              membership.departmentId,
          )
          .map((membership) => membership.departmentId as string),
      ),
    );

    if (!isSuperAdmin && departmentIds.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to review onboarding requests',
      );
    }

    return this.prisma.department.findMany({
      where: {
        isActive: true,
        ...(isSuperAdmin ? {} : { id: { in: departmentIds } }),
      },
      select: {
        id: true,
        name: true,
        kind: true,
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async listPendingForDepartment(
    admin: AuthUserContext,
    departmentId: string,
  ) {
    this.authorization.assertCanAdministerDepartment(admin, departmentId);

    return this.prisma.onboardingRequest.findMany({
      where: {
        departmentId,
        status: OnboardingRequestStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        ...this.requestSelect(),
        user: {
          select: {
            id: true,
            phoneE164: true,
          },
        },
        employee: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });
  }

  async approve(admin: AuthUserContext, requestId: string) {
    const request = await this.prisma.onboardingRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Onboarding request not found');
    }

    this.authorization.assertCanAdministerDepartment(
      admin,
      request.departmentId,
    );

    if (request.status !== OnboardingRequestStatus.PENDING) {
      throw new ConflictException('Onboarding request is already resolved');
    }

    return this.prisma.$transaction(async (tx) => {
      const requester = await tx.user.findUnique({
        where: { id: request.userId },
        include: { employee: true },
      });

      if (!requester || !requester.isActive) {
        throw new ConflictException('Requester account is not active');
      }

      if (requester.employee) {
        throw new ConflictException(
          'Requester account is already linked to an employee',
        );
      }

      let employee: {
        id: string;
        displayName: string;
        departmentId: string;
      };

      if (request.type === OnboardingRequestType.LINK_EXISTING) {
        if (!request.employeeId) {
          throw new ConflictException(
            'Existing employee request has no employee target',
          );
        }

        const target = await tx.employee.findUnique({
          where: { id: request.employeeId },
        });

        if (!target || !target.isActive) {
          throw new ConflictException('Employee profile is not active');
        }

        if (target.userId) {
          throw new ConflictException(
            'Employee profile is already linked to another account',
          );
        }

        employee = await tx.employee.update({
          where: { id: target.id },
          data: { userId: requester.id },
          select: {
            id: true,
            displayName: true,
            departmentId: true,
          },
        });
      } else {
        if (!request.requestedDisplayName) {
          throw new ConflictException(
            'Registration request has no employee name',
          );
        }

        employee = await tx.employee.create({
          data: {
            displayName: request.requestedDisplayName,
            departmentId: request.departmentId,
            userId: requester.id,
            employmentRate: 1,
          },
          select: {
            id: true,
            displayName: true,
            departmentId: true,
          },
        });
      }

      const existingMembership = await tx.membership.findFirst({
        where: {
          userId: requester.id,
          departmentId: employee.departmentId,
          role: RoleType.EMPLOYEE,
          isActive: true,
        },
      });

      if (!existingMembership) {
        await tx.membership.create({
          data: {
            userId: requester.id,
            departmentId: employee.departmentId,
            role: RoleType.EMPLOYEE,
          },
        });
      }

      const resolved = await tx.onboardingRequest.update({
        where: { id: request.id },
        data: {
          status: OnboardingRequestStatus.APPROVED,
          reviewedByUserId: admin.id,
          reviewedAt: new Date(),
        },
        select: this.requestSelect(),
      });

      return {
        request: resolved,
        employee,
      };
    });
  }

  async reject(admin: AuthUserContext, requestId: string) {
    const request = await this.prisma.onboardingRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Onboarding request not found');
    }

    this.authorization.assertCanAdministerDepartment(
      admin,
      request.departmentId,
    );

    if (request.status !== OnboardingRequestStatus.PENDING) {
      throw new ConflictException('Onboarding request is already resolved');
    }

    return this.prisma.onboardingRequest.update({
      where: { id: request.id },
      data: {
        status: OnboardingRequestStatus.REJECTED,
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
      },
      select: this.requestSelect(),
    });
  }

  private assertUserIsUnlinked(user: AuthUserContext): void {
    if (user.employee) {
      throw new ConflictException(
        'Account is already linked to an employee profile',
      );
    }
  }

  private async assertNoPendingRequest(userId: string): Promise<void> {
    const pending = await this.prisma.onboardingRequest.findFirst({
      where: {
        userId,
        status: OnboardingRequestStatus.PENDING,
      },
      select: { id: true },
    });

    if (pending) {
      throw new ConflictException(
        'Account already has a pending onboarding request',
      );
    }
  }

  private requestSelect() {
    return {
      id: true,
      type: true,
      status: true,
      departmentId: true,
      employeeId: true,
      requestedDisplayName: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
}
