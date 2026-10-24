import { test } from 'vitest';
import runBrowserTests from './test.cjs';

test(
  'preserves source, artifact integrity, geometry diagnostics, and raster fidelity',
  runBrowserTests,
  600_000,
);
