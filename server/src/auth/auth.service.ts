import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { RoleType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  hashOtp,
  hashSessionToken,
  normalizePhoneE164,
  safeHashEquals,
  validateOtpCode,
} from './auth.utils';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_REQUEST_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
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
  }>;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async requestCode(rawPhone: string): Promise<{
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
    const code = this.getDevelopmentOtpCode();

    await this.prisma.$transaction(async (tx) => {
      // Serialize request-code for the same normalized phone across backend instances.
      // A hash collision can only over-serialize unrelated phones; it cannot bypass cooldown.
      await tx.$queryRaw<Array<{ locked: number }>>`
        SELECT 1::int AS locked
        FROM (
          SELECT pg_advisory_xact_lock(hashtext(${phoneE164}))
        ) AS phone_lock
      `;

      const now = new Date();
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

      await tx.authChallenge.create({
        data: {
          phoneE164,
          codeHash: hashOtp(code, pepper),
          expiresAt: new Date(now.getTime() + OTP_TTL_MS),
          maxAttempts: OTP_MAX_ATTEMPTS,
        },
      });
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

  private getOtpPepper(): string {
    const pepper = process.env.AUTH_OTP_PEPPER;

    if (!pepper || pepper.length < 32) {
      throw new ServiceUnavailableException(
        'OTP hashing secret is not configured',
      );
    }

    return pepper;
  }

  private getDevelopmentOtpCode(): string {
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.AUTH_ALLOW_DEV_OTP !== 'true'
    ) {
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
}
