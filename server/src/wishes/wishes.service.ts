import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PermissionCapability } from '@prisma/client';

import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

export interface WishMutationInput {
  employeeId?: unknown;
  year?: unknown;
  month?: unknown;
  day?: unknown;
  text?: unknown;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }
  return value.trim();
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadRequestException(field + ' must be an integer');
  }
  return value;
}

function assertPeriod(year: number, month: number): void {
  if (year < 1970 || year > 9999) {
    throw new BadRequestException('year must be between 1970 and 9999');
  }

  if (month < 1 || month > 12) {
    throw new BadRequestException('month must be between 1 and 12');
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function optionalDay(
  value: unknown,
  year: number,
  month: number,
): number | null {
  if (value === null || value === undefined) return null;

  const day = requireInteger(value, 'day');
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new BadRequestException('day is outside the selected month');
  }

  return day;
}

function requireText(value: unknown): string {
  const text = requireString(value, 'text');
  if (text.length > 1000) {
    throw new BadRequestException('text must not exceed 1000 characters');
  }
  return text;
}

function serializeWish(wish: {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  day: number | null;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: wish.id,
    employeeId: wish.employeeId,
    year: wish.year,
    month: wish.month,
    day: wish.day,
    text: wish.text,
    createdAt: wish.createdAt.toISOString(),
    updatedAt: wish.updatedAt.toISOString(),
  };
}

@Injectable()
export class WishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async listDepartmentWishes(
    admin: AuthUserContext,
    departmentId: string,
    year: number,
    month: number,
  ) {
    assertPeriod(year, month);
    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_EDIT,
      departmentId,
    );

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

    const wishes = await this.prisma.employeeWish.findMany({
      where: {
        year,
        month,
        employee: {
          departmentId,
          isActive: true,
        },
      },
      orderBy: [
        { employeeId: 'asc' },
        { day: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        employeeId: true,
        year: true,
        month: true,
        day: true,
        text: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return wishes.map(serializeWish);
  }

  async createWish(
    admin: AuthUserContext,
    input: WishMutationInput,
  ) {
    const employeeId = requireString(input.employeeId, 'employeeId');
    const year = requireInteger(input.year, 'year');
    const month = requireInteger(input.month, 'month');
    assertPeriod(year, month);
    const day = optionalDay(input.day, year, month);
    const text = requireText(input.text);

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        isActive: true,
        department: {
          isActive: true,
        },
      },
      select: {
        id: true,
        departmentId: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_EDIT,
      employee.departmentId,
    );

    const wish = await this.prisma.employeeWish.create({
      data: {
        employeeId,
        year,
        month,
        day,
        text,
      },
      select: {
        id: true,
        employeeId: true,
        year: true,
        month: true,
        day: true,
        text: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return serializeWish(wish);
  }

  async deleteWish(
    admin: AuthUserContext,
    wishId: string,
  ) {
    const normalizedWishId = requireString(wishId, 'wishId');

    const wish = await this.prisma.employeeWish.findUnique({
      where: { id: normalizedWishId },
      select: {
        id: true,
        employee: {
          select: {
            departmentId: true,
            isActive: true,
            department: {
              select: {
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (
      !wish ||
      !wish.employee.isActive ||
      !wish.employee.department.isActive
    ) {
      throw new NotFoundException('Wish not found');
    }

    this.authorization.assertCapability(
      admin,
      PermissionCapability.SCHEDULE_EDIT,
      wish.employee.departmentId,
    );

    await this.prisma.employeeWish.delete({
      where: { id: wish.id },
    });

    return {
      status: 'ok' as const,
      wishId: wish.id,
    };
  }
}
