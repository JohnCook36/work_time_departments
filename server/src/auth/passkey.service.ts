import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ActivationInvitationPurpose,
  AuditAction,
  AuditEntityType,
  PermissionCapability,
  Prisma,
  RoleType,
  WebAuthnChallengeType,
} from '@prisma/client';
import { randomBytes, randomInt } from 'node:crypto';

import { appendAuditLog } from '../audit/audit-log';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUserContext } from './auth.service';
import { AuthorizationService } from './authorization.service';
import { hashSessionToken } from './auth.utils';
import {
  authenticationOptions,
  authenticationResponseChallenge,
  type AuthenticationResponseJSON,
  randomBase64Url,
  registrationOptions,
  registrationResponseChallenge,
  type RegistrationResponseJSON,
  sha256Hex,
  toBase64Url,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from './passkey-webauthn';

const INVITATION_TTL_MS = 20 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SHORT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function normalizeShortCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function invitationSecretHashes(secret: string) {
  const trimmed = secret.trim();
  if (!trimmed) throw new BadRequestException('Activation token or code is required');
  return {
    tokenHash: sha256Hex(trimmed),
    shortCodeHash: sha256Hex(normalizeShortCode(trimmed)),
  };
}

function prismaBytes(
  value: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(value.byteLength);
  const copy = new Uint8Array(buffer);
  copy.set(value);
  return copy;
}

function createShortCode(): string {
  let value = '';
  for (let index = 0; index < 10; index += 1) {
    value += SHORT_CODE_ALPHABET[randomInt(0, SHORT_CODE_ALPHABET.length)];
  }
  return value.slice(0, 5) + '-' + value.slice(5);
}

function safeInvitation(invitation: {
  id: string;
  purpose: ActivationInvitationPurpose;
  expiresAt: Date;
  employee: {
    id: string;
    displayName: string;
    department: { id: string; name: string };
  };
}) {
  return {
    invitationId: invitation.id,
    purpose: invitation.purpose,
    expiresAt: invitation.expiresAt.toISOString(),
    employee: {
      id: invitation.employee.id,
      displayName: invitation.employee.displayName,
      departmentId: invitation.employee.department.id,
      departmentName: invitation.employee.department.name,
    },
  };
}

@Injectable()
export class PasskeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  private config() {
    const rpId = process.env.WEBAUTHN_RP_ID?.trim();
    const origin = process.env.WEBAUTHN_ORIGIN?.trim();
    const rpName = process.env.WEBAUTHN_RP_NAME?.trim() || 'Work Time Departments';

    if (!rpId || !origin) {
      throw new ServiceUnavailableException(
        'WebAuthn RP ID and origin are not configured',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ServiceUnavailableException('WEBAUTHN_ORIGIN is invalid');
    }

    if (
      process.env.NODE_ENV === 'production' &&
      parsed.protocol !== 'https:'
    ) {
      throw new ServiceUnavailableException(
        'WEBAUTHN_ORIGIN must use HTTPS in production',
      );
    }

    if (
      parsed.hostname !== rpId &&
      !parsed.hostname.endsWith('.' + rpId)
    ) {
      throw new ServiceUnavailableException(
        'WEBAUTHN_RP_ID must match the configured origin host',
      );
    }

    return { rpId, origin: parsed.origin, rpName };
  }

  private async currentManager(
    tx: Prisma.TransactionClient,
    admin: AuthUserContext,
    departmentId: string,
  ): Promise<AuthUserContext> {
    const current = await tx.user.findUnique({
      where: { id: admin.id },
      select: {
        isActive: true,
        memberships: {
          where: { isActive: true },
          select: {
            id: true,
            role: true,
            departmentId: true,
            permissions: { select: { capability: true } },
          },
        },
      },
    });

    if (!current?.isActive) {
      throw new ForbiddenException('Manager account is inactive');
    }

    const currentAdmin: AuthUserContext = {
      ...admin,
      memberships: current.memberships.map(membership => ({
        id: membership.id,
        role: membership.role,
        departmentId: membership.departmentId,
        permissions: membership.permissions.map(item => item.capability),
      })),
    };

    this.authorization.assertCapability(
      currentAdmin,
      PermissionCapability.EMPLOYEE_MANAGE,
      departmentId,
    );

    return currentAdmin;
  }

  private async createInvitation(
    tx: Prisma.TransactionClient,
    admin: AuthUserContext,
    employee: {
      id: string;
      displayName: string;
      departmentId: string;
      department: { id: string; name: string };
    },
    purpose: ActivationInvitationPurpose,
    userHandle?: Buffer,
  ) {
    await this.currentManager(tx, admin, employee.departmentId);

    const now = new Date();
    await tx.activationInvitation.updateMany({
      where: {
        employeeId: employee.id,
        consumedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    await tx.activationInvitation.deleteMany({
      where: {
        employeeId: employee.id,
        OR: [
          { consumedAt: { not: null } },
          { revokedAt: { not: null } },
          { expiresAt: { lte: now } },
        ],
      },
    });

    const token = randomBase64Url(32);
    const shortCode = createShortCode();
    const invitation = await tx.activationInvitation.create({
      data: {
        employeeId: employee.id,
        createdByUserId: admin.id,
        purpose,
        tokenHash: sha256Hex(token),
        shortCodeHash: sha256Hex(normalizeShortCode(shortCode)),
        userHandle: prismaBytes(userHandle ?? randomBytes(32)),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    await appendAuditLog(tx, {
      actorUserId: admin.id,
      action: AuditAction.ACTIVATION_INVITATION_CREATED,
      entityType: AuditEntityType.EMPLOYEE,
      entityId: employee.id,
      departmentId: employee.departmentId,
    });

    return {
      ...safeInvitation({
        ...invitation,
        employee: {
          id: employee.id,
          displayName: employee.displayName,
          department: employee.department,
        },
      }),
      token,
      shortCode,
    };
  }

  async issueActivationInvitation(
    admin: AuthUserContext,
    employeeId: string,
  ) {
    return this.prisma.$transaction(async tx => {
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          displayName: true,
          departmentId: true,
          isActive: true,
          userId: true,
          department: { select: { id: true, name: true } },
        },
      });

      if (!employee?.isActive) throw new NotFoundException('Employee not found');
      await this.currentManager(tx, admin, employee.departmentId);

      if (employee.userId) {
        throw new ConflictException(
          'Employee is already activated; use access recovery instead',
        );
      }

      return this.createInvitation(
        tx,
        admin,
        employee,
        ActivationInvitationPurpose.ACTIVATION,
      );
    });
  }

  async resetAccessAndIssueRecovery(
    admin: AuthUserContext,
    employeeId: string,
  ) {
    return this.prisma.$transaction(async tx => {
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          departmentId: true,
          isActive: true,
          userId: true,
          user: {
            select: {
              isActive: true,
              webauthnUserHandle: true,
              memberships: {
                where: { isActive: true },
                select: {
                  role: true,
                  permissions: {
                    select: { capability: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!employee?.isActive) throw new NotFoundException('Employee not found');
      const currentAdmin = await this.currentManager(
        tx,
        admin,
        employee.departmentId,
      );

      if (!employee.userId || !employee.user?.isActive) {
        throw new ConflictException('Employee has no active account to recover');
      }
      if (employee.userId === currentAdmin.id) {
        throw new ConflictException(
          'Use your authenticated credential management flow for your own account',
        );
      }

      const targetHasManagementAccess = employee.user.memberships.some(
        membership =>
          membership.role === RoleType.SUPER_ADMIN ||
          membership.role === RoleType.DEPARTMENT_ADMIN ||
          membership.permissions.length > 0,
      );
      if (
        targetHasManagementAccess &&
        !this.authorization.isSuperAdmin(currentAdmin)
      ) {
        throw new ConflictException(
          'Only Super Admin can reset access for a management account',
        );
      }

      const userHandle =
        employee.user.webauthnUserHandle ?? randomBytes(32);
      if (!employee.user.webauthnUserHandle) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { webauthnUserHandle: prismaBytes(userHandle) },
        });
      }

      await tx.passkeyCredential.deleteMany({
        where: { userId: employee.userId },
      });
      await tx.authSession.updateMany({
        where: { userId: employee.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await appendAuditLog(tx, {
        actorUserId: admin.id,
        action: AuditAction.PASSKEY_CREDENTIALS_RESET,
        entityType: AuditEntityType.EMPLOYEE,
        entityId: employee.id,
        departmentId: employee.departmentId,
      });

      return this.createInvitation(
        tx,
        admin,
        employee,
        ActivationInvitationPurpose.RECOVERY,
        prismaBytes(userHandle),
      );
    });
  }

  private async findActiveInvitation(secret: string) {
    const now = new Date();
    await this.prisma.activationInvitation.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    const hashes = invitationSecretHashes(secret);
    const invitation = await this.prisma.activationInvitation.findFirst({
      where: {
        OR: [
          { tokenHash: hashes.tokenHash },
          { shortCodeHash: hashes.shortCodeHash },
        ],
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        employee: {
          select: {
            id: true,
            displayName: true,
            departmentId: true,
            isActive: true,
            userId: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!invitation || !invitation.employee.isActive) {
      throw new UnauthorizedException('Activation invitation is invalid or expired');
    }

    if (
      invitation.purpose === ActivationInvitationPurpose.ACTIVATION &&
      invitation.employee.userId
    ) {
      throw new ConflictException('Employee account is already activated');
    }
    if (
      invitation.purpose === ActivationInvitationPurpose.RECOVERY &&
      !invitation.employee.userId
    ) {
      throw new ConflictException('Recovery account no longer exists');
    }

    return invitation;
  }

  async resolveInvitation(secret: string) {
    return safeInvitation(await this.findActiveInvitation(secret));
  }

  async createRegistrationOptions(secret: string) {
    const config = this.config();
    const invitation = await this.findActiveInvitation(secret);

    await this.prisma.webAuthnChallenge.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });

    const challenge = randomBase64Url(32);
    await this.prisma.webAuthnChallenge.create({
      data: {
        challengeHash: sha256Hex(challenge),
        type: WebAuthnChallengeType.REGISTER,
        invitationId: invitation.id,
        userId: invitation.employee.userId ?? null,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    const existing = invitation.employee.userId
      ? await this.prisma.passkeyCredential.findMany({
          where: {
            userId: invitation.employee.userId,
            revokedAt: null,
          },
          select: { credentialId: true, transports: true },
        })
      : [];

    return registrationOptions({
      challenge,
      rpId: config.rpId,
      rpName: config.rpName,
      userHandle: Buffer.from(invitation.userHandle),
      userName:
        'wtd-' + toBase64Url(invitation.userHandle).slice(0, 16),
      excludeCredentialIds: existing.map(item => ({
        id: item.credentialId,
        transports: item.transports,
      })),
    });
  }

  async completeRegistration(
    secret: string,
    response: RegistrationResponseJSON,
  ) {
    const config = this.config();
    const invitation = await this.findActiveInvitation(secret);
    const challengeValue = registrationResponseChallenge(
      response,
      config.origin,
    );

    const challenge = await this.prisma.webAuthnChallenge.findFirst({
      where: {
        challengeHash: sha256Hex(challengeValue),
        type: WebAuthnChallengeType.REGISTER,
        invitationId: invitation.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!challenge) {
      throw new UnauthorizedException('WebAuthn challenge is invalid or expired');
    }

    let verified;
    try {
      verified = verifyRegistrationResponse({
        response,
        expectedChallenge: challengeValue,
        expectedOrigin: config.origin,
        rpId: config.rpId,
      });
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Passkey registration failed',
      );
    }

    const rawSession = randomBase64Url(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    return this.prisma.$transaction(async tx => {
      const now = new Date();

      const consumedChallenge = await tx.webAuthnChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumedChallenge.count !== 1) {
        throw new ConflictException('WebAuthn challenge was already used');
      }

      const consumedInvitation = await tx.activationInvitation.updateMany({
        where: {
          id: invitation.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumedInvitation.count !== 1) {
        throw new ConflictException('Activation invitation was already used');
      }

      const currentEmployee = await tx.employee.findUnique({
        where: { id: invitation.employee.id },
        select: {
          id: true,
          displayName: true,
          departmentId: true,
          isActive: true,
          userId: true,
        },
      });
      if (!currentEmployee?.isActive) {
        throw new ConflictException('Employee is no longer active');
      }

      let userId: string;
      if (invitation.purpose === ActivationInvitationPurpose.ACTIVATION) {
        if (currentEmployee.userId) {
          throw new ConflictException('Employee account was already activated');
        }

        const user = await tx.user.create({
          data: {
            phoneE164: null,
            webauthnUserHandle: prismaBytes(invitation.userHandle),
          },
          select: { id: true },
        });
        userId = user.id;

        const linked = await tx.employee.updateMany({
          where: {
            id: currentEmployee.id,
            isActive: true,
            userId: null,
          },
          data: { userId },
        });
        if (linked.count !== 1) {
          throw new ConflictException('Employee account changed during activation');
        }

        await tx.membership.create({
          data: {
            userId,
            departmentId: currentEmployee.departmentId,
            role: RoleType.EMPLOYEE,
          },
        });
      } else {
        if (!currentEmployee.userId) {
          throw new ConflictException('Recovery account is no longer linked');
        }
        userId = currentEmployee.userId;

        const recoveryUser = await tx.user.findUnique({
          where: { id: userId },
          select: { isActive: true, webauthnUserHandle: true },
        });
        if (
          !recoveryUser?.isActive ||
          !recoveryUser.webauthnUserHandle ||
          !Buffer.from(recoveryUser.webauthnUserHandle).equals(
            Buffer.from(invitation.userHandle),
          )
        ) {
          throw new ConflictException('Recovery account changed during activation');
        }
      }

      await tx.passkeyCredential.create({
        data: {
          userId,
          credentialId: verified.credentialId,
          publicKey: prismaBytes(verified.publicKey),
          counter: verified.counter,
          transports: verified.transports,
        },
      });

      await tx.authSession.create({
        data: {
          userId,
          tokenHash: hashSessionToken(rawSession),
          expiresAt,
        },
      });

      await appendAuditLog(tx, {
        actorUserId: userId,
        action: AuditAction.PASSKEY_REGISTERED,
        entityType: AuditEntityType.EMPLOYEE,
        entityId: currentEmployee.id,
        departmentId: currentEmployee.departmentId,
      });

      await tx.activationInvitation.delete({
        where: { id: invitation.id },
      });

      return {
        token: rawSession,
        expiresAt: expiresAt.toISOString(),
        user: {
          id: userId,
          phoneE164: null,
          onboardingRequired: false,
        },
      };
    });
  }

  async createAuthenticationOptions() {
    const config = this.config();
    await this.prisma.webAuthnChallenge.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });

    const challenge = randomBase64Url(32);
    await this.prisma.webAuthnChallenge.create({
      data: {
        challengeHash: sha256Hex(challenge),
        type: WebAuthnChallengeType.AUTHENTICATE,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    return authenticationOptions({
      challenge,
      rpId: config.rpId,
    });
  }

  async completeAuthentication(response: AuthenticationResponseJSON) {
    const config = this.config();
    const challengeValue = authenticationResponseChallenge(
      response,
      config.origin,
    );
    const challengeHash = sha256Hex(challengeValue);

    const challenge = await this.prisma.webAuthnChallenge.findFirst({
      where: {
        challengeHash,
        type: WebAuthnChallengeType.AUTHENTICATE,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge) {
      throw new UnauthorizedException('WebAuthn challenge is invalid or expired');
    }

    const credentialId =
      typeof response.rawId === 'string'
        ? response.rawId
        : typeof response.id === 'string'
          ? response.id
          : '';
    if (!credentialId) throw new UnauthorizedException('Credential id is required');

    const credential = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId },
      include: {
        user: {
          select: {
            id: true,
            isActive: true,
            webauthnUserHandle: true,
            employee: {
              select: { id: true, isActive: true },
            },
          },
        },
      },
    });

    if (
      !credential ||
      credential.revokedAt ||
      !credential.user.isActive ||
      !credential.user.employee?.isActive ||
      !credential.user.webauthnUserHandle
    ) {
      throw new UnauthorizedException('Passkey is not active');
    }

    const responseUserHandle = response.response?.userHandle;
    if (
      typeof responseUserHandle !== 'string' ||
      responseUserHandle !== toBase64Url(credential.user.webauthnUserHandle)
    ) {
      throw new UnauthorizedException('Passkey user handle mismatch');
    }

    let verified;
    try {
      verified = verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeValue,
        expectedOrigin: config.origin,
        rpId: config.rpId,
        credential: {
          credentialId: credential.credentialId,
          publicKey: Buffer.from(credential.publicKey),
          counter: credential.counter,
        },
      });
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Passkey authentication failed',
      );
    }

    const rawSession = randomBase64Url(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    return this.prisma.$transaction(async tx => {
      const now = new Date();
      const consumed = await tx.webAuthnChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('WebAuthn challenge was already used');
      }

      const currentCredential = await tx.passkeyCredential.findUnique({
        where: { id: credential.id },
        select: { counter: true, revokedAt: true, userId: true },
      });
      if (!currentCredential || currentCredential.revokedAt) {
        throw new UnauthorizedException('Passkey was revoked');
      }
      if (
        currentCredential.counter > 0n &&
        verified.newCounter <= currentCredential.counter
      ) {
        throw new UnauthorizedException('Passkey counter is stale');
      }

      await tx.passkeyCredential.update({
        where: { id: credential.id },
        data: {
          counter: verified.newCounter,
          lastUsedAt: now,
        },
      });
      await tx.authSession.create({
        data: {
          userId: currentCredential.userId,
          tokenHash: hashSessionToken(rawSession),
          expiresAt,
        },
      });

      return {
        token: rawSession,
        expiresAt: expiresAt.toISOString(),
        userId: currentCredential.userId,
      };
    });
  }

  async listCredentials(user: AuthUserContext) {
    const credentials = await this.prisma.passkeyCredential.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        transports: true,
      },
    });

    return credentials.map(item => ({
      id: item.id,
      createdAt: item.createdAt.toISOString(),
      lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
      transports: item.transports,
    }));
  }

  async revokeCredential(user: AuthUserContext, credentialId: string) {
    const activeCount = await this.prisma.passkeyCredential.count({
      where: { userId: user.id, revokedAt: null },
    });
    if (activeCount <= 1) {
      throw new ConflictException(
        'The last passkey cannot be removed without a recovery invitation',
      );
    }

    const result = await this.prisma.passkeyCredential.deleteMany({
      where: {
        id: credentialId,
        userId: user.id,
        revokedAt: null,
      },
    });
    if (result.count !== 1) throw new NotFoundException('Passkey not found');

    return { status: 'ok' as const };
  }
}
