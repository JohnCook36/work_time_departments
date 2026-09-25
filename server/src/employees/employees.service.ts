import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  EmployeeScheduleMode,
  OnboardingRequestStatus,
  PermissionCapability,
  ShiftChangeRequestStatus,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

const SHIFT_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED_RATES = new Set([1, 0.75, 0.5]);

export interface EmployeeMutationInput {
  displayName?: unknown;
  departmentId?: unknown;
  employmentRate?: unknown;
  scheduleMode?: unknown;
  fixedStartTime?: unknown;
  fixedEndTime?: unknown;
  expectedUpdatedAt?: unknown;
}

export interface EmployeeReorderInput {
  departmentId?: unknown;
  orderedEmployeeIds?: unknown;
  expectedUpdatedAtByEmployeeId?: unknown;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }

  return value.trim();
}

function optionalName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const name = requireString(value, 'displayName');
  if (name.length < 2 || name.length > 160) {
    throw new BadRequestException(
      'displayName must contain between 2 and 160 characters',
    );
  }
  return name;
}

function optionalRate(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !ALLOWED_RATES.has(value)) {
    throw new BadRequestException('employmentRate must be 1, 0.75, or 0.5');
  }
  return value;
}

function optionalScheduleMode(
  value: unknown,
): EmployeeScheduleMode | undefined {
  if (value === undefined) return undefined;
  if (
    value !== EmployeeScheduleMode.FLEXIBLE &&
    value !== EmployeeScheduleMode.FIXED_WEEKDAYS
  ) {
    throw new BadRequestException(
      'scheduleMode must be FLEXIBLE or FIXED_WEEKDAYS',
    );
  }
  return value;
}

function optionalTime(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !SHIFT_TIME_PATTERN.test(value)) {
    throw new BadRequestException(field + ' must use HH:MM format');
  }
  return value;
}

function requireExpectedUpdatedAt(value: unknown): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException('expectedUpdatedAt is required');
  }

  const normalized = value.trim();
  const isoDateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  const parsed = new Date(normalized);

  if (!isoDateTimePattern.test(normalized) || Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('expectedUpdatedAt must be an ISO date-time');
  }

  return parsed;
}

function requireEmployeeOrder(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('orderedEmployeeIds must be a non-empty array');
  }

  const ids = value.map((item) => requireString(item, 'orderedEmployeeIds'));
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException('orderedEmployeeIds must not contain duplicates');
  }

  return ids;
}

function requireExpectedUpdatedAtMap(
  value: unknown,
  employeeIds: string[],
): Record<string, Date> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(
      'expectedUpdatedAtByEmployeeId must be an object',
    );
  }

  const raw = value as Record<string, unknown>;
  const expected: Record<string, Date> = {};

  employeeIds.forEach((employeeId) => {
    expected[employeeId] = requireExpectedUpdatedAt(raw[employeeId]);
  });

  return expected;
}

function normalizeWorkPattern(input: {
  scheduleMode: EmployeeScheduleMode;
  fixedStartTime: string | null;
  fixedEndTime: string | null;
}) {
  if (input.scheduleMode === EmployeeScheduleMode.FLEXIBLE) {
    return {
      scheduleMode: EmployeeScheduleMode.FLEXIBLE,
      fixedStartTime: null,
      fixedEndTime: null,
    };
  }

  if (!input.fixedStartTime || !input.fixedEndTime) {
    throw new BadRequestException(
      'fixedStartTime and fixedEndTime are required for FIXED_WEEKDAYS',
    );
  }

  if (input.fixedStartTime === input.fixedEndTime) {
    throw new BadRequestException(
      'fixedStartTime and fixedEndTime must be different',
    );
  }

  return input;
}

