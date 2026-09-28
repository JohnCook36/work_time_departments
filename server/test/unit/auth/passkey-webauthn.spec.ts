import {
  createHash,
  generateKeyPairSync,
  sign,
} from 'node:crypto';

import {
  authenticationResponseChallenge,
  registrationResponseChallenge,
  toBase64Url,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '../../../src/auth/passkey-webauthn';

function cborHead(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  if (value < 65536) {
    const buffer = Buffer.alloc(3);
    buffer[0] = (major << 5) | 25;
    buffer.writeUInt16BE(value, 1);
    return buffer;
  }
  const buffer = Buffer.alloc(5);
  buffer[0] = (major << 5) | 26;
  buffer.writeUInt32BE(value, 1);
  return buffer;
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
  if (Array.isArray(value)) {
    return Buffer.concat([
      cborHead(4, value.length),
      ...value.map(cbor),
    ]);
  }
  if (value instanceof Map) {
    const parts: Buffer[] = [cborHead(5, value.size)];
    value.forEach((item, key) => {
      parts.push(cbor(key), cbor(item));
    });
    return Buffer.concat(parts);
  }
  if (value && typeof value === 'object') {
    return cbor(new Map(Object.entries(value as Record<string, unknown>)));
  }
  throw new Error('Unsupported test CBOR value');
}

function clientData(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
  origin: string,
) {
  return Buffer.from(
    JSON.stringify({
      type,
      challenge,
      origin,
      crossOrigin: false,
    }),
    'utf8',
  );
}

function p256Fixture() {
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

  return { privateKey, cose };
}

function registrationFixture(input: {
  challenge: string;
  origin: string;
  rpId: string;
}) {
  const keys = p256Fixture();
  const credentialId = Buffer.from('credential-passkey-001');
  const rpHash = createHash('sha256').update(input.rpId).digest();
  const header = Buffer.alloc(37);
  rpHash.copy(header, 0);
  header[32] = 0x45; // UP + UV + AT
  header.writeUInt32BE(0, 33);
  const idLength = Buffer.alloc(2);
  idLength.writeUInt16BE(credentialId.length, 0);
  const authData = Buffer.concat([
    header,
    Buffer.alloc(16),
    idLength,
    credentialId,
    keys.cose,
  ]);
  const attestation = cbor(
    new Map<unknown, unknown>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authData],
    ]),
  );
  const rawClientData = clientData(
    'webauthn.create',
    input.challenge,
    input.origin,
  );

  return {
    privateKey: keys.privateKey,
    credentialId: toBase64Url(credentialId),
    publicKey: keys.cose,
    response: {
      id: toBase64Url(credentialId),
      rawId: toBase64Url(credentialId),
      type: 'public-key',
      response: {
        clientDataJSON: toBase64Url(rawClientData),
        attestationObject: toBase64Url(attestation),
        transports: ['internal'],
      },
    },
  };
}

function authenticationFixture(input: {
  challenge: string;
  origin: string;
  rpId: string;
  credentialId: string;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
  counter: number;
}) {
  const rpHash = createHash('sha256').update(input.rpId).digest();
  const authData = Buffer.alloc(37);
  rpHash.copy(authData, 0);
  authData[32] = 0x05; // UP + UV
  authData.writeUInt32BE(input.counter, 33);

  const rawClientData = clientData(
    'webauthn.get',
    input.challenge,
    input.origin,
  );
  const signed = Buffer.concat([
    authData,
    createHash('sha256').update(rawClientData).digest(),
  ]);
  const signature = sign('sha256', signed, input.privateKey);

  return {
    id: input.credentialId,
    rawId: input.credentialId,
    type: 'public-key',
    response: {
      clientDataJSON: toBase64Url(rawClientData),
      authenticatorData: toBase64Url(authData),
      signature: toBase64Url(signature),
      userHandle: toBase64Url(Buffer.from('user-handle')),
    },
  };
}

