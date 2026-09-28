import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  RoleType,
} from '@prisma/client';
import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';

import type { AuthUserContext } from '../../src/auth/auth.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import {
  toBase64Url,
} from '../../src/auth/passkey-webauthn';
import { PasskeyService } from '../../src/auth/passkey.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const describeLive =
  process.env.LIVE_DATABASE_TESTS === '1' ? describe : describe.skip;

function cborHead(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  if (value < 65536) {
    const buffer = Buffer.alloc(3);
    buffer[0] = (major << 5) | 25;
    buffer.writeUInt16BE(value, 1);
    return buffer;
  }
  throw new Error('Test CBOR value is too large');
}

function cbor(value: unknown): Buffer {
  if (typeof value === 'number') {
    return value >= 0
      ? cborHead(0, value)
      : cborHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const body = Buffer.from(value, 'utf8');
    return Buffer.concat([cborHead(3, body.length), body]);
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([cborHead(2, value.length), value]);
  }
  if (value instanceof Map) {
    const parts: Buffer[] = [cborHead(5, value.size)];
    value.forEach((item, key) => {
      parts.push(cbor(key), cbor(item));
    });
    return Buffer.concat(parts);
  }
  throw new Error('Unsupported test CBOR');
}

function clientData(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
  origin: string,
) {
  return Buffer.from(
    JSON.stringify({ type, challenge, origin, crossOrigin: false }),
    'utf8',
  );
}

function registrationResponse(input: {
  challenge: string;
  origin: string;
  rpId: string;
}) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = publicKey.export({ format: 'jwk' });
  if (!jwk.x || !jwk.y) throw new Error('Missing P-256 coordinates');

  const cose = cbor(
    new Map<unknown, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, 'base64url')],
      [-3, Buffer.from(jwk.y, 'base64url')],
    ]),
  );
  const credentialId = Buffer.from(
    'live-passkey-' + Math.random().toString(36).slice(2),
  );
  const header = Buffer.alloc(37);
  createHash('sha256').update(input.rpId).digest().copy(header, 0);
  header[32] = 0x45;
  header.writeUInt32BE(0, 33);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(credentialId.length, 0);
  const authData = Buffer.concat([
    header,
    Buffer.alloc(16),
    length,
    credentialId,
    cose,
  ]);
  const attestation = cbor(
    new Map<unknown, unknown>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authData],
    ]),
  );

  return {
    privateKey,
    credentialId: toBase64Url(credentialId),
    response: {
      id: toBase64Url(credentialId),
      rawId: toBase64Url(credentialId),
      type: 'public-key',
      response: {
        clientDataJSON: toBase64Url(
          clientData('webauthn.create', input.challenge, input.origin),
        ),
        attestationObject: toBase64Url(attestation),
        transports: ['internal'],
      },
    },
  };
}

function authenticationResponse(input: {
  challenge: string;
  origin: string;
  rpId: string;
  credentialId: string;
  privateKey: KeyObject;
  userHandle: string;
  counter: number;
}) {
  const authData = Buffer.alloc(37);
  createHash('sha256').update(input.rpId).digest().copy(authData, 0);
  authData[32] = 0x05;
  authData.writeUInt32BE(input.counter, 33);

  const rawClient = clientData(
    'webauthn.get',
    input.challenge,
    input.origin,
  );
  const signature = sign(
    'sha256',
    Buffer.concat([
      authData,
      createHash('sha256').update(rawClient).digest(),
    ]),
    input.privateKey,
  );

  return {
    id: input.credentialId,
    rawId: input.credentialId,
    type: 'public-key',
    response: {
      clientDataJSON: toBase64Url(rawClient),
      authenticatorData: toBase64Url(authData),
      signature: toBase64Url(signature),
      userHandle: input.userHandle,
    },
  };
}

