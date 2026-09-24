import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  DepartmentKind,
  OnboardingRequestStatus,
  Prisma,
  RoleType,
  ShiftChangeRequestStatus,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import { AuthUserContext } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

export interface DepartmentMutationInput {
  name?: unknown;
  kind?: unknown;
  expectedUpdatedAt?: unknown;
}

export interface DepartmentReorderInput {
  orderedDepartmentIds?: unknown;
  expectedUpdatedAtByDepartmentId?: unknown;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }
  return value.trim();
}

function requireDepartmentName(value: unknown): string {
  const name = requireString(value, 'name');
  if (name.length < 2 || name.length > 80) {
    throw new BadRequestException('name must contain between 2 and 80 characters');
  }
  return name;
}

function optionalDepartmentName(value: unknown): string | undefined {
  return value === undefined ? undefined : requireDepartmentName(value);
}

function optionalDepartmentKind(value: unknown): DepartmentKind | undefined {
  if (value === undefined) return undefined;

  if (
    value !== DepartmentKind.GENERAL &&
    value !== DepartmentKind.FO &&
    value !== DepartmentKind.NIGHT
  ) {
    throw new BadRequestException('kind must be GENERAL, FO, or NIGHT');
  }

  return value;
}

function requireDepartmentOrder(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException(
      'orderedDepartmentIds must be a non-empty array',
    );
  }

  const ids = value.map((item) =>
    requireString(item, 'orderedDepartmentIds'),
  );

  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException(
      'orderedDepartmentIds must not contain duplicates',
    );
  }

  return ids;
}

function requireExpectedUpdatedAt(value: unknown): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException('Department expectedUpdatedAt is required');
  }

  const normalized = value.trim();
  const isoDateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  const parsed = new Date(normalized);

  if (!isoDateTimePattern.test(normalized) || Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      'Department expectedUpdatedAt must be an ISO date-time',
    );
  }

  return parsed;
}

function requireExpectedUpdatedAtMap(
  value: unknown,
  departmentIds: string[],
): Record<string, Date> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(
      'expectedUpdatedAtByDepartmentId must be an object',
    );
  }

  const raw = value as Record<string, unknown>;
  const expected: Record<string, Date> = {};

  departmentIds.forEach((departmentId) => {
    expected[departmentId] = requireExpectedUpdatedAt(raw[departmentId]);
  });

  return expected;
}

function assertSuperAdmin(user: AuthUserContext): void {
  const isSuperAdmin = user.memberships.some(
    (membership) => membership.role === RoleType.SUPER_ADMIN,
  );

  if (!isSuperAdmin) {
    throw new ForbiddenException(
      'Only Super Admin can modify department structure',
    );
  }
}

