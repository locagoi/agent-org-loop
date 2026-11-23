// Test for scripts/check-generic.mjs. Builds throwaway git repos in a temp dir and checks the
// guard's exit code. Fictional values only. Works from any directory.
//   node scripts/check-generic.test.mjs
// GUARD=/path/to/other-guard.mjs runs the same cases against another version (used to show
// that the new cases fail on the old guard).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guard = process.env.GUARD || join(here, 'check-generic.mjs');
const repoRoot = join(here, '..');

// Build a repo, let `after` modify it, run the guard. Returns { status, out }.
function run(files, { history = false, after } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: dir });
    git('init', '-q'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 't');
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    git('add', '-A');
    if (history) git('commit', '-q', '-m', 't');
    if (after) after(dir, git);
    const r = spawnSync('node', [guard, ...(history ? ['--history'] : [])], { cwd: dir, encoding: 'utf8' });
    return { status: r.status, out: r.stdout + r.stderr };
  } finally {
    try { chmodSync(dir, 0o755); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
}

const A = (text) => ({ 'a.md': text + '\n' });
const R = (text) => ({ 'README.md': text + '\n' });
const cases = []; // [name, files, wantStatus, options]
const add = (name, files, want, opts) => cases.push([name, files, want, opts]);

// Baseline
add('clean template text passes', A('Use YOUR_API_KEY and https://example.com/page'), 0);
add('real email address fails', A('mail anna.beispiel@firma-xyz.de'), 1);
add('absolute home path fails', A('see /home/anna/projects/x'), 1);
add('bare UUID fails', A('id 123e4567-e89b-12d3-a456-426614174000'), 1);
add('live domain fails', A('visit https://www.live-firma.de/x'), 1);
add('product doc link allowed in README.md', R('Docs: https://www.cegtec.net/gtm-goat/docs/'), 0);
add('product doc link NOT allowed in another file', A('Docs: https://www.cegtec.net/gtm-goat/docs/'), 1);
add('other page on that domain NOT allowed in README.md', R('See https://www.cegtec.net/other-page'), 1);

// Finding 1: key shapes with - and _
add('F1 sk-or-v1 key (OpenRouter shape) fails', A('key sk-or-v1-' + 'a1b2c3d4'.repeat(8)), 1);
add('F1 sk-ant-api03 key (Anthropic shape) fails', A('key sk-ant-api03-' + 'Ab9_x-'.repeat(10)), 1);
add('F1 sk-proj key (OpenAI shape) fails', A('key sk-proj-' + 'Zz9_x-'.repeat(8)), 1);
add('F1 sk_live key fails', A('key sk_live_' + 'abcdef0123456789'), 1);
add('F1 github_pat key fails', A('key github_pat_' + 'A1b2C3d4_'.repeat(4)), 1);
add('F1 AKIA key fails', A('key AKIA' + 'ABCDEFGHIJKLMNOP'), 1);
add('F1 whsec key fails', A('key whsec_' + 'abcdefghijklmnopqrstuvwx'), 1);
add('F1 short placeholder "sk-" prefix in prose passes', A('keys start with sk- or ghp_ (examples only)'), 0);

// Finding 2: every match on a line is judged
add('F2 allowed URL then live URL on one line fails', A('see https://github.com/x, https://www.live-firma.de'), 1);
add('F2 product doc URL then live URL in README fails', R('Docs https://www.cegtec.net/gtm-goat/docs/ and https://customer-firma.de'), 1);
add('F2 allowed email then real email on one line fails', A('a@example.com and anna@firma-xyz.de'), 1);
add('F2 two allowed URLs on one line pass', A('https://github.com/x and https://example.com/y'), 0);

// Finding 3: allow-list is exact host or subdomain, not substring
add('F3 notgithub.com fails', A('https://notgithub.com/x'), 1);
add('F3 github.com.firma.de fails', A('https://github.com.firma.de/x'), 1);
add('F3 anthropic.com.client-x.de fails', A('https://anthropic.com.client-x.de'), 1);
add('F3 dreamstripe.com fails', A('https://www.dreamstripe.com/portal'), 1);
add('F3 yoursite.firma.de fails', A('https://yoursite.firma.de'), 1);
add('F3 email at mygoogle.com fails', A('anna@mygoogle.com'), 1);
add('F3 subdomain of an allowed host passes', A('https://docs.github.com/x https://fonts.googleapis.com/css'), 0);
add('F3 placeholder site passes', A('https://www.yoursite.com/page'), 0);

// Finding 4: unreadable files are loud
const unreadableLink = { after: (dir) => { symlinkSync('does-not-exist', join(dir, 'broken')); execFileSync('git', ['add', '-A'], { cwd: dir }); } };
add('F4 unreadable (broken link) file exits non-zero and says so', A('nothing'), 2, { ...unreadableLink, expectOut: /UNREADABLE/ });
if (process.getuid && process.getuid() !== 0) {
  add('F4 unreadable (no permission) file exits non-zero', A('nothing'), 2, {
    after: (dir) => chmodSync(join(dir, 'a.md'), 0o000), expectOut: /UNREADABLE/,
  });
}
add('F4 deleted-but-indexed file is skipped, run stays clean', A('nothing'), 0, {
  after: (dir) => rmSync(join(dir, 'a.md')),
});

// History
add('history: key removed in a later commit still fails with --history', A('key sk-or-v1-' + 'a1b2c3d4'.repeat(8)), 1, {
  history: true,
  after: (dir, git) => { writeFileSync(join(dir, 'a.md'), 'clean\n'); git('add', '-A'); git('commit', '-q', '-m', 'remove'); },
});

// Nits
add('N7 logo@2x.png is not an email', A('<img src="logo@2x.png">'), 0);
add('N7 user@example.net is not a real email', A('user@example.net'), 0);

let failed = 0;
for (const [name, files, want, opts = {}] of cases) {
  const { status, out } = run(files, opts);
  const outOk = !opts.expectOut || opts.expectOut.test(out);
  const ok = status === want && outOk;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (exit ${status}, expected ${want}${outOk ? '' : ', message missing'})`);
}

// Header must not claim CI that does not exist (N6).
const header = readFileSync(guard, 'utf8').split('\n').slice(0, 14).join('\n');
const headerOk = !/runs in ci|npm test/i.test(header.replace(/there is no CI step and no package\.json here/i, ''));
if (!headerOk) failed++;
console.log(`${headerOk ? 'ok  ' : 'FAIL'} N6 header makes no CI or npm claim`);

// Accepted history on this very repo: exit 0 (shallow clones may lack the commit; still clean).
const own = spawnSync('node', [guard, '--history'], { cwd: repoRoot, encoding: 'utf8' });
const ownOk = own.status === 0;
if (!ownOk) failed++;
console.log(`${ownOk ? 'ok  ' : 'FAIL'} this repo passes with --history (exit ${own.status})`);

const total = cases.length + 2;
if (failed) { console.log(`\n${failed} of ${total} failed`); process.exit(1); }
console.log(`\nAll ${total} passed`);
