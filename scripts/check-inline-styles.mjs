import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const sourceExtensions = new Set(['.ts', '.tsx']);

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

const patterns = [
  {
    label: 'JSX style prop',
    pattern: /\bstyle\s*=\s*\{/g,
  },
  {
    label: 'React.CSSProperties style object',
    pattern: /\bReact\.CSSProperties\b/g,
  },
  {
    label: 'CSSProperties style object',
    pattern: /\bCSSProperties\b/g,
  },
];

const violations = [];

for (const filePath of await collectFiles(sourceRoot)) {
  const content = await readFile(filePath, 'utf8');

  for (const { label, pattern } of patterns) {
    pattern.lastIndex = 0;

    for (const match of content.matchAll(pattern)) {
      const { line, column } = lineAndColumn(content, match.index ?? 0);

      violations.push({
        file: path.relative(root, filePath).split(path.sep).join('/'),
        line,
        column,
        label,
      });
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Inline frontend styles are forbidden in production source. Use Emotion styled components and typed props instead.\n',
  );

  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.column} ${violation.label}`,
    );
  }

  process.exit(1);
}

console.log('Inline style guard passed: production frontend has no JSX style props or CSSProperties style objects.');
