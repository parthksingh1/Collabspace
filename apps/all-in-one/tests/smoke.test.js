/**
 * Smoke tests for @collabspace/all-in-one
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('package.json is valid and named correctly', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@collabspace/all-in-one');
  assert.ok(pkg.scripts, 'scripts must be defined');
});

test('source directory exists', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src')));
});

test('has a source entry file', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src', 'index.ts')));
});

test('tsconfig.json exists and parses', () => {
  const p = path.join(ROOT, 'tsconfig.json');
  assert.ok(fs.existsSync(p));
  const raw = fs.readFileSync(p, 'utf8');
  assert.ok(raw.length > 0);
});

test('required scripts exist', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const s of ['test', 'lint', 'build', 'start']) {
    assert.ok(pkg.scripts[s], `scripts.${s} must be defined`);
  }
});
