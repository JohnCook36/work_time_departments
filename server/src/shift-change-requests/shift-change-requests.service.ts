import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RoleType,
  ShiftChangeRequestEventType,
  ShiftChangeRequestKind,
  ShiftChangeRequestStatus,
} from '@prisma/client';

import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateShiftChangeRequestInput {
  kind: ShiftChangeRequestKind;
  targetEmployeeId: string;
  requesterShiftId: string;
  targetShiftId?: string;
}

type TransitionRequest = Prisma.ShiftChangeRequestGetPayload<{
  include: {
    requesterShift: { select: { updatedAt: true } };
    targetShift: { select: { updatedAt: true } };
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
          select: {
            id: true,
            updatedAt: true,
          },
        }),
        input.targetShiftId
          ? this.prisma.shift.findFirst({
              where: {
                id: input.targetShiftId,
                employeeId: input.targetEmployeeId,
                isOff: false,
              },
              select: {
                id: true,
                updatedAt: true,
              },
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
    const isSuperAdmin = admin.memberships.some(
      (membership) => membership.role === RoleType.SUPER_ADMIN,
    );
    const departmentIds = admin.memberships
      .filter(
        (membership) =>
          membership.role === RoleType.DEPARTMENT_ADMIN &&
          membership.departmentId !== null,
      )
      .map((membership) => membership.departmentId as string);

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
        'Shift change request is stale because a source shift changed',
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
          ShiftChangeRequestStatus.MANAGER_APPROVED,
          ShiftChangeRequestEventType.MANAGER_APPROVED,
          admin.id,
          {
            managerUserId: admin.id,
            resolvedAt: new Date(),
          },
        );

        return { stale: false as const, request: resolved };
      },
      this.transactionOptions(),
    );

    if (result.stale) {
      throw new ConflictException(
        'Shift change request is stale because a source shift changed',
      );
    }

    return result.request;
  }

  async managerReject(admin: AuthUserContext, requestId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const request = await this.getForTransition(tx, requestId);
        this.assertManagerScope(admin, request);
        this.assertStatus(request, ShiftChangeRequestStatus.PENDING_MANAGER);

        return this.transition(
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
      },
      this.transactionOptions(),
    );
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
        requesterShift: { select: { updatedAt: true } },
        targetShift: { select: { updatedAt: true } },
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
    this.authorization.assertCanAdministerDepartments(admin, [
      request.requesterDepartmentId,
      request.targetDepartmentId,
    ]);
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
    } = {},
  ) {
    const updated = await tx.shiftChangeRequest.updateMany({
      where: {
        id: request.id,
        status: { in: fromStatuses },
      },
      data: {
        status: toStatus,
        ...extraData,
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
      requesterUserId: true,
      requesterEmployeeId: true,
      requesterDepartmentId: true,
      targetUserId: true,
      targetEmployeeId: true,
      targetDepartmentId: true,
      requesterShiftId: true,
      targetShiftId: true,
      requesterShiftUpdatedAt: true,
      targetShiftUpdatedAt: true,
      managerUserId: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          eventType: true,
          actorUserId: true,
          metadata: true,
          createdAt: true,
        },
      },
    } as const;
  }
}
