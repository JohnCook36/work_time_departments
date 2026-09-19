import { ForbiddenException, Injectable } from '@nestjs/common';
import { RoleType } from '@prisma/client';

import { AuthUserContext } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  listManageable(user: AuthUserContext) {
    const isSuperAdmin = user.memberships.some(
      (membership) => membership.role === RoleType.SUPER_ADMIN,
    );

    const departmentIds = Array.from(
      new Set(
        user.memberships
          .filter(
            (membership) =>
              membership.role === RoleType.DEPARTMENT_ADMIN &&
              membership.departmentId !== null,
          )
          .map((membership) => membership.departmentId as string),
      ),
    );

    if (!isSuperAdmin && departmentIds.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to manage departments',
      );
    }

    return this.prisma.department.findMany({
      where: {
        isActive: true,
        ...(isSuperAdmin ? {} : { id: { in: departmentIds } }),
      },
      select: {
        id: true,
        name: true,
        kind: true,
        position: true,
        updatedAt: true,
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }
}
