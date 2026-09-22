import { ApiProperty } from '@nestjs/swagger';

// Documentation metadata only. Existing controller/service validation remains authoritative.
export class RequestCodeDto {
  @ApiProperty({ type: String, description: 'Phone in international E.164 format.' })
  phone!: string;
}

export class VerifyCodeDto extends RequestCodeDto {
  @ApiProperty({ type: String, pattern: '^\\d{6}$', writeOnly: true, description: 'The six-digit code received by the user. No code examples are published.' })
  code!: string;
}
