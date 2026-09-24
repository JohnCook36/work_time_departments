import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Documentation metadata only. Existing controller/service validation remains authoritative.
export class ScheduleCellChangeDto {
  @ApiProperty({ type: String })
  employeeId!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 31, description: 'Must exist in the selected month.' })
  day!: number;

  @ApiProperty({ enum: ['empty', 'off', 'shift'], description: 'empty deletes a stored cell; off stores OFF; shift requires distinct startTime/endTime.' })
  type!: string;

  @ApiPropertyOptional({ type: String, pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$', description: 'Required for shift. Overnight shifts allowed.' })
  startTime?: string;

  @ApiPropertyOptional({ type: String, pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$', description: 'Required for shift; cannot equal startTime.' })
  endTime?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'For shift: E, IN, INN, L, N (case insensitive), or null/omitted.' })
  code?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time', description: 'Omitted: no version precondition. null: cell must not exist. String: must exactly match stored Shift.updatedAt; mismatch returns 409.' })
  expectedUpdatedAt?: string | null;
}

export class ApplyPlannerChangesDto {
  @ApiProperty({ type: 'integer', minimum: 1970, maximum: 9999 })
  year!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 12 })
  month!: number;

  @ApiProperty({ type: () => [ScheduleCellChangeDto], minItems: 1, maxItems: 5000, description: 'Atomic batch; each employee/day pair must be unique. A single cell uses a one-item batch.' })
  changes!: ScheduleCellChangeDto[];
}

export class ApplyDepartmentChangesDto extends ApplyPlannerChangesDto {
  @ApiProperty({ type: String })
  departmentId!: string;
}

export class MaterializeFixedWeekdaysDto {
  @ApiProperty({ type: 'integer', minimum: 1970, maximum: 9999 })
  year!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 12 })
  month!: number;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 100, description: 'Every department requires existing management permission. DEPUTY is not granted access.' })
  departmentIds!: string[];
}


export class PublishDepartmentScheduleDto {
  @ApiProperty({ type: String })
  departmentId!: string;

  @ApiProperty({ type: 'integer', minimum: 1970, maximum: 9999 })
  year!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 12 })
  month!: number;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  comment?: string | null;

  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    nullable: true,
    description: 'Optional immutable ruleset/version identifier used for this publication.',
  })
  rulesVersion?: string | null;
}
