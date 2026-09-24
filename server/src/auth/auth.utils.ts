import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const OTP_PATTERN = /^\d{6}$/;

export function normalizePhoneE164(value: string): string {
  const normalized = value.trim().replace(/[\s()-]/g, '');

  if (!PHONE_PATTERN.test(normalized)) {
    throw new Error('Phone must be in E.164 format, for example +79991234567');
  }

  return normalized;
}

export function validateOtpCode(value: string): string {
  const normalized = value.trim();

  if (!OTP_PATTERN.test(normalized)) {
    throw new Error('OTP code must contain exactly 6 digits');
  }

  return normalized;
}

export function hashOtp(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(code).digest('hex');
}

export function hashAuthRequestSource(source: string, pepper: string): string {
  return createHmac('sha256', pepper).update(source).digest('hex');
}

function normalizeIp(value: string | undefined | null): string | null {
  const candidate = value?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

export function resolveAuthRequestSource(
  remoteAddress: string | undefined | null,
  forwardedFor: string | string[] | undefined,
  trustedProxyHopsRaw: string | undefined,
): string {
  const direct = normalizeIp(remoteAddress) ?? 'unknown';
  const trustedProxyHops = Number(trustedProxyHopsRaw ?? '0');

  if (
    !Number.isInteger(trustedProxyHops) ||
    trustedProxyHops < 1 ||
    trustedProxyHops > 5
  ) {
    return direct;
  }

  const forwarded = (Array.isArray(forwardedFor)
    ? forwardedFor.join(',')
    : forwardedFor ?? ''
  )
    .split(',')
    .map((value) => normalizeIp(value));

  if (forwarded.length < trustedProxyHops) {
    return direct;
  }

  return forwarded[forwarded.length - trustedProxyHops] ?? direct;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');

  return a.length === b.length && timingSafeEqual(a, b);
}

export const SESSION_COOKIE_NAME = 'wtd_session';

export function extractSessionToken(headers: {
  authorization?: string;
  cookie?: string;
}): string | null {
  const bearer = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;

  const cookieHeader = headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName !== SESSION_COOKIE_NAME) continue;

    const value = rest.join('=').trim();
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

export function serializeSessionCookie(
  token: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  const parts = [
    SESSION_COOKIE_NAME + '=' + encodeURIComponent(token),
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=' + Math.max(0, Math.floor(maxAgeSeconds)),
  ];

  if (secure) parts.push('Secure');

  return parts.join('; ');
}

export function serializeClearedSessionCookie(secure: boolean): string {
  return serializeSessionCookie('', 0, secure);
}
