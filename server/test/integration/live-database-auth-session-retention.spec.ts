import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { hashSessionToken } from '../../src/auth/auth.utils';
import { PrismaService } from '../../src/prisma/prisma.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

describeLive('live PostgreSQL auth-session retention', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (
      !databaseUrl.includes('work_time_departments_test') ||
      (!databaseUrl.includes('localhost') &&
        !databaseUrl.includes('127.0.0.1'))
    ) {
      throw new Error(
        'Live database tests require a dedicated local work_time_departments_test database',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('removes invalid sessions when a fresh login session is created', async () => {
    const phone = '+79990000887';
    const user = await prisma.user.create({
      data: { phoneE164: phone },
    });
    const expired = await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken('expired-session-token'),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const revoked = await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken('revoked-session-token'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: new Date(),
      },
    });

    const pepper = process.env.AUTH_OTP_PEPPER;
    const allow = process.env.AUTH_ALLOW_DEV_OTP;
    const code = process.env.AUTH_DEV_OTP_CODE;
    const nodeEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_ALLOW_DEV_OTP = 'true';
      process.env.AUTH_DEV_OTP_CODE = '123456';
      process.env.AUTH_OTP_PEPPER =
        'live-test-pepper-value-that-is-longer-than-32-characters';

      await auth.requestCode(phone);
      await auth.verifyCode(phone, '123456');

      expect(
        await prisma.authSession.findUnique({ where: { id: expired.id } }),
      ).toBeNull();
      expect(
        await prisma.authSession.findUnique({ where: { id: revoked.id } }),
      ).toBeNull();
      expect(
        await prisma.authSession.count({
          where: { userId: user.id },
        }),
      ).toBe(1);
    } finally {
      if (pepper === undefined) delete process.env.AUTH_OTP_PEPPER;
      else process.env.AUTH_OTP_PEPPER = pepper;
      if (allow === undefined) delete process.env.AUTH_ALLOW_DEV_OTP;
      else process.env.AUTH_ALLOW_DEV_OTP = allow;
      if (code === undefined) delete process.env.AUTH_DEV_OTP_CODE;
      else process.env.AUTH_DEV_OTP_CODE = code;
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;

      await prisma.authSession.deleteMany({ where: { userId: user.id } });
      await prisma.authChallenge.deleteMany({ where: { phoneE164: phone } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
