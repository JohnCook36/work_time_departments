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
  PermissionCapability,
  Prisma,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import { AuthUserContext } from '../auth/auth.service';
import { isRussiaFiveDayWorkingDay } from '../calendar/productionCalendar';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseSchedulePublicationSnapshot } from './schedule-publications.service';

function assertPeriod(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new BadRequestException('year must be an integer between 1970 and 9999');
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException('month must be an integer between 1 and 12');
  }
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const SHIFT_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED_SHIFT_CODES = new Set(['E', 'IN', 'INN', 'L', 'N']);

export interface ScheduleCellChange {
  employeeId: string;
  day: number;
  type: 'empty' | 'off' | 'shift';
  startTime?: string;
  endTime?: string;
  code?: string | null;
  expectedUpdatedAt?: string | null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function changeKey(employeeId: string, day: number): string {
  return employeeId + ':' + day;
}

function validateCellChange(
  change: ScheduleCellChange,
  year: number,
  month: number,
): void {
  if (!change || typeof change !== 'object') {
    throw new BadRequestException('Each schedule change must be an object');
  }

  if (typeof change.employeeId !== 'string' || change.employeeId.trim() === '') {
    throw new BadRequestException('employeeId is required for every change');
  }

  if (
    !Number.isInteger(change.day) ||
    change.day < 1 ||
    change.day > daysInMonth(year, month)
  ) {
    throw new BadRequestException('day is outside the selected month');
  }

  if (!['empty', 'off', 'shift'].includes(change.type)) {
    throw new BadRequestException('change type must be empty, off, or shift');
  }

  if (change.type === 'shift') {
    if (
      typeof change.startTime !== 'string' ||
      !SHIFT_TIME_PATTERN.test(change.startTime) ||
      typeof change.endTime !== 'string' ||
      !SHIFT_TIME_PATTERN.test(change.endTime)
    ) {
      throw new BadRequestException('shift time must use HH:MM format');
    }

    if (change.startTime === change.endTime) {
      throw new BadRequestException(
        'shift startTime and endTime must be different',
      );
    }

    if (
      change.code != null &&
      (typeof change.code !== 'string' ||
        !ALLOWED_SHIFT_CODES.has(change.code.toUpperCase()))
    ) {
      throw new BadRequestException('unsupported shift code');
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(change, 'expectedUpdatedAt') &&
    change.expectedUpdatedAt !== null &&
    (typeof change.expectedUpdatedAt !== 'string' ||
      Number.isNaN(Date.parse(change.expectedUpdatedAt)))
  ) {
    throw new BadRequestException('expectedUpdatedAt must be ISO date-time or null');
  }
}

function serializeShift(shift: {
  id: string;
  employeeId: string;
  date: Date;
  code: string | null;
  startTime: string | null;
  endTime: string | null;
  isOff: boolean;
  updatedAt: Date;
}) {
  return {
    id: shift.id,
    employeeId: shift.employeeId,
    date: dateOnly(shift.date),
    code: shift.code,
    startTime: shift.startTime,
    endTime: shift.endTime,
    isOff: shift.isOff,
    updatedAt: shift.updatedAt.toISOString(),
  };
}

function serializePlannerEmployee(employee: {
  id: string;
  displayName: string;
  employmentRate: number;
  scheduleMode: string;
  fixedStartTime: string | null;
  fixedEndTime: string | null;
  position: number;
  updatedAt: Date;
}) {
  return {
    id: employee.id,
    displayName: employee.displayName,
    employmentRate: employee.employmentRate,
    scheduleMode: employee.scheduleMode,
    fixedStartTime: employee.fixedStartTime,
    fixedEndTime: employee.fixedEndTime,
    position: employee.position,
    updatedAt: employee.updatedAt.toISOString(),
  };
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  // Explicit planning command: never called by GET/read/render paths.
  async materializeFixedWeekdays(
    admin: AuthUserContext,
    year: number,
    month: number,
    departmentIds: string[],
  ) {
    assertPeriod(year, month);
    if (
      !Array.isArray(departmentIds) ||
      departmentIds.length === 0 ||
      departmentIds.length > 100 ||
      departmentIds.some((id) => typeof id !== 'string' || !id.trim()) ||
      new Set(departmentIds).size !== departmentIds.length
    ) {
      throw new BadRequestException('departmentIds must contain 1–100 unique department ids');
    }
    this.authorization.assertCapabilityForDepartments(
      admin,
      PermissionCapability.SCHEDULE_EDIT,
      departmentIds,
    );
    const today = new Date();
    const earliest = new Date(Date.UTC(
      today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(),
    ));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const departments = await tx.department.findMany({
          where: { id: { in: departmentIds }, isActive: true },
          select: { id: true },
        });
        if (departments.length !== departmentIds.length) {
          throw new NotFoundException('Department not found');
        }
        const employees = await tx.employee.findMany({
          where: {
            departmentId: { in: departmentIds },
            isActive: true,
            scheduleMode: EmployeeScheduleMode.FIXED_WEEKDAYS,
          },
          select: { id: true, fixedStartTime: true, fixedEndTime: true },
        });
        const entries: Array<{ employeeId: string; date: Date; startTime: string; endTime: string }> = [];
        for (const employee of employees) {
          const { fixedStartTime, fixedEndTime } = employee;
          if (
            !fixedStartTime || !fixedEndTime ||
            !SHIFT_TIME_PATTERN.test(fixedStartTime) ||
            !SHIFT_TIME_PATTERN.test(fixedEndTime) ||
            fixedStartTime === fixedEndTime
          ) {
            throw new ConflictException('Employee work pattern is invalid; update the employee first');
          }
          for (let day = 1; day <= daysInMonth(year, month); day++) {
            const date = shiftDate(year, month, day);
            if (date < earliest || !isRussiaFiveDayWorkingDay(year, month - 1, day)) {
              continue;
            }
            entries.push({ employeeId: employee.id, date, startTime: fixedStartTime, endTime: fixedEndTime });
          }
        }
        if (entries.length === 0) return { status: 'ok' as const, created: 0 };

        const schedule = await tx.schedule.upsert({
          where: { year_month: { year, month } },
          create: { year, month }, update: {}, select: { id: true },
        });
        // PostgreSQL ON CONFLICT DO NOTHING uses the existing unique cell key.
        // Never update existing rows: explicit OFF, manual shifts and earlier
        // saved patterns keep their id, times and updatedAt (including history).
        const inserted = await tx.shift.createMany({
          data: entries.map((entry) => ({ ...entry, scheduleId: schedule.id })),
          skipDuplicates: true,
        });
        if (inserted.count > 0) {
          await tx.schedule.update({
            where: { id: schedule.id }, data: { updatedAt: new Date() },
          });

          for (const departmentId of departmentIds) {
            await appendAuditLog(tx, {
              actorUserId: admin.id,
              action: AuditAction.SCHEDULE_CHANGED,
              entityType: AuditEntityType.SCHEDULE,
              entityId: schedule.id,
              departmentId,
            });
          }
        }
        return { status: 'ok' as const, created: inserted.count };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002')
      ) {
        throw new ConflictException('График изменился. Обновите данные и повторите сохранение 5/2.');
      }
      throw error;
    }
  }

