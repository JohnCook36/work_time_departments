import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
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

  await app.listen(port);
}

void bootstrap();
