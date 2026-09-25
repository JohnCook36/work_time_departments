import { ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionCapability, RoleType } from '@prisma/client';

import { AuthUserContext } from './auth.service';

type MembershipContext = AuthUserContext['memberships'][number];

@Injectable()
export class AuthorizationService {
  isSuperAdmin(user: AuthUserContext): boolean {
    return user.memberships.some(
      membership => membership.role === RoleType.SUPER_ADMIN,
    );
  }

  hasCapability(
    user: AuthUserContext,
    capability: PermissionCapability,
    departmentId?: string | null,
  ): boolean {
    if (this.isSuperAdmin(user)) return true;

    return user.memberships.some(membership =>
      this.membershipAllows(membership, capability, departmentId ?? null),
    );
  }

  assertCapability(
    user: AuthUserContext,
    capability: PermissionCapability,
    departmentId?: string | null,
  ): void {
    if (!this.hasCapability(user, capability, departmentId)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }
  }

  assertCapabilityForDepartments(
    user: AuthUserContext,
    capability: PermissionCapability,
    departmentIds: readonly string[],
  ): void {
    for (const departmentId of new Set(departmentIds)) {
      this.assertCapability(user, capability, departmentId);
    }
  }

  departmentIdsForCapability(
    user: AuthUserContext,
    capability: PermissionCapability,
  ): string[] {
    const ids = user.memberships
      .filter(
        membership =>
          !!membership.departmentId &&
          this.membershipAllows(
            membership,
            capability,
            membership.departmentId,
          ),
      )
      .map(membership => membership.departmentId!);

    return [...new Set(ids)];
  }

  departmentIdsWithAnyCapability(user: AuthUserContext): string[] {
    const ids = user.memberships
      .filter(
        membership =>
          !!membership.departmentId &&
          (membership.role === RoleType.DEPARTMENT_ADMIN ||
            (membership.permissions?.length ?? 0) > 0),
      )
      .map(membership => membership.departmentId!);

    return [...new Set(ids)];
  }

  hasAnyManagementCapability(user: AuthUserContext): boolean {
    if (this.isSuperAdmin(user)) return true;

    return user.memberships.some(
      membership =>
        membership.role === RoleType.DEPARTMENT_ADMIN ||
        (membership.permissions?.length ?? 0) > 0,
    );
  }

  canAdministerDepartment(
    user: AuthUserContext,
    departmentId: string,
  ): boolean {
    return user.memberships.some(membership => {
      if (membership.role === RoleType.SUPER_ADMIN) {
        return true;
      }

      return (
        membership.role === RoleType.DEPARTMENT_ADMIN &&
        membership.departmentId === departmentId
      );
    });
  }

  assertCanAdministerDepartment(
    user: AuthUserContext,
    departmentId: string,
  ): void {
    if (!this.canAdministerDepartment(user, departmentId)) {
      throw new ForbiddenException(
        'You do not have permission to manage this department',
      );
    }
  }

  assertCanAdministerDepartments(
    user: AuthUserContext,
    departmentIds: readonly string[],
  ): void {
    for (const departmentId of new Set(departmentIds)) {
      this.assertCanAdministerDepartment(user, departmentId);
    }
  }

  private membershipAllows(
    membership: MembershipContext,
    capability: PermissionCapability,
    departmentId: string | null,
  ): boolean {
    if (membership.role === RoleType.SUPER_ADMIN) return true;

    if (
      departmentId &&
      membership.role === RoleType.DEPARTMENT_ADMIN &&
      membership.departmentId === departmentId
    ) {
      return true;
    }

    if (
      membership.departmentId !== departmentId ||
      !membership.permissions?.includes(capability)
    ) {
      return false;
    }

    return true;
  }
}
