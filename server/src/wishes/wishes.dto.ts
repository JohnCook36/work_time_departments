import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Documentation metadata only. Existing controller/service validation remains authoritative.
export class CreateWishDto {
  @ApiProperty({ type: String })
  employeeId!: string;

  @ApiProperty({ type: 'integer', minimum: 1970, maximum: 9999 })
  year!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 12 })
  month!: number;

  @ApiPropertyOptional({ type: 'integer', nullable: true, minimum: 1, maximum: 31, description: 'Omitted/null means a general monthly wish; otherwise must exist in the month.' })
  day?: number | null;

  @ApiProperty({ type: String, minLength: 1, maxLength: 1000 })
  text!: string;
}
