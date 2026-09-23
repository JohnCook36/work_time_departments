import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = resolve(process.cwd(), 'src');
const NATIVE_DIALOG_CALL =
  /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/g;

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(path);
    }

    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('native browser dialog guard', () => {
  it('does not allow alert, confirm or prompt calls in frontend source', () => {
    const violations = collectSourceFiles(SOURCE_ROOT).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      const matches = [...source.matchAll(NATIVE_DIALOG_CALL)];

      return matches.map((match) => ({
        path: path.slice(SOURCE_ROOT.length + 1),
        index: match.index,
        call: match[0],
      }));
    });

    expect(violations).toEqual([]);
  });
});
