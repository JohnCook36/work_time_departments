import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionCapability, Prisma } from '@prisma/client';

import type { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import {
  businessTimeZone,
  localBusinessDateTime,
  publishedShiftInterval,
} from '../hours/business-time';
import { comparePlanActual } from '../hours/plan-actual';
import { PrismaService } from '../prisma/prisma.service';
import { parseSchedulePublicationSnapshot } from '../schedules/schedule-publications.service';

function assertPeriod(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new BadRequestException('Invalid year');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException('Invalid month');
  }
}

function monthDate(year: number, month: number): string {
  return year + '-' + String(month).padStart(2, '0') + '-01';
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function overlapMs(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date | null,
): number {
  const effectiveEndB = endB ?? new Date(8.64e15);
  return Math.max(
    0,
    Math.min(endA.getTime(), effectiveEndB.getTime()) -
      Math.max(startA.getTime(), startB.getTime()),
  );
}

@Injectable()
export class PlanActualService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  private async currentUser(
    tx: Prisma.TransactionClient,
    user: AuthUserContext,
  ): Promise<AuthUserContext> {
    const current = await tx.user.findUnique({
      where: { id: user.id },
      select: {
        isActive: true,
        memberships: {
          where: { isActive: true },
          select: {
            id: true,
            role: true,
            departmentId: true,
            permissions: { select: { capability: true } },
          },
        },
      },
    });
    if (!current?.isActive) {
      throw new ForbiddenException('Manager account is inactive');
    }
    return {
      ...user,
      memberships: current.memberships.map(membership => ({
        id: membership.id,
        role: membership.role,
        departmentId: membership.departmentId,
        permissions: membership.permissions.map(item => item.capability),
      })),
    };
  }

  async read(
    user: AuthUserContext,
    year: number,
    month: number,
    departmentId?: string,
  ) {
    assertPeriod(year, month);
    const timeZone = businessTimeZone();

    return this.prisma.$transaction(async tx => {
      const current = await this.currentUser(tx, user);
      let departmentIds: string[];

      if (this.authorization.isSuperAdmin(current)) {
        departmentIds = (
          await tx.department.findMany({
            where: { isActive: true },
            select: { id: true },
          })
        ).map(item => item.id);
      } else {
        const scheduleIds = new Set(
          this.authorization.departmentIdsForCapability(
            current,
            PermissionCapability.SCHEDULE_READ,
          ),
        );
        departmentIds = this.authorization
          .departmentIdsForCapability(current, PermissionCapability.ATTENDANCE_READ)
          .filter(id => scheduleIds.has(id));
      }

      if (departmentId) {
        if (!departmentIds.includes(departmentId)) {
          throw new ForbiddenException(
            'Schedule and attendance read access are required',
          );
        }
        departmentIds = [departmentId];
      }
      if (departmentIds.length === 0) {
        throw new ForbiddenException(
          'Schedule and attendance read access are required',
        );
      }

      const departments = await tx.department.findMany({
        where: { id: { in: departmentIds }, isActive: true },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, kind: true },
      });
      const selectedIds = departments.map(item => item.id);

      const schedule = await tx.schedule.findUnique({
        where: { year_month: { year, month } },
        select: { id: true },
      });
      const publications = !schedule
        ? []
        : await tx.schedulePublication.findMany({
            where: {
              scheduleId: schedule.id,
              departmentId: { in: selectedIds },
            },
            orderBy: [{ createdAt: 'desc' }],
            select: {
              id: true,
              departmentId: true,
              version: true,
              snapshot: true,
              createdAt: true,
            },
          });

      const latest = new Map<string, (typeof publications)[number]>();
      for (const publication of publications) {
        if (!latest.has(publication.departmentId)) {
          latest.set(publication.departmentId, publication);
        }
      }

      const next = nextMonth(year, month);
      const rangeStart = localBusinessDateTime(monthDate(year, month), '00:00', timeZone);
      const rangeEnd = localBusinessDateTime(monthDate(next.year, next.month), '00:00', timeZone);
      const sessions = await tx.workSession.findMany({
        where: {
          departmentId: { in: selectedIds },
          checkInAt: { lt: rangeEnd },
          OR: [{ checkOutAt: null }, { checkOutAt: { gt: rangeStart } }],
        },
        orderBy: [{ checkInAt: 'asc' }],
        select: {
          id: true,
          employeeId: true,
          departmentId: true,
          checkInAt: true,
          checkOutAt: true,
          employee: { select: { displayName: true } },
        },
      });

      const matched = new Set<string>();
      const rows = departments.flatMap(department => {
        const publication = latest.get(department.id);
        const snapshot = publication
          ? parseSchedulePublicationSnapshot(publication.snapshot)
          : null;
        if (!publication || !snapshot) return [];

        const names = new Map(
          snapshot.employees.map(employee => [employee.id, employee.displayName]),
        );

        return snapshot.shifts
          .filter(
            shift =>
              !shift.isOff &&
              shift.startTime &&
              shift.endTime &&
              shift.date.startsWith(year + '-' + String(month).padStart(2, '0')),
          )
          .map(shift => {
            const planned = publishedShiftInterval(
              shift.date,
              shift.startTime!,
              shift.endTime!,
              timeZone,
            );
            const candidates = sessions
              .filter(
                session =>
                  !matched.has(session.id) &&
                  session.departmentId === department.id &&
                  session.employeeId === shift.employeeId,
              )
              .map(session => ({
                session,
                overlap: overlapMs(
                  planned.startAt,
                  planned.endAt,
                  session.checkInAt,
                  session.checkOutAt,
                ),
              }))
              .filter(candidate => candidate.overlap > 0)
              .sort((a, b) => b.overlap - a.overlap);
            const actual = candidates[0]?.session ?? null;
            if (actual) matched.add(actual.id);

            return {
              departmentId: department.id,
              departmentName: department.name,
              publicationId: publication.id,
              publicationVersion: publication.version,
              publishedAt: publication.createdAt.toISOString(),
              shiftId: shift.id,
              employeeId: shift.employeeId,
              displayName: names.get(shift.employeeId) ?? shift.employeeId,
              date: shift.date,
              code: shift.code,
              startTime: shift.startTime,
              endTime: shift.endTime,
              workSessionId: actual?.id ?? null,
              ...comparePlanActual(
                planned.startAt,
                planned.endAt,
                actual
                  ? {
                      checkInAt: actual.checkInAt,
                      checkOutAt: actual.checkOutAt,
                    }
                  : null,
                timeZone,
              ),
            };
          });
      });

      return {
        period: { year, month },
        businessTimeZone: timeZone,
        payableAvailable: false,
        rows,
        unplannedSessions: sessions
          .filter(session => !matched.has(session.id))
          .map(session => ({
            id: session.id,
            employeeId: session.employeeId,
            displayName: session.employee.displayName,
            departmentId: session.departmentId,
            checkInAt: session.checkInAt.toISOString(),
            checkOutAt: session.checkOutAt?.toISOString() ?? null,
          })),
      };
    });
  }
}
