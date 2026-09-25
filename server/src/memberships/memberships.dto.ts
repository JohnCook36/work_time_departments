import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PermissionCapability, RoleType } from '@prisma/client';

export class CreateMembershipAssignmentDto {
  @ApiProperty({ type: String })
  employeeId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Required for every role except SUPER_ADMIN.',
  })
  departmentId?: string | null;

  @ApiProperty({ enum: RoleType })
  role!: RoleType;

  @ApiPropertyOptional({
    enum: PermissionCapability,
    isArray: true,
    description: 'Explicit capabilities are allowed only for DEPUTY.',
  })
  permissions?: PermissionCapability[];
}

export class ReplaceMembershipPermissionsDto {
  @ApiProperty({ enum: PermissionCapability, isArray: true })
  permissions!: PermissionCapability[];

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Optimistic version from the last read.',
  })
  expectedUpdatedAt!: string;
}

export class DeactivateMembershipDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Optimistic version from the last read.',
  })
  expectedUpdatedAt!: string;
}
