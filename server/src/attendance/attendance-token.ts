import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ATTENDANCE_QR_TTL_MS = 60_000;

interface TokenPayload {
  d: string; // Managed department, never an employee or account identifier.
  i: number; // Server issue time, milliseconds since epoch.
  n: string; // Per-display nonce.
  c: string; // Opaque display context; device registration belongs to #76.
}

function signingSecret(): string {
  const secret = process.env.ATTENDANCE_QR_SECRET;
  if (!secret || secret.length < 32) {
    throw new ServiceUnavailableException('Attendance QR signing secret is not configured');
  }
  return secret;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function issueAttendanceToken(departmentId: string, now = new Date()) {
  if (!departmentId) throw new BadRequestException('departmentId is required');
  const payload: TokenPayload = {
    d: departmentId,
    i: now.getTime(),
    n: randomBytes(16).toString('base64url'),
    c: randomBytes(8).toString('base64url'),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = encoded + '.' + signature(encoded, signingSecret()).toString('base64url');
  return {
    token,
    expiresAt: new Date(payload.i + ATTENDANCE_QR_TTL_MS).toISOString(),
  };
}

export function verifyAttendanceToken(rawToken: unknown, now = new Date()) {
  if (
    typeof rawToken !== 'string' ||
    rawToken.length > 512 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(rawToken)
  ) {
    throw new UnauthorizedException('Attendance QR is invalid or expired');
  }

  const [encoded, encodedSignature] = rawToken.split('.');
  const received = Buffer.from(encodedSignature, 'base64url');
  const expected = signature(encoded, signingSecret());
  if (
    received.length !== expected.length ||
    received.toString('base64url') !== encodedSignature ||
    !timingSafeEqual(received, expected)
  ) {
    throw new UnauthorizedException('Attendance QR is invalid or expired');
  }

  let payload: Partial<TokenPayload>;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<TokenPayload>;
  } catch {
    throw new UnauthorizedException('Attendance QR is invalid or expired');
  }
  if (
    typeof payload.d !== 'string' || !payload.d ||
    typeof payload.i !== 'number' || !Number.isSafeInteger(payload.i) ||
    typeof payload.n !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(payload.n) ||
    typeof payload.c !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(payload.c) ||
    payload.i > now.getTime() ||
    now.getTime() >= payload.i + ATTENDANCE_QR_TTL_MS
  ) {
    throw new UnauthorizedException('Attendance QR is invalid or expired');
  }

  return {
    departmentId: payload.d,
    tokenHash: createHash('sha256').update(rawToken).digest('hex'),
  };
}
