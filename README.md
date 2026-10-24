# mermaid-design

English | [日本語](README.ja.md)

An agent skill for Mermaid diagrams that communicate the intended relationships and export consistently to SVG and PNG. It covers flowcharts, system views, state diagrams, sequences, and data relationships.

The agent checks three things: valid Mermaid syntax, readable images, and agreement with the source facts. Local tools generate layout candidates, geometry warnings, image previews, and hashes; the agent reviews meaning and appearance.

## Installation

Use Node.js 24.22.1 LTS (`.nvmrc`), npm 11.19.1, and a Chromium browser. The repository enforces supported Node.js and npm versions with `engine-strict`. Place the complete repository in your agent's skills directory as `mermaid-design`, or configure the agent to load [SKILL.md](SKILL.md). Keep the scripts and package files alongside it.

From the repository directory:

```sh
npm run setup
npm exec --prefix .runtime -- playwright install chromium
```

Setup installs only the locked production dependencies into `.runtime/`. If Chromium is already installed, skip the second command and pass its executable with `--browser`, or set `MERMAID_BROWSER`. After dependency updates, rerun `npm run setup`; the renderer rejects stale installed versions. Refresh a standard development installation with `npm ci` instead.

The renderer pins Mermaid 12.2.0, Playwright 1.64.1, and YAML 2.9.1. See [Development](#development) for the nvm setup and validation commands.

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

| Component                                  | Function                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `SKILL.md`                                 | Agent instructions for relationships, boundaries, notation, and review |
| `scripts/diagram.cjs`                      | Candidate sources, batch rendering, exports, and hash verification     |
| `scripts/audit.cjs`                        | Browser-side geometry diagnostics                                      |
| `scripts/setup.cjs`, `scripts/runtime.cjs` | Locked dependency installation and resolution                          |
| `.mmd`, `.svg`, `.png`, `.render.json`     | Source, derived images, and provenance record                          |

Rendering runs locally with browser network requests blocked. A source edit requires regenerated exports for that diagram. Existing review can be reused only when its facts, source, environment, configuration, and artifacts still match. Automatic semantic and visual approval flags remain `false`; the separate review records the checks actually performed.

## Measured comparison

Measured on 2026-10-24 (JST) with five matched synthetic tasks: two creations, two local edits, and one semantic repair. Every trial used a fresh agent context. The without-skill arm used standard Mermaid knowledge and a basic single-configuration renderer; the with-skill arm loaded this English skill and its CLI. Both used the same model, dependencies, browser, case text, export requirements, and image-viewing tools.

| Case                          | Without: tokens | With: tokens | Without: active seconds | With: active seconds |
| ----------------------------- | --------------: | -----------: | ----------------------: | -------------------: |
| Component creation            |         363,152 |      245,913 |                    95.2 |                135.2 |
| Sequence creation             |         626,828 |      334,085 |                   156.3 |                126.1 |
| Storage label edit            |         899,259 |      226,261 |                   227.0 |                 91.0 |
| Response label edit           |         462,670 |      509,688 |                   104.6 |                192.3 |
| Independent attributes repair |         481,706 |      389,004 |                   151.1 |                163.5 |

Across all five pairs, processed tokens changed from 2,833,615 to 1,704,951 (39.8% fewer), and worker time from 734.2 to 708.1 seconds (3.6% shorter). Model tool calls changed from 53 to 29. The five with-skill trials together used 1,704,951 tokens, below the 2,000,000-token acceptance limit.

A separate reviewer, with treatment labels withheld, scored every with-skill result 4/4 for syntax, visual quality, and semantic accuracy. No paired final score decreased. The initial review found a lifeline crossing message text in one sequence from each arm. Those original workers corrected their outputs; all continuation tokens and work time are included, and the initial grades and affected artifacts are retained. Final source/export hashes and actual image inputs were checked for both authors and the reviewer.

Tokens are the native runtime's reported input plus output, including cached input once within input. Active work time sums completed worker turn durations, including tool waits, recoverable failures, and quality-gate corrections. Wall-clock elapsed times, including coordination between turns, are reported separately in the data. Active-work totals exclude setup, development, coordination, independent grading, and service time between trials. All ten trials completed without interruption or replacement.

These are five single-case pairs on one model/runtime. They do not establish general speedups or human-validated quality equivalence.

The [method, exact prompts, counters, quality scores, and example outputs](benchmarks/README.md) are included. Recompute the totals with:

```sh
node benchmarks/summarize.cjs
```

## Development

Use the Node.js 24.22.1 LTS version in `.nvmrc` and npm 11.19.1. Install development dependencies in the standard npm layout:

```sh
nvm install
nvm use
npm ci
npm exec -- playwright install chromium
npm run check
```

Keep lifecycle scripts enabled for `npm ci`: its `prepare` script installs Husky hooks.

| Command                | Checks                                                       |
| ---------------------- | ------------------------------------------------------------ |
| `npm run lint`         | ESLint with no warnings                                      |
| `npm run format:check` | Prettier formatting                                          |
| `npm run test:unit`    | Unit and runtime cases without Chromium                      |
| `npm run test:browser` | Browser rendering and image checks                           |
| `npm test`             | All Vitest tests                                             |
| `npm run check:fast`   | Lint, formatting, and unit/runtime tests                     |
| `npm run check`        | Fast checks, browser tests, and benchmark counter validation |

Vitest runs 17 unit/runtime tests and one browser integration suite covering seven fixtures across five diagram families. Checks include source preservation, invalid input, artifact tampering, stale exports, geometry faults, and PNG coverage and fidelity. All 27 generated PNGs are compared with independent SVG DOM renders.

Husky runs `check:fast` before commits and `check` before pushes. These local hooks can be bypassed; the repository has no server-required CI checks or GitHub Actions workflows.

Once this configuration is on the default branch, Dependabot opens npm update pull requests weekly and groups development-dependency minor and patch updates. Updates do not merge automatically. Bot pull requests do not execute local hooks, so a maintainer must check out each pull request and run `npm ci && npm run check` locally before merging it.

## License

[MIT](LICENSE). Dependencies retain their own licenses.
