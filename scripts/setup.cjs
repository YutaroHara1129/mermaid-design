#!/usr/bin/env node
const fs = require('node:fs'),
  path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  runtime = path.join(root, '.runtime');
const args = process.argv.slice(2);
if (args.some((a) => a !== '--offline')) {
  console.error('Usage: node scripts/setup.cjs [--offline]');
  process.exit(1);
}
fs.mkdirSync(runtime, { recursive: true });
for (const name of ['package.json', 'package-lock.json'])
  fs.copyFileSync(path.join(root, name), path.join(runtime, name));
const result = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['ci', '--omit=dev', '--engine-strict', '--ignore-scripts', '--no-audit', '--no-fund', ...args],
  { cwd: runtime, stdio: 'inherit', shell: false },
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exitCode = result.status === null ? 1 : result.status;
