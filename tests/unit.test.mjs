import { describe, expect, test } from 'vitest';
import runDraftTests from './drafts.cjs';
import runSourceAliasTests from './source-alias.cjs';
import summarizer from '../benchmarks/summarize.cjs';

const { summarize } = summarizer;

test('creates isolated layout drafts without changing source bytes', runDraftTests);
test('rejects output paths and hard links that alias a source', runSourceAliasTests);

function pairedRuns() {
  const environment = { node: 'v24.22.1', browser: 'test-browser' };
  const model = { name: 'test-model' };
  return {
    environment,
    model,
    runs: ['flow', 'sequence', 'constraints'].flatMap((name) =>
      ['without', 'with'].map((arm) => {
        const scale = arm === 'without' ? 2 : 1;
        return {
          case: name,
          arm,
          promptSha256: name,
          environment,
          model,
          inputTokens: 50 * scale,
          outputTokens: 10 * scale,
          cachedInputTokens: 25 * scale,
          totalTokens: 60 * scale,
          reasoningOutputTokens: 2 * scale,
          durationMs: arm === 'without' ? 2000 : 1500,
          elapsedMs: arm === 'without' ? 4000 : 1000,
          modelToolCalls: arm === 'without' ? 4 : 0,
          interrupted: false,
          quality: { syntax: 4, visual: 3, semantic: 4 },
        };
      }),
    ),
  };
}

describe('benchmark summary', () => {
  test('aggregates paired measurements and reports reductions', () => {
    const result = summarize(pairedRuns());
    expect(result.totals.without).toMatchObject({
      runs: 3,
      totalTokens: 360,
      inputTokens: 300,
      outputTokens: 60,
      cachedInputTokens: 150,
      durationMs: 6000,
      elapsedMs: 12000,
      modelToolCalls: 12,
      quality: { syntax: 12, visual: 9, semantic: 12 },
    });
    expect(result.totals.with.totalTokens).toBe(180);
    expect(result.reductionPercent).toEqual({
      tokens: 50,
      duration: 25,
      elapsed: 75,
      modelToolCalls: 100,
    });
  });

  test('accepts five complete pairs and rejects a missing arm', () => {
    const data = pairedRuns();
    for (const name of ['flow-edit', 'sequence-edit']) {
      data.runs.push(
        ...data.runs.slice(0, 2).map((run) => ({ ...run, case: name, promptSha256: name })),
      );
    }
    expect(summarize(data).totals.with.runs).toBe(5);
    data.runs.pop();
    expect(() => summarize(data)).toThrow();
  });

  test.each([-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid measurement counters (%s)',
    (invalid) => {
      const data = pairedRuns();
      data.runs[0].elapsedMs = invalid;
      expect(() => summarize(data)).toThrow('Invalid elapsedMs');
    },
  );

  test('rejects token totals that do not match input and output usage', () => {
    const data = pairedRuns();
    data.runs[0].totalTokens += 1;
    expect(() => summarize(data)).toThrow();
  });

  test('rejects cases whose treatment arms received different prompts', () => {
    const data = pairedRuns();
    data.runs[1].promptSha256 = 'different-prompt';
    expect(() => summarize(data)).toThrow();
  });
});
