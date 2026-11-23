#!/usr/bin/env node
// Guard: this repo is a clone-and-adapt TEMPLATE. Nothing org-specific belongs in it.
// Run it before you make a fork or a copy of your working state public: after /einrichten
// the folders firma/, ergebnisse/ and ops/ hold your own data, and this is the check that
// tells you what would leak.
//
// It runs by hand (there is no CI step and no package.json here):
//   node scripts/check-generic.mjs [--history]
//   node scripts/check-generic.test.mjs
// Exit 0 = clean, 1 = findings, 2 = some files could not be read (the run is NOT clean).
//
// It deliberately knows only STRUCTURAL patterns: real email addresses, key shapes, absolute
// home paths, UUIDs and http(s) URLs. It does NOT carry a list of company or customer names,
// and it never should: a denylist of the names you are protecting would publish them in the
// act of protecting them. Keep name-level checks in a private repo.
//
// Scope of the domain rule: http(s):// URLs only. Bare domains (www.example-firma.de) and
// git@host: remotes are not detected.

import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, statSync } from 'node:fs';

const withHistory = process.argv.includes('--history');

// Hosts that are fine to link to: public specs, docs and API endpoints the scripts use.
// A host is allowed only if it IS one of these or a subdomain of one ("host === d" or
// "host ends with .d"). A substring such as notgithub.com or github.com.firma.de is not.
const ALLOWED_DOMAINS = [
  'example.com', 'example.org', 'example.net',
  'schema.org', 'json-schema.org', 'w3.org', 'creativecommons.org', 'llmstxt.org',
  'openrouter.ai', 'openai.com', 'anthropic.com', 'claude.com', 'github.com', 'stripe.com',
  'npmjs.com', 'nodejs.org', 'perplexity.ai', 'google.com', 'googleapis.com', 'gstatic.com',
  'microsoft.com',
];
// Placeholder sites: the second-level label must be one of these (yoursite.com, www.yoursite.com),
// so yoursite.firma.de is NOT a placeholder.
const PLACEHOLDER_LABELS = new Set(['yourdomain', 'yoursite', 'your-site']);
// Email domains that are fine (documentation addresses).
const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'];
// File-name look-alikes such as logo@2x.png are not email addresses.
const ASSET_TLD = /^(png|jpe?g|gif|webp|svg|ico|avif)$/i;

function hostAllowed(host) {
  const h = host.toLowerCase();
  if (ALLOWED_DOMAINS.some((d) => h === d || h.endsWith('.' + d))) return true;
  const labels = h.split('.');
  return labels.length >= 2 && PLACEHOLDER_LABELS.has(labels[labels.length - 2]);
}

// The one documented exception. The maintainers' product documentation link appears in the
// optional "Connect to GTM Goat" section and the tool notes. It is allowed ONLY as a URL that
// starts with this exact prefix and ONLY in these files; any other URL on that domain, or the
// link anywhere else, still fails.
const PRODUCT_DOC_URL = 'https://www.cegtec.net/gtm-goat/docs/';
const PRODUCT_DOC_FILES = new Set(['README.md', 'README.de.md', 'docs/werkzeuge.md', 'docs/waechter.md', 'vorlagen/README.md']);

// Accepted history: ONE specific finding in the very first commit (a one-line maintainer
// backlink in the old README). History is not rewritten. Only this exact (commit, rule, file,
// hit) is accepted; everything else in that commit is reported like any other finding.
const ACCEPTED_HISTORY = [
  { commit: '9c2ee756ff5f4e91abb32190d090e3e9a99cebe7', rule: 'Hardcoded non-placeholder domain', file: 'README.md', hit: 'https://cegtec.net' },
];

// Every rule is a global regex; EVERY match on a line is judged on its own.
const RULES = [
  {
    name: 'Real email address',
    why: 'Use an example.com address or a placeholder, never a working mailbox.',
    re: /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g,
    allowed: (m) => {
      const domain = m[1].toLowerCase();
      const tld = domain.split('.').pop();
      return ASSET_TLD.test(tld) || ALLOWED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d));
    },
  },
  {
    name: 'Credential-shaped string',
    why: 'Secrets are read from env vars. Nothing key-shaped belongs in the tree.',
    // Key bodies may contain - and _ (sk-or-v1-..., sk-ant-api03-..., sk-proj-..., github_pat_...).
    re: new RegExp('(?<![A-Za-z0-9_-])(' + [
      'sk-[A-Za-z0-9_-]{20,}',
      '[sr]k_(?:live|test)_[A-Za-z0-9]{10,}',
      'whsec_[A-Za-z0-9]{16,}',
      'github_pat_[A-Za-z0-9_]{20,}',
      'gh[pousr]_[A-Za-z0-9]{30,}',
      'AKIA[0-9A-Z]{16}',
      'AIza[0-9A-Za-z_-]{30,}',
      'sbp_[a-f0-9]{40,}',
      'ntn_[A-Za-z0-9]{30,}',
      'xox[bapr]-[0-9A-Za-z-]{9,}',
      'eyJ[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{10,}',
    ].join('|') + ')', 'g'),
    allowed: () => false,
  },
  {
    name: 'Absolute home path',
    why: 'A path from someone machine leaks a username and does not resolve for a cloner.',
    re: /(\/home\/[a-z][a-z0-9_-]*|\/Users\/[A-Za-z][A-Za-z0-9_-]*|C:\\Users\\[A-Za-z][A-Za-z0-9_-]*)/g,
    allowed: () => false,
  },
  {
    name: 'Bare UUID',
    why: 'Database, workspace and document ids identify a live system. Use a placeholder.',
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    allowed: () => false,
  },
  {
    name: 'Hardcoded non-placeholder domain',
    why: 'Point the template at example.com or a config value, not a live site.',
    re: /https?:\/\/([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)(?::\d+)?[^\s)"'<>\]`]*/g,
    allowed: (m, file) => {
      const host = m[1].toLowerCase();
      if (host === 'www.cegtec.net') return PRODUCT_DOC_FILES.has(file) && m[0].startsWith(PRODUCT_DOC_URL);
      return hostAllowed(host);
    },
  },
];

