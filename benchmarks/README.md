# Benchmark

Five matched synthetic tasks compare a fresh agent using standard Mermaid knowledge with a fresh agent using this skill:

- Creation: [component flow](cases/flow.md) and [retrieval sequence](cases/sequence.md).
- Local edits: [storage terminology](cases/flow-edit.md) and [one response label](cases/sequence-edit.md), each with an existing source to preserve.
- Semantic repair: [independent attributes and a publishing precondition](cases/constraints.md), starting from an incorrect combined state chain.

Both arms receive identical case bytes, export requirements, and image-viewing tools.

## Environment and protocol

Recorded on 2026-10-24 (JST) on macOS with `gpt-6.1-sol` at `ultra` reasoning effort, Node.js `v24.22.1`, Mermaid `12.2.0`, Playwright `1.64.1`, and Chromium `156.0.8078.4`. Dependencies and the browser were installed before timing.

The fixed order was flow without/with, sequence with/without, flow-edit without/with, sequence-edit with/without, and constraints without/with. All ten trials used separate native agent contexts and ran sequentially. Ordinary source corrections and recoverable sandbox-launch retries stayed in the same worker and are included. No completed result was discarded or replaced, and no worker was interrupted. After the initial ten trials, the independent visual gate found message/lifeline overlap in run04 and run07. Each original worker received the same concrete defect feedback and continued in its original context, sequentially in that order. The reviewer reassessed the two corrected anonymized items. All continuation costs remain in the totals.

The without-skill arm received only its case, common delivery requirements, package metadata, and [render-baseline.cjs](render-baseline.cjs). This helper parses Mermaid, renders one configuration per invocation including source-supplied settings, exports SVG and two PNG sizes, and returns hashes. It supplies no semantic rules, layout search, or geometry diagnostics. The agent could inspect this helper but could not read the skill, its scripts, or other trials.

The with-skill arm read `SKILL.md` and used `scripts/diagram.cjs`. It could not read the baseline helper or other trials. Both arms could inspect and repair their diagrams and had to view the actual exported images. Neither received the expected graph or the other arm's answer.

The English skill, runtime, dependencies, baseline helper, and all five case files were frozen before the first trial. `SKILL.md` SHA-256: `7696acd19fa7d21a58d9cde24a51557d3a66ddb45b1e4d03b57ab529d06e8e41`. Full file hashes appear in [results.json](results.json).

## Results

| Case                          | Without: tokens | With: tokens | Without: active seconds | With: active seconds |
| ----------------------------- | --------------: | -----------: | ----------------------: | -------------------: |
| Component creation            |         363,152 |      245,913 |                    95.2 |                135.2 |
| Sequence creation             |         626,828 |      334,085 |                   156.3 |                126.1 |
| Storage label edit            |         899,259 |      226,261 |                   227.0 |                 91.0 |
| Response label edit           |         462,670 |      509,688 |                   104.6 |                192.3 |
| Independent attributes repair |         481,706 |      389,004 |                   151.1 |                163.5 |

Across all five pairs, processed tokens changed from 2,833,615 to 1,704,951 (39.8% fewer), and worker time from 734.2 to 708.1 seconds (3.6% shorter). Model tool calls changed from 53 to 29. The five with-skill trials together used 1,704,951 tokens, below the 2,000,000-token acceptance limit.

[results.json](results.json) contains native counters, environment metadata, prompt/artifact hashes, image-input coverage, and independent quality scores. The [example outputs](examples/) contain only synthetic case facts. Affected first-pass outputs are retained in [initial-review/](initial-review/); their grades and counters appear alongside final data. Local paths, account data, session identifiers, and raw transcripts are omitted.

Tokens are reported input plus output. Cached input is included once within input, and reasoning output once within output. Counts represent processed tokens, rather than dollars or uncached-only usage. The five with-skill trials are the aggregate used for the 2,000,000-token acceptance check.

`durationMs` sums native completed-turn durations, including tools and waits. `elapsedMs` spans the worker's first start through final completion. Failed attempts remain included. The active-work comparison uses completed-turn duration. Elapsed times additionally include the interval between the initial final and its quality-gate continuation, which depends on trial order and coordination. Setup, development, coordination, grading, and service time between trials are excluded from active-work totals; elapsed totals are not a measure of isolated worker speed.

## Quality checks

A separate reviewer received anonymized final sources, source facts, and PNGs, without treatment labels, counters, author reviews, or trial order. It assessed syntax, readability, and factual agreement. The 0–4 scale means: 0 unusable/missing, 1 major defects, 2 partially correct, 3 minor defects, 4 passes the stated checks. Successful syntax rendering receives 4; a render failure receives 0. Unambiguous line crossings alone are not a defect.

| Case          | Without: syntax / visual / semantic | With: syntax / visual / semantic |
| ------------- | ----------------------------------- | -------------------------------- |
| flow          | 4 / 4 / 4                           | 4 / 4 / 4                        |
| sequence      | 4 / 4 / 4                           | 4 / 4 / 4                        |
| flow-edit     | 4 / 4 / 4                           | 4 / 4 / 4                        |
| sequence-edit | 4 / 4 / 4                           | 4 / 4 / 4                        |
| constraints   | 4 / 4 / 4                           | 4 / 4 / 4                        |

A separate reviewer, with treatment labels withheld, scored every with-skill result 4/4 for syntax, visual quality, and semantic accuracy. No paired final score decreased. The initial review found a lifeline crossing message text in one sequence from each arm. Those original workers corrected their outputs; all continuation tokens and work time are included, and the initial grades and affected artifacts are retained. Final source/export hashes and actual image inputs were checked for both authors and the reviewer.

These are five single-case pairs on one model/runtime. They do not establish general speedups or human-validated quality equivalence.

## Repeat the comparison

Use the pinned development environment; the baseline helper requires standard root dependencies:

```sh
nvm install
nvm use
npm ci
npm exec -- playwright install chromium
```

Use one fresh agent context per case/arm, fix the model, reasoning effort, Node executable, and browser executable, and supply exactly the same case bytes to both arms. Follow the treatment access rules above. Run workers sequentially. Keep corrections in the same context and include all attempts and continuations; report quota or infrastructure interruptions rather than replacing them.

Without-skill render command:

```sh
node benchmarks/render-baseline.cjs /work/output/diagram.mmd /work/output /path/to/chromium
```

With-skill workers activate `SKILL.md`. Require both arms to deliver source, SVG, PNGs, and a short factual/visual review, and to view the actual review PNG plus every detail tile. Record native input/output/cache counters, turn duration, elapsed time, model tool calls, and final artifact hashes. Check image-input hashes and grade the final sources/images independently before comparing efficiency. Feed any concrete defect back to the affected original worker under its original access restrictions, retain the first-pass artifacts and grades, count all continuation costs, and reassess the corrected images.

Recompute the committed totals:

```sh
npm run benchmark:check
```

This validates stored counters and arithmetic. `npm run check` includes this check and browser regressions; it does not launch new model trials. Rerun the measured study separately after changes to the skill or rendering environment.
