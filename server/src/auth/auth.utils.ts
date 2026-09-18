import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

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

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');

  return a.length === b.length && timingSafeEqual(a, b);
}