const BINARY = /\.(png|jpe?g|gif|webp|svg|ico|pdf|woff2?)$/i;
const SELF = new Set(['scripts/check-generic.mjs', 'scripts/check-generic.test.mjs']);

// Default target is the WORKING TREE, not a commit: a guard that only reads committed
// state reports "clean" for changes that are staged or merely written to disk, which is
// exactly when you need it. --history switches to scanning every commit instead.
function files(ref) {
  const args = ref === null
    ? ['ls-files', '--cached', '--others', '--exclude-standard']
    : ['ls-tree', '-r', '--name-only', ref];
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean).filter((f) => !BINARY.test(f));
}

// Returns { text } or { skip: true } (a path that is indexed but really gone: the only
// legitimate skip) or { error } (anything else: NOT clean, reported and exit 2).
function read(ref, file) {
  if (ref === null) {
    let st;
    try { st = lstatSync(file); } catch (e) {
      return e.code === 'ENOENT' ? { skip: true } : { error: e.message };
    }
    try {
      if (st.isSymbolicLink() ? statSync(file).isDirectory() : st.isDirectory()) return { skip: true }; // submodule or dir link
      return { text: readFileSync(file, 'utf8') };
    } catch (e) { return { error: e.message }; }
  }
  try {
    return { text: execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }) };
  } catch (e) { return { error: (e.message || String(e)).split('\n')[0] }; }
}

const refs = withHistory
  ? execFileSync('git', ['rev-list', '--all'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean)
  : [null]; // null = working tree

console.log(`Template guard — scanning ${withHistory ? `${refs.length} commits` : 'working tree'}\n`);

const findings = [];
const unreadable = [];
const seen = new Set();
let accepted = 0;
for (const ref of refs) {
  for (const file of files(ref)) {
    if (SELF.has(file)) continue; // the guard and its test describe the patterns
    const r = read(ref, file);
    if (r.skip) continue;
    if (r.error) { unreadable.push({ ref, file, error: r.error }); continue; }
    r.text.split('\n').forEach((line, i) => {
      for (const rule of RULES) {
        for (const m of line.matchAll(rule.re)) {
          if (rule.allowed(m, file)) continue;
          const hit = m[0];
          if (ref !== null && ACCEPTED_HISTORY.some((a) => a.commit === ref && a.rule === rule.name && a.file === file && a.hit === hit)) {
            accepted++;
            continue;
          }
          const key = `${rule.name}|${file}|${i}|${hit}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push({ rule, file, line: i + 1, hit });
        }
      }
    });
  }
}

const byRule = new Map();
for (const f of findings) byRule.set(f.rule.name, [...(byRule.get(f.rule.name) || []), f]);

for (const rule of RULES) {
  const hits = byRule.get(rule.name) || [];
  if (!hits.length) { console.log(`  ok    ${rule.name}`); continue; }
  console.log(`  FOUND ${rule.name} — ${hits.length}`);
  console.log(`        ${rule.why}`);
  for (const h of hits.slice(0, 6)) console.log(`        ${h.file}:${h.line}  ${h.hit.slice(0, 80)}`);
  if (hits.length > 6) console.log(`        … and ${hits.length - 6} more`);
}

console.log();
if (unreadable.length) {
  console.log(`UNREADABLE: ${unreadable.length} file(s) could not be scanned, so this run is NOT a clean result:`);
  for (const u of unreadable.slice(0, 10)) console.log(`        ${u.ref ? u.ref.slice(0, 8) + ':' : ''}${u.file}  ${u.error.slice(0, 100)}`);
  if (unreadable.length > 10) console.log(`        … and ${unreadable.length - 10} more`);
}
if (findings.length) {
  console.log(`FAILED: ${findings.length} org-specific value(s). Replace with a placeholder or move to config.`);
  process.exit(1);
}
if (unreadable.length) process.exit(2);
console.log(`Clean — nothing org-specific found.${accepted ? ` (${accepted} hit(s) in accepted history, see ACCEPTED_HISTORY)` : ''}`);
