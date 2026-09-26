import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  PermissionCapability,
  Prisma,
  ShiftChangeRequestStatus,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { calculatePlannedShiftHours, getMonthlyProductionNormHours } from '../hours/schedule-hours';
import { PrismaService } from '../prisma/prisma.service';
import { parseSchedulePublicationSnapshot } from '../schedules/schedule-publications.service';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new BadRequestException('date must use YYYY-MM-DD');
  }
  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('date is invalid');
  }
  return date;
}

function assertPeriod(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new BadRequestException('year must be an integer between 1970 and 9999');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException('month must be an integer between 1 and 12');
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class ManagementInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  private async loadCurrentManager(
    tx: Prisma.TransactionClient,
    admin: AuthUserContext,
    departmentId: string,
  ): Promise<AuthUserContext> {
    const current = await tx.user.findUnique({
      where: { id: admin.id },
      select: {
        isActive: true,
        memberships: {
          where: { isActive: true },
          select: {
            id: true,
            role: true,
            departmentId: true,
            permissions: {
              select: { capability: true },
            },
          },
        },
      },
    });

    if (!current?.isActive) {
      throw new ForbiddenException('Manager account is inactive');
    }

    const currentAdmin: AuthUserContext = {
      ...admin,
      memberships: current.memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        departmentId: membership.departmentId,
        permissions: membership.permissions.map(
          (permission) => permission.capability,
        ),
      })),
    };

    this.authorization.assertCapability(
      currentAdmin,
      PermissionCapability.SCHEDULE_EDIT,
      departmentId,
    );
    return currentAdmin;
  }

  private async manageableDepartments(admin: AuthUserContext) {
    if (!this.authorization.hasAnyManagementCapability(admin)) {
      throw new ForbiddenException('Management access is required');
    }

    if (this.authorization.isSuperAdmin(admin)) {
      return this.prisma.department.findMany({
        where: { isActive: true },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, kind: true },
      });
    }

    const departmentIds = this.authorization.departmentIdsForCapability(
      admin,
      PermissionCapability.SCHEDULE_READ,
    );
    if (departmentIds.length === 0) {
      throw new ForbiddenException('Schedule read access is required');
    }

    return this.prisma.department.findMany({
      where: { id: { in: departmentIds }, isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, kind: true },
    });
  }

  async today(admin: AuthUserContext, dateText: string) {
    const date = parseDateOnly(dateText);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const departments = await this.manageableDepartments(admin);
    const departmentIds = departments.map((department) => department.id);

    const schedule = await this.prisma.schedule.findUnique({
      where: { year_month: { year, month } },
      select: { id: true },
    });

    const publications = schedule
      ? await this.prisma.schedulePublication.findMany({
          where: {
            scheduleId: schedule.id,
            departmentId: { in: departmentIds },
          },
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            departmentId: true,
            version: true,
            snapshot: true,
            createdAt: true,
          },
        })
      : [];

    const latestByDepartment = new Map<string, (typeof publications)[number]>();
    for (const publication of publications) {
      if (!latestByDepartment.has(publication.departmentId)) {
        latestByDepartment.set(publication.departmentId, publication);
      }
    }

    const absences = departmentIds.length
      ? await this.prisma.absence.findMany({
          where: {
            canceledAt: null,
            startDate: { lte: date },
            endDate: { gte: date },
            employee: {
              departmentId: { in: departmentIds },
              isActive: true,
            },
          },
          orderBy: [{ employee: { displayName: 'asc' } }],
          select: {
            id: true,
            employeeId: true,
            type: true,
            startDate: true,
            endDate: true,
            comment: true,
            employee: {
              select: {
                displayName: true,
                departmentId: true,
              },
            },
          },
        })
      : [];

    const requests = departmentIds.length
      ? await this.prisma.shiftChangeRequest.findMany({
          where: {
            status: ShiftChangeRequestStatus.PENDING_MANAGER,
            requesterDepartmentId: { in: departmentIds },
            targetDepartmentId: { in: departmentIds },
          },
          orderBy: [{ createdAt: 'asc' }],
          select: {
            id: true,
            kind: true,
            status: true,
            requesterDepartmentId: true,
            targetDepartmentId: true,
            requesterEmployee: { select: { displayName: true } },
            targetEmployee: { select: { displayName: true } },
            requesterShift: {
              select: {
                date: true,
                startTime: true,
                endTime: true,
                code: true,
              },
            },
            targetShift: {
              select: {
                date: true,
                startTime: true,
                endTime: true,
                code: true,
              },
            },
            createdAt: true,
          },
        })
      : [];

    const departmentRows = departments.map((department) => {
      const publication = latestByDepartment.get(department.id);
      const snapshot = publication
        ? parseSchedulePublicationSnapshot(publication.snapshot)
        : null;
      const employeeNames = new Map(
        snapshot?.employees.map((employee) => [
          employee.id,
          employee.displayName,
        ]) ?? [],
      );
      const plannedShifts =
        snapshot?.shifts
          .filter((shift) => shift.date === dateText && !shift.isOff)
          .map((shift) => ({
            id: shift.id,
            employeeId: shift.employeeId,
            displayName: employeeNames.get(shift.employeeId) ?? shift.employeeId,
            date: shift.date,
            code: shift.code,
            startTime: shift.startTime,
            endTime: shift.endTime,
          })) ?? [];

      const departmentAbsences = absences
        .filter((absence) => absence.employee.departmentId === department.id)
        .map((absence) => ({
          id: absence.id,
          employeeId: absence.employeeId,
          displayName: absence.employee.displayName,
          type: absence.type,
          startDate: absence.startDate.toISOString().slice(0, 10),
          endDate: absence.endDate.toISOString().slice(0, 10),
          comment: absence.comment,
        }));

      return {
        id: department.id,
        name: department.name,
        kind: department.kind,
        publication: publication
          ? {
              id: publication.id,
              version: publication.version,
              publishedAt: publication.createdAt.toISOString(),
            }
          : null,
        plannedShifts,
        absences: departmentAbsences,
        riskCount:
          (publication ? 0 : 1) +
          departmentAbsences.length +
          requests.filter(
            (request) =>
              request.requesterDepartmentId === department.id ||
              request.targetDepartmentId === department.id,
          ).length,
      };
    });

    return {
      date: dateText,
      departments: departmentRows,
      pendingRequests: requests.map((request) => ({
        id: request.id,
        kind: request.kind,
        status: request.status,
        requesterDepartmentId: request.requesterDepartmentId,
        targetDepartmentId: request.targetDepartmentId,
        requesterDisplayName: request.requesterEmployee.displayName,
        targetDisplayName: request.targetEmployee.displayName,
        requesterShift: {
          date: request.requesterShift.date.toISOString().slice(0, 10),
          startTime: request.requesterShift.startTime,
          endTime: request.requesterShift.endTime,
          code: request.requesterShift.code,
        },
        targetShift: request.targetShift
          ? {
              date: request.targetShift.date.toISOString().slice(0, 10),
              startTime: request.targetShift.startTime,
              endTime: request.targetShift.endTime,
              code: request.targetShift.code,
            }
          : null,
        createdAt: request.createdAt.toISOString(),
      })),
      totals: {
        plannedShifts: departmentRows.reduce(
          (sum, department) => sum + department.plannedShifts.length,
          0,
        ),
        activeAbsences: absences.length,
        pendingRequests: requests.length,
        unpublishedDepartments: departmentRows.filter(
          (department) => !department.publication,
        ).length,
      },
      attendanceAvailable: false,
    };
  }

  async upsertHoursNorm(
    admin: AuthUserContext,
    departmentId: string,
    year: number,
    month: number,
    fullTimeHours: number,
  ) {
    assertPeriod(year, month);
    if (!departmentId.trim()) {
      throw new BadRequestException('departmentId is required');
    }
    if (
      typeof fullTimeHours !== 'number' ||
      !Number.isFinite(fullTimeHours) ||
      fullTimeHours < 0 ||
      fullTimeHours > 400
    ) {
      throw new BadRequestException(
        'fullTimeHours must be a number between 0 and 400',
      );
    }

    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_EDIT,
      departmentId,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.loadCurrentManager(tx, admin, departmentId);

      const department = await tx.department.findFirst({
        where: { id: departmentId, isActive: true },
        select: { id: true },
      });
      if (!department) {
        throw new ForbiddenException('Department is unavailable');
      }

      const existing = await tx.departmentHoursNorm.findUnique({
        where: {
          departmentId_year_month: {
            departmentId,
            year,
            month,
          },
        },
        select: { id: true, createdByUserId: true },
      });

      const saved = await tx.departmentHoursNorm.upsert({
        where: {
          departmentId_year_month: {
            departmentId,
            year,
            month,
          },
        },
        create: {
          departmentId,
          year,
          month,
          fullTimeHours,
          createdByUserId: admin.id,
          updatedByUserId: admin.id,
        },
        update: {
          fullTimeHours,
          updatedByUserId: admin.id,
        },
        select: {
          id: true,
          departmentId: true,
          year: true,
          month: true,
          fullTimeHours: true,
          createdByUserId: true,
          updatedByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await appendAuditLog(tx, {
        actorUserId: admin.id,
        action: AuditAction.DEPARTMENT_HOURS_NORM_UPSERTED,
        entityType: AuditEntityType.DEPARTMENT_HOURS_NORM,
        entityId: saved.id,
        departmentId,
      });

      return {
        ...saved,
        fullTimeHours: round(saved.fullTimeHours),
        createdAt: saved.createdAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
        created: !existing,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async hours(
    admin: AuthUserContext,
    year: number,
    month: number,
    departmentId?: string,
  ) {
    assertPeriod(year, month);
    const manageable = await this.manageableDepartments(admin);
    const manageableIds = new Set(manageable.map((department) => department.id));

    if (departmentId && !manageableIds.has(departmentId)) {
      throw new ForbiddenException('Department is outside management scope');
    }

    const selected = departmentId
      ? manageable.filter((department) => department.id === departmentId)
      : manageable;
    const departmentIds = selected.map((department) => department.id);

    const schedule = await this.prisma.schedule.findUnique({
      where: { year_month: { year, month } },
      select: { id: true, updatedAt: true },
    });

    const employees = departmentIds.length
      ? await this.prisma.employee.findMany({
          where: {
            isActive: true,
            departmentId: { in: departmentIds },
          },
          orderBy: [
            { department: { position: 'asc' } },
            { position: 'asc' },
            { displayName: 'asc' },
          ],
          select: {
            id: true,
            displayName: true,
            employmentRate: true,
            departmentId: true,
          },
        })
      : [];

    const employeeIds = employees.map((employee) => employee.id);
    const norms = departmentIds.length
      ? await this.prisma.departmentHoursNorm.findMany({
          where: {
            departmentId: { in: departmentIds },
            year,
            month,
          },
          select: {
            departmentId: true,
            fullTimeHours: true,
            updatedAt: true,
          },
        })
      : [];
    const normByDepartment = new Map(
      norms.map((norm) => [norm.departmentId, norm]),
    );

    const shifts =
      schedule && employeeIds.length
        ? await this.prisma.shift.findMany({
            where: {
              scheduleId: schedule.id,
              employeeId: { in: employeeIds },
              isOff: false,
            },
            orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
            select: {
              id: true,
              employeeId: true,
              startTime: true,
              endTime: true,
              code: true,
            },
          })
        : [];

    const shiftsByEmployee = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      const list = shiftsByEmployee.get(shift.employeeId) ?? [];
      list.push(shift);
      shiftsByEmployee.set(shift.employeeId, list);
    }

    const employeeRows = employees.map((employee) => {
      let dayHours = 0;
      let nightHours = 0;
      let plannedHours = 0;
      let shiftCount = 0;

      for (const shift of shiftsByEmployee.get(employee.id) ?? []) {
        if (!shift.startTime || !shift.endTime) continue;
        const hours = calculatePlannedShiftHours(
          shift.startTime,
          shift.endTime,
          shift.code,
        );
        dayHours += hours.day;
        nightHours += hours.night;
        plannedHours += hours.total;
        shiftCount += 1;
      }

      const productionNormHours = getMonthlyProductionNormHours(
        year,
        month,
        employee.employmentRate,
      );
      const departmentNorm = normByDepartment.get(employee.departmentId);
      const departmentNormHours = departmentNorm
        ? round(departmentNorm.fullTimeHours * employee.employmentRate)
        : null;
      const comparisonNormHours =
        departmentNormHours ?? productionNormHours;
      const deltaHours = round(plannedHours - comparisonNormHours);

      return {
        id: employee.id,
        displayName: employee.displayName,
        departmentId: employee.departmentId,
        employmentRate: employee.employmentRate,
        shiftCount,
        dayHours: round(dayHours),
        nightHours: round(nightHours),
        plannedHours: round(plannedHours),
        productionNormHours,
        departmentNormHours,
        comparisonNormHours,
        deltaHours,
        status:
          Math.abs(deltaHours) < 0.01
            ? ('balanced' as const)
            : deltaHours > 0
              ? ('over' as const)
              : ('under' as const),
      };
    });

    const departmentRows = selected.map((department) => {
      const rows = employeeRows.filter(
        (employee) => employee.departmentId === department.id,
      );
      const plannedHours = round(
        rows.reduce((sum, employee) => sum + employee.plannedHours, 0),
      );
      const productionNormHours = round(
        rows.reduce((sum, employee) => sum + employee.productionNormHours, 0),
      );
      const departmentNormHours = normByDepartment.has(department.id)
        ? round(
            rows.reduce(
              (sum, employee) =>
                sum + (employee.departmentNormHours ?? 0),
              0,
            ),
          )
        : null;
      const comparisonNormHours =
        departmentNormHours ?? productionNormHours;
      const deltaHours = round(plannedHours - comparisonNormHours);
      return {
        id: department.id,
        name: department.name,
        kind: department.kind,
        employeeCount: rows.length,
        plannedHours,
        productionNormHours,
        departmentNormHours,
        comparisonNormHours,
        normUpdatedAt:
          normByDepartment.get(department.id)?.updatedAt.toISOString() ?? null,
        deltaHours,
        outsideNormCount: rows.filter(
          (employee) => employee.status !== 'balanced',
        ).length,
      };
    });

    return {
      period: { year, month },
      schedule: schedule
        ? { id: schedule.id, updatedAt: schedule.updatedAt.toISOString() }
        : null,
      departmentNormConfigured: norms.length > 0,
      departments: departmentRows,
      employees: employeeRows,
    };
  }
}
