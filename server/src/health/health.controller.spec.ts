import { Test } from '@nestjs/testing';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('is mounted at GET /health', () => {
    expect(Reflect.getMetadata('path', HealthController)).toBe('health');
    expect(Reflect.getMetadata('path', HealthController.prototype.getHealth)).toBe('/');
    expect(Reflect.getMetadata('method', HealthController.prototype.getHealth)).toBe(0);
  });

  it('returns an ok status', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    const controller = moduleRef.get(HealthController);

    expect(controller.getHealth()).toEqual({ status: 'ok' });

    await moduleRef.close();
  });
});
