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
  RoleType,
} from '@prisma/client';

import { appendAuditLog } from '../audit/audit-log';
import { AuthUserContext } from '../auth/auth.service';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateMembershipAssignmentInput {
  employeeId?: unknown;
  departmentId?: unknown;
  role?: unknown;
  permissions?: unknown;
}

export interface ReplaceMembershipPermissionsInput {
  permissions?: unknown;
  expectedUpdatedAt?: unknown;
}

export interface DeactivateMembershipInput {
  expectedUpdatedAt?: unknown;
}

const assignmentSelect = {
  id: true,
  role: true,
  departmentId: true,
  isActive: true,
  updatedAt: true,
  permissions: {
    select: { capability: true },
    orderBy: { capability: 'asc' as const },
  },
  user: {
    select: {
      employee: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  },
} satisfies Prisma.MembershipSelect;

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(field + ' is required');
  }
  return value.trim();
}

function requireRole(value: unknown): RoleType {
  if (
    typeof value !== 'string' ||
    !Object.values(RoleType).includes(value as RoleType)
  ) {
    throw new BadRequestException('role is invalid');
  }
  return value as RoleType;
}

function requirePermissions(value: unknown): PermissionCapability[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException('permissions must be an array');
  }

  const permissions = value.map(item => {
    if (
      typeof item !== 'string' ||
      !Object.values(PermissionCapability).includes(
        item as PermissionCapability,
      )
    ) {
      throw new BadRequestException('permissions contains an invalid capability');
    }
    return item as PermissionCapability;
  });

  if (new Set(permissions).size !== permissions.length) {
    throw new BadRequestException('permissions must not contain duplicates');
  }

  return permissions.sort();
}

function requireExpectedUpdatedAt(value: unknown): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException('expectedUpdatedAt is required');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('expectedUpdatedAt must be an ISO date-time');
  }
  return parsed;
}

