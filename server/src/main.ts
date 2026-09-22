import { NestFactory } from '@nestjs/core';
import { loadEnvFile } from 'node:process';

import { AppModule } from './app.module';
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
  const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim();

  if (frontendOrigin) {
    app.enableCors({
      origin: frontendOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    });
  }

  setupOpenApi(app);
  await app.listen(port);
}

void bootstrap();
