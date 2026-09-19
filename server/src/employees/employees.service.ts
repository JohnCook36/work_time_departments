import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeScheduleMode } from '@prisma/client';

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
    this.authorization.assertCanAdministerDepartment(admin, departmentId);

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
    this.authorization.assertCanAdministerDepartment(admin, departmentId);
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

  async updateEmployee(
    admin: AuthUserContext,
    employeeId: string,
    input: EmployeeMutationInput,
  ) {
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
      },
    });

    if (!existing || !existing.isActive) {
      throw new NotFoundException('Employee not found');
    }

    this.authorization.assertCanAdministerDepartment(
      admin,
      existing.departmentId,
    );

    const requestedDepartmentId =
      input.departmentId === undefined
        ? existing.departmentId
        : requireString(input.departmentId, 'departmentId');

    if (requestedDepartmentId !== existing.departmentId) {
      this.authorization.assertCanAdministerDepartment(
        admin,
        requestedDepartmentId,
      );
      await this.assertActiveDepartment(requestedDepartmentId);
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

    const employee = await this.prisma.employee.update({
      where: { id: existing.id },
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