function serializeAssignment(
  assignment: Prisma.MembershipGetPayload<{ select: typeof assignmentSelect }>,
) {
  return {
    id: assignment.id,
    role: assignment.role,
    departmentId: assignment.departmentId,
    permissions: assignment.permissions.map(item => item.capability),
    employee: assignment.user.employee
      ? {
          id: assignment.user.employee.id,
          displayName: assignment.user.employee.displayName,
        }
      : null,
    isActive: assignment.isActive,
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async listManageable(admin: AuthUserContext, departmentId?: string) {
    const scope = departmentId?.trim() || null;
    if (scope) {
      this.authorization.assertCapability(
        admin,
        PermissionCapability.ROLE_MANAGE,
        scope,
      );
      await this.assertActiveDepartment(scope);
    } else if (!this.authorization.isSuperAdmin(admin)) {
      throw new ForbiddenException(
        'Only Super Admin can list global assignments',
      );
    }

    const assignments = await this.prisma.membership.findMany({
      where: {
        isActive: true,
        ...(scope ? { departmentId: scope } : { departmentId: null }),
      },
      select: assignmentSelect,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return assignments.map(serializeAssignment);
  }

  async createAssignment(
    admin: AuthUserContext,
    input: CreateMembershipAssignmentInput,
  ) {
    const employeeId = requireString(input.employeeId, 'employeeId');
    const role = requireRole(input.role);
    const departmentId =
      input.departmentId === null || input.departmentId === undefined
        ? null
        : requireString(input.departmentId, 'departmentId');
    const permissions = requirePermissions(input.permissions);

    this.assertRoleShape(role, departmentId, permissions);

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        isActive: true,
        userId: { not: null },
      },
      select: {
        id: true,
        departmentId: true,
        userId: true,
      },
    });
    if (!employee?.userId) {
      throw new NotFoundException('Linked active employee not found');
    }

    if (employee.userId === admin.id) {
      throw new ConflictException('You cannot create an assignment for yourself');
    }

    if (departmentId && employee.departmentId !== departmentId) {
      throw new BadRequestException(
        'Employee must belong to the assignment department',
      );
    }

    await this.assertActorCanManageAssignment(
      admin,
      role,
      departmentId,
      permissions,
    );
    if (departmentId) await this.assertActiveDepartment(departmentId);

    return this.prisma.$transaction(async tx => {
      const currentAdmin = await this.loadCurrentActor(tx, admin);
      await this.assertActorCanManageAssignment(
        currentAdmin,
        role,
        departmentId,
        permissions,
      );

      await this.lockAssignment(tx, employee.userId!, role, departmentId);

      const duplicate = await tx.membership.findFirst({
        where: {
          userId: employee.userId!,
          role,
          departmentId,
          isActive: true,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Active assignment already exists');
      }

      const assignment = await tx.membership.create({
        data: {
          userId: employee.userId!,
          role,
          departmentId,
          ...(permissions.length > 0
            ? {
                permissions: {
                  create: permissions.map(capability => ({ capability })),
                },
              }
            : {}),
        },
        select: assignmentSelect,
      });

      await appendAuditLog(tx, {
        actorUserId: admin.id,
        action: AuditAction.ROLE_ASSIGNMENT_CREATED,
        entityType: AuditEntityType.MEMBERSHIP,
        entityId: assignment.id,
        departmentId,
      });

      return serializeAssignment(assignment);
    });
  }

  async replacePermissions(
    admin: AuthUserContext,
    membershipId: string,
    input: ReplaceMembershipPermissionsInput,
  ) {
    const permissions = requirePermissions(input.permissions);
    const expectedUpdatedAt = requireExpectedUpdatedAt(input.expectedUpdatedAt);

    return this.prisma.$transaction(async tx => {
      const existing = await tx.membership.findUnique({
        where: { id: membershipId },
        select: {
          id: true,
          userId: true,
          role: true,
          departmentId: true,
          isActive: true,
          updatedAt: true,
        },
      });

      if (!existing?.isActive) {
        throw new NotFoundException('Active membership not found');
      }
      if (existing.userId === admin.id) {
        throw new ConflictException('You cannot change your own permissions');
      }
      if (existing.role !== RoleType.DEPUTY || !existing.departmentId) {
        throw new BadRequestException(
          'Explicit permissions are supported only for DEPUTY memberships',
        );
      }

      const currentAdmin = await this.loadCurrentActor(tx, admin);
      await this.assertActorCanManageAssignment(
        currentAdmin,
        existing.role,
        existing.departmentId,
        permissions,
      );

      if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConflictException('Membership changed after it was loaded');
      }

      await tx.membershipPermission.deleteMany({
        where: { membershipId: existing.id },
      });
      if (permissions.length > 0) {
        await tx.membershipPermission.createMany({
          data: permissions.map(capability => ({
            membershipId: existing.id,
            capability,
          })),
        });
      }

      const update = await tx.membership.updateMany({
        where: {
          id: existing.id,
          isActive: true,
          updatedAt: expectedUpdatedAt,
        },
        data: { updatedAt: new Date() },
      });
      if (update.count !== 1) {
        throw new ConflictException('Membership changed during update');
      }

      await appendAuditLog(tx, {
        actorUserId: admin.id,
        action: AuditAction.ROLE_PERMISSIONS_UPDATED,
        entityType: AuditEntityType.MEMBERSHIP,
        entityId: existing.id,
        departmentId: existing.departmentId,
      });

      const updated = await tx.membership.findUniqueOrThrow({
        where: { id: existing.id },
        select: assignmentSelect,
      });
      return serializeAssignment(updated);
    });
  }

  async deactivate(
    admin: AuthUserContext,
    membershipId: string,
    input: DeactivateMembershipInput,
  ) {
    const expectedUpdatedAt = requireExpectedUpdatedAt(input.expectedUpdatedAt);

    return this.prisma.$transaction(async tx => {
      const existing = await tx.membership.findUnique({
        where: { id: membershipId },
        select: {
          id: true,
          userId: true,
          role: true,
          departmentId: true,
          isActive: true,
          updatedAt: true,
        },
      });
      if (!existing?.isActive) {
        throw new NotFoundException('Active membership not found');
      }
      if (existing.userId === admin.id) {
        throw new ConflictException('You cannot deactivate your own assignment');
      }

      const currentAdmin = await this.loadCurrentActor(tx, admin);
      await this.assertActorCanManageAssignment(
        currentAdmin,
        existing.role,
        existing.departmentId,
        [],
      );

      if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConflictException('Membership changed after it was loaded');
      }

      const update = await tx.membership.updateMany({
        where: {
          id: existing.id,
          isActive: true,
          updatedAt: expectedUpdatedAt,
        },
        data: { isActive: false },
      });
      if (update.count !== 1) {
        throw new ConflictException('Membership changed during deactivation');
      }

      await appendAuditLog(tx, {
        actorUserId: admin.id,
        action: AuditAction.ROLE_ASSIGNMENT_DEACTIVATED,
        entityType: AuditEntityType.MEMBERSHIP,
        entityId: existing.id,
        departmentId: existing.departmentId,
      });

      return { status: 'ok' as const, membershipId: existing.id };
    });
  }

  private async loadCurrentActor(
    tx: Prisma.TransactionClient,
    admin: AuthUserContext,
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

    return {
      ...admin,
      memberships: current.memberships.map(membership => ({
        id: membership.id,
        role: membership.role,
        departmentId: membership.departmentId,
        permissions: membership.permissions.map(
          permission => permission.capability,
        ),
      })),
    };
  }

  private assertRoleShape(
    role: RoleType,
    departmentId: string | null,
    permissions: PermissionCapability[],
  ) {
    if (role === RoleType.SUPER_ADMIN) {
      if (departmentId !== null) {
        throw new BadRequestException(
          'SUPER_ADMIN assignment must not have departmentId',
        );
      }
    } else if (!departmentId) {
      throw new BadRequestException(
        role + ' assignment requires departmentId',
      );
    }

    if (role !== RoleType.DEPUTY && permissions.length > 0) {
      throw new BadRequestException(
        'Explicit permissions are supported only for DEPUTY memberships',
      );
    }
  }

  private async assertActorCanManageAssignment(
    admin: AuthUserContext,
    targetRole: RoleType,
    departmentId: string | null,
    permissions: PermissionCapability[],
  ) {
    if (
      targetRole === RoleType.SUPER_ADMIN ||
      targetRole === RoleType.DEPARTMENT_ADMIN
    ) {
      if (!this.authorization.isSuperAdmin(admin)) {
        throw new ForbiddenException(
          'Only Super Admin can manage administrator assignments',
        );
      }
      return;
    }

    if (!departmentId) {
      throw new BadRequestException('departmentId is required');
    }

    this.authorization.assertCapability(
      admin,
      PermissionCapability.ROLE_MANAGE,
      departmentId,
    );

    if (!this.authorization.isSuperAdmin(admin)) {
      for (const capability of permissions) {
        this.authorization.assertCapability(admin, capability, departmentId);
      }
    }
  }

  private async assertActiveDepartment(departmentId: string) {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { id: true },
    });
    if (!department) throw new NotFoundException('Department not found');
  }

  private async lockAssignment(
    tx: Prisma.TransactionClient,
    userId: string,
    role: RoleType,
    departmentId: string | null,
  ) {
    const key = ['membership', userId, role, departmentId ?? 'GLOBAL'].join(':');
    await tx.$queryRaw<Array<{ locked: number }>>`
      SELECT 1::int AS locked
      FROM (
        SELECT pg_advisory_xact_lock(hashtext(${key}))
      ) AS membership_lock
    `;
  }
}
