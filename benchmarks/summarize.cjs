#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function summarize(data) {
  const arms = ['without', 'with'];
  assert.ok(data.runs.length >= 2 && data.runs.length % 2 === 0, 'Expected paired cases');
  for (const run of data.runs) {
    assert.ok(arms.includes(run.arm));
    assert.equal(run.totalTokens, run.inputTokens + run.outputTokens);
    assert.ok(run.cachedInputTokens <= run.inputTokens);
    for (const key of [
      'inputTokens',
      'outputTokens',
      'cachedInputTokens',
      'totalTokens',
      'durationMs',
      'elapsedMs',
      'modelToolCalls',
    ])
      assert.ok(Number.isSafeInteger(run[key]) && run[key] >= 0, 'Invalid ' + key);
    assert.ok(run.totalTokens > 0 && run.durationMs > 0 && run.elapsedMs > 0);
    assert.ok(
      Number.isSafeInteger(run.reasoningOutputTokens) &&
        run.reasoningOutputTokens >= 0 &&
        run.reasoningOutputTokens <= run.outputTokens,
    );
    assert.equal(run.interrupted, false, 'Interrupted runs require separate timing analysis');
    assert.deepEqual(run.environment, data.environment);
    assert.deepEqual(run.model, data.model);
    for (const axis of ['syntax', 'visual', 'semantic'])
      assert.ok(
        Number.isInteger(run.quality[axis]) && run.quality[axis] >= 0 && run.quality[axis] <= 4,
      );
  }
  const cases = [...new Set(data.runs.map((run) => run.case))];
  assert.equal(cases.length * 2, data.runs.length);
  for (const name of cases) {
    const pair = data.runs.filter((run) => run.case === name);
    assert.equal(pair.length, 2);
    assert.deepEqual(pair.map((run) => run.arm).sort(), [...arms].sort());
    assert.equal(pair[0].promptSha256, pair[1].promptSha256);
  }
  const totals = Object.fromEntries(
    arms.map((arm) => {
      const runs = data.runs.filter((run) => run.arm === arm);
      const sum = (key) => runs.reduce((value, run) => value + run[key], 0);
      return [
        arm,
        {
          runs: runs.length,
          totalTokens: sum('totalTokens'),
          inputTokens: sum('inputTokens'),
          outputTokens: sum('outputTokens'),
          cachedInputTokens: sum('cachedInputTokens'),
          durationMs: sum('durationMs'),
          elapsedMs: sum('elapsedMs'),
          modelToolCalls: sum('modelToolCalls'),
          quality: Object.fromEntries(
            ['syntax', 'visual', 'semantic'].map((axis) => [
              axis,
              runs.reduce((value, run) => value + run.quality[axis], 0),
            ]),
          ),
        },
      ];
    }),
  );
  const reduction = (key) => 100 * (1 - totals.with[key] / totals.without[key]);
  return {
    totals,
    reductionPercent: {
      tokens: reduction('totalTokens'),
      duration: reduction('durationMs'),
      elapsed: reduction('elapsedMs'),
      modelToolCalls: reduction('modelToolCalls'),
    },
  };
}
if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, 'results.json');
  console.log(JSON.stringify(summarize(JSON.parse(fs.readFileSync(file, 'utf8'))), null, 2));
}
module.exports = { summarize };
