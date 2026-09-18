import {
  hashOtp,
  hashSessionToken,
  normalizePhoneE164,
  safeHashEquals,
  validateOtpCode,
} from './auth.utils';

describe('auth utils', () => {
  it('normalizes formatted E.164 phone numbers', () => {
    expect(normalizePhoneE164('+7 (999) 123-45-67')).toBe('+79991234567');
  });

  it('rejects phone numbers without an international prefix', () => {
    expect(() => normalizePhoneE164('89991234567')).toThrow();
  });

  it('accepts only six-digit OTP codes', () => {
    expect(validateOtpCode('123456')).toBe('123456');
    expect(() => validateOtpCode('12345')).toThrow();
    expect(() => validateOtpCode('12a456')).toThrow();
  });

  it('hashes OTPs with a pepper and compares hashes safely', () => {
    const first = hashOtp('123456', 'pepper');
    const second = hashOtp('123456', 'pepper');
    const other = hashOtp('654321', 'pepper');

    expect(safeHashEquals(first, second)).toBe(true);
    expect(safeHashEquals(first, other)).toBe(false);
  });

  it('hashes session tokens deterministically', () => {
    expect(hashSessionToken('token')).toBe(hashSessionToken('token'));
    expect(hashSessionToken('token')).not.toBe(hashSessionToken('other'));
  });
});
