import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Documentation metadata only. Existing controller/service validation remains authoritative.
export class DepartmentFieldsDto {
  @ApiPropertyOptional({ type: String, minLength: 2, maxLength: 80 })
  name?: string;

  @ApiPropertyOptional({ enum: ['GENERAL', 'FO', 'NIGHT'], description: 'Defaults to GENERAL on create.' })
  kind?: string;
}

export class CreateDepartmentDto extends DepartmentFieldsDto {
  @ApiProperty({ required: true, type: String, minLength: 2, maxLength: 80 })
  declare name: string;
}

export class UpdateDepartmentDto extends DepartmentFieldsDto {
  @ApiProperty({ required: true, type: String, format: 'date-time', description: 'Required version from the last read; stale writes return 409.' })
  expectedUpdatedAt!: string;
}

export class DeactivateDepartmentDto {
  @ApiProperty({ required: true, type: String, format: 'date-time', description: 'Required version from the last read; stale writes return 409.' })
  expectedUpdatedAt!: string;
}

export class ReorderDepartmentsDto {
  @ApiProperty({ type: [String], minItems: 1, uniqueItems: true, description: 'Complete list of active departments.' })
  orderedDepartmentIds!: string[];

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string', format: 'date-time' }, description: 'A version for every listed department ID.' })
  expectedUpdatedAtByDepartmentId!: Record<string, string>;
}
