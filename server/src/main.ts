import { NestFactory } from '@nestjs/core';
import { loadEnvFile } from 'node:process';

import { AppModule } from './app.module';
import { configureHttpSecurity } from './security/http-security';
import { setupOpenApi } from './openapi';

function loadRuntimeEnvironment(): void {
  try {
    loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function bootstrap(): Promise<void> {
  loadRuntimeEnvironment();

  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);

  configureHttpSecurity(app, {
    frontendOrigin: process.env.FRONTEND_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
  });

  setupOpenApi(app);
  await app.listen(port);
}

void bootstrap();
