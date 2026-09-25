import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  PermissionCapability,
  Prisma,
} from '@prisma/client';

import type { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditQueryInput {
  departmentId?: unknown;
  action?: unknown;
  entityType?: unknown;
  from?: unknown;
  to?: unknown;
  cursor?: unknown;
  limit?: unknown;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Invalid query parameter');
  }
  return value.trim();
}

function optionalEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): T | undefined {
  const normalized = optionalText(value);
  if (!normalized) return undefined;
  if (!values.includes(normalized as T)) {
    throw new BadRequestException(field + ' is invalid');
  }
  return normalized as T;
}

function optionalDate(value: unknown, field: string): Date | undefined {
  const normalized = optionalText(value);
  if (!normalized) return undefined;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(field + ' must be ISO date-time');
  }
  return parsed;
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (
    typeof parsed !== 'number' ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_LIMIT
  ) {
    throw new BadRequestException('limit must be an integer between 1 and 100');
  }
  return parsed;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(user: AuthUserContext, input: AuditQueryInput) {
    const requestedDepartmentId = optionalText(input.departmentId);
    const action = optionalEnum(
      input.action,
      Object.values(AuditAction),
      'action',
    );
    const entityType = optionalEnum(
      input.entityType,
      Object.values(AuditEntityType),
      'entityType',
    );
    const from = optionalDate(input.from, 'from');
    const to = optionalDate(input.to, 'to');
    const cursor = optionalText(input.cursor);
    const limit = parseLimit(input.limit);

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('from must not be after to');
    }

    const scopeWhere = this.scopeWhere(user, requestedDepartmentId);

    let cursorBoundary:
      | {
          id: string;
          createdAt: Date;
        }
      | undefined;

    if (cursor) {
      const cursorRow = await this.prisma.auditLog.findFirst({
        where: {
          id: cursor,
          ...scopeWhere,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });
      if (!cursorRow) {
        throw new NotFoundException('Audit cursor not found in current scope');
      }
      cursorBoundary = cursorRow;
    }

    const where: Prisma.AuditLogWhereInput = {
      ...scopeWhere,
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...((from || to)
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(cursorBoundary
        ? {
            OR: [
              { createdAt: { lt: cursorBoundary.createdAt } },
              {
                createdAt: cursorBoundary.createdAt,
                id: { lt: cursorBoundary.id },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        departmentId: true,
        createdAt: true,
      },
    });

    const pageRows = rows.slice(0, limit);
    const actorIds = [...new Set(pageRows.map(row => row.actorUserId))];
    const actors =
      actorIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: {
              id: true,
              employee: {
                select: { displayName: true },
              },
            },
          });
    const actorLabels = new Map(
      actors.map(actor => [
        actor.id,
        actor.employee?.displayName ?? 'Администратор',
      ]),
    );

    return {
      items: pageRows.map(row => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        departmentId: row.departmentId,
        actorLabel: actorLabels.get(row.actorUserId) ?? 'Администратор',
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit ? pageRows.at(-1)?.id ?? null : null,
    };
  }

  private scopeWhere(
    user: AuthUserContext,
    requestedDepartmentId?: string,
  ): Prisma.AuditLogWhereInput {
    if (requestedDepartmentId) {
      this.authorization.assertCapability(
        user,
        PermissionCapability.AUDIT_READ,
        requestedDepartmentId,
      );
      return { departmentId: requestedDepartmentId };
    }

    if (this.authorization.isSuperAdmin(user)) {
      return {};
    }

    const departmentIds = this.authorization.departmentIdsForCapability(
      user,
      PermissionCapability.AUDIT_READ,
    );
    if (departmentIds.length === 0) {
      throw new ForbiddenException('Audit read access is required');
    }

    return {
      departmentId: { in: departmentIds },
    };
  }
}
