import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  PermissionCapability,
  Prisma,
  ShiftChangeRequestEventType,
  ShiftChangeRequestKind,
  ShiftChangeRequestStatus,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseSchedulePublicationSnapshot,
  type PublishedShiftSnapshot,
} from '../schedules/schedule-publications.service';

export interface CreateShiftChangeRequestInput {
  kind: ShiftChangeRequestKind;
  targetEmployeeId: string;
  requesterShiftId: string;
  targetShiftId?: string;
}

const shiftForTransitionSelect = {
  id: true,
  scheduleId: true,
  employeeId: true,
  date: true,
  code: true,
  startTime: true,
  endTime: true,
  isOff: true,
  updatedAt: true,
} as const;

type TransitionRequest = Prisma.ShiftChangeRequestGetPayload<{
  include: {
    requesterShift: { select: typeof shiftForTransitionSelect };
    targetShift: { select: typeof shiftForTransitionSelect };
    requesterEmployee: { select: { departmentId: true; isActive: true } };
    targetEmployee: { select: { departmentId: true; isActive: true } };
  };
}>;

@Injectable()
export class ShiftChangeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async create(
    user: AuthUserContext,
    input: CreateShiftChangeRequestInput,
  ) {
    const sessionEmployee = this.requireLinkedEmployee(user);
    for (const id of [input.requesterShiftId, input.targetShiftId]) {
      if (id !== undefined && (typeof id !== 'string' || !id.trim() || id.startsWith('default:'))) {
        throw new BadRequestException('Shift change requests require a saved shift');
      }
    }

    if (input.targetEmployeeId === sessionEmployee.id) {
      throw new BadRequestException(
        'A shift change request cannot target the requester',
      );
    }

    if (
      input.kind === ShiftChangeRequestKind.SWAP &&
      !input.targetShiftId
    ) {
      throw new BadRequestException('SWAP requires targetShiftId');
    }
    if (input.kind === ShiftChangeRequestKind.COVER && input.targetShiftId) {
      throw new BadRequestException('COVER cannot include targetShiftId');
    }

    const [requesterEmployee, targetEmployee, requesterShift, targetShift] =
      await Promise.all([
        this.prisma.employee.findFirst({
          where: {
            id: sessionEmployee.id,
            userId: user.id,
            isActive: true,
          },
          select: {
            id: true,
            departmentId: true,
          },
        }),
        this.prisma.employee.findFirst({
          where: {
            id: input.targetEmployeeId,
            isActive: true,
          },
          select: {
            id: true,
            userId: true,
            departmentId: true,
            user: {
              select: {
                isActive: true,
              },
            },
          },
        }),
        this.prisma.shift.findFirst({
          where: {
            id: input.requesterShiftId,
            employeeId: sessionEmployee.id,
            isOff: false,
          },
          select: shiftForTransitionSelect,
        }),
        input.targetShiftId
          ? this.prisma.shift.findFirst({
              where: {
                id: input.targetShiftId,
                employeeId: input.targetEmployeeId,
                isOff: false,
              },
              select: shiftForTransitionSelect,
            })
          : Promise.resolve(null),
      ]);

    if (!requesterEmployee) {
      throw new ForbiddenException(
        'Authenticated account is not linked to an active employee',
      );
    }

    if (!targetEmployee) {
      throw new NotFoundException('Target employee not found');
    }

    if (!targetEmployee.userId || !targetEmployee.user?.isActive) {
      throw new ConflictException(
        'Target employee is not linked to an active account',
      );
    }

    if (!requesterShift) {
      throw new ForbiddenException(
        'Requester shift does not belong to the authenticated employee',
      );
    }

    if (input.targetShiftId && !targetShift) {
      throw new BadRequestException(
        'Target shift does not belong to the target employee',
      );
    }

    await this.assertMatchesLatestPublicationIfPresent(
      requesterEmployee.id,
      requesterEmployee.departmentId,
      requesterShift,
    );
    if (targetShift) {
      await this.assertMatchesLatestPublicationIfPresent(
        targetEmployee.id,
        targetEmployee.departmentId,
        targetShift,
      );
    }

    return this.prisma.shiftChangeRequest.create({
      data: {
        kind: input.kind,
        status: ShiftChangeRequestStatus.PENDING_TARGET,
        requesterUserId: user.id,
        requesterEmployeeId: requesterEmployee.id,
        requesterDepartmentId: requesterEmployee.departmentId,
        targetUserId: targetEmployee.userId,
        targetEmployeeId: targetEmployee.id,
        targetDepartmentId: targetEmployee.departmentId,
        requesterShiftId: requesterShift.id,
        targetShiftId: targetShift?.id,
        requesterShiftUpdatedAt: requesterShift.updatedAt,
        targetShiftUpdatedAt: targetShift?.updatedAt,
        events: {
          create: {
            eventType: ShiftChangeRequestEventType.CREATED,
            actorUserId: user.id,
          },
        },
      },
      select: this.requestSelect(),
    });
  }

  getMine(user: AuthUserContext) {
    const employee = this.requireLinkedEmployee(user);

    return this.prisma.shiftChangeRequest.findMany({
      where: {
        requesterUserId: user.id,
        requesterEmployeeId: employee.id,
      },
      orderBy: { createdAt: 'desc' },
      select: this.requestSelect(),
    });
  }

  async discoverTargets(user: AuthUserContext) {
    const employee = await this.requireCurrentEmployee(user);
    return this.prisma.employee.findMany({
      where: {
        departmentId: employee.departmentId,
        id: { not: employee.id },
        isActive: true,
        userId: { not: null },
        user: { isActive: true },
      },
      orderBy: [{ position: 'asc' }, { displayName: 'asc' }],
      select: { id: true, displayName: true },
    });
  }

  async discoverTargetShift(user: AuthUserContext, targetEmployeeId: string, date: string, sourceShiftId: string) {
    const employee = await this.requireCurrentEmployee(user);
    if (!sourceShiftId || sourceShiftId.startsWith('default:')) {
      throw new BadRequestException('A persisted source shift is required');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(date + 'T00:00:00.000Z')) ||
        new Date(date + 'T00:00:00.000Z').toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD');
    }
    const source = await this.prisma.shift.findFirst({
      where: { id: sourceShiftId, employeeId: employee.id, isOff: false,
        startTime: { not: null }, endTime: { not: null } },
      select: shiftForTransitionSelect,
    });
    if (!source) throw new ForbiddenException('Source shift does not belong to the authenticated employee');
    await this.requireLatestPublishedShift(employee.id, employee.departmentId, source);
    const target = await this.prisma.employee.findFirst({
      where: {
        id: { equals: targetEmployeeId, not: employee.id },
        departmentId: employee.departmentId,
        isActive: true,
        userId: { not: null },
        user: { isActive: true },
      },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Eligible target employee not found');
    const shift = await this.prisma.shift.findFirst({
      where: {
        employeeId: target.id,
        date: new Date(date + 'T00:00:00.000Z'),
        isOff: false,
        startTime: { not: null },
        endTime: { not: null },
      },
      select: shiftForTransitionSelect,
    });
    if (!shift) throw new NotFoundException('Eligible shift not found for this date');
    const published = await this.requireLatestPublishedShift(
      target.id,
      employee.departmentId,
      shift,
    );
    return {
      id: published.id,
      date: published.date,
      startTime: published.startTime!,
      endTime: published.endTime!,
      code: published.code,
    };
  }

  private async latestPublishedShift(
    employeeId: string,
    departmentId: string,
    shift: {
      id: string;
      scheduleId: string;
      employeeId: string;
      date: Date;
      code: string | null;
      startTime: string | null;
      endTime: string | null;
      isOff: boolean;
      updatedAt: Date;
    },
  ): Promise<PublishedShiftSnapshot | null> {
    const publication = await this.prisma.schedulePublication.findFirst({
      where: {
        scheduleId: shift.scheduleId,
        departmentId,
      },
      orderBy: { version: 'desc' },
      select: { snapshot: true },
    });
    if (!publication) return null;

    const snapshot = parseSchedulePublicationSnapshot(publication.snapshot);
    if (!snapshot) {
      throw new ConflictException('Latest published schedule snapshot is invalid');
    }

    const published = snapshot.shifts.find(
      candidate => candidate.id === shift.id && candidate.employeeId === employeeId,
    );
    if (
      !published ||
      published.isOff ||
      !published.startTime ||
      !published.endTime ||
      published.date !== shift.date.toISOString().slice(0, 10) ||
      published.code !== shift.code ||
      published.startTime !== shift.startTime ||
      published.endTime !== shift.endTime ||
      published.updatedAt !== shift.updatedAt.toISOString()
    ) {
      return null;
    }

    return published;
  }

  private async requireLatestPublishedShift(
    employeeId: string,
    departmentId: string,
    shift: Parameters<ShiftChangeRequestsService['latestPublishedShift']>[2],
  ): Promise<PublishedShiftSnapshot> {
    const published = await this.latestPublishedShift(
      employeeId,
      departmentId,
      shift,
    );
    if (!published) {
      throw new ConflictException(
        'Shift is not current in the latest published schedule',
      );
    }
    return published;
  }

  private async assertMatchesLatestPublicationIfPresent(
    employeeId: string,
    departmentId: string,
    shift: Parameters<ShiftChangeRequestsService['latestPublishedShift']>[2],
  ): Promise<void> {
    const publication = await this.prisma.schedulePublication.findFirst({
      where: {
        scheduleId: shift.scheduleId,
        departmentId,
      },
      orderBy: { version: 'desc' },
      select: { snapshot: true },
    });
    if (!publication) return;

    const snapshot = parseSchedulePublicationSnapshot(publication.snapshot);
    if (!snapshot) {
      throw new ConflictException('Latest published schedule snapshot is invalid');
    }
    const published = snapshot.shifts.find(
      candidate => candidate.id === shift.id && candidate.employeeId === employeeId,
    );
    if (
      !published ||
      published.isOff ||
      !published.startTime ||
      !published.endTime ||
      published.date !== shift.date.toISOString().slice(0, 10) ||
      published.code !== shift.code ||
      published.startTime !== shift.startTime ||
      published.endTime !== shift.endTime ||
      published.updatedAt !== shift.updatedAt.toISOString()
    ) {
      throw new ConflictException(
        'Shift changed after the latest publication; publish or refresh before requesting a change',
      );
    }
  }

  private async requireCurrentEmployee(user: AuthUserContext) {
    const linked = this.requireLinkedEmployee(user);
    const employee = await this.prisma.employee.findFirst({
      where: { id: linked.id, userId: user.id, isActive: true, user: { isActive: true } },
      select: { id: true, departmentId: true },
    });
    if (!employee) throw new ForbiddenException('Active linked employee required');
    return employee;
  }

  getIncoming(user: AuthUserContext) {
    const employee = this.requireLinkedEmployee(user);

    return this.prisma.shiftChangeRequest.findMany({
      where: {
        targetUserId: user.id,
        targetEmployeeId: employee.id,
      },
      orderBy: { createdAt: 'desc' },
      select: this.requestSelect(),
    });
  }

  getPendingForAdmin(admin: AuthUserContext) {
    const isSuperAdmin = this.authorization.isSuperAdmin(admin);
    const departmentIds = this.authorization.departmentIdsForCapability(
      admin,
      PermissionCapability.SHIFT_CHANGE_APPROVE,
    );

    if (!isSuperAdmin && departmentIds.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to manage shift change requests',
      );
    }

    return this.prisma.shiftChangeRequest.findMany({
      where: {
        status: ShiftChangeRequestStatus.PENDING_MANAGER,
        ...(isSuperAdmin
          ? {}
          : {
              requesterDepartmentId: { in: departmentIds },
              targetDepartmentId: { in: departmentIds },
              requesterEmployee: {
                departmentId: { in: departmentIds },
                isActive: true,
              },
              targetEmployee: {
                departmentId: { in: departmentIds },
                isActive: true,
              },
            }),
      },
      orderBy: { createdAt: 'asc' },
      select: this.requestSelect(),
    });
  }

  async accept(user: AuthUserContext, requestId: string) {
    this.requireLinkedEmployee(user);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const request = await this.getForTransition(tx, requestId);
        this.assertTarget(request, user);
        this.assertStatus(request, ShiftChangeRequestStatus.PENDING_TARGET);

        if (this.isStale(request)) {
          await this.markStale(tx, request, user.id);
          return { stale: true as const };
        }

        const resolved = await this.transition(
          tx,
          request,
          [ShiftChangeRequestStatus.PENDING_TARGET],
          ShiftChangeRequestStatus.PENDING_MANAGER,
          ShiftChangeRequestEventType.TARGET_ACCEPTED,
          user.id,
        );

        return { stale: false as const, request: resolved };
      },
      this.transactionOptions(),
    );

    if (result.stale) {
      throw new ConflictException(
        'Shift change request is stale because an employee or source shift changed',
      );
    }

    return result.request;
  }

  async reject(user: AuthUserContext, requestId: string) {
    this.requireLinkedEmployee(user);

    return this.prisma.$transaction(
      async (tx) => {
        const request = await this.getForTransition(tx, requestId);
        this.assertTarget(request, user);
        this.assertStatus(request, ShiftChangeRequestStatus.PENDING_TARGET);

        return this.transition(
          tx,
          request,
          [ShiftChangeRequestStatus.PENDING_TARGET],
          ShiftChangeRequestStatus.TARGET_REJECTED,
          ShiftChangeRequestEventType.TARGET_REJECTED,
          user.id,
          { resolvedAt: new Date() },
        );
      },
      this.transactionOptions(),
    );
  }

  async cancel(user: AuthUserContext, requestId: string) {
    this.requireLinkedEmployee(user);

    return this.prisma.$transaction(
      async (tx) => {
        const request = await this.getForTransition(tx, requestId);

        if (
          request.requesterUserId !== user.id ||
          request.requesterEmployeeId !== user.employee?.id
        ) {
          throw new ForbiddenException(
            'Only the requester can cancel this shift change request',
          );
        }

        const cancelable = [
          ShiftChangeRequestStatus.PENDING_TARGET,
          ShiftChangeRequestStatus.PENDING_MANAGER,
        ];
        this.assertOneOfStatuses(request, cancelable);

        return this.transition(
          tx,
          request,
          cancelable,
          ShiftChangeRequestStatus.CANCELED,
          ShiftChangeRequestEventType.CANCELED,
          user.id,
          { resolvedAt: new Date() },
        );
      },
      this.transactionOptions(),
    );
  }

  async approve(admin: AuthUserContext, requestId: string) {
    let result:
      | { stale: true; request?: never }
      | { stale: false; request: Awaited<ReturnType<ShiftChangeRequestsService['transition']>> };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const request = await this.getForTransition(tx, requestId);
          this.assertManagerScope(admin, request);
          this.assertStatus(request, ShiftChangeRequestStatus.PENDING_MANAGER);
          await this.assertCurrentManagerScope(tx, admin, request);

          if (this.isStale(request)) {
            await this.markStale(tx, request, admin.id);
            return { stale: true as const };
          }

          const applied = await this.applyApprovedChange(tx, request);
          const resolved = await this.transition(
            tx,
            request,
            [ShiftChangeRequestStatus.PENDING_MANAGER],
            ShiftChangeRequestStatus.MANAGER_APPROVED,
            ShiftChangeRequestEventType.MANAGER_APPROVED,
            admin.id,
            {
              managerUserId: admin.id,
              resolvedAt: new Date(),
              eventMetadata: applied.metadata,
            },
          );

          for (const departmentId of new Set([
            request.requesterDepartmentId,
            request.targetDepartmentId,
          ])) {
            await appendAuditLog(tx, {
              actorUserId: admin.id,
              action: AuditAction.SHIFT_CHANGE_MANAGER_APPROVED,
              entityType: AuditEntityType.SHIFT_CHANGE_REQUEST,
              entityId: request.id,
              departmentId,
            });
          }
          for (const scheduleId of applied.scheduleIds) {
            await tx.schedule.update({
              where: { id: scheduleId },
              data: { updatedAt: new Date() },
            });
            for (const departmentId of new Set([
              request.requesterDepartmentId,
              request.targetDepartmentId,
            ])) {
              await appendAuditLog(tx, {
                actorUserId: admin.id,
                action: AuditAction.SCHEDULE_CHANGED,
                entityType: AuditEntityType.SCHEDULE,
                entityId: scheduleId,
                departmentId,
              });
            }
          }

          return { stale: false as const, request: resolved };
        },
        this.transactionOptions(),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new ConflictException(
          'Shift change conflicts with a concurrent schedule update',
        );
      }
      throw error;
    }

    if (result.stale) {
      throw new ConflictException(
        'Shift change request is stale because an employee or source shift changed',
      );
    }

    return result.request;
  }

  private async assertCurrentManagerScope(
    tx: Prisma.TransactionClient,
    admin: AuthUserContext,
    request: TransitionRequest,
  ): Promise<void> {
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
              select: {
                capability: true,
              },
            },
          },
        },
      },
    });
    if (!current?.isActive) {
      throw new ForbiddenException('Manager account is inactive');
    }
    this.authorization.assertCapabilityForDepartments(
      {
        ...admin,
        memberships: current.memberships.map(membership => ({
          id: membership.id,
          role: membership.role,
          departmentId: membership.departmentId,
          permissions: (membership.permissions ?? []).map(
            permission => permission.capability,
          ),
        })),
      },
      PermissionCapability.SHIFT_CHANGE_APPROVE,
      [request.requesterDepartmentId, request.targetDepartmentId],
    );
  }

  private async applyApprovedChange(
    tx: Prisma.TransactionClient,
    request: TransitionRequest,
  ): Promise<{ scheduleIds: Set<string>; metadata: Prisma.InputJsonValue }> {
    const source = request.requesterShift;
    const target = request.targetShift;
    if (
      this.isStale(request) ||
      (request.kind === ShiftChangeRequestKind.SWAP && !target) ||
      (request.kind === ShiftChangeRequestKind.COVER && request.targetShiftId)
    ) {
      throw new ConflictException(
        'Source shift no longer matches the accepted request',
      );
    }

    const sameDate = target && source.scheduleId === target.scheduleId &&
      source.date.getTime() === target.date.getTime();
    if (!sameDate) {
      const destinations = [
        { scheduleId: source.scheduleId, date: source.date, employeeId: request.targetEmployeeId },
        ...(target ? [{ scheduleId: target.scheduleId, date: target.date, employeeId: request.requesterEmployeeId }] : []),
      ];
      const occupied = await tx.shift.findFirst({
        where: { OR: destinations },
        select: { id: true },
      });
      if (occupied) {
        throw new ConflictException('Destination already has a shift or OFF');
      }
    }

    const changes = target ? [source, target] : [source];
    const metadata: Array<Record<string, unknown>> = [];
    for (const shift of changes) {
      const other = shift.id === source.id ? target : source;
      const payload = sameDate && other
        ? { code: other.code, startTime: other.startTime, endTime: other.endTime }
        : { employeeId: shift.id === source.id ? request.targetEmployeeId : request.requesterEmployeeId };
      const changed = await tx.shift.updateMany({
        where: {
          id: shift.id,
          employeeId: shift.employeeId,
          scheduleId: shift.scheduleId,
          date: shift.date,
          updatedAt: shift.updatedAt,
          isOff: false,
        },
        data: payload,
      });
      if (changed.count !== 1) {
        throw new ConflictException('Source shift changed during approval');
      }
      metadata.push({
        shiftId: shift.id,
        scheduleId: shift.scheduleId,
        date: shift.date.toISOString().slice(0, 10),
        before: sameDate
          ? { code: shift.code, startTime: shift.startTime, endTime: shift.endTime }
          : { employeeId: shift.employeeId },
        after: payload,
      });
    }

    return {
      scheduleIds: new Set(changes.map(shift => shift.scheduleId)),
      metadata: { appliedShifts: metadata } as Prisma.InputJsonValue,
    };
  }

  async managerReject(admin: AuthUserContext, requestId: string) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const request = await this.getForTransition(tx, requestId);
        this.assertManagerScope(admin, request);
        this.assertStatus(request, ShiftChangeRequestStatus.PENDING_MANAGER);

        if (this.isStale(request)) {
          await this.markStale(tx, request, admin.id);
          return { stale: true as const };
        }

        const resolved = await this.transition(
          tx,
          request,
          [ShiftChangeRequestStatus.PENDING_MANAGER],
          ShiftChangeRequestStatus.MANAGER_REJECTED,
          ShiftChangeRequestEventType.MANAGER_REJECTED,
          admin.id,
          {
            managerUserId: admin.id,
            resolvedAt: new Date(),
          },
        );

        for (const departmentId of new Set([
          request.requesterDepartmentId,
          request.targetDepartmentId,
        ])) {
          await appendAuditLog(tx, {
            actorUserId: admin.id,
            action: AuditAction.SHIFT_CHANGE_MANAGER_REJECTED,
            entityType: AuditEntityType.SHIFT_CHANGE_REQUEST,
            entityId: request.id,
            departmentId,
          });
        }

        return { stale: false as const, request: resolved };
      },
      this.transactionOptions(),
    );

    if (result.stale) {
      throw new ConflictException(
        'Shift change request is stale because an employee or source shift changed',
      );
    }

    return result.request;
  }

  private requireLinkedEmployee(user: AuthUserContext) {
    if (!user.employee) {
      throw new ForbiddenException(
        'A linked employee profile is required for shift change requests',
      );
    }

    return user.employee;
  }

  private transactionOptions() {
    return {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    } as const;
  }

  private async getForTransition(
    tx: Prisma.TransactionClient,
    requestId: string,
  ): Promise<TransitionRequest> {
    const request = await tx.shiftChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        requesterShift: { select: shiftForTransitionSelect },
        targetShift: { select: shiftForTransitionSelect },
        requesterEmployee: {
          select: { departmentId: true, isActive: true },
        },
        targetEmployee: {
          select: { departmentId: true, isActive: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Shift change request not found');
    }

    return request;
  }

  private assertTarget(
    request: TransitionRequest,
    user: AuthUserContext,
  ): void {
    if (
      request.targetUserId !== user.id ||
      request.targetEmployeeId !== user.employee?.id
    ) {
      throw new ForbiddenException(
        'Only the target employee can respond to this request',
      );
    }
  }

  private assertManagerScope(
    admin: AuthUserContext,
    request: TransitionRequest,
  ): void {
    this.authorization.assertCapabilityForDepartments(
      admin,
      PermissionCapability.SHIFT_CHANGE_APPROVE,
      [request.requesterDepartmentId, request.targetDepartmentId],
    );
  }

  private assertStatus(
    request: TransitionRequest,
    expected: ShiftChangeRequestStatus,
  ): void {
    this.assertOneOfStatuses(request, [expected]);
  }

  private assertOneOfStatuses(
    request: TransitionRequest,
    expected: ShiftChangeRequestStatus[],
  ): void {
    if (!expected.includes(request.status)) {
      throw new ConflictException(
        `Shift change request cannot transition from ${request.status}`,
      );
    }
  }

  private isStale(request: TransitionRequest): boolean {
    if (
      !request.requesterEmployee.isActive ||
      !request.targetEmployee.isActive ||
      request.requesterEmployee.departmentId !== request.requesterDepartmentId ||
      request.targetEmployee.departmentId !== request.targetDepartmentId
    ) {
      return true;
    }

    if (
      request.requesterShift.employeeId !== request.requesterEmployeeId ||
      request.requesterShift.isOff ||
      !request.requesterShift.startTime ||
      !request.requesterShift.endTime ||
      request.requesterShift.updatedAt.getTime() !==
      request.requesterShiftUpdatedAt.getTime()
    ) {
      return true;
    }

    if (!request.targetShiftId) {
      return false;
    }

    return (
      !request.targetShift ||
      !request.targetShiftUpdatedAt ||
      request.targetShift.employeeId !== request.targetEmployeeId ||
      request.targetShift.isOff ||
      !request.targetShift.startTime ||
      !request.targetShift.endTime ||
      request.targetShift.updatedAt.getTime() !==
        request.targetShiftUpdatedAt.getTime()
    );
  }

  private async markStale(
    tx: Prisma.TransactionClient,
    request: TransitionRequest,
    actorUserId: string,
  ): Promise<void> {
    const updated = await tx.shiftChangeRequest.updateMany({
      where: {
        id: request.id,
        status: request.status,
      },
      data: {
        status: ShiftChangeRequestStatus.STALE,
        resolvedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Shift change request was updated concurrently',
      );
    }

    await tx.shiftChangeRequestEvent.create({
      data: {
        requestId: request.id,
        eventType: ShiftChangeRequestEventType.MARKED_STALE,
        actorUserId,
      },
    });
  }

  private async transition(
    tx: Prisma.TransactionClient,
    request: TransitionRequest,
    fromStatuses: ShiftChangeRequestStatus[],
    toStatus: ShiftChangeRequestStatus,
    eventType: ShiftChangeRequestEventType,
    actorUserId: string,
    extraData: {
      managerUserId?: string;
      resolvedAt?: Date;
      eventMetadata?: Prisma.InputJsonValue;
    } = {},
  ) {
    const { eventMetadata, ...requestData } = extraData;
    const updated = await tx.shiftChangeRequest.updateMany({
      where: {
        id: request.id,
        status: { in: fromStatuses },
      },
      data: {
        status: toStatus,
        ...requestData,
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Shift change request was updated concurrently',
      );
    }

    await tx.shiftChangeRequestEvent.create({
      data: {
        requestId: request.id,
        eventType,
        actorUserId,
        ...(eventMetadata === undefined ? {} : { metadata: eventMetadata }),
      },
    });

    const result = await tx.shiftChangeRequest.findUnique({
      where: { id: request.id },
      select: this.requestSelect(),
    });

    if (!result) {
      throw new ConflictException('Shift change request disappeared');
    }

    return result;
  }

  private requestSelect() {
    return {
      id: true,
      kind: true,
      status: true,
      requesterEmployeeId: true,
      requesterDepartmentId: true,
      targetEmployeeId: true,
      targetDepartmentId: true,
      requesterShiftId: true,
      targetShiftId: true,
      requesterShiftUpdatedAt: true,
      targetShiftUpdatedAt: true,
      requesterEmployee: { select: { displayName: true } },
      targetEmployee: { select: { displayName: true } },
      requesterShift: { select: { date: true, startTime: true, endTime: true, code: true, isOff: true } },
      targetShift: { select: { date: true, startTime: true, endTime: true, code: true, isOff: true } },
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          eventType: true,
          metadata: true,
          createdAt: true,
        },
      },
    } as const;
  }
}
