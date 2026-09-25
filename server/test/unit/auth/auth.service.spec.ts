import {
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from '../../../src/auth/auth.service';
import { hashOtp } from '../../../src/auth/auth.utils';
import { PrismaService } from '../../../src/prisma/prisma.service';

const PHONE = '+79991234567';
const VALID_CODE = '123456';
const PEPPER = 'test-pepper-value-that-is-longer-than-32-characters';

function prismaMock() {
  const mock = {
    authChallenge: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    user: {
      upsert: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  mock.$transaction.mockImplementation(
    async (callback: (tx: typeof mock) => unknown) => callback(mock),
  );

  return mock;
}

function challenge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'challenge-1',
    phoneE164: PHONE,
    codeHash: hashOtp(VALID_CODE, PEPPER),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    maxAttempts: 5,
    consumedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService OTP verification concurrency', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: AuthService;
  const originalPepper = process.env.AUTH_OTP_PEPPER;

  beforeEach(() => {
    process.env.AUTH_OTP_PEPPER = PEPPER;
    prisma = prismaMock();
    service = new AuthService(prisma as unknown as PrismaService);

    prisma.authChallenge.findFirst.mockResolvedValue(challenge());
    prisma.authChallenge.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.upsert.mockResolvedValue({
      id: 'user-1',
      phoneE164: PHONE,
      isActive: true,
      employee: null,
    });
    prisma.authSession.create.mockResolvedValue({ id: 'session-1' });
  });

  afterAll(() => {
    if (originalPepper === undefined) {
      delete process.env.AUTH_OTP_PEPPER;
    } else {
      process.env.AUTH_OTP_PEPPER = originalPepper;
    }
  });

  it('atomically reserves one attempt before checking the supplied code', async () => {
    await service.verifyCode(PHONE, VALID_CODE);

    expect(prisma.authChallenge.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'challenge-1',
          consumedAt: null,
          attempts: { lt: 5 },
          expiresAt: { gt: expect.any(Date) },
        }),
        data: { attempts: { increment: 1 } },
      }),
    );
  });

  it('rejects when another request consumed the challenge before session creation', async () => {
    prisma.authChallenge.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.verifyCode(PHONE, VALID_CODE),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('returns 429 when the atomic reservation loses the last available attempt', async () => {
    prisma.authChallenge.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.authChallenge.findUnique.mockResolvedValue(
      challenge({ attempts: 5 }),
    );

    let error: unknown;
    try {
      await service.verifyCode(PHONE, VALID_CODE);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('counts an invalid code attempt without consuming the challenge', async () => {
    await expect(
      service.verifyCode(PHONE, '654321'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.authChallenge.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('consumes a verified challenge exactly once before creating a session', async () => {
    await service.verifyCode(PHONE, VALID_CODE);

    expect(prisma.authChallenge.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'challenge-1',
          consumedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
        data: { consumedAt: expect.any(Date) },
      }),
    );
    expect(prisma.user.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.authSession.create).toHaveBeenCalledTimes(1);
  });
});


describe('AuthService development OTP safety', () => {
  const allowKey = ['AUTH', 'ALLOW', 'DEV', 'OTP'].join('_');
  const codeKey = ['AUTH', 'DEV', 'OTP', 'CODE'].join('_');
  const pepperKey = ['AUTH', 'OTP', 'PEPPER'].join('_');
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllow = process.env[allowKey];
  const originalCode = process.env[codeKey];
  const originalPepper = process.env[pepperKey];
  const sourceWindowKey = 'AUTH_OTP_SOURCE_WINDOW_SECONDS';
  const originalSourceWindow = process.env[sourceWindowKey];

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalAllow === undefined) delete process.env[allowKey];
    else process.env[allowKey] = originalAllow;

    if (originalCode === undefined) delete process.env[codeKey];
    else process.env[codeKey] = originalCode;

    if (originalPepper === undefined) delete process.env[pepperKey];
    else process.env[pepperKey] = originalPepper;

    if (originalSourceWindow === undefined) delete process.env[sourceWindowKey];
    else process.env[sourceWindowKey] = originalSourceWindow;
  });

  function requestCodeService() {
    const prisma = prismaMock();
    prisma.authChallenge.findFirst.mockResolvedValue(null);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    prisma.$queryRaw.mockResolvedValue([]);
    process.env[pepperKey] = PEPPER;
    process.env[codeKey] = VALID_CODE;

    return {
      prisma,
      service: new AuthService(prisma as unknown as PrismaService),
    };
  }

  it('fails closed when dev OTP opt-in is missing', async () => {
    delete process.env.NODE_ENV;
    delete process.env[allowKey];
    const { service, prisma } = requestCodeService();

    await expect(service.requestCode(PHONE)).rejects.toThrow(
      'SMS OTP provider is not configured',
    );
    expect(prisma.authChallenge.create).not.toHaveBeenCalled();
  });

  it('allows dev OTP only with explicit opt-in outside production', async () => {
    process.env.NODE_ENV = 'development';
    process.env[allowKey] = 'true';
    const { service, prisma } = requestCodeService();

    await expect(service.requestCode(PHONE)).resolves.toEqual({
      status: 'sent',
      expiresInSeconds: 300,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.authChallenge.create).toHaveBeenCalledTimes(1);
  });

  it('prunes challenges older than the active OTP source rate-limit window', async () => {
    process.env.NODE_ENV = 'development';
    process.env[allowKey] = 'true';
    process.env[sourceWindowKey] = '1800';
    const { service, prisma } = requestCodeService();
    const before = Date.now();

    await service.requestCode(PHONE);

    const after = Date.now();
    expect(prisma.authChallenge.deleteMany).toHaveBeenCalledTimes(1);
    const cutoff =
      prisma.authChallenge.deleteMany.mock.calls[0][0].where.createdAt.lt;
    expect(cutoff).toBeInstanceOf(Date);
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 30 * 60 * 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - 30 * 60 * 1000);
  });

  it('returns 429 without creating another challenge inside the locked cooldown', async () => {
    process.env.NODE_ENV = 'development';
    process.env[allowKey] = 'true';
    const { service, prisma } = requestCodeService();
    prisma.authChallenge.findFirst.mockResolvedValue(challenge());

    let error: unknown;
    try {
      await service.requestCode(PHONE);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.authChallenge.create).not.toHaveBeenCalled();
  });

  it('always rejects dev OTP in production even when opt-in is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env[allowKey] = 'true';
    const { service, prisma } = requestCodeService();

    await expect(service.requestCode(PHONE)).rejects.toThrow(
      'SMS OTP provider is not configured',
    );
    expect(prisma.authChallenge.create).not.toHaveBeenCalled();
  });
});