describe('passkey WebAuthn verification', () => {
  const challenge = toBase64Url(Buffer.from('challenge-32-bytes-value-1234567'));
  const origin = 'https://work.example.test';
  const rpId = 'work.example.test';

  it('verifies none-attestation ES256 registration with UV and RP binding', () => {
    const fixture = registrationFixture({ challenge, origin, rpId });

    expect(
      registrationResponseChallenge(fixture.response, origin),
    ).toBe(challenge);

    const result = verifyRegistrationResponse({
      response: fixture.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      rpId,
    });

    expect(result).toMatchObject({
      credentialId: fixture.credentialId,
      counter: 0n,
      transports: ['internal'],
    });
    expect(result.publicKey.equals(fixture.publicKey)).toBe(true);
  });

  it('verifies a signed assertion and advances its counter', () => {
    const registration = registrationFixture({ challenge, origin, rpId });
    const assertionChallenge = toBase64Url(
      Buffer.from('second-challenge-value-1234567890'),
    );
    const response = authenticationFixture({
      challenge: assertionChallenge,
      origin,
      rpId,
      credentialId: registration.credentialId,
      privateKey: registration.privateKey,
      counter: 3,
    });

    expect(
      authenticationResponseChallenge(response, origin),
    ).toBe(assertionChallenge);

    expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: assertionChallenge,
        expectedOrigin: origin,
        rpId,
        credential: {
          credentialId: registration.credentialId,
          publicKey: registration.publicKey,
          counter: 2n,
        },
      }),
    ).toEqual({
      credentialId: registration.credentialId,
      newCounter: 3n,
    });
  });

  it('rejects wrong origin, RP, challenge and non-advancing counter', () => {
    const registration = registrationFixture({ challenge, origin, rpId });

    expect(() =>
      verifyRegistrationResponse({
        response: registration.response,
        expectedChallenge: challenge,
        expectedOrigin: 'https://evil.example.test',
        rpId,
      }),
    ).toThrow(/origin mismatch/);

    expect(() =>
      verifyRegistrationResponse({
        response: registration.response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        rpId: 'other.example.test',
      }),
    ).toThrow(/RP ID hash mismatch/);

    expect(() =>
      verifyRegistrationResponse({
        response: registration.response,
        expectedChallenge: toBase64Url(Buffer.from('wrong-challenge')),
        expectedOrigin: origin,
        rpId,
      }),
    ).toThrow(/challenge mismatch/);

    const assertion = authenticationFixture({
      challenge,
      origin,
      rpId,
      credentialId: registration.credentialId,
      privateKey: registration.privateKey,
      counter: 4,
    });

    expect(() =>
      verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        rpId,
        credential: {
          credentialId: registration.credentialId,
          publicKey: registration.publicKey,
          counter: 4n,
        },
      }),
    ).toThrow(/counter did not advance/);
  });

  it('rejects cross-origin client data even when the origin string matches', () => {
    const registration = registrationFixture({ challenge, origin, rpId });
    registration.response.response.clientDataJSON = toBase64Url(
      Buffer.from(
        JSON.stringify({
          type: 'webauthn.create',
          challenge,
          origin,
          crossOrigin: true,
          topOrigin: 'https://evil.example.test',
        }),
        'utf8',
      ),
    );

    expect(() =>
      verifyRegistrationResponse({
        response: registration.response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        rpId,
      }),
    ).toThrow(/Cross-origin/);
  });

  it('rejects assertions with a tampered signature', () => {
    const registration = registrationFixture({ challenge, origin, rpId });
    const assertion = authenticationFixture({
      challenge,
      origin,
      rpId,
      credentialId: registration.credentialId,
      privateKey: registration.privateKey,
      counter: 1,
    });
    const signature = Buffer.from(assertion.response.signature, 'base64url');
    signature[0] ^= 0x01;
    assertion.response.signature = toBase64Url(signature);

    expect(() =>
      verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        rpId,
        credential: {
          credentialId: registration.credentialId,
          publicKey: registration.publicKey,
          counter: 0n,
        },
      }),
    ).toThrow(/signature verification failed/);
  });
});
