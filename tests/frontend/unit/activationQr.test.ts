import { describe, expect, it } from 'vitest';

import {
  ACTIVATION_QR_SIZE,
  createActivationQrMatrix,
} from '../../../src/auth/activationQr';

describe('activation QR encoder', () => {
  it('creates a complete deterministic QR matrix without embedding presentation data', () => {
    const payload =
      'https://work.example.test/login?activation=opaque-token-value';
    const first = createActivationQrMatrix(payload);
    const second = createActivationQrMatrix(payload);

    expect(first).toEqual(second);
    expect(first).toHaveLength(ACTIVATION_QR_SIZE);
    expect(first.every(row => row.length === ACTIVATION_QR_SIZE)).toBe(true);
    expect(first.flat().every(cell => typeof cell === 'boolean')).toBe(true);

    // Finder pattern corner sanity checks.
    expect(first[0][0]).toBe(true);
    expect(first[1][1]).toBe(false);
    expect(first[3][3]).toBe(true);
    expect(first[0][ACTIVATION_QR_SIZE - 7]).toBe(true);
    expect(first[ACTIVATION_QR_SIZE - 7][0]).toBe(true);
  });

  it('changes when the opaque activation secret changes', () => {
    expect(
      createActivationQrMatrix(
        'https://work.example.test/login?activation=token-a',
      ),
    ).not.toEqual(
      createActivationQrMatrix(
        'https://work.example.test/login?activation=token-b',
      ),
    );
  });

  it('fails closed instead of truncating oversized activation URLs', () => {
    expect(() =>
      createActivationQrMatrix('https://work.example.test/?activation=' + 'x'.repeat(300)),
    ).toThrow(/слишком длинная/);
  });
});