describeLive('live PostgreSQL passkey activation', () => {
  let prisma: PrismaService;
  let passkeys: PasskeyService;
  let manager: AuthUserContext;
  let departmentId: string;
  let targetEmployeeId: string;

  const originalRpId = process.env.WEBAUTHN_RP_ID;
  const originalOrigin = process.env.WEBAUTHN_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;

  async function clearDatabase() {
    await prisma.webAuthnChallenge.deleteMany();
    await prisma.activationInvitation.deleteMany();
    await prisma.passkeyCredential.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.authChallenge.deleteMany();
    await prisma.onboardingRequest.deleteMany();
    await prisma.membershipPermission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        "SET LOCAL wtd.audit_retention_delete = 'on'",
      );
      await tx.auditLog.deleteMany();
    });
    await prisma.user.deleteMany();
    await prisma.department.deleteMany();
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (
      !url.includes('work_time_departments_test') ||
      (!url.includes('localhost') && !url.includes('127.0.0.1'))
    ) {
      throw new Error(
        'Live passkey tests require the dedicated local test database',
      );
    }

    process.env.NODE_ENV = 'test';
    process.env.WEBAUTHN_RP_ID = 'work.example.test';
    process.env.WEBAUTHN_ORIGIN = 'https://work.example.test';

    prisma = new PrismaService();
    await prisma.$connect();
    passkeys = new PasskeyService(prisma, new AuthorizationService());
  });

  beforeEach(async () => {
    await clearDatabase();

    const department = await prisma.department.create({
      data: { name: 'Passkey Front Office', kind: 'FO' },
    });
    departmentId = department.id;

    const managerUser = await prisma.user.create({
      data: { phoneE164: '+12025551001' },
    });
    const managerMembership = await prisma.membership.create({
      data: {
        userId: managerUser.id,
        departmentId,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });
    manager = {
      id: managerUser.id,
      phoneE164: managerUser.phoneE164,
      employee: null,
      memberships: [{
        id: managerMembership.id,
        role: managerMembership.role,
        departmentId,
      }],
    };

    const employee = await prisma.employee.create({
      data: {
        displayName: 'Passkey Employee',
        departmentId,
      },
    });
    targetEmployeeId = employee.id;
  });

  afterAll(async () => {
    if (prisma) {
      await clearDatabase();
      await prisma.$disconnect();
    }
    if (originalRpId === undefined) delete process.env.WEBAUTHN_RP_ID;
    else process.env.WEBAUTHN_RP_ID = originalRpId;
    if (originalOrigin === undefined) delete process.env.WEBAUTHN_ORIGIN;
    else process.env.WEBAUTHN_ORIGIN = originalOrigin;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('activates once, authenticates, blocks replay and revokes old access on recovery', async () => {
    const invitation = await passkeys.issueActivationInvitation(
      manager,
      targetEmployeeId,
    );

    expect(invitation.token).not.toContain(targetEmployeeId);
    expect(invitation.shortCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    const registrationOptions = await passkeys.createRegistrationOptions(
      invitation.token,
    );
    expect(registrationOptions.user.id).toBeTruthy();

    const fixture = registrationResponse({
      challenge: registrationOptions.challenge,
      origin: 'https://work.example.test',
      rpId: 'work.example.test',
    });
    const activated = await passkeys.completeRegistration(
      invitation.token,
      fixture.response,
    );

    const linked = await prisma.employee.findUniqueOrThrow({
      where: { id: targetEmployeeId },
      include: { user: true },
    });
    expect(linked.userId).toBe(activated.user.id);
    expect(linked.user?.phoneE164).toBeNull();
    expect(linked.user?.webauthnUserHandle).not.toBeNull();
    expect(
      await prisma.membership.count({
        where: {
          userId: linked.userId!,
          departmentId,
          role: RoleType.EMPLOYEE,
          isActive: true,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.passkeyCredential.count({
        where: { userId: linked.userId!, revokedAt: null },
      }),
    ).toBe(1);
    expect(
      await prisma.authSession.count({
        where: { userId: linked.userId!, revokedAt: null },
      }),
    ).toBe(1);

    await expect(
      passkeys.completeRegistration(invitation.token, fixture.response),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const authOptions = await passkeys.createAuthenticationOptions();
    const assertion = authenticationResponse({
      challenge: authOptions.challenge,
      origin: 'https://work.example.test',
      rpId: 'work.example.test',
      credentialId: fixture.credentialId,
      privateKey: fixture.privateKey,
      userHandle: registrationOptions.user.id,
      counter: 1,
    });

    await expect(
      passkeys.completeAuthentication(assertion),
    ).resolves.toMatchObject({ userId: linked.userId });

    await expect(
      passkeys.completeAuthentication(assertion),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const futureAuthOptions = await passkeys.createAuthenticationOptions();
    const futureAssertion = authenticationResponse({
      challenge: futureAuthOptions.challenge,
      origin: 'https://work.example.test',
      rpId: 'work.example.test',
      credentialId: fixture.credentialId,
      privateKey: fixture.privateKey,
      userHandle: registrationOptions.user.id,
      counter: 2,
    });

    const recovery = await passkeys.resetAccessAndIssueRecovery(
      manager,
      targetEmployeeId,
    );
    expect(recovery.purpose).toBe('RECOVERY');

    expect(
      await prisma.passkeyCredential.count({
        where: { userId: linked.userId!, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.authSession.count({
        where: { userId: linked.userId!, revokedAt: null },
      }),
    ).toBe(0);

    await expect(
      passkeys.completeAuthentication(futureAssertion),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const recoveryOptions = await passkeys.createRegistrationOptions(
      recovery.shortCode,
    );
    expect(recoveryOptions.user.id).toBe(registrationOptions.user.id);
  });

  it('serializes concurrent invitations and leaves exactly one usable secret', async () => {
    const [left, right] = await Promise.all([
      passkeys.issueActivationInvitation(manager, targetEmployeeId),
      passkeys.issueActivationInvitation(manager, targetEmployeeId),
    ]);

    expect(
      await prisma.activationInvitation.count({
        where: {
          employeeId: targetEmployeeId,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ).toBe(1);

    const resolutions = await Promise.allSettled([
      passkeys.resolveInvitation(left.token),
      passkeys.resolveInvitation(right.token),
    ]);

    expect(
      resolutions.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      resolutions.filter(result => result.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('does not let a department admin reset another management account', async () => {
    const targetUser = await prisma.user.create({
      data: {
        phoneE164: '+12025551002',
        webauthnUserHandle: new Uint8Array(new ArrayBuffer(32)).fill(7),
      },
    });
    await prisma.employee.update({
      where: { id: targetEmployeeId },
      data: { userId: targetUser.id },
    });
    await prisma.membership.create({
      data: {
        userId: targetUser.id,
        departmentId,
        role: RoleType.DEPARTMENT_ADMIN,
      },
    });

    await expect(
      passkeys.resetAccessAndIssueRecovery(manager, targetEmployeeId),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
