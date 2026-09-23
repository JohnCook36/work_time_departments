import { describe, expect, it } from 'vitest';

const sourceModules = import.meta.glob(
  '../../../src/**/*.{ts,tsx,js,jsx}',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

const NATIVE_DIALOG_CALL =
  /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/g;

describe('native browser dialog guard', () => {
  it('does not allow alert, confirm or prompt calls in frontend source', () => {
    const violations = Object.entries(sourceModules).flatMap(
      ([path, source]) => {
        if (typeof source !== 'string') return [];

        return [...source.matchAll(NATIVE_DIALOG_CALL)].map((match) => ({
          path,
          index: match.index,
          call: match[0],
        }));
      },
    );

    expect(violations).toEqual([]);
  });
});
