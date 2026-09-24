import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const KINDS = ['MAX_CONCURRENT_EMPLOYEES', 'MIN_STAFF_AT_TIME'];
const SCOPES = ['ORGANIZATION', 'DEPARTMENT', 'ROLE', 'SHIFT_TYPE'];
const SEVERITIES = ['HARD', 'SOFT'];

export class ScheduleRuleFieldsDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 120 })
  name?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 4000 })
  description?: string;

  @ApiPropertyOptional({ enum: KINDS })
  kind?: string;

  @ApiPropertyOptional({ enum: SCOPES })
  scope?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'ROLE requires a RoleType; SHIFT_TYPE requires E/IN/INN/L/N; omitted for organization/department scope.',
  })
  scopeValue?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Required only for DEPARTMENT scope.',
  })
  departmentId?: string | null;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 1000 })
  priority?: number;

  @ApiPropertyOptional({ enum: SEVERITIES })
  severity?: string;

  @ApiPropertyOptional({ type: Boolean })
  isActive?: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'MAX_CONCURRENT_EMPLOYEES: {maxConcurrent}; MIN_STAFF_AT_TIME: {time, minStaff}.',
  })
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 500 })
  violationMessage?: string;
}

export class CreateScheduleRuleDto extends ScheduleRuleFieldsDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  declare name: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 4000 })
  declare description: string;

  @ApiProperty({ enum: KINDS })
  declare kind: string;

  @ApiProperty({ enum: SCOPES })
  declare scope: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  declare config: Record<string, unknown>;

  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  declare violationMessage: string;
}

export class UpdateScheduleRuleDto extends ScheduleRuleFieldsDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Required optimistic version; stale writes return 409.',
  })
  expectedUpdatedAt!: string;
}

export class DeleteScheduleRuleDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Required optimistic version; stale writes return 409.',
  })
  expectedUpdatedAt!: string;
}
