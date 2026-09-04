#!/usr/bin/env node
/**
 * Typecheck ratchet.
 *
 * The problem this solves: ten packages carry
 * `"typecheck": "tsc --noEmit || echo \"[typecheck] non-blocking\""`, and CI
 * wraps every invocation in `|| echo "[warn] ..."`. So 93 real type errors are
 * invisible, and nothing stops a pull request adding the 94th.
 *
 * The honest fix is to fix all 93 and delete the escape hatches. That is a day
 * of work that keeps not happening, and in the meantime "turn it on and let CI
 * be permanently red" is not a fix either — a red build that everyone ignores
 * is worse than no build.
 *
 * So: a ratchet. `.github/typecheck-baseline.json` records the current error
 * count per package. This script re-runs `tsc` and fails if any package is
 * ABOVE its baseline. New errors are blocked; existing ones are visible in the
 * job summary and can only go down.
 *
 * When a package improves, run with --update to lower its baseline. Baselines
 * never go up: raising one requires editing the JSON by hand and explaining
 * yourself in the pull request.
 *
 * Usage:
 *   node scripts/typecheck-ratchet.cjs            # check (used by CI)
 *   node scripts/typecheck-ratchet.cjs --update   # lower baselines after fixes
 */

'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.github', 'typecheck-baseline.json');
const UPDATE = process.argv.includes('--update');

function workspaceDirs() {
  const dirs = [];
  for (const group of ['apps', 'packages']) {
    const groupPath = path.join(ROOT, group);
    if (!fs.existsSync(groupPath)) continue;
    for (const name of fs.readdirSync(groupPath)) {
      const dir = path.join(groupPath, name);
      if (fs.existsSync(path.join(dir, 'tsconfig.json'))) {
        dirs.push(`${group}/${name}`);
      }
    }
  }
  return dirs.sort();
}

/** Runs tsc in one workspace and returns its error count. */
function countErrors(relDir) {
  try {
    execSync('npx tsc --noEmit', { cwd: path.join(ROOT, relDir), stdio: 'pipe' });
    return 0;
  } catch (err) {
    const text = String(err.stdout || '') + String(err.stderr || '');
    return (text.match(/error TS/g) || []).length;
  }
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`No baseline at ${BASELINE_PATH}. Run with --update to create one.`);
    return {};
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function main() {
  const baseline = loadBaseline();
  const dirs = workspaceDirs();
  const current = {};

  const regressions = [];
  const improvements = [];

  for (const dir of dirs) {
    const count = countErrors(dir);
    current[dir] = count;

    // A package with no baseline entry is new; it must start clean.
    const allowed = baseline[dir] ?? 0;

    if (count > allowed) {
      regressions.push({ dir, count, allowed });
    } else if (count < allowed) {
      improvements.push({ dir, count, allowed });
    }
  }

  const total = Object.values(current).reduce((a, b) => a + b, 0);
  const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);

  // -- Report ---------------------------------------------------------------

  const lines = [];
  lines.push('## TypeScript error ratchet');
  lines.push('');
  lines.push(`**Total: ${total}** (baseline ${baselineTotal})`);
  lines.push('');
  lines.push('| Package | Errors | Baseline | |');
  lines.push('| --- | ---: | ---: | --- |');
  for (const dir of dirs) {
    const c = current[dir];
    const b = baseline[dir] ?? 0;
    const mark = c > b ? 'REGRESSION' : c < b ? 'improved' : c === 0 ? 'clean' : '';
    lines.push(`| \`${dir}\` | ${c} | ${b} | ${mark} |`);
  }
  const report = lines.join('\n');

  console.log(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  }

  // -- Update mode ----------------------------------------------------------

  if (UPDATE) {
    // Only ever lower a baseline. Raising one has to be a deliberate hand edit.
    const next = { ...baseline };
    for (const dir of dirs) {
      const c = current[dir];
      const b = baseline[dir];
      next[dir] = b === undefined ? c : Math.min(b, c);
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
    console.log(`\nBaseline written to ${path.relative(ROOT, BASELINE_PATH)}.`);
    if (regressions.length > 0) {
      console.log(
        'Note: regressions were NOT absorbed into the baseline. Fix them or edit the file by hand.',
      );
    }
    process.exit(regressions.length > 0 ? 1 : 0);
  }

  // -- Check mode -----------------------------------------------------------

  if (improvements.length > 0) {
    console.log('\nImproved since the baseline (run with --update to lock these in):');
    for (const { dir, count, allowed } of improvements) {
      console.log(`  ${dir}: ${allowed} -> ${count}`);
    }
  }

  if (regressions.length > 0) {
    console.error('\nNew TypeScript errors introduced:');
    for (const { dir, count, allowed } of regressions) {
      console.error(`  ${dir}: ${count} errors, baseline allows ${allowed}`);
    }
    console.error(
      '\nFix them, or run `npx tsc --noEmit` in that package to see them.\n' +
        'The baseline only moves down. See docs/LIMITATIONS.md on why these exist at all.',
    );
    process.exit(1);
  }

  console.log('\nNo new type errors.');
  process.exit(0);
}

main();
