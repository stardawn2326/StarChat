import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('.', import.meta.url).pathname.replace(/^\/+([A-Za-z]):/, '$1:');
const sourceRoot = join(root, 'src');
const manifest = JSON.parse(readFileSync(join(root, 'test-manifest.json'), 'utf8'));

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (/\.test\.(?:ts|tsx)$/u.test(entry.name)) files.push(relative(root, absolute).replaceAll('\\', '/'));
  }
  return files;
}

const tests = walk(sourceRoot).sort();
const covered = new Set();
for (const invocation of manifest.invocations ?? []) {
  const includes = Array.isArray(invocation.include) ? invocation.include : tests.filter((file) => !(invocation.exclude ?? []).includes(file));
  for (const file of includes) {
    if (!tests.includes(file)) throw new Error(`test-manifest 引用了不存在的测试：${file}`);
    covered.add(file);
  }
}
const uncovered = tests.filter((file) => !covered.has(file));
if (uncovered.length > 0) throw new Error(`test-manifest 未覆盖测试：${uncovered.join(', ')}`);
console.log(`test-manifest verified: ${tests.length} test files covered by ${manifest.invocations.length} invocations`);
