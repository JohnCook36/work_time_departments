import { ForbiddenException, Injectable } from '@nestjs/common';
import { RoleType } from '@prisma/client';

import { AuthUserContext } from './auth.service';

@Injectable()
export class AuthorizationService {
  canAdministerDepartment(
    user: AuthUserContext,
    departmentId: string,
  ): boolean {
    return user.memberships.some((membership) => {
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
}
