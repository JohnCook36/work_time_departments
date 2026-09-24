import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const KINDS = ['MAX_CONCURRENT_EMPLOYEES', 'MIN_STAFF_AT_TIME'];
const SCOPES = ['ORGANIZATION', 'DEPARTMENT', 'ROLE', 'SHIFT_TYPE'];
const SEVERITIES = ['HARD', 'SOFT'];

export class CreateScheduleRuleDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  name!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 4000 })
  description!: string;

  @ApiProperty({ enum: KINDS })
  kind!: string;

  @ApiProperty({ enum: SCOPES })
  scope!: string;

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
    description: 'Required at runtime only for DEPARTMENT scope.',
  })
  departmentId?: string | null;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 1000 })
  priority?: number;

  @ApiPropertyOptional({ enum: SEVERITIES })
  severity?: string;

  @ApiPropertyOptional({ type: Boolean })
  isActive?: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'MAX_CONCURRENT_EMPLOYEES: {maxConcurrent}; MIN_STAFF_AT_TIME: {time, minStaff}.',
  })
  config!: Record<string, unknown>;

  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  violationMessage!: string;
}

export class UpdateScheduleRuleDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 120 })
  name?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 4000 })
  description?: string;

  @ApiPropertyOptional({ enum: KINDS })
  kind?: string;

  @ApiPropertyOptional({ enum: SCOPES })
  scope?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  scopeValue?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  departmentId?: string | null;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 1000 })
  priority?: number;

  @ApiPropertyOptional({ enum: SEVERITIES })
  severity?: string;

  @ApiPropertyOptional({ type: Boolean })
  isActive?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 500 })
  violationMessage?: string;

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
