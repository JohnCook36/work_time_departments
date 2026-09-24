import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  Prisma,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PublishedEmployeeSnapshot {
  id: string;
  displayName: string;
  employmentRate: number;
  scheduleMode: string;
  fixedStartTime: string | null;
  fixedEndTime: string | null;
}

export interface PublishedShiftSnapshot {
  id: string;
  employeeId: string;
  date: string;
  code: string | null;
  startTime: string | null;
  endTime: string | null;
  isOff: boolean;
  updatedAt: string;
}

export interface SchedulePublicationSnapshot {
  department: {
    id: string;
    name: string;
    kind: string;
  };
  employees: PublishedEmployeeSnapshot[];
  shifts: PublishedShiftSnapshot[];
}

interface DiffEntry<T> {
  key: string;
  before: T | null;
  after: T | null;
}

export interface SchedulePublicationDiff {
  employees: Array<DiffEntry<PublishedEmployeeSnapshot>>;
  shifts: Array<DiffEntry<PublishedShiftSnapshot>>;
}

function assertPeriod(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new BadRequestException('year must be an integer between 1970 and 9999');
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException('month must be an integer between 1 and 12');
  }
}

function normalizeOptionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(field + ' must be a string');
  }

  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new BadRequestException(field + ' is too long');
  }

  return normalized;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function diffByKey<T>(
  before: T[],
  after: T[],
  keyOf: (value: T) => string,
): Array<DiffEntry<T>> {
  const beforeMap = new Map(before.map((value) => [keyOf(value), value]));
  const afterMap = new Map(after.map((value) => [keyOf(value), value]));
  const keys = Array.from(
    new Set([...beforeMap.keys(), ...afterMap.keys()]),
  ).sort();

  const changes: Array<DiffEntry<T>> = [];
  for (const key of keys) {
    const beforeValue = beforeMap.get(key) ?? null;
    const afterValue = afterMap.get(key) ?? null;
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      continue;
    }

    changes.push({
      key,
      before: beforeValue,
      after: afterValue,
    });
  }

  return changes;
}

function emptySnapshot(
  department: SchedulePublicationSnapshot['department'],
): SchedulePublicationSnapshot {
  return {
    department,
    employees: [],
    shifts: [],
  };
}

function buildDiff(
  before: SchedulePublicationSnapshot,
  after: SchedulePublicationSnapshot,
): SchedulePublicationDiff {
  return {
    employees: diffByKey(
      before.employees,
      after.employees,
      (employee) => employee.id,
    ),
    shifts: diffByKey(
      before.shifts,
      after.shifts,
      (shift) => shift.employeeId + ':' + shift.date,
    ),
  };
}

function hasDiff(diff: SchedulePublicationDiff): boolean {
  return diff.employees.length > 0 || diff.shifts.length > 0;
}

export function parseSchedulePublicationSnapshot(
  value: Prisma.JsonValue,
): SchedulePublicationSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, Prisma.JsonValue>;
  if (
    !candidate.department ||
    typeof candidate.department !== 'object' ||
    Array.isArray(candidate.department) ||
    !Array.isArray(candidate.employees) ||
    !Array.isArray(candidate.shifts)
  ) {
    return null;
  }

  return value as unknown as SchedulePublicationSnapshot;
}

function serializePublication(publication: {
  id: string;
  scheduleId: string;
  departmentId: string;
  version: number;
  publishedByUserId: string;
  sourceScheduleUpdatedAt: Date;
  comment: string | null;
  rulesVersion: string | null;
  snapshot: Prisma.JsonValue;
  diff: Prisma.JsonValue;
  createdAt: Date;
}) {
  return {
    id: publication.id,
    scheduleId: publication.scheduleId,
    departmentId: publication.departmentId,
    version: publication.version,
    publishedByUserId: publication.publishedByUserId,
    sourceScheduleUpdatedAt: publication.sourceScheduleUpdatedAt.toISOString(),
    comment: publication.comment,
    rulesVersion: publication.rulesVersion,
    snapshot: publication.snapshot,
    diff: publication.diff,
    createdAt: publication.createdAt.toISOString(),
  };
}

