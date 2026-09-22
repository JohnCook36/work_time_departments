import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Documentation metadata only. Existing controller/service validation remains authoritative.
export class CreateShiftChangeRequestDto {
  @ApiProperty({ enum: ['SWAP', 'COVER'] })
  kind!: string;

  @ApiProperty({ type: String })
  targetEmployeeId!: string;

  @ApiProperty({ type: String, description: 'Persisted Shift ID belonging to the requesting employee.' })
  requesterShiftId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Required for SWAP. May be omitted/null/empty for COVER; if supplied must belong to target employee.' })
  targetShiftId?: string | null;
}