  async getDepartmentSchedule(
    admin: AuthUserContext,
    departmentId: string,
    year: number,
    month: number,
  ) {
    assertPeriod(year, month);
    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_READ,
      departmentId,
    );

    const department = await this.prisma.department.findFirst({
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
            position: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: {
        year_month: {
          year,
          month,
        },
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    const shifts = schedule
      ? await this.prisma.shift.findMany({
          where: {
            scheduleId: schedule.id,
            employee: {
              departmentId,
              isActive: true,
            },
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
        })
      : [];

    return {
      period: { year, month },
      schedule: schedule
        ? {
            id: schedule.id,
            updatedAt: schedule.updatedAt.toISOString(),
          }
        : null,
      department: {
        id: department.id,
        name: department.name,
        kind: department.kind,
      },
      employees: department.employees.map(serializePlannerEmployee),
      shifts: shifts.map(serializeShift),
    };
  }


  private validateScheduleChanges(
    changes: ScheduleCellChange[],
    year: number,
    month: number,
  ): string[] {
    if (!Array.isArray(changes) || changes.length === 0) {
      throw new BadRequestException('changes must contain at least one item');
    }

    if (changes.length > 5000) {
      throw new BadRequestException('too many schedule changes in one request');
    }

    const seen = new Set<string>();
    for (const change of changes) {
      validateCellChange(change, year, month);
      const key = changeKey(change.employeeId, change.day);
      if (seen.has(key)) {
        throw new BadRequestException(
          'duplicate schedule change for the same employee and day',
        );
      }
      seen.add(key);
    }

    return Array.from(
      new Set(changes.map((change) => change.employeeId)),
    );
  }

  private async applyScheduleChangesInTransaction(
    tx: Prisma.TransactionClient,
    year: number,
    month: number,
    changes: ScheduleCellChange[],
    employeeIds: string[],
  ) {
    let schedule = await tx.schedule.findUnique({
      where: {
        year_month: { year, month },
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    const hasStoredValues = changes.some(
      (change) => change.type !== 'empty',
    );

    if (!schedule && !hasStoredValues) {
      return {
        status: 'ok' as const,
        applied: changes.length,
        schedule: null,
      };
    }

    if (!schedule) {
      schedule = await tx.schedule.create({
        data: { year, month },
        select: {
          id: true,
          updatedAt: true,
        },
      });
    }

    const existing = await tx.shift.findMany({
      where: {
        scheduleId: schedule.id,
        employeeId: { in: employeeIds },
        date: {
          in: changes.map((change) =>
            shiftDate(year, month, change.day),
          ),
        },
      },
      select: {
        id: true,
        employeeId: true,
        date: true,
        updatedAt: true,
      },
    });

    const existingByKey = new Map(
      existing.map((shift) => [
        changeKey(shift.employeeId, shift.date.getUTCDate()),
        shift,
      ]),
    );

    for (const change of changes) {
      const key = changeKey(change.employeeId, change.day);
      const current = existingByKey.get(key);

      if (
        Object.prototype.hasOwnProperty.call(change, 'expectedUpdatedAt')
      ) {
        if (change.expectedUpdatedAt === null && current) {
          throw new ConflictException(
            'Schedule cell changed since it was loaded',
          );
        }

        if (
          typeof change.expectedUpdatedAt === 'string' &&
          (!current ||
            current.updatedAt.toISOString() !== change.expectedUpdatedAt)
        ) {
          throw new ConflictException(
            'Schedule cell changed since it was loaded',
          );
        }
      }

      const date = shiftDate(year, month, change.day);

      if (change.type === 'empty') {
        await tx.shift.deleteMany({
          where: {
            scheduleId: schedule.id,
            employeeId: change.employeeId,
            date,
          },
        });
        continue;
      }

      const data =
        change.type === 'off'
          ? {
              code: null,
              startTime: null,
              endTime: null,
              isOff: true,
            }
          : {
              code: change.code ? change.code.toUpperCase() : null,
              startTime: change.startTime!,
              endTime: change.endTime!,
              isOff: false,
            };

      await tx.shift.upsert({
        where: {
          scheduleId_employeeId_date: {
            scheduleId: schedule.id,
            employeeId: change.employeeId,
            date,
          },
        },
        create: {
          scheduleId: schedule.id,
          employeeId: change.employeeId,
          date,
          ...data,
        },
        update: data,
      });
    }

    const updatedSchedule = await tx.schedule.update({
      where: { id: schedule.id },
      data: { updatedAt: new Date() },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    return {
      status: 'ok' as const,
      applied: changes.length,
      schedule: {
        id: updatedSchedule.id,
        updatedAt: updatedSchedule.updatedAt.toISOString(),
      },
    };
  }

  async applyDepartmentScheduleChanges(
    admin: AuthUserContext,
    departmentId: string,
    year: number,
    month: number,
    changes: ScheduleCellChange[],
  ) {
    assertPeriod(year, month);
    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_EDIT,
      departmentId,
    );

    const employeeIds = this.validateScheduleChanges(
      changes,
      year,
      month,
    );

    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
        departmentId,
        isActive: true,
      },
      select: { id: true },
    });

    if (employees.length !== employeeIds.length) {
      throw new BadRequestException(
        'one or more employees do not belong to this department',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await this.applyScheduleChangesInTransaction(
        tx,
        year,
        month,
        changes,
        employeeIds,
      );

      if (result.schedule) {
        await appendAuditLog(tx, {
          actorUserId: admin.id,
          action: AuditAction.SCHEDULE_CHANGED,
          entityType: AuditEntityType.SCHEDULE,
          entityId: result.schedule.id,
          departmentId,
        });
      }

      return result;
    });
  }

  async applyPlannerScheduleChanges(
    admin: AuthUserContext,
    year: number,
    month: number,
    changes: ScheduleCellChange[],
  ) {
    assertPeriod(year, month);

    const employeeIds = this.validateScheduleChanges(
      changes,
      year,
      month,
    );

    return this.prisma.$transaction(async (tx) => {
      const employees = await tx.employee.findMany({
        where: {
          id: { in: employeeIds },
          isActive: true,
        },
        select: {
          id: true,
          departmentId: true,
        },
      });

      if (employees.length !== employeeIds.length) {
        throw new BadRequestException(
          'one or more employees are not active planner employees',
        );
      }

      this.authorization.assertCapabilityForDepartments(
        admin,
        PermissionCapability.SCHEDULE_EDIT,
        employees.map((employee) => employee.departmentId),
      );

      const result = await this.applyScheduleChangesInTransaction(
        tx,
        year,
        month,
        changes,
        employeeIds,
      );

      if (result.schedule) {
        const departmentIds = Array.from(
          new Set(employees.map((employee) => employee.departmentId)),
        );
        for (const departmentId of departmentIds) {
          await appendAuditLog(tx, {
            actorUserId: admin.id,
            action: AuditAction.SCHEDULE_CHANGED,
            entityType: AuditEntityType.SCHEDULE,
            entityId: result.schedule.id,
            departmentId,
          });
        }
      }

      return result;
    });
  }

  async getMySchedule(user: AuthUserContext, year: number, month: number) {
    assertPeriod(year, month);

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
      },
      select: {
        id: true,
        displayName: true,
        employmentRate: true,
        scheduleMode: true,
        fixedStartTime: true,
        fixedEndTime: true,
        department: {
          select: {
            id: true,
            name: true,
            kind: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Linked employee profile is not active');
    }

    const currentEmployeePayload = {
      id: employee.id,
      displayName: employee.displayName,
      employmentRate: employee.employmentRate,
      scheduleMode: employee.scheduleMode,
      fixedStartTime: employee.fixedStartTime,
      fixedEndTime: employee.fixedEndTime,
      department: employee.department,
    };

    const schedule = await this.prisma.schedule.findUnique({
      where: {
        year_month: {
          year,
          month,
        },
      },
      select: {
        id: true,
      },
    });

    if (!schedule) {
      return {
        period: { year, month },
        schedule: null,
        employee: currentEmployeePayload,
        shifts: [],
      };
    }

    const publication = await this.prisma.schedulePublication.findFirst({
      where: {
        scheduleId: schedule.id,
        departmentId: employee.department.id,
      },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        createdAt: true,
        snapshot: true,
      },
    });

    if (!publication) {
      return {
        period: { year, month },
        schedule: null,
        employee: currentEmployeePayload,
        shifts: [],
      };
    }

    const snapshot = parseSchedulePublicationSnapshot(publication.snapshot);
    if (!snapshot) {
      throw new ConflictException(
        'Published schedule snapshot is invalid',
      );
    }

    const publishedEmployee = snapshot.employees.find(
      (candidate) => candidate.id === employee.id,
    );

    if (!publishedEmployee) {
      return {
        period: { year, month },
        schedule: null,
        employee: currentEmployeePayload,
        shifts: [],
      };
    }

    return {
      period: { year, month },
      schedule: {
        id: publication.id,
        updatedAt: publication.createdAt.toISOString(),
      },
      employee: {
        id: publishedEmployee.id,
        displayName: publishedEmployee.displayName,
        employmentRate: publishedEmployee.employmentRate,
        scheduleMode: publishedEmployee.scheduleMode,
        fixedStartTime: publishedEmployee.fixedStartTime,
        fixedEndTime: publishedEmployee.fixedEndTime,
        department: snapshot.department,
      },
      shifts: snapshot.shifts.filter(
        (shift) => shift.employeeId === employee.id,
      ),
    };
  }
}