@Injectable()
export class SchedulePublicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async publishDepartmentSchedule(
    admin: AuthUserContext,
    departmentId: string,
    year: number,
    month: number,
    comment?: string | null,
    rulesVersion?: string | null,
  ) {
    assertPeriod(year, month);
    if (!departmentId.trim()) {
      throw new BadRequestException('departmentId is required');
    }
    this.authorization.assertCanAdministerDepartment(admin, departmentId);

    const normalizedComment = normalizeOptionalText(comment, 'comment', 500);
    const normalizedRulesVersion = normalizeOptionalText(
      rulesVersion,
      'rulesVersion',
      100,
    );

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const department = await tx.department.findFirst({
            where: {
              id: departmentId,
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              kind: true,
              employees: {
                where: { isActive: true },
                orderBy: [{ position: 'asc' }, { displayName: 'asc' }],
                select: {
                  id: true,
                  displayName: true,
                  employmentRate: true,
                  scheduleMode: true,
                  fixedStartTime: true,
                  fixedEndTime: true,
                },
              },
            },
          });

          if (!department) {
            throw new NotFoundException('Department not found');
          }

          const schedule = await tx.schedule.upsert({
            where: {
              year_month: { year, month },
            },
            create: { year, month },
            update: {},
            select: {
              id: true,
              updatedAt: true,
            },
          });

          const employeeIds = department.employees.map(
            (employee) => employee.id,
          );
          const shifts =
            employeeIds.length === 0
              ? []
              : await tx.shift.findMany({
                  where: {
                    scheduleId: schedule.id,
                    employeeId: { in: employeeIds },
                  },
                  orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
                  select: {
                    id: true,
                    employeeId: true,
                    date: true,
                    code: true,
                    startTime: true,
                    endTime: true,
                    isOff: true,
                    updatedAt: true,
                  },
                });

          const snapshot: SchedulePublicationSnapshot = {
            department: {
              id: department.id,
              name: department.name,
              kind: department.kind,
            },
            employees: department.employees.map((employee) => ({
              id: employee.id,
              displayName: employee.displayName,
              employmentRate: employee.employmentRate,
              scheduleMode: employee.scheduleMode,
              fixedStartTime: employee.fixedStartTime,
              fixedEndTime: employee.fixedEndTime,
            })),
            shifts: shifts.map((shift) => ({
              id: shift.id,
              employeeId: shift.employeeId,
              date: dateOnly(shift.date),
              code: shift.code,
              startTime: shift.startTime,
              endTime: shift.endTime,
              isOff: shift.isOff,
              updatedAt: shift.updatedAt.toISOString(),
            })),
          };

          const latest = await tx.schedulePublication.findFirst({
            where: {
              scheduleId: schedule.id,
              departmentId,
            },
            orderBy: { version: 'desc' },
            select: {
              version: true,
              snapshot: true,
            },
          });

          const previousSnapshot = latest
            ? parseSchedulePublicationSnapshot(latest.snapshot)
            : null;
          if (latest && !previousSnapshot) {
            throw new ConflictException(
              'Latest published schedule snapshot is invalid',
            );
          }

          const diff = buildDiff(
            previousSnapshot ?? emptySnapshot(snapshot.department),
            snapshot,
          );

          if (latest && !hasDiff(diff)) {
            throw new ConflictException(
              'There are no unpublished schedule changes',
            );
          }

          const publication = await tx.schedulePublication.create({
            data: {
              scheduleId: schedule.id,
              departmentId,
              version: (latest?.version ?? 0) + 1,
              publishedByUserId: admin.id,
              sourceScheduleUpdatedAt: schedule.updatedAt,
              comment: normalizedComment,
              rulesVersion: normalizedRulesVersion,
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
              diff: diff as unknown as Prisma.InputJsonValue,
            },
            select: {
              id: true,
              scheduleId: true,
              departmentId: true,
              version: true,
              publishedByUserId: true,
              sourceScheduleUpdatedAt: true,
              comment: true,
              rulesVersion: true,
              snapshot: true,
              diff: true,
              createdAt: true,
            },
          });

          await appendAuditLog(tx, {
            actorUserId: admin.id,
            action: AuditAction.SCHEDULE_PUBLISHED,
            entityType: AuditEntityType.SCHEDULE,
            entityId: schedule.id,
            departmentId,
          });

          return serializePublication(publication);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new ConflictException(
          'Schedule publication changed concurrently; refresh and retry',
        );
      }

      throw error;
    }
  }

  async listDepartmentPublications(
    admin: AuthUserContext,
    departmentId: string,
    year: number,
    month: number,
  ) {
    assertPeriod(year, month);
    this.authorization.assertCanAdministerDepartment(admin, departmentId);

    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { year_month: { year, month } },
      select: { id: true },
    });
    if (!schedule) return [];

    const publications = await this.prisma.schedulePublication.findMany({
      where: {
        scheduleId: schedule.id,
        departmentId,
      },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        scheduleId: true,
        departmentId: true,
        version: true,
        publishedByUserId: true,
        sourceScheduleUpdatedAt: true,
        comment: true,
        rulesVersion: true,
        snapshot: true,
        diff: true,
        createdAt: true,
      },
    });

    return publications.map(serializePublication);
  }

  async getDepartmentPublication(
    admin: AuthUserContext,
    departmentId: string,
    year: number,
    month: number,
    version: number,
  ) {
    assertPeriod(year, month);
    if (!Number.isInteger(version) || version < 1) {
      throw new BadRequestException('version must be a positive integer');
    }
    this.authorization.assertCanAdministerDepartment(admin, departmentId);

    const schedule = await this.prisma.schedule.findUnique({
      where: { year_month: { year, month } },
      select: { id: true },
    });
    if (!schedule) {
      throw new NotFoundException('Published schedule version not found');
    }

    const publication = await this.prisma.schedulePublication.findFirst({
      where: {
        scheduleId: schedule.id,
        departmentId,
        version,
      },
      select: {
        id: true,
        scheduleId: true,
        departmentId: true,
        version: true,
        publishedByUserId: true,
        sourceScheduleUpdatedAt: true,
        comment: true,
        rulesVersion: true,
        snapshot: true,
        diff: true,
        createdAt: true,
      },
    });

    if (!publication) {
      throw new NotFoundException('Published schedule version not found');
    }

    return serializePublication(publication);
  }
}
