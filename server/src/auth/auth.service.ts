import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { PermissionCapability, RoleType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  hashAuthRequestSource,
  hashOtp,
  hashSessionToken,
  normalizePhoneE164,
  safeHashEquals,
  validateOtpCode,
} from './auth.utils';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_REQUEST_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const DEFAULT_OTP_SOURCE_WINDOW_SECONDS = 10 * 60;
const DEFAULT_OTP_SOURCE_MAX_REQUESTS = 20;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthUserContext {
  id: string;
  phoneE164: string;
  employee: {
    id: string;
    displayName: string;
    departmentId: string;
    departmentName: string;
    employmentRate: number;
    scheduleMode?: 'FLEXIBLE' | 'FIXED_WEEKDAYS';
    fixedStartTime?: string | null;
    fixedEndTime?: string | null;
  } | null;
  memberships: Array<{
    id: string;
    role: RoleType;
    departmentId: string | null;
    permissions?: PermissionCapability[];
  }>;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async requestCode(
    rawPhone: string,
    requestSource?: string,
  ): Promise<{
    status: 'sent';
    expiresInSeconds: number;
  }> {
    let phoneE164: string;

    try {
      phoneE164 = normalizePhoneE164(rawPhone);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid phone number',
      );
    }

    const pepper = this.getOtpPepper();
    const code = this.getOtpCode();
    this.assertOtpDeliveryConfigured();
    const sourceHash = requestSource
      ? hashAuthRequestSource(requestSource, pepper)
      : null;
    const sourceRateLimit = this.getOtpSourceRateLimit();

    await this.prisma.$transaction(async (tx) => {
      // Serialize request-code for the same normalized phone across backend instances.
      // A hash collision can only over-serialize unrelated phones; it cannot bypass cooldown.
      await tx.$queryRaw<Array<{ locked: number }>>`
        SELECT 1::int AS locked
        FROM (
          SELECT pg_advisory_xact_lock(hashtext(${phoneE164}))
        ) AS phone_lock
      `;

      if (sourceHash) {
        await tx.$queryRaw<Array<{ locked: number }>>`
          SELECT 1::int AS locked
          FROM (
            SELECT pg_advisory_xact_lock(hashtext(${sourceHash}))
          ) AS source_lock
        `;
      }

      const now = new Date();
      const challengeRetentionMs = Math.max(
        OTP_TTL_MS,
        sourceRateLimit.windowMs,
      );
      await tx.authChallenge.deleteMany({
        where: {
          createdAt: {
            lt: new Date(now.getTime() - challengeRetentionMs),
          },
        },
      });

      const recentChallenge = await tx.authChallenge.findFirst({
        where: {
          phoneE164,
          createdAt: {
            gt: new Date(now.getTime() - OTP_REQUEST_COOLDOWN_MS),
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentChallenge) {
        throw new HttpException(
          'Please wait before requesting another code',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (sourceHash) {
        const [sourceUsage] = await tx.$queryRaw<
          Array<{ requestCount: number }>
        >`
          SELECT COUNT(*)::int AS "requestCount"
          FROM "AuthChallenge"
          WHERE "requestSourceHash" = ${sourceHash}
            AND "createdAt" > ${new Date(
              now.getTime() - sourceRateLimit.windowMs,
            )}
        `;

        if (
          (sourceUsage?.requestCount ?? 0) >= sourceRateLimit.maxRequests
        ) {
          throw new HttpException(
            'Too many code requests from this source',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      await tx.authChallenge.create({
        data: {
          phoneE164,
          codeHash: hashOtp(code, pepper),
          requestSourceHash: sourceHash,
          expiresAt: new Date(now.getTime() + OTP_TTL_MS),
          maxAttempts: OTP_MAX_ATTEMPTS,
        },
      });

      await this.deliverOtp(phoneE164, code);
    });

    return {
      status: 'sent',
      expiresInSeconds: OTP_TTL_MS / 1000,
    };
  }

  async verifyCode(
    rawPhone: string,
    rawCode: string,
  ): Promise<{
    token: string;
    expiresAt: string;
    user: {
      id: string;
      phoneE164: string;
      onboardingRequired: boolean;
    };
  }> {
    let phoneE164: string;
    let code: string;

    try {
      phoneE164 = normalizePhoneE164(rawPhone);
      code = validateOtpCode(rawCode);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid authentication data',
      );
    }

    await this.cleanupInactiveSessions();

    const challenge = await this.prisma.authChallenge.findFirst({
      where: {
        phoneE164,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Code is invalid or expired');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new HttpException(
        'Too many verification attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const reservationTime = new Date();
    const reservedAttempt = await this.prisma.authChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: reservationTime },
        attempts: { lt: challenge.maxAttempts },
      },
      data: { attempts: { increment: 1 } },
    });

    if (reservedAttempt.count !== 1) {
      const currentChallenge = await this.prisma.authChallenge.findUnique({
        where: { id: challenge.id },
        select: {
          attempts: true,
          maxAttempts: true,
          consumedAt: true,
          expiresAt: true,
        },
      });

      if (
        currentChallenge &&
        currentChallenge.consumedAt === null &&
        currentChallenge.expiresAt.getTime() > Date.now() &&
        currentChallenge.attempts >= currentChallenge.maxAttempts
      ) {
        throw new HttpException(
          'Too many verification attempts',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException('Code is invalid or expired');
    }

    const suppliedHash = hashOtp(code, this.getOtpPepper());

    if (!safeHashEquals(challenge.codeHash, suppliedHash)) {
      throw new UnauthorizedException('Code is invalid or expired');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const result = await this.prisma.$transaction(async (tx) => {
      const consumeTime = new Date();
      const consumedChallenge = await tx.authChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: consumeTime },
        },
        data: { consumedAt: consumeTime },
      });

      if (consumedChallenge.count !== 1) {
        throw new UnauthorizedException('Code is invalid or expired');
      }

      const user = await tx.user.upsert({
        where: { phoneE164 },
        create: { phoneE164 },
        update: {},
        include: {
          employee: true,
        },
      });

      if (!user.isActive) {
        throw new ForbiddenException('Account is inactive');
      }

      await tx.authSession.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      return user;
    });

    return {
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: result.id,
        phoneE164: result.phoneE164,
        onboardingRequired: result.employee === null,
      },
    };
  }

  async getCurrentUser(rawToken: string): Promise<AuthUserContext> {
    await this.cleanupInactiveSessions();
    const tokenHash = hashSessionToken(rawToken);

    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            employee: {
              include: {
                department: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            memberships: {
              where: { isActive: true },
              include: {
                permissions: {
                  select: {
                    capability: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException('Session is invalid or expired');
    }

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      id: session.user.id,
      phoneE164: session.user.phoneE164,
      employee: session.user.employee
        ? {
            id: session.user.employee.id,
            displayName: session.user.employee.displayName,
            departmentId: session.user.employee.departmentId,
            departmentName: session.user.employee.department.name,
            employmentRate: session.user.employee.employmentRate,
            scheduleMode: session.user.employee.scheduleMode,
            fixedStartTime: session.user.employee.fixedStartTime,
            fixedEndTime: session.user.employee.fixedEndTime,
          }
        : null,
      memberships: session.user.memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        departmentId: membership.departmentId,
        permissions: membership.permissions.map(
          permission => permission.capability,
        ),
      })),
    };
  }

  async logout(rawToken: string): Promise<{ status: 'ok' }> {
    const tokenHash = hashSessionToken(rawToken);

    await this.prisma.authSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { status: 'ok' };
  }

  private getOtpSourceRateLimit(): { windowMs: number; maxRequests: number } {
    const rawWindowSeconds = process.env.AUTH_OTP_SOURCE_WINDOW_SECONDS;
    const rawMaxRequests = process.env.AUTH_OTP_SOURCE_MAX_REQUESTS;
    const windowSeconds = rawWindowSeconds
      ? Number(rawWindowSeconds)
      : DEFAULT_OTP_SOURCE_WINDOW_SECONDS;
    const maxRequests = rawMaxRequests
      ? Number(rawMaxRequests)
      : DEFAULT_OTP_SOURCE_MAX_REQUESTS;

    if (
      !Number.isInteger(windowSeconds) ||
      windowSeconds < 60 ||
      windowSeconds > 24 * 60 * 60 ||
      !Number.isInteger(maxRequests) ||
      maxRequests < 1 ||
      maxRequests > 1000
    ) {
      throw new ServiceUnavailableException(
        'OTP source rate limit is not configured correctly',
      );
    }

    return {
      windowMs: windowSeconds * 1000,
      maxRequests,
    };
  }

  private getOtpPepper(): string {
    const pepper = process.env.AUTH_OTP_PEPPER;

    if (!pepper || pepper.length < 32) {
      throw new ServiceUnavailableException(
        'OTP hashing secret is not configured',
      );
    }

    return pepper;
  }

  private getOtpCode(): string {
    if (process.env.NODE_ENV === 'production') {
      return randomInt(0, 1_000_000).toString().padStart(6, '0');
    }

    if (process.env.AUTH_ALLOW_DEV_OTP !== 'true') {
      throw new ServiceUnavailableException(
        'SMS OTP provider is not configured',
      );
    }

    const code = process.env.AUTH_DEV_OTP_CODE;

    if (!code) {
      throw new ServiceUnavailableException(
        'Development OTP code is not configured',
      );
    }

    try {
      return validateOtpCode(code);
    } catch {
      throw new ServiceUnavailableException(
        'Development OTP code must contain exactly 6 digits',
      );
    }
  }

  private assertOtpDeliveryConfigured(): void {
    if (process.env.NODE_ENV !== 'production') return;

    const url = process.env.AUTH_OTP_PROVIDER_URL?.trim();
    const token = process.env.AUTH_OTP_PROVIDER_TOKEN?.trim();
    const rawTimeoutMs = process.env.AUTH_OTP_PROVIDER_TIMEOUT_MS;
    const timeoutMs = rawTimeoutMs ? Number(rawTimeoutMs) : 5000;

    if (!url || !token) {
      throw new ServiceUnavailableException(
        'SMS OTP provider is not configured',
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new ServiceUnavailableException(
        'SMS OTP provider is not configured correctly',
      );
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new ServiceUnavailableException(
        'SMS OTP provider URL must use HTTPS in production',
      );
    }

    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1000 ||
      timeoutMs > 15000
    ) {
      throw new ServiceUnavailableException(
        'SMS OTP provider timeout is not configured correctly',
      );
    }
  }

  private async deliverOtp(phoneE164: string, code: string): Promise<void> {
    if (process.env.NODE_ENV !== 'production') return;

    const url = process.env.AUTH_OTP_PROVIDER_URL?.trim();
    const token = process.env.AUTH_OTP_PROVIDER_TOKEN?.trim();
    const rawTimeoutMs = process.env.AUTH_OTP_PROVIDER_TIMEOUT_MS;
    const timeoutMs = rawTimeoutMs ? Number(rawTimeoutMs) : 5000;

    if (!url || !token) {
      throw new ServiceUnavailableException(
        'SMS OTP provider is not configured',
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new ServiceUnavailableException(
        'SMS OTP provider is not configured correctly',
      );
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new ServiceUnavailableException(
        'SMS OTP provider URL must use HTTPS in production',
      );
    }

    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1000 ||
      timeoutMs > 15000
    ) {
      throw new ServiceUnavailableException(
        'SMS OTP provider timeout is not configured correctly',
      );
    }

    try {
      const response = await fetch(parsedUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ phoneE164, code }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error('provider rejected delivery');
      }
    } catch {
      throw new ServiceUnavailableException(
        'OTP delivery provider failed',
      );
    }
  }

  private async cleanupInactiveSessions(): Promise<void> {
    const now = new Date();
    await this.prisma.authSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { revokedAt: { not: null } },
        ],
      },
    });
  }
}
