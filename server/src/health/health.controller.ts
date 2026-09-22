import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { okResponse } from '../openapi.responses';

import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({ status: 200, schema: okResponse })
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
