import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Documentation metadata only. Existing controller/service validation remains authoritative.
export class EmployeeFieldsDto {
  @ApiPropertyOptional({ type: String, minLength: 2, maxLength: 160 })
  displayName?: string;

  @ApiPropertyOptional({ type: String })
  departmentId?: string;

  @ApiPropertyOptional({ type: Number, enum: [1, 0.75, 0.5], description: 'Defaults to 1 on create.' })
  employmentRate?: number;

  @ApiPropertyOptional({ enum: ['FLEXIBLE', 'FIXED_WEEKDAYS'], description: 'Defaults to FLEXIBLE on create. FIXED_WEEKDAYS requires distinct start/end times.' })
  scheduleMode?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'HH:MM; null or empty string clears the value. FLEXIBLE normalizes both times to null.' })
  fixedStartTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'HH:MM; null or empty string clears the value. Overnight hours are allowed.' })
  fixedEndTime?: string | null;
}

export class CreateEmployeeDto extends EmployeeFieldsDto {
  @ApiProperty({ required: true, type: String, minLength: 2, maxLength: 160 })
  declare displayName: string;

  @ApiProperty({ required: true, type: String })
  declare departmentId: string;
}

export class UpdateEmployeeDto extends EmployeeFieldsDto {
  @ApiProperty({ required: true, type: String, format: 'date-time', description: 'Required version from the last read; stale writes return 409.' })
  expectedUpdatedAt!: string;
}

export class DeactivateEmployeeDto {
  @ApiProperty({ required: true, type: String, format: 'date-time', description: 'Required version from the last read; stale writes return 409.' })
  expectedUpdatedAt!: string;
}

export class ReorderEmployeesDto {
  @ApiProperty({ required: true, type: String })
  declare departmentId: string;

  @ApiProperty({ type: [String], minItems: 1, uniqueItems: true, description: 'Complete list of active employees in this department.' })
  orderedEmployeeIds!: string[];

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string', format: 'date-time' }, description: 'A version for every listed employee ID.' })
  expectedUpdatedAtByEmployeeId!: Record<string, string>;
}
