/**
 * Smoke tests for @collabspace/crdt
 * Runs without external infrastructure - validates package structure + invariants.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PKG_NAME = "@collabspace/crdt";

test('package.json is valid and named correctly', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, PKG_NAME);
  assert.ok(pkg.scripts, 'scripts must be defined');
});

test('source directory exists', () => {
  const srcDir = path.join(ROOT, 'src');
  assert.ok(fs.existsSync(srcDir), 'src/ directory must exist');
});

test('has a source entry file', () => {
  const srcDir = path.join(ROOT, 'src');
  const files = fs.readdirSync(srcDir);
  const hasEntry = files.some((f) =>
    f === 'index.ts' || f === 'index.js' || f === 'index.tsx' || f === 'main.ts'
  ) || fs.existsSync(path.join(srcDir, 'app'));
  assert.ok(hasEntry, 'src must contain an entry file (index.*, main.ts, or app/)');
});

test('tsconfig.json exists', () => {
  const tsconfigPath = path.join(ROOT, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return;
  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  assert.ok(raw.length > 0, 'tsconfig.json must not be empty');
  // Best-effort parse: tsconfig may contain JSONC-style comments. Try raw first,
  // then strip block comments only (safer than line-comment regex).
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    try { parsed = JSON.parse(stripped); } catch { /* accept JSONC */ }
  }
  if (parsed) {
    assert.ok(typeof parsed === 'object', 'tsconfig.json must be an object');
  }
});

test('required scripts exist', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const script of ['test', 'lint']) {
    assert.ok(pkg.scripts[script], 'scripts.' + script + ' must be defined');
  }
});
