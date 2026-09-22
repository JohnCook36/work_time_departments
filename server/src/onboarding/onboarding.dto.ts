import { ApiProperty } from '@nestjs/swagger';

// Documentation metadata only. Existing controller/service validation remains authoritative.
export class LinkEmployeeDto {
  @ApiProperty({ type: String })
  employeeId!: string;
}

export class RegisterEmployeeDto {
  @ApiProperty({ type: String, minLength: 3, maxLength: 160 })
  displayName!: string;

  @ApiProperty({ type: String })
  departmentId!: string;
}
