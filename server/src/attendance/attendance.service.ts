import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  PermissionCapability,
  Prisma,
  WorkSessionEventType,
  WorkSessionSource,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import type { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { issueAttendanceToken, verifyAttendanceToken } from './attendance-token';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;
const sessionInclude = {
  employee: { select: { displayName: true, departmentId: true } },
  events: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      type: true,
      oldCheckInAt: true,
      oldCheckOutAt: true,
      checkInAt: true,
      checkOutAt: true,
      reason: true,
      createdAt: true,
    },
  },
} as const;
type SessionRow = Prisma.WorkSessionGetPayload<{ include: typeof sessionInclude }>;

function iso(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

function serialize(row: SessionRow) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    displayName: row.employee.displayName,
    departmentId: row.employee.departmentId,
    source: row.source,
    checkInAt: row.checkInAt.toISOString(),
    checkOutAt: iso(row.checkOutAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    history: row.events.map(event => ({
      id: event.id,
      type: event.type,
      oldCheckInAt: iso(event.oldCheckInAt),
      oldCheckOutAt: iso(event.oldCheckOutAt),
      checkInAt: event.checkInAt.toISOString(),
      checkOutAt: iso(event.checkOutAt),
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new BadRequestException(field + ' must use YYYY-MM-DD');
  }
  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(field + ' is invalid');
  }
  return date;
}

function range(from: unknown, to: unknown) {
  const start = parseDate(from, 'from');
  const end = parseDate(to, 'to');
  const until = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  if (until <= start || until.getTime() - start.getTime() > MAX_DAYS * 24 * 60 * 60 * 1000) {
    throw new BadRequestException('Attendance range must be 1 to 31 days');
  }
  return { gte: start, lt: until };
}

function timestamp(value: unknown, field: string, now: Date, allowFuture = false): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw new BadRequestException(field + ' must be an ISO date-time');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value || (!allowFuture && parsed > now)) {
    throw new BadRequestException(field + ' must be a valid past server timestamp');
  }
  return parsed;
}

function reason(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 240) {
    throw new BadRequestException('Correction reason must be 1 to 240 characters');
  }
  return value.trim();
}

function conflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  ) {
    throw new ConflictException('Attendance state changed; reload and retry');
  }
  throw error;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  private async currentEmployee(tx: Prisma.TransactionClient, user: AuthUserContext) {
    const employee = await tx.employee.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        department: { isActive: true },
        user: { isActive: true },
      },
      select: { id: true, departmentId: true },
    });
    if (!employee) throw new ForbiddenException('Active linked employee is required');
    return employee;
  }

  private async currentManager(
    tx: Prisma.TransactionClient,
    admin: AuthUserContext,
    departmentId: string,
    capability: PermissionCapability = PermissionCapability.ATTENDANCE_CORRECT,
  ): Promise<void> {
    const current = await tx.user.findUnique({
      where: { id: admin.id },
      select: {
        isActive: true,
        memberships: {
          where: { isActive: true },
          select: {
            id: true, role: true, departmentId: true,
            permissions: { select: { capability: true } },
          },
        },
      },
    });
    if (!current?.isActive) throw new ForbiddenException('Manager account is inactive');
    this.authorization.assertCapability(
      {
        ...admin,
        memberships: current.memberships.map(membership => ({
          id: membership.id,
          role: membership.role,
          departmentId: membership.departmentId,
          permissions: membership.permissions.map(item => item.capability),
        })),
      },
      capability,
      departmentId,
    );
  }

  async issueQr(admin: AuthUserContext, departmentId: unknown) {
    if (typeof departmentId !== 'string' || !departmentId.trim()) {
      throw new BadRequestException('departmentId is required');
    }
    return this.prisma.$transaction(async tx => {
      await this.currentManager(tx, admin, departmentId.trim());
      const department = await tx.department.findFirst({
        where: { id: departmentId.trim(), isActive: true },
        select: { id: true },
      });
      if (!department) throw new NotFoundException('Department not found');
      return issueAttendanceToken(department.id);
    });
  }

  async checkIn(user: AuthUserContext, rawToken: unknown) {
    try {
      return await this.prisma.$transaction(async tx => {
        const now = new Date();
        const qr = verifyAttendanceToken(rawToken, now);
        const employee = await this.currentEmployee(tx, user);
        if (employee.departmentId !== qr.departmentId) {
          throw new UnauthorizedException('Attendance QR is invalid or expired');
        }
        const open = await tx.workSession.findFirst({
          where: { employeeId: employee.id, checkOutAt: null },
          select: { id: true },
        });
        if (open) throw new ConflictException('An open work session already exists');
        const session = await tx.workSession.create({
          data: {
            employeeId: employee.id,
            source: WorkSessionSource.QR,
            checkInAt: now,
          },
        });
        await tx.workSessionEvent.create({
          data: {
            sessionId: session.id,
            employeeId: employee.id,
            actorUserId: user.id,
            type: WorkSessionEventType.CHECK_IN,
            checkInAt: now,
            qrTokenHash: qr.tokenHash,
          },
        });
        return tx.workSession.findUniqueOrThrow({
          where: { id: session.id },
          include: sessionInclude,
        }).then(serialize);
      });
    } catch (error) {
      conflict(error);
    }
  }

  async checkOut(user: AuthUserContext, rawToken: unknown) {
    try {
      return await this.prisma.$transaction(async tx => {
        const now = new Date();
        const qr = verifyAttendanceToken(rawToken, now);
        const employee = await this.currentEmployee(tx, user);
        if (employee.departmentId !== qr.departmentId) {
          throw new UnauthorizedException('Attendance QR is invalid or expired');
        }
        const session = await tx.workSession.findFirst({
          where: { employeeId: employee.id, checkOutAt: null },
        });
        if (!session) throw new ConflictException('No open work session');
        if (session.checkInAt >= now) throw new ConflictException('Check-out must follow check-in');
        const updated = await tx.workSession.updateMany({
          where: { id: session.id, checkOutAt: null },
          data: { checkOutAt: now },
        });
        if (updated.count !== 1) throw new ConflictException('Work session changed');
        await tx.workSessionEvent.create({
          data: {
            sessionId: session.id,
            employeeId: employee.id,
            actorUserId: user.id,
            type: WorkSessionEventType.CHECK_OUT,
            oldCheckInAt: session.checkInAt,
            checkInAt: session.checkInAt,
            checkOutAt: now,
            qrTokenHash: qr.tokenHash,
          },
        });
        return tx.workSession.findUniqueOrThrow({
          where: { id: session.id },
          include: sessionInclude,
        }).then(serialize);
      });
    } catch (error) {
      conflict(error);
    }
  }

  async mine(user: AuthUserContext, from: unknown, to: unknown) {
    const period = range(from, to);
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        department: { isActive: true },
        user: { isActive: true },
      },
      select: { id: true },
    });
    if (!employee) throw new ForbiddenException('Active linked employee is required');
    const rows = await this.prisma.workSession.findMany({
      where: { employeeId: employee.id, checkInAt: period },
      orderBy: { checkInAt: 'desc' },
      take: 100,
      include: sessionInclude,
    });
    return rows.map(serialize);
  }

  async department(admin: AuthUserContext, departmentId: unknown, from: unknown, to: unknown) {
    if (typeof departmentId !== 'string' || !departmentId.trim()) {
      throw new BadRequestException('departmentId is required');
    }
    const period = range(from, to);
    return this.prisma.$transaction(async tx => {
      await this.currentManager(tx, admin, departmentId.trim(), PermissionCapability.SCHEDULE_READ);
      const rows = await tx.workSession.findMany({
        where: { employee: { departmentId: departmentId.trim() }, checkInAt: period },
        orderBy: { checkInAt: 'desc' },
        take: 100,
        include: sessionInclude,
      });
      return rows.map(serialize);
    });
  }

  async createCorrection(admin: AuthUserContext, input: Record<string, unknown>) {
    if (typeof input.employeeId !== 'string' || !input.employeeId.trim()) {
      throw new BadRequestException('employeeId is required');
    }
    const now = new Date();
    const checkInAt = timestamp(input.checkInAt, 'checkInAt', now);
    const checkOutAt = timestamp(input.checkOutAt, 'checkOutAt', now);
    if (checkOutAt <= checkInAt) throw new BadRequestException('checkOutAt must follow checkInAt');
    const correctionReason = reason(input.reason);
    try {
      return await this.prisma.$transaction(async tx => {
        const employee = await tx.employee.findFirst({
          where: { id: input.employeeId as string, isActive: true, department: { isActive: true } },
          select: { id: true, departmentId: true },
        });
        if (!employee) throw new NotFoundException('Employee not found');
        await this.currentManager(tx, admin, employee.departmentId);
        const session = await tx.workSession.create({
          data: {
            employeeId: employee.id,
            source: WorkSessionSource.MANUAL,
            checkInAt,
            checkOutAt,
          },
        });
        await tx.workSessionEvent.create({
          data: {
            sessionId: session.id,
            employeeId: employee.id,
            actorUserId: admin.id,
            type: WorkSessionEventType.CORRECTED,
            checkInAt,
            checkOutAt,
            reason: correctionReason,
          },
        });
        await appendAuditLog(tx, {
          actorUserId: admin.id,
          action: AuditAction.WORK_SESSION_CORRECTED,
          entityType: AuditEntityType.WORK_SESSION,
          entityId: session.id,
          departmentId: employee.departmentId,
        });
        return tx.workSession.findUniqueOrThrow({
          where: { id: session.id },
          include: sessionInclude,
        }).then(serialize);
      });
    } catch (error) {
      conflict(error);
    }
  }

  async correct(admin: AuthUserContext, sessionId: string, input: Record<string, unknown>) {
    if (!sessionId) throw new BadRequestException('sessionId is required');
    const now = new Date();
    const checkInAt = timestamp(input.checkInAt, 'checkInAt', now);
    const checkOutAt = input.checkOutAt === null
      ? null
      : timestamp(input.checkOutAt, 'checkOutAt', now);
    if (checkOutAt && checkOutAt <= checkInAt) {
      throw new BadRequestException('checkOutAt must follow checkInAt');
    }
    const expectedUpdatedAt = timestamp(input.expectedUpdatedAt, 'expectedUpdatedAt', now, true);
    const correctionReason = reason(input.reason);
    try {
      return await this.prisma.$transaction(async tx => {
        const previous = await tx.workSession.findUnique({
          where: { id: sessionId },
          include: { employee: { select: { departmentId: true } } },
        });
        if (!previous) throw new NotFoundException('Work session not found');
        await this.currentManager(tx, admin, previous.employee.departmentId);
        if (
          previous.checkInAt.getTime() === checkInAt.getTime() &&
          previous.checkOutAt?.getTime() === checkOutAt?.getTime()
        ) {
          throw new BadRequestException('Correction must change a timestamp');
        }
        const updated = await tx.workSession.updateMany({
          where: { id: sessionId, updatedAt: expectedUpdatedAt },
          data: {
            checkInAt,
            checkOutAt,
            // Keep the optimistic token monotonic even for two corrections in one millisecond.
            updatedAt: new Date(Math.max(now.getTime(), previous.updatedAt.getTime() + 1)),
          },
        });
        if (updated.count !== 1) throw new ConflictException('Work session changed');
        await tx.workSessionEvent.create({
          data: {
            sessionId,
            employeeId: previous.employeeId,
            actorUserId: admin.id,
            type: WorkSessionEventType.CORRECTED,
            oldCheckInAt: previous.checkInAt,
            oldCheckOutAt: previous.checkOutAt,
            checkInAt,
            checkOutAt,
            reason: correctionReason,
          },
        });
        await appendAuditLog(tx, {
          actorUserId: admin.id,
          action: AuditAction.WORK_SESSION_CORRECTED,
          entityType: AuditEntityType.WORK_SESSION,
          entityId: sessionId,
          departmentId: previous.employee.departmentId,
        });
        return tx.workSession.findUniqueOrThrow({
          where: { id: sessionId },
          include: sessionInclude,
        }).then(serialize);
      });
    } catch (error) {
      conflict(error);
    }
  }
}
