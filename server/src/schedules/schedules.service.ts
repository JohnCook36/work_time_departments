import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async getDepartmentSchedule(
    admin: AuthUserContext,
    departmentId: string,
    year: number,
    month: number,
  ) {
    assertPeriod(year, month);
    this.authorization.assertCanAdministerDepartment(admin, departmentId);

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
            position: true,
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
      employees: department.employees,
      shifts: shifts.map(serializeShift),
    };
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
            employeeId: employee.id,
          },
          orderBy: { date: 'asc' },
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
      employee: {
        id: employee.id,
        displayName: employee.displayName,
        employmentRate: employee.employmentRate,
        department: employee.department,
      },
      shifts: shifts.map(serializeShift),
    };
  }
}
