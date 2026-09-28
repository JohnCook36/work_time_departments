import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as verifySignature,
} from 'node:crypto';

export interface RegistrationResponseJSON {
  id?: unknown;
  rawId?: unknown;
  type?: unknown;
  response?: {
    clientDataJSON?: unknown;
    attestationObject?: unknown;
    transports?: unknown;
  };
}

export interface AuthenticationResponseJSON {
  id?: unknown;
  rawId?: unknown;
  type?: unknown;
  response?: {
    clientDataJSON?: unknown;
    authenticatorData?: unknown;
    signature?: unknown;
    userHandle?: unknown;
  };
}

export interface VerifiedRegistration {
  credentialId: string;
  publicKey: Buffer;
  counter: bigint;
  transports: string[];
}

export interface StoredPasskey {
  credentialId: string;
  publicKey: Buffer;
  counter: bigint;
}

export interface VerifiedAuthentication {
  credentialId: string;
  newCounter: bigint;
}

interface CborResult {
  value: unknown;
  next: number;
}

function requireBase64Url(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error(field + ' must be base64url');
  }
  return value;
}

export function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

export function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function randomBase64Url(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeLength(buffer: Buffer, offset: number, additional: number) {
  if (additional < 24) return { length: additional, next: offset };
  if (additional === 24) {
    if (offset + 1 > buffer.length) throw new Error('Malformed CBOR length');
    return { length: buffer.readUInt8(offset), next: offset + 1 };
  }
  if (additional === 25) {
    if (offset + 2 > buffer.length) throw new Error('Malformed CBOR length');
    return { length: buffer.readUInt16BE(offset), next: offset + 2 };
  }
  if (additional === 26) {
    if (offset + 4 > buffer.length) throw new Error('Malformed CBOR length');
    return { length: buffer.readUInt32BE(offset), next: offset + 4 };
  }
  if (additional === 27) {
    if (offset + 8 > buffer.length) throw new Error('Malformed CBOR length');
    const length = buffer.readBigUInt64BE(offset);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('CBOR length exceeds safe range');
    }
    return { length: Number(length), next: offset + 8 };
  }
  throw new Error('Indefinite CBOR is not supported');
}

function decodeCbor(buffer: Buffer, offset = 0): CborResult {
  if (offset >= buffer.length) throw new Error('Malformed CBOR');
  const first = buffer.readUInt8(offset);
  const major = first >> 5;
  const additional = first & 31;
  const decoded = decodeLength(buffer, offset + 1, additional);
  const length = decoded.length;
  let cursor = decoded.next;

  if (major === 0) return { value: length, next: cursor };
  if (major === 1) return { value: -1 - length, next: cursor };

  if (major === 2) {
    if (cursor + length > buffer.length) throw new Error('Malformed CBOR bytes');
    return {
      value: buffer.subarray(cursor, cursor + length),
      next: cursor + length,
    };
  }

  if (major === 3) {
    if (cursor + length > buffer.length) throw new Error('Malformed CBOR text');
    return {
      value: buffer.subarray(cursor, cursor + length).toString('utf8'),
      next: cursor + length,
    };
  }

  if (major === 4) {
    const values: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const item = decodeCbor(buffer, cursor);
      values.push(item.value);
      cursor = item.next;
    }
    return { value: values, next: cursor };
  }

  if (major === 5) {
    const values = new Map<unknown, unknown>();
    for (let index = 0; index < length; index += 1) {
      const key = decodeCbor(buffer, cursor);
      cursor = key.next;
      const value = decodeCbor(buffer, cursor);
      cursor = value.next;
      values.set(key.value, value.value);
    }
    return { value: values, next: cursor };
  }

  if (major === 6) {
    const tagged = decodeCbor(buffer, cursor);
    return { value: tagged.value, next: tagged.next };
  }

  if (major === 7) {
    if (additional === 20) return { value: false, next: offset + 1 };
    if (additional === 21) return { value: true, next: offset + 1 };
    if (additional === 22) return { value: null, next: offset + 1 };
    throw new Error('Unsupported CBOR simple value');
  }

  throw new Error('Unsupported CBOR value');
}

function requireMap(value: unknown, field: string): Map<unknown, unknown> {
  if (!(value instanceof Map)) throw new Error(field + ' must be a CBOR map');
  return value;
}

function requireBytes(value: unknown, field: string): Buffer {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new Error(field + ' must be bytes');
  }
  return Buffer.from(value);
}

