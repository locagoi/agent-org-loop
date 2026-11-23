// Test for scripts/check-generic.mjs. Builds throwaway git repos in a temp dir and checks
// the guard's exit code. Uses only fictional values. Run: node scripts/check-generic.test.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const guard = resolve('scripts/check-generic.mjs');

function run(files) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    execFileSync('git', ['add', '-A'], { cwd: dir });
    return spawnSync('node', [guard], { cwd: dir, encoding: 'utf8' }).status;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const cases = [
  ['clean template text passes', { 'a.md': 'Use YOUR_API_KEY and https://example.com/page\n' }, 0],
  ['real email address fails', { 'a.md': 'mail anna.beispiel@firma-xyz.de\n' }, 1],
  ['credential-shaped string fails', { 'a.md': 'key sk-abcdefghijklmnopqrstuvwx1234\n' }, 1],
  ['absolute home path fails', { 'a.md': 'see /home/anna/projects/x\n' }, 1],
  ['bare UUID fails', { 'a.md': 'id 123e4567-e89b-12d3-a456-426614174000\n' }, 1],
  ['live domain fails', { 'a.md': 'visit https://www.live-firma.de/x\n' }, 1],
  ['product doc link allowed in README.md', { 'README.md': 'Docs: https://www.cegtec.net/gtm-goat/docs/\n' }, 0],
  ['product doc link NOT allowed in another file', { 'notes.md': 'Docs: https://www.cegtec.net/gtm-goat/docs/\n' }, 1],
  ['other cegtec.net page NOT allowed in README.md', { 'README.md': 'See https://www.cegtec.net/other-page\n' }, 1],
];

let failed = 0;
for (const [name, files, want] of cases) {
  const got = run(files);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (exit ${got}, expected ${want})`);
}
if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nAll tests passed');
