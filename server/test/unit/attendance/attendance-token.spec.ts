import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

import {
  ATTENDANCE_QR_TTL_MS,
  issueAttendanceToken,
  verifyAttendanceToken,
} from '../../../src/attendance/attendance-token';

describe('attendance QR signing contract', () => {
  const original = process.env.ATTENDANCE_QR_SECRET;
  const now = new Date('2026-09-26T08:00:00.000Z');

  beforeEach(() => {
    process.env.ATTENDANCE_QR_SECRET = 'separate-test-qr-secret-at-least-32-characters';
  });

  afterAll(() => {
    if (original === undefined) delete process.env.ATTENDANCE_QR_SECRET;
    else process.env.ATTENDANCE_QR_SECRET = original;
  });

  it('signs a short-lived multi-employee token without employee ID or phone', () => {
    const issued = issueAttendanceToken('department-a', now);
    expect(issued.expiresAt).toBe(new Date(now.getTime() + ATTENDANCE_QR_TTL_MS).toISOString());
    const payload = Buffer.from(issued.token.split('.')[0], 'base64url').toString('utf8');
    expect(payload).toContain('department-a');
    expect(payload).not.toMatch(/employee|phone|\+7999/i);
    expect(verifyAttendanceToken(issued.token, new Date(now.getTime() + ATTENDANCE_QR_TTL_MS - 1)))
      .toMatchObject({ departmentId: 'department-a', tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it('rejects expired, tampered and future QR tokens', () => {
    const { token } = issueAttendanceToken('department-a', now);
    expect(() => verifyAttendanceToken(token, new Date(now.getTime() + ATTENDANCE_QR_TTL_MS)))
      .toThrow(UnauthorizedException);
    expect(() => verifyAttendanceToken(token, new Date(now.getTime() - 1)))
      .toThrow(UnauthorizedException);
    const [payload, signature] = token.split('.');
    expect(() => verifyAttendanceToken(payload + '.' + (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1), now))
      .toThrow(UnauthorizedException);
    // A non-canonical base64url spelling must not bypass per-employee token-hash replay protection.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const finalDigit = alphabet.indexOf(signature.at(-1)!);
    const alias = alphabet[(finalDigit & 0b111100) | ((finalDigit + 1) & 0b000011)];
    expect(() => verifyAttendanceToken(payload + '.' + signature.slice(0, -1) + alias, now))
      .toThrow(UnauthorizedException);
  });

  it('fails closed without a separate signing secret', () => {
    delete process.env.ATTENDANCE_QR_SECRET;
    expect(() => issueAttendanceToken('department-a', now)).toThrow(ServiceUnavailableException);
  });
});