function parseClientData(
  encoded: unknown,
  expectedType: 'webauthn.create' | 'webauthn.get',
  expectedOrigin: string,
) {
  const raw = fromBase64Url(requireBase64Url(encoded, 'clientDataJSON'));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('clientDataJSON is invalid');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('clientDataJSON is invalid');
  }
  const data = parsed as Record<string, unknown>;
  if (data.type !== expectedType) throw new Error('WebAuthn ceremony type mismatch');
  if (data.origin !== expectedOrigin) throw new Error('WebAuthn origin mismatch');
  const challenge = requireBase64Url(data.challenge, 'challenge');
  return { raw, challenge };
}

function verifyAuthenticatorHeader(
  authData: Buffer,
  rpId: string,
  requireAttestedCredential: boolean,
) {
  if (authData.length < 37) throw new Error('Authenticator data is too short');
  const expectedRpIdHash = createHash('sha256').update(rpId).digest();
  const rpIdHash = authData.subarray(0, 32);
  if (!rpIdHash.equals(expectedRpIdHash)) {
    throw new Error('WebAuthn RP ID hash mismatch');
  }

  const flags = authData.readUInt8(32);
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const attestedCredential = (flags & 0x40) !== 0;

  if (!userPresent || !userVerified) {
    throw new Error('WebAuthn user verification is required');
  }
  if (requireAttestedCredential && !attestedCredential) {
    throw new Error('Registration did not include an attested credential');
  }

  return {
    counter: BigInt(authData.readUInt32BE(33)),
    flags,
  };
}

export function registrationResponseChallenge(
  response: RegistrationResponseJSON,
  expectedOrigin: string,
): string {
  return parseClientData(
    response.response?.clientDataJSON,
    'webauthn.create',
    expectedOrigin,
  ).challenge;
}

export function authenticationResponseChallenge(
  response: AuthenticationResponseJSON,
  expectedOrigin: string,
): string {
  return parseClientData(
    response.response?.clientDataJSON,
    'webauthn.get',
    expectedOrigin,
  ).challenge;
}

export function verifyRegistrationResponse(input: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  rpId: string;
}): VerifiedRegistration {
  const response = input.response;
  if (response.type !== 'public-key') throw new Error('Invalid credential type');

  const rawId = requireBase64Url(response.rawId ?? response.id, 'rawId');
  const id = requireBase64Url(response.id ?? response.rawId, 'id');
  if (fromBase64Url(rawId).compare(fromBase64Url(id)) !== 0) {
    throw new Error('Credential id mismatch');
  }

  const client = parseClientData(
    response.response?.clientDataJSON,
    'webauthn.create',
    input.expectedOrigin,
  );
  if (client.challenge !== input.expectedChallenge) {
    throw new Error('WebAuthn challenge mismatch');
  }

  const attestationObject = fromBase64Url(
    requireBase64Url(
      response.response?.attestationObject,
      'attestationObject',
    ),
  );
  const decoded = decodeCbor(attestationObject);
  if (decoded.next !== attestationObject.length) {
    throw new Error('Trailing CBOR in attestation object');
  }
  const attestation = requireMap(decoded.value, 'attestationObject');
  if (attestation.get('fmt') !== 'none') {
    throw new Error('Only privacy-preserving none attestation is accepted');
  }

  const authData = requireBytes(attestation.get('authData'), 'authData');
  const header = verifyAuthenticatorHeader(authData, input.rpId, true);

  let cursor = 37;
  if (cursor + 18 > authData.length) {
    throw new Error('Attested credential data is incomplete');
  }
  cursor += 16; // AAGUID
  const credentialIdLength = authData.readUInt16BE(cursor);
  cursor += 2;
  if (credentialIdLength < 1 || cursor + credentialIdLength > authData.length) {
    throw new Error('Credential id length is invalid');
  }
  const credentialId = authData.subarray(cursor, cursor + credentialIdLength);
  cursor += credentialIdLength;

  if (!credentialId.equals(fromBase64Url(rawId))) {
    throw new Error('Attested credential id does not match rawId');
  }

  const publicKeyStart = cursor;
  const publicKeyDecoded = decodeCbor(authData, publicKeyStart);
  const publicKey = authData.subarray(publicKeyStart, publicKeyDecoded.next);
  parseCosePublicKey(publicKey);

  const transportsRaw = response.response?.transports;
  const transports = Array.isArray(transportsRaw)
    ? transportsRaw.filter(
        (item): item is string =>
          typeof item === 'string' && item.length > 0 && item.length <= 40,
      )
    : [];

  return {
    credentialId: toBase64Url(credentialId),
    publicKey: Buffer.from(publicKey),
    counter: header.counter,
    transports: Array.from(new Set(transports)).slice(0, 8),
  };
}

