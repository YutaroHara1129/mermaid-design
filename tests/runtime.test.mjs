import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const runtimeSource = fs.readFileSync(new URL('../scripts/runtime.cjs', import.meta.url));
const dependencies = { mermaid: '1.2.3', playwright: '4.5.6', yaml: '7.8.9' };
const fixtures = [];

function createFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-runtime-test-')));
  fixtures.push(root);
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'scripts/runtime.cjs'), runtimeSource);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
  return root;
}

function installPackages(directory, versions = dependencies) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ dependencies: versions }),
  );
  for (const [name, version] of Object.entries(versions)) {
    const packageDirectory = path.join(directory, 'node_modules', name);
    fs.mkdirSync(packageDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(packageDirectory, 'package.json'),
      JSON.stringify({ name, version, main: 'index.cjs' }),
    );
    fs.writeFileSync(
      path.join(packageDirectory, 'index.cjs'),
      'module.exports = ' + JSON.stringify({ name, directory }) + ';\n',
    );
  }
}

function loadRuntime(root) {
  return require(path.join(root, 'scripts/runtime.cjs'));
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    for (const filename of Object.keys(require.cache)) {
      if (filename.startsWith(root + path.sep)) delete require.cache[filename];
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('loads the helper without installed dependencies for dependency-free commands', () => {
  const root = createFixture();
  let runtime;
  expect(() => {
    runtime = loadRuntime(root);
  }).not.toThrow();
  expect(typeof runtime).toBe('function');
  expect(typeof runtime.resolve).toBe('function');
});

test('prefers current root dependencies over a stale hidden runtime', () => {
  const root = createFixture();
  installPackages(root);
  installPackages(path.join(root, '.runtime'), { ...dependencies, mermaid: '0.0.1' });
  const runtime = loadRuntime(root);
  expect(runtime('mermaid')).toEqual({ name: 'mermaid', directory: root });
  expect(runtime.resolve('playwright')).toBe(path.join(root, 'node_modules/playwright/index.cjs'));
});

test('uses the hidden runtime when root dependencies are absent', () => {
  const root = createFixture();
  const hidden = path.join(root, '.runtime');
  installPackages(hidden);
  const runtime = loadRuntime(root);
  expect(runtime('yaml')).toEqual({ name: 'yaml', directory: hidden });
  expect(runtime.resolve('mermaid')).toBe(path.join(hidden, 'node_modules/mermaid/index.cjs'));
});

test.each(['root', 'hidden'])(
  'rejects stale %s packages against the current root dependency versions',
  (location) => {
    const root = createFixture();
    const directory = location === 'root' ? root : path.join(root, '.runtime');
    installPackages(directory, { ...dependencies, playwright: '0.0.1' });
    if (location === 'root') {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
    }
    const runtime = loadRuntime(root);
    const recovery = location === 'root' ? 'npm ci' : 'npm run setup';
    for (const useModule of [() => runtime('mermaid'), () => runtime.resolve('mermaid')]) {
      expect(useModule).toThrow('playwright');
      expect(useModule).toThrow(recovery);
    }
  },
);

test.each(['root', 'hidden'])(
  'rejects missing %s packages before loading another dependency',
  (location) => {
    const root = createFixture();
    const directory = location === 'root' ? root : path.join(root, '.runtime');
    installPackages(directory);
    fs.rmSync(path.join(directory, 'node_modules/yaml'), { recursive: true });
    if (location === 'root') installPackages(path.join(root, '.runtime'));
    const runtime = loadRuntime(root);
    const recovery = location === 'root' ? 'npm ci' : 'npm run setup';
    for (const useModule of [() => runtime('mermaid'), () => runtime.resolve('mermaid')]) {
      expect(useModule).toThrow('yaml');
      expect(useModule).toThrow(recovery);
    }
  },
);
