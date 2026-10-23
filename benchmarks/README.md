# Benchmark

Three paired, synthetic tasks compare a fresh agent using standard Mermaid knowledge with a fresh agent using this skill. The cases are [a component flow](cases/flow.md), [an ordered sequence](cases/sequence.md), and [independent attributes with an action precondition](cases/constraints.md). The same case text is used for both arms.

## Environment and protocol

Recorded on 2026-10-23 on macOS with `gpt-6.1-sol` at `ultra` reasoning effort, Node.js `v24.13.1`, Mermaid `11.12.0`, Playwright `1.62.1`, and Chromium `155.0.8059.85`. Each arm had the same general host instructions and tools; only skill activation and the supplied rendering interface differed.

Dependencies and Chromium were available before timing. The fixed trial order was flow without/with, sequence with/without, and constraints without/with. Each trial used a separate native agent context; workers ran sequentially. Ordinary source errors and corrective iterations remained part of the trial. There were no replacement trials or discarded completed results.

The without-skill agent received only the case, the required exports and review, and the location of [render-baseline.cjs](render-baseline.cjs). This helper parses and renders Mermaid with one configuration per invocation, including source-supplied settings, exports SVG and two PNG sizes, and returns hashes and image paths. It supplies no semantic rules, layout search, or geometry diagnostics. The agent could inspect the helper and package metadata, but could not read the skill, its scripts, or the other trials.

The with-skill agent received the identical case, read `SKILL.md`, and used `scripts/diagram.cjs`. It could not read the baseline helper or other trial outputs. Both arms could inspect and repair their diagrams and had to view actual exported images. No agent was given the expected graph or the other arm's answer.

The English skill was fixed before the first with-skill trial and remained unchanged: `SKILL.md` SHA-256 `c7437e0d0ff44121e73c30b9c97ed9853b2a1292400c1c43eb5520aad3308acd`. Renderer, audit, runtime, setup, package, and baseline-helper hashes are recorded in results.json.

## Results

| Case | Without: tokens | With: tokens | Without: seconds | With: seconds |
| --- | ---: | ---: | ---: | ---: |
| Component flow | 1,027,142 | 242,832 | 231.6 | 110.0 |
| Retrieval sequence | 350,107 | 177,551 | 68.4 | 60.0 |
| Independent attributes | 462,549 | 277,609 | 109.8 | 85.4 |

Across all three pairs, processed tokens fell from 1,839,798 to 697,992 (62.1% fewer), and worker time from 409.8 to 255.3 seconds (37.7% shorter). Model tool calls fell from 36 to 12.

[results.json](results.json) contains reported counters, model/environment metadata, prompt and artifact hashes, image-input coverage, and independent quality scores. It omits local paths, account details, native session identifiers, and conversation transcripts. The example diagrams under [examples/](examples/) contain only the synthetic case facts.

The actual-token measure is reported input plus output. Cached input is included once within input; reasoning output is included once within output. These counts measure processed tokens, not dollars or uncached-only usage. Coordinator work, setup, development, and independent grading are outside the trial totals.

`durationMs` is the sum of native completed-turn durations, including tool execution and waits inside each turn. `elapsedMs` is the interval from the trial's first start to its final completion. All failed source attempts are included. The first without-skill flow trial briefly paused while the coordinator clarified that recoverable parse errors were allowed as normal iterations. It resumed in the same context without graph coaching; that pause is retained in both time measures.

## Quality checks

A separate reviewer received anonymized final sources, source facts, and image files, without arm labels, counters, author reviews, or the trial order. It checked syntax, visual readability, and semantic agreement. The reviewer used a 0–4 scale: 0 unusable/missing, 1 major defects, 2 partially correct, 3 minor defects, and 4 passing the stated checks. Syntax received 4 for successful rendering and 0 otherwise. Native image-input hashes were checked against the required exported images.

An independent review with treatment labels withheld scored all three with-skill results 4/4 for syntax, visual quality, and semantic accuracy. No paired score decreased. The without-skill flow scored 3/4 visually because an edge crossed a boundary title; its other scores and the other two results were 4/4.

The first without-skill flow trial includes a brief protocol-clarification pause, retained in the timing. These are three single-case pairs on one model/runtime; they do not establish general speedups or human-validated quality equivalence.

## Repeat or inspect the comparison

The benchmark helper uses the standard development npm layout, rather than the skill installer's hidden runtime:

```sh
npm ci --ignore-scripts
npx playwright install chromium
```

Use a new agent context for each case/arm, fix the model, reasoning effort, Node executable, and browser executable, and keep the case text unchanged. Supply the appropriate arm instructions above. Run one trial at a time; include failed source attempts and any continuation in the counters. For the without-skill arm, the render command is:

```sh
node benchmarks/render-baseline.cjs /work/output/diagram.mmd /work/output /path/to/chromium
```

For the with-skill arm, activate `SKILL.md`. Require both agents to deliver the requested files and view the actual exports. Record native input/output/cache counters, turn duration, elapsed time, and model tool calls. If an execution is interrupted by quota or infrastructure, report the interruption and both time definitions rather than silently replacing it. Assess final sources and images independently before comparing efficiency.

Recompute the committed totals and validate counter identities:

```sh
node benchmarks/summarize.cjs
```

This command checks the stored data and arithmetic. It does not rerun model trials or independently certify the recorded observations.