function parseCosePublicKey(publicKey: Buffer) {
  const decoded = decodeCbor(publicKey);
  if (decoded.next !== publicKey.length) {
    throw new Error('Credential public key has trailing CBOR');
  }
  const cose = requireMap(decoded.value, 'credential public key');
  const kty = cose.get(1);
  const alg = cose.get(3);

  if (kty === 2 && alg === -7) {
    const crv = cose.get(-1);
    if (crv !== 1) throw new Error('Only P-256 ES256 credentials are supported');
    const x = requireBytes(cose.get(-2), 'EC x');
    const y = requireBytes(cose.get(-3), 'EC y');
    if (x.length !== 32 || y.length !== 32) {
      throw new Error('Invalid P-256 public key size');
    }
    return {
      algorithm: 'ES256' as const,
      key: createPublicKey({
        key: {
          kty: 'EC',
          crv: 'P-256',
          x: toBase64Url(x),
          y: toBase64Url(y),
        },
        format: 'jwk',
      }),
    };
  }

  if (kty === 3 && alg === -257) {
    const n = requireBytes(cose.get(-1), 'RSA modulus');
    const e = requireBytes(cose.get(-2), 'RSA exponent');
    if (n.length < 256 || e.length < 1) {
      throw new Error('Invalid RSA public key');
    }
    return {
      algorithm: 'RS256' as const,
      key: createPublicKey({
        key: {
          kty: 'RSA',
          n: toBase64Url(n),
          e: toBase64Url(e),
        },
        format: 'jwk',
      }),
    };
  }

  throw new Error('Unsupported WebAuthn credential algorithm');
}

export function verifyAuthenticationResponse(input: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  rpId: string;
  credential: StoredPasskey;
}): VerifiedAuthentication {
  const response = input.response;
  if (response.type !== 'public-key') throw new Error('Invalid credential type');

  const rawId = requireBase64Url(response.rawId ?? response.id, 'rawId');
  const id = requireBase64Url(response.id ?? response.rawId, 'id');
  if (
    rawId !== input.credential.credentialId ||
    fromBase64Url(rawId).compare(fromBase64Url(id)) !== 0
  ) {
    throw new Error('Credential id mismatch');
  }

  const client = parseClientData(
    response.response?.clientDataJSON,
    'webauthn.get',
    input.expectedOrigin,
  );
  if (client.challenge !== input.expectedChallenge) {
    throw new Error('WebAuthn challenge mismatch');
  }

  const authenticatorData = fromBase64Url(
    requireBase64Url(
      response.response?.authenticatorData,
      'authenticatorData',
    ),
  );
  const header = verifyAuthenticatorHeader(
    authenticatorData,
    input.rpId,
    false,
  );

  const signature = fromBase64Url(
    requireBase64Url(response.response?.signature, 'signature'),
  );
  const signedData = Buffer.concat([
    authenticatorData,
    createHash('sha256').update(client.raw).digest(),
  ]);

  const parsedKey = parseCosePublicKey(input.credential.publicKey);
  const verified =
    parsedKey.algorithm === 'ES256'
      ? verifySignature('sha256', signedData, parsedKey.key, signature)
      : verifySignature('RSA-SHA256', signedData, parsedKey.key, signature);

  if (!verified) throw new Error('WebAuthn signature verification failed');

  if (
    input.credential.counter > 0n &&
    header.counter <= input.credential.counter
  ) {
    throw new Error('WebAuthn signature counter did not advance');
  }

  return {
    credentialId: rawId,
    newCounter: header.counter,
  };
}

export function registrationOptions(input: {
  challenge: string;
  rpId: string;
  rpName: string;
  userHandle: Buffer;
  userName: string;
  excludeCredentialIds: Array<{ id: string; transports: string[] }>;
}) {
  return {
    challenge: input.challenge,
    rp: {
      id: input.rpId,
      name: input.rpName,
    },
    user: {
      id: toBase64Url(input.userHandle),
      name: input.userName,
      displayName: input.userName,
    },
    pubKeyCredParams: [
      { type: 'public-key' as const, alg: -7 },
      { type: 'public-key' as const, alg: -257 },
    ],
    timeout: 60_000,
    attestation: 'none' as const,
    authenticatorSelection: {
      residentKey: 'required' as const,
      requireResidentKey: true,
      userVerification: 'required' as const,
    },
    excludeCredentials: input.excludeCredentialIds.map(credential => ({
      id: credential.id,
      type: 'public-key' as const,
      transports: credential.transports,
    })),
  };
}

export function authenticationOptions(input: {
  challenge: string;
  rpId: string;
}) {
  return {
    challenge: input.challenge,
    rpId: input.rpId,
    timeout: 60_000,
    userVerification: 'required' as const,
  };
}
