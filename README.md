# mermaid-design

English | [日本語](README.ja.md)

An agent skill for Mermaid diagrams that communicate the intended relationships and export consistently to SVG and PNG. It covers flowcharts, system views, state diagrams, sequences, and data relationships.

The agent checks three things: valid Mermaid syntax, readable images, and agreement with the source facts. Local tools generate layout candidates, geometry warnings, image previews, and hashes; the agent reviews meaning and appearance.

## Installation

Use Node.js 20 or newer and a Chromium browser. Place the complete repository in your agent's skills directory as `mermaid-design`, or configure the agent to load [SKILL.md](SKILL.md). Keep the scripts and package files alongside it.

From the repository directory:

```sh
npm run setup
npm exec --prefix .runtime -- playwright install chromium
```

Setup installs the locked dependencies into `.runtime/`. If Chromium is already installed, skip the second command and pass its executable with `--browser`, or set `MERMAID_BROWSER`.

The locked renderer uses Mermaid 11.12.0 and Playwright 1.62.1. The measurements below used Node.js 24.13.1 on macOS.

## Usage

Ask an agent with file, shell, and image-viewing tools:

> Use mermaid-design to diagram the supplied facts. Deliver the Mermaid source, SVG, PNG, and a short review of the meaning and readability.

The source facts can describe a new diagram or a change to an existing one. The agent reads the skill, chooses a suitable notation, renders the diagram, views the exported images, and checks the result against the facts.

You can also run the renderer directly:

```sh
node scripts/diagram.cjs review docs/architecture.mmd --out-dir output --improve
node scripts/diagram.cjs verify output/architecture.render.json
```

`review --improve` compares three layout profiles and exports the selected SVG, PNG images, a viewport-width preview, and a `.render.json` manifest. Large diagrams may use an overview and overlapping detail tiles. `verify` checks the recorded source and artifact hashes and returns the saved environment and configuration hash. It does not rerun the renderer or approve meaning and appearance.

For a new flowchart whose direction carries no meaning, `drafts --presentation-only` creates LR, TB, and BT source candidates without rewriting the original. The agent chooses a candidate after inspection. See [the skill](SKILL.md) for this workflow and the review requirements.

## Architecture

![From source facts through rendering to a reviewed diagram](docs/architecture.svg)

| Component | Function |
| --- | --- |
| `SKILL.md` | Agent instructions for relationships, boundaries, notation, and review |
| `scripts/diagram.cjs` | Candidate sources, batch rendering, exports, and hash verification |
| `scripts/audit.cjs` | Browser-side geometry diagnostics |
| `scripts/setup.cjs`, `scripts/runtime.cjs` | Locked dependency installation and resolution |
| `.mmd`, `.svg`, `.png`, `.render.json` | Source, derived images, and provenance record |

Rendering runs locally with browser network requests blocked. A source edit requires regenerated exports for that diagram. Existing review can be reused only when its facts, source, environment, configuration, and artifacts still match. Automatic semantic and visual approval flags remain `false`; the separate review records the checks actually performed.

## Measured comparison

Measured on 2026-10-23 with three matched synthetic tasks and fresh agent contexts. The without-skill arm used standard Mermaid knowledge and a basic single-configuration renderer. The with-skill arm loaded this English skill and its CLI. Both used the same model, dependencies, browser, task facts, export requirements, and image-viewing capability.

| Case | Without: tokens | With: tokens | Without: seconds | With: seconds |
| --- | ---: | ---: | ---: | ---: |
| Component flow | 1,027,142 | 242,832 | 231.6 | 110.0 |
| Retrieval sequence | 350,107 | 177,551 | 68.4 | 60.0 |
| Independent attributes | 462,549 | 277,609 | 109.8 | 85.4 |

Across all three pairs, processed tokens fell from 1,839,798 to 697,992 (62.1% fewer), and worker time from 409.8 to 255.3 seconds (37.7% shorter). Model tool calls fell from 36 to 12.

An independent review with treatment labels withheld scored all three with-skill results 4/4 for syntax, visual quality, and semantic accuracy. No paired score decreased. The without-skill flow scored 3/4 visually because an edge crossed a boundary title; its other scores and the other two results were 4/4.

Tokens are the native runtime's reported input plus output, including cached input. Cached input is a subset of input, not an additional charge in this count. Time is the completed worker turn duration, including tool waits; setup, coordinator work, independent grading, and service time between runs are excluded. All six trials completed without an interruption.

The first without-skill flow trial includes a brief protocol-clarification pause, retained in the timing. These are three single-case pairs on one model/runtime; they do not establish general speedups or human-validated quality equivalence.

The [method, exact prompts, counters, quality scores, and example outputs](benchmarks/README.md) are included. Recompute the table totals with:

```sh
node benchmarks/summarize.cjs
```

## Tests

For development, install dependencies in the standard npm layout:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

The suite covers seven fixtures across five diagram families, source preservation, invalid input, artifact tampering, stale exports, geometry faults, and PNG coverage and fidelity. The release check generated 17 detail tiles. `npm run test:drafts` runs 16 source-candidate checks without launching a browser.

## License

[MIT](LICENSE). Dependencies retain their own licenses.
