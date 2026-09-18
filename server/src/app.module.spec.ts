import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

describe('AppModule', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    await moduleRef?.close();
  });

  it('compiles without connecting to PostgreSQL', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);
  });
});
