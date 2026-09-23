import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const scanRoots = [path.join(root, 'src')];
const extraFiles = [path.join(root, 'index.html')];
const allowedRawColorFiles = new Set([
  path.normalize(path.join(root, 'src', 'theme', 'palette.ts')),
]);

const sourceExtensions = new Set(['.ts', '.tsx', '.css', '.html']);
const rawColorPatterns = [
  {
    label: 'hex color',
    pattern: /(?<!&)#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
  },
  {
    label: 'rgb/rgba color',
    pattern: /\brgba?\s*\([^)]*\)/gi,
  },
  {
    label: 'hsl/hsla color',
    pattern: /\bhsla?\s*\([^)]*\)/gi,
  },
];

function isTestFile(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  return (
    normalized.includes('/test/') ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
      continue;
    }

    if (
      entry.isFile() &&
      sourceExtensions.has(path.extname(entry.name)) &&
      !isTestFile(entryPath)
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function lineAndColumn(content, offset) {
  const prefix = content.slice(0, offset);
  const lines = prefix.split('\n');

  return {
    line: lines.length,
    column: lines.at(-1).length + 1,
  };
}

const files = [
  ...(await Promise.all(scanRoots.map(collectFiles))).flat(),
  ...extraFiles,
];

const violations = [];

for (const filePath of files) {
  const normalizedPath = path.normalize(filePath);

  if (allowedRawColorFiles.has(normalizedPath)) {
    continue;
  }

  const content = await readFile(filePath, 'utf8');

  for (const { label, pattern } of rawColorPatterns) {
    pattern.lastIndex = 0;

    for (const match of content.matchAll(pattern)) {
      const { line, column } = lineAndColumn(content, match.index ?? 0);

      violations.push({
        file: path.relative(root, filePath).split(path.sep).join('/'),
        line,
        column,
        label,
        value: match[0],
      });
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Raw frontend colors are forbidden outside src/theme/palette.ts. Use semantic theme/design tokens instead.\n'
  );

  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.column} ${violation.label}: ${violation.value}`
    );
  }

  process.exit(1);
}

console.log('Design token guard passed: no raw frontend colors outside the canonical palette.');
