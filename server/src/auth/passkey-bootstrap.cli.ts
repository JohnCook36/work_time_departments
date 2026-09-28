import {
  ActivationInvitationPurpose,
  AuditAction,
  AuditEntityType,
  PrismaClient,
  RoleType,
} from '@prisma/client';
import { randomBytes, randomInt } from 'node:crypto';

import {
  randomBase64Url,
  sha256Hex,
} from './passkey-webauthn';

const CONFIRMATION = 'INITIAL_PASSKEY_BOOTSTRAP';
const TTL_MS = 20 * 60 * 1000;
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function assertPasskeyBootstrapInput(input: {
  confirmation?: string;
  employeeId?: string;
}) {
  if (input.confirmation !== CONFIRMATION) {
    throw new Error(
      'Set AUTH_BOOTSTRAP_CONFIRM=' + CONFIRMATION + ' explicitly',
    );
  }
  if (!input.employeeId?.trim()) {
    throw new Error('Employee id argument is required');
  }
}

function shortCode() {
  let value = '';
  for (let index = 0; index < 10; index += 1) {
    value += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return value.slice(0, 5) + '-' + value.slice(5);
}

async function main() {
  const employeeId = process.argv[2]?.trim();
  assertPasskeyBootstrapInput({
    confirmation: process.env.AUTH_BOOTSTRAP_CONFIRM,
    employeeId,
  });

  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(async tx => {
      const employee = await tx.employee.findUnique({
        where: { id: employeeId! },
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
                  permissions: { select: { capability: true } },
                },
              },
              passkeyCredentials: {
                where: { revokedAt: null },
                select: { id: true },
              },
            },
          },
        },
      });

      if (
        !employee?.isActive ||
        !employee.userId ||
        !employee.user?.isActive
      ) {
        throw new Error('Target must be an active linked employee account');
      }

      const managementAccount = employee.user.memberships.some(
        membership =>
          membership.role === RoleType.SUPER_ADMIN ||
          membership.role === RoleType.DEPARTMENT_ADMIN ||
          membership.permissions.length > 0,
      );
      if (!managementAccount) {
        throw new Error(
          'Bootstrap is allowed only for an existing management account',
        );
      }

      if (employee.user.passkeyCredentials.length > 0) {
        throw new Error(
          'Account already has an active Passkey; use normal recovery flow',
        );
      }

      const userHandle =
        employee.user.webauthnUserHandle ?? randomBytes(32);
      if (!employee.user.webauthnUserHandle) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { webauthnUserHandle: userHandle },
        });
      }

      await tx.activationInvitation.updateMany({
        where: {
          employeeId: employee.id,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.authSession.updateMany({
        where: { userId: employee.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const token = randomBase64Url(32);
      const code = shortCode();
      const invitation = await tx.activationInvitation.create({
        data: {
          employeeId: employee.id,
          createdByUserId: employee.userId,
          purpose: ActivationInvitationPurpose.RECOVERY,
          tokenHash: sha256Hex(token),
          shortCodeHash: sha256Hex(code.replace('-', '')),
          userHandle,
          expiresAt: new Date(Date.now() + TTL_MS),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: employee.userId,
          action: AuditAction.ACTIVATION_INVITATION_CREATED,
          entityType: AuditEntityType.EMPLOYEE,
          entityId: employee.id,
          departmentId: employee.departmentId,
        },
      });

      return {
        token,
        code,
        invitationId: invitation.id,
        expiresAt: invitation.expiresAt.toISOString(),
      };
    });

    console.log('Initial Passkey bootstrap invitation created.');
    console.log('Invitation id: ' + result.invitationId);
    console.log('Expires at: ' + result.expiresAt);
    console.log('Activation token: ' + result.token);
    console.log('Fallback code: ' + result.code);
    console.log(
      'Treat the token/code as a credential and clear terminal history after transfer.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(error => {
    console.error(
      error instanceof Error ? error.message : 'Passkey bootstrap failed',
    );
    process.exitCode = 1;
  });
}