function serializeEmployee(employee: {
  id: string;
  displayName: string;
  employmentRate: number;
  scheduleMode: EmployeeScheduleMode;
  fixedStartTime: string | null;
  fixedEndTime: string | null;
  departmentId: string;
  position: number;
  isActive: boolean;
  userId: string | null;
  updatedAt: Date;
}) {
  return {
    id: employee.id,
    displayName: employee.displayName,
    employmentRate: employee.employmentRate,
    scheduleMode: employee.scheduleMode,
    fixedStartTime: employee.fixedStartTime,
    fixedEndTime: employee.fixedEndTime,
    departmentId: employee.departmentId,
    position: employee.position,
    isActive: employee.isActive,
    isLinked: employee.userId !== null,
    updatedAt: employee.updatedAt.toISOString(),
  };
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async listDepartmentEmployees(
    admin: AuthUserContext,
    departmentId: string,
  ) {
    this.authorization.assertCapability(
      admin,
      PermissionCapability.EMPLOYEE_MANAGE,
      departmentId,
    );

    await this.assertActiveDepartment(departmentId);

    const employees = await this.prisma.employee.findMany({
      where: {
        departmentId,
        isActive: true,
      },
      orderBy: [{ position: 'asc' }, { displayName: 'asc' }],
      select: {
        id: true,
        displayName: true,
        employmentRate: true,
        scheduleMode: true,
        fixedStartTime: true,
        fixedEndTime: true,
        departmentId: true,
        position: true,
        isActive: true,
        userId: true,
        updatedAt: true,
      },
    });

    return employees.map(serializeEmployee);
  }

  async createEmployee(
    admin: AuthUserContext,
    input: EmployeeMutationInput,
  ) {
    const displayName = optionalName(input.displayName);
    if (!displayName) {
      throw new BadRequestException('displayName is required');
    }

    const departmentId = requireString(input.departmentId, 'departmentId');
    this.authorization.assertCapability(
      admin,
      PermissionCapability.EMPLOYEE_MANAGE,
      departmentId,
    );
    await this.assertActiveDepartment(departmentId);

    const employmentRate = optionalRate(input.employmentRate) ?? 1;
    const scheduleMode =
      optionalScheduleMode(input.scheduleMode) ??
      EmployeeScheduleMode.FLEXIBLE;
    const fixedStartTime =
      optionalTime(input.fixedStartTime, 'fixedStartTime') ?? null;
    const fixedEndTime =
      optionalTime(input.fixedEndTime, 'fixedEndTime') ?? null;
    const workPattern = normalizeWorkPattern({
      scheduleMode,
      fixedStartTime,
      fixedEndTime,
    });

    const lastEmployee = await this.prisma.employee.findFirst({
      where: { departmentId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const employee = await this.prisma.employee.create({
      data: {
        displayName,
        departmentId,
        employmentRate,
        position: (lastEmployee?.position ?? -1) + 1,
        ...workPattern,
      },
      select: {
        id: true,
        displayName: true,
        employmentRate: true,
        scheduleMode: true,
        fixedStartTime: true,
        fixedEndTime: true,
        departmentId: true,
        position: true,
        isActive: true,
        userId: true,
        updatedAt: true,
      },
    });

    return serializeEmployee(employee);
  }

  async reorderEmployees(
    admin: AuthUserContext,
    input: EmployeeReorderInput,
  ) {
    const departmentId = requireString(input.departmentId, 'departmentId');
    const orderedEmployeeIds = requireEmployeeOrder(input.orderedEmployeeIds);
    const expectedUpdatedAtByEmployeeId = requireExpectedUpdatedAtMap(
      input.expectedUpdatedAtByEmployeeId,
      orderedEmployeeIds,
    );

    this.authorization.assertCapability(
      admin,
      PermissionCapability.EMPLOYEE_MANAGE,
      departmentId,
    );
    await this.assertActiveDepartment(departmentId);

    return this.prisma.$transaction(async (tx) => {
      const currentEmployees = await tx.employee.findMany({
        where: {
          departmentId,
          isActive: true,
        },
        orderBy: [{ position: 'asc' }, { displayName: 'asc' }],
        select: {
          id: true,
          updatedAt: true,
        },
      });

      const currentIds = currentEmployees.map((employee) => employee.id);
      const currentSet = new Set(currentIds);
      const requestedSet = new Set(orderedEmployeeIds);

      if (
        currentIds.length !== orderedEmployeeIds.length ||
        currentIds.some((employeeId) => !requestedSet.has(employeeId)) ||
        orderedEmployeeIds.some((employeeId) => !currentSet.has(employeeId))
      ) {
        throw new ConflictException(
          'Employee list changed after it was loaded',
        );
      }

      for (const employee of currentEmployees) {
        const expectedUpdatedAt = expectedUpdatedAtByEmployeeId[employee.id];
        if (
          employee.updatedAt.getTime() !== expectedUpdatedAt.getTime()
        ) {
          throw new ConflictException(
            'Employee changed after it was loaded',
          );
        }
      }

      for (let position = 0; position < orderedEmployeeIds.length; position++) {
        const employeeId = orderedEmployeeIds[position];
        const updateResult = await tx.employee.updateMany({
          where: {
            id: employeeId,
            departmentId,
            isActive: true,
            updatedAt: expectedUpdatedAtByEmployeeId[employeeId],
          },
          data: { position },
        });

        if (updateResult.count !== 1) {
          throw new ConflictException(
            'Employee changed during reorder',
          );
        }
      }

      return { status: 'ok' as const, reordered: orderedEmployeeIds.length };
    });
  }

  async deactivateEmployee(
    admin: AuthUserContext,
    employeeId: string,
    input: EmployeeMutationInput,
  ) {
    const expectedUpdatedAt = requireExpectedUpdatedAt(input.expectedUpdatedAt);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          departmentId: true,
          isActive: true,
          userId: true,
          updatedAt: true,
          user: {
            select: {
              memberships: {
                where: { isActive: true },
                select: {
                  role: true,
                  departmentId: true,
                  permissions: {
                    select: {
                      capability: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!existing || !existing.isActive) {
        throw new NotFoundException('Employee not found');
      }

      this.authorization.assertCapability(
        admin,
        PermissionCapability.EMPLOYEE_MANAGE,
        existing.departmentId,
      );

      if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConflictException('Employee changed after it was loaded');
      }

      if (existing.userId === admin.id) {
        throw new ConflictException(
          'You cannot deactivate your own employee profile',
        );
      }

      const targetHasManagementAccess =
        existing.user?.memberships.some(
          membership =>
            membership.role === 'SUPER_ADMIN' ||
            membership.role === 'DEPARTMENT_ADMIN' ||
            membership.permissions.length > 0,
        ) ?? false;

      const adminIsSuperAdmin = this.authorization.isSuperAdmin(admin);

      if (targetHasManagementAccess && !adminIsSuperAdmin) {
        throw new ConflictException(
          'Only Super Admin can deactivate a management account',
        );
      }

      const [pendingOnboardingCount, activeShiftChangeCount] =
        await Promise.all([
          tx.onboardingRequest.count({
            where: {
              status: OnboardingRequestStatus.PENDING,
              OR: [
                { employeeId: existing.id },
                ...(existing.userId ? [{ userId: existing.userId }] : []),
              ],
            },
          }),
          tx.shiftChangeRequest.count({
            where: {
              status: {
                in: [
                  ShiftChangeRequestStatus.PENDING_TARGET,
                  ShiftChangeRequestStatus.PENDING_MANAGER,
                ],
              },
              OR: [
                { requesterEmployeeId: existing.id },
                { targetEmployeeId: existing.id },
              ],
            },
          }),
        ]);

      if (pendingOnboardingCount > 0) {
        throw new ConflictException(
          'Resolve pending onboarding requests before deactivating Employee',
        );
      }

      if (activeShiftChangeCount > 0) {
        throw new ConflictException(
          'Resolve active shift-change requests before deactivating Employee',
        );
      }

      const employeeUpdate = await tx.employee.updateMany({
        where: {
          id: existing.id,
          isActive: true,
          updatedAt: expectedUpdatedAt,
        },
        data: {
          isActive: false,
        },
      });

      if (employeeUpdate.count !== 1) {
        throw new ConflictException('Employee changed during deactivation');
      }

      if (existing.userId) {
        await tx.user.updateMany({
          where: {
            id: existing.userId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        await tx.membership.updateMany({
          where: {
            userId: existing.userId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        await tx.authSession.updateMany({
          where: {
            userId: existing.userId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }

      await appendAuditLog(tx, {
        actorUserId: admin.id,
        action: AuditAction.EMPLOYEE_DEACTIVATED,
        entityType: AuditEntityType.EMPLOYEE,
        entityId: existing.id,
        departmentId: existing.departmentId,
      });

      return {
        status: 'ok' as const,
        employeeId: existing.id,
      };
    });
  }

  async updateEmployee(
    admin: AuthUserContext,
    employeeId: string,
    input: EmployeeMutationInput,
  ) {
    const expectedUpdatedAt = requireExpectedUpdatedAt(input.expectedUpdatedAt);

    const existing = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        displayName: true,
        employmentRate: true,
        scheduleMode: true,
        fixedStartTime: true,
        fixedEndTime: true,
        departmentId: true,
        isActive: true,
        updatedAt: true,
      },
    });

    if (!existing || !existing.isActive) {
      throw new NotFoundException('Employee not found');
    }

    this.authorization.assertCapability(
      admin,
      PermissionCapability.EMPLOYEE_MANAGE,
      existing.departmentId,
    );

    if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConflictException('Employee changed after it was loaded');
    }

    const requestedDepartmentId =
      input.departmentId === undefined
        ? existing.departmentId
        : requireString(input.departmentId, 'departmentId');

    if (requestedDepartmentId !== existing.departmentId) {
      this.authorization.assertCapability(
        admin,
        PermissionCapability.EMPLOYEE_MANAGE,
        requestedDepartmentId,
      );
      await this.assertActiveDepartment(requestedDepartmentId);

      const activeShiftChangeCount = await this.prisma.shiftChangeRequest.count({
        where: {
          status: {
            in: [
              ShiftChangeRequestStatus.PENDING_TARGET,
              ShiftChangeRequestStatus.PENDING_MANAGER,
            ],
          },
          OR: [
            { requesterEmployeeId: existing.id },
            { targetEmployeeId: existing.id },
          ],
        },
      });

      if (activeShiftChangeCount > 0) {
        throw new ConflictException(
          'Resolve active shift-change requests before moving Employee',
        );
      }
    }

    const displayName = optionalName(input.displayName);
    const employmentRate = optionalRate(input.employmentRate);
    const requestedMode = optionalScheduleMode(input.scheduleMode);
    const requestedStart = optionalTime(input.fixedStartTime, 'fixedStartTime');
    const requestedEnd = optionalTime(input.fixedEndTime, 'fixedEndTime');

    const workPattern = normalizeWorkPattern({
      scheduleMode: requestedMode ?? existing.scheduleMode,
      fixedStartTime:
        requestedStart === undefined
          ? existing.fixedStartTime
          : requestedStart,
      fixedEndTime:
        requestedEnd === undefined ? existing.fixedEndTime : requestedEnd,
    });

    let targetPosition: number | undefined;
    if (requestedDepartmentId !== existing.departmentId) {
      const lastEmployee = await this.prisma.employee.findFirst({
        where: { departmentId: requestedDepartmentId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      targetPosition = (lastEmployee?.position ?? -1) + 1;
    }

    const updateResult = await this.prisma.employee.updateMany({
      where: {
        id: existing.id,
        isActive: true,
        updatedAt: expectedUpdatedAt,
      },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(employmentRate !== undefined ? { employmentRate } : {}),
        ...(requestedDepartmentId !== existing.departmentId
          ? {
              departmentId: requestedDepartmentId,
              position: targetPosition,
            }
          : {}),
        ...workPattern,
      },
    });

    if (updateResult.count !== 1) {
      throw new ConflictException('Employee changed after it was loaded');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: existing.id },
      select: {
        id: true,
        displayName: true,
        employmentRate: true,
        scheduleMode: true,
        fixedStartTime: true,
        fixedEndTime: true,
        departmentId: true,
        position: true,
        isActive: true,
        userId: true,
        updatedAt: true,
      },
    });

    if (!employee || !employee.isActive) {
      throw new ConflictException('Employee changed after it was loaded');
    }

    return serializeEmployee(employee);
  }

  private async assertActiveDepartment(departmentId: string) {
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
  }
}
