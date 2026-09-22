import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, RoleType } from '@prisma/client';

import { AuthUserContext } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async reorderDepartments(
    user: AuthUserContext,
    input: DepartmentReorderInput,
  ) {
    const isSuperAdmin = user.memberships.some(
      (membership) => membership.role === RoleType.SUPER_ADMIN,
    );

    if (!isSuperAdmin) {
      throw new ForbiddenException(
        'Only Super Admin can reorder departments',
      );
    }

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