const departmentSelect = {
  id: true,
  name: true,
  kind: true,
  position: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DepartmentSelect;

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createDepartment(
    user: AuthUserContext,
    input: DepartmentMutationInput,
  ) {
    assertSuperAdmin(user);

    const name = requireDepartmentName(input.name);
    const kind = optionalDepartmentKind(input.kind) ?? DepartmentKind.GENERAL;

    return this.prisma.$transaction(
      async (tx) => {
        const lastDepartment = await tx.department.findFirst({
          where: { isActive: true },
          orderBy: [{ position: 'desc' }, { createdAt: 'desc' }],
          select: { position: true },
        });

        return tx.department.create({
          data: {
            name,
            kind,
            position: (lastDepartment?.position ?? -1) + 1,
          },
          select: departmentSelect,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async updateDepartment(
    user: AuthUserContext,
    departmentId: string,
    input: DepartmentMutationInput,
  ) {
    assertSuperAdmin(user);

    const normalizedDepartmentId = requireString(
      departmentId,
      'departmentId',
    );
    const expectedUpdatedAt = requireExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );
    const name = optionalDepartmentName(input.name);
    const kind = optionalDepartmentKind(input.kind);

    if (name === undefined && kind === undefined) {
      throw new BadRequestException(
        'At least one Department field must be provided',
      );
    }

    const current = await this.prisma.department.findFirst({
      where: {
        id: normalizedDepartmentId,
        isActive: true,
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    if (!current) {
      throw new NotFoundException('Department not found');
    }

    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConflictException(
        'Department changed after it was loaded',
      );
    }

    const result = await this.prisma.department.updateMany({
      where: {
        id: normalizedDepartmentId,
        isActive: true,
        updatedAt: expectedUpdatedAt,
      },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(kind !== undefined ? { kind } : {}),
      },
    });

    if (result.count !== 1) {
      throw new ConflictException(
        'Department changed during update',
      );
    }

    const updated = await this.prisma.department.findFirst({
      where: {
        id: normalizedDepartmentId,
        isActive: true,
      },
      select: departmentSelect,
    });

    if (!updated) {
      throw new ConflictException(
        'Department became unavailable after update',
      );
    }

    return updated;
  }

  async deactivateDepartment(
    user: AuthUserContext,
    departmentId: string,
    input: DepartmentMutationInput,
  ) {
    assertSuperAdmin(user);

    const normalizedDepartmentId = requireString(
      departmentId,
      'departmentId',
    );
    const expectedUpdatedAt = requireExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );

    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.department.findFirst({
          where: {
            id: normalizedDepartmentId,
            isActive: true,
          },
          select: {
            id: true,
            updatedAt: true,
          },
        });

        if (!current) {
          throw new NotFoundException('Department not found');
        }

        if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          throw new ConflictException(
            'Department changed after it was loaded',
          );
        }

        const [
          activeDepartmentCount,
          activeEmployeeCount,
          activeMembershipCount,
          pendingOnboardingCount,
          activeShiftChangeCount,
        ] = await Promise.all([
          tx.department.count({
            where: { isActive: true },
          }),
          tx.employee.count({
            where: {
              departmentId: normalizedDepartmentId,
              isActive: true,
            },
          }),
          tx.membership.count({
            where: {
              departmentId: normalizedDepartmentId,
              isActive: true,
            },
          }),
          tx.onboardingRequest.count({
            where: {
              departmentId: normalizedDepartmentId,
              status: OnboardingRequestStatus.PENDING,
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
                { requesterDepartmentId: normalizedDepartmentId },
                { targetDepartmentId: normalizedDepartmentId },
              ],
            },
          }),
        ]);

        if (activeDepartmentCount <= 1) {
          throw new ConflictException(
            'At least one active Department must remain',
          );
        }

        if (activeEmployeeCount > 0) {
          throw new ConflictException(
            'Move or deactivate active Employees before deactivating Department',
          );
        }

        if (activeMembershipCount > 0) {
          throw new ConflictException(
            'Remove active Department memberships before deactivating Department',
          );
        }

        if (pendingOnboardingCount > 0) {
          throw new ConflictException(
            'Resolve pending onboarding requests before deactivating Department',
          );
        }

        if (activeShiftChangeCount > 0) {
          throw new ConflictException(
            'Resolve active shift-change requests before deactivating Department',
          );
        }

        const result = await tx.department.updateMany({
          where: {
            id: normalizedDepartmentId,
            isActive: true,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            isActive: false,
          },
        });

        if (result.count !== 1) {
          throw new ConflictException(
            'Department changed during deactivation',
          );
        }

        await appendAuditLog(tx, {
          actorUserId: user.id,
          action: AuditAction.DEPARTMENT_DEACTIVATED,
          entityType: AuditEntityType.DEPARTMENT,
          entityId: normalizedDepartmentId,
          departmentId: normalizedDepartmentId,
        });

        return {
          status: 'ok' as const,
          departmentId: normalizedDepartmentId,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async reorderDepartments(
    user: AuthUserContext,
    input: DepartmentReorderInput,
  ) {
    assertSuperAdmin(user);

    const orderedDepartmentIds = requireDepartmentOrder(
      input.orderedDepartmentIds,
    );
    const expectedUpdatedAtByDepartmentId = requireExpectedUpdatedAtMap(
      input.expectedUpdatedAtByDepartmentId,
      orderedDepartmentIds,
    );

    return this.prisma.$transaction(
      async (tx) => {
        const currentDepartments = await tx.department.findMany({
          where: { isActive: true },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            updatedAt: true,
          },
        });

        const currentIds = currentDepartments.map(
          (department) => department.id,
        );
        const currentSet = new Set(currentIds);
        const requestedSet = new Set(orderedDepartmentIds);

        if (
          currentIds.length !== orderedDepartmentIds.length ||
          currentIds.some(
            (departmentId) => !requestedSet.has(departmentId),
          ) ||
          orderedDepartmentIds.some(
            (departmentId) => !currentSet.has(departmentId),
          )
        ) {
          throw new ConflictException(
            'Department list changed after it was loaded',
          );
        }

        for (const department of currentDepartments) {
          const expectedUpdatedAt =
            expectedUpdatedAtByDepartmentId[department.id];
          if (
            department.updatedAt.getTime() !== expectedUpdatedAt.getTime()
          ) {
            throw new ConflictException(
              'Department changed after it was loaded',
            );
          }
        }

        for (
          let position = 0;
          position < orderedDepartmentIds.length;
          position++
        ) {
          const departmentId = orderedDepartmentIds[position];
          const updateResult = await tx.department.updateMany({
            where: {
              id: departmentId,
              isActive: true,
              updatedAt:
                expectedUpdatedAtByDepartmentId[departmentId],
            },
            data: { position },
          });

          if (updateResult.count !== 1) {
            throw new ConflictException(
              'Department changed during reorder',
            );
          }
        }

        return {
          status: 'ok' as const,
          reordered: orderedDepartmentIds.length,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  listManageable(user: AuthUserContext) {
    const isSuperAdmin = user.memberships.some(
      (membership) => membership.role === RoleType.SUPER_ADMIN,
    );

    const departmentIds = Array.from(
      new Set(
        user.memberships
          .filter(
            (membership) =>
              membership.role === RoleType.DEPARTMENT_ADMIN &&
              membership.departmentId !== null,
          )
          .map((membership) => membership.departmentId as string),
      ),
    );

    if (!isSuperAdmin && departmentIds.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to manage departments',
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
        position: true,
        updatedAt: true,
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }
}
