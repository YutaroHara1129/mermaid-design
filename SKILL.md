---
name: mermaid-design
description: Design Mermaid diagrams for semantic accuracy, valid syntax, and readability; batch-render matching SVG and PNG exports and inspect the results. Use for system views, workflows, states, sequences, and data relationships.
---

# Design and review Mermaid diagrams

Answer the reader's question without inventing relationships, membership, dependencies, or order. Treat `.mmd` as the source of truth. Check meaning, syntax, and visual quality separately. This file defines the semantic and CLI workflow.

## 1. Establish meaning before drawing

Record the following briefly: a few lines for a simple diagram, or a table for several boundaries and relationship types. Mark unknown facts as unresolved rather than filling them in.

| Item                     | Establish                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Reader and question      | Who needs to decide what? State the specific question the diagram should answer.                                                               |
| Scope and abstraction    | What does a node represent: system, running application, step, state, person, or attribute?                                                    |
| Entities and sets        | Stable IDs, roles, membership, internal/external scope, and whether a boundary means responsibility, authority, deployment, or set membership. |
| Dimensions and placement | Independent classifications such as time, responsibility, environment, type, and importance; the meaning assigned to position and color.       |
| Relationships            | Source, destination, type, verb and object, direction, and any condition or multiplicity; a consistent reading of arrows.                      |
| Facts to preserve        | Exceptions, cycles, shared entities, cross-boundary links, counts, and identities whose omission could mislead; their source evidence.         |

Be able to explain whether two nodes have the same abstraction level, what entering a boundary asserts, whether an arrow could be read backward, and whether placement implies unsupported order.

Check in both directions: every required source fact appears, and every claim made by a node, edge, boundary, or note has evidence. Track relationships as `actor / action / counterpart / condition / evidence`; keep the same actor across related diagrams. Do not add a usual business actor, request, response, or processing order without evidence. Label hypothetical examples and assumptions visibly, separate from established facts.

## 2. Map the concepts to a notation

| Situation                                          | Representation                                                                                         | Avoid                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| One system and external responsibilities           | A focused system view with external roles identified                                                   | Mixing its internal parts with peer systems                                     |
| Peer execution units and shared data/control       | A component view at one decomposition level; label external types                                      | Mixing database tables or library functions into application-level boxes        |
| Membership or containment                          | Nested boundaries with their containment meaning named                                                 | Turning use/dependency into containment or inventing membership for layout      |
| Overlapping classifications                        | Attributes, a mapping table, or panels with common IDs; a set representation if overlap is the subject | Forcing independent dimensions into one nesting tree                            |
| Branching or repeated work                         | A flowchart with branch conditions and reasons for returns                                             | Flattening real branches or cycles for appearance                               |
| Ordered interactions among actors                  | A sequence diagram distinguishing calls, asynchronous messages, responses, and alternatives            | Presenting structural dependencies as chronological events                      |
| Allowed transitions of one object                  | `stateDiagram-v2`, separating states, triggers, and conditions                                         | Combining independent state dimensions into one mutually exclusive list         |
| Known attribute values without transition rules    | Attributes with value sets, or a table                                                                 | Inventing transitions, initial states, or final states from value lists         |
| Data references and multiplicity                   | `erDiagram`, `classDiagram`, or a mapping table                                                        | Treating cardinality, use direction, and data movement as the same arrow        |
| Inheritance versus use/ownership                   | Decide whether A is a kind of B or uses/contains B; use distinct connectors and endpoints              | Making a dependency or part into a superclass                                   |
| Shared entities, cycles, or many-to-many relations | Preserve the actual graph; separate responsibilities and time if needed                                | Duplicating shared entities, deleting cycles, or inventing a hub to make a tree |

Structural and chronological diagrams answer different questions. Reuse semantic IDs across views, map any expansion or omission, and distinguish different entities, repeated views of one entity, and multiple instances.

Aggregate only when members have the same role for this question and the resulting arrows do not falsely assert a relationship for every member. Do not merge distinct senders or recipients just to reduce lines. When splitting a diagram, retain the scope, common IDs, references, and necessary cross-boundary relationships.

Test conditions and order by paraphrasing. “B requires A” means `B implies A`; it does not mean `A implies B` or automatic execution. Attach the condition to action/transition B, rather than merely to a preceding state. “Shipping requires payment” does not equate payment, reservation, and shipping. Unknown order, either order being allowed, parallel execution, and absence of waiting are different facts. Do not turn unknown order into a sequence or `par`; use relationships, separate panels, or an explicit unspecified-order note.

Distinguish a condition required at execution time from an invariant that must hold afterward. Approval at publication time does not imply that approval remains unchanged forever. If transition rules are unspecified, show the action and its necessary condition independently; do not invent a permanent constraint between stored attribute values.

## 3. Make labels and visual encoding readable

Keep node names at a consistent type and granularity. Put the name first, then type/role and a short responsibility needed for the decision. Do not pack full prose into boxes. Break long labels at meaningful boundaries with `<br/>`, retaining identifying words and conditions.

Read arrows as “who does what.” For a call, use `A -->|query history / API| B`; for returned data, use `B -->|return history| A`. Keep one arrow convention, or explicitly distinguish conventions with labels and line styles. “History” alone does not distinguish a call from data movement. Use a bidirectional relationship only for the same contract in both directions; represent different operations or times separately.

Give color, boundaries, shape, position, and line styles distinct, consistent meanings. For example, a boundary can mean membership, color a role, and line style a relationship type. Preserve distinctions without color through labels, type names, or a legend. Do not assume readers assign a universal meaning to solid lines, dashes, or cylinders.

If position represents quantity, chronology, or authority, name the axis and direction. Otherwise avoid suggesting unsupported causality or hierarchy through placement. Put classifications that do not help answer this question into prose or a table.

## 4. Work with automatic layout

Use stable IDs, quoted Unicode labels, and a few role-based `classDef` styles where useful. Declaration order is not a coordinate system. Do not force every diagram into C4, LR, TB, or one palette.

| Rendered problem                                 | Repairs that preserve meaning                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Long labels or poor wrapping                     | Separate names from detail, insert meaningful breaks, adjust width and spacing before reducing text size.                               |
| Lines through unrelated nodes or boundary titles | Check relationships and direction, compare spacing/order/orientation, then consider separate views with references.                     |
| Crossings that make paths ambiguous              | Distinguish main and supporting paths; separate questions using common IDs and overview/detail views. Do not invent hubs or membership. |
| Subgraph direction is ignored                    | External edges from child nodes can make Mermaid inherit the parent direction. Preserve actual endpoints and compare separate views.    |
| Text becomes unreadable when fitted              | Check at the viewing width; split or provide detail views, scalable SVG, and detailed PNGs.                                             |

Connecting to a boundary instead of an entity changes the endpoint's meaning. Do not move edges to a parent set for layout. Use invisible links only as ordering aids, with `%% layout-only` and their purpose recorded in the source. Do not fake layout with visible arrows, invented nodes, or direct SVG coordinate edits.

Choose direction for reading order and page shape. If it represents a meaningful axis, update the explanation and verification when changing it. Reconsider sets and abstraction when layout alone cannot resolve density; do not split at a fixed node count.

## 5. Batch rendering and review

Use the installed Node runtime and the CLI contracts below. On a successful normal path, do not reread help, implementation, or full manifests. Inspect relevant internals when diagnosing failures. Run `npm run setup` only if dependencies are absent or stale. Check compatibility with the pinned Mermaid version before using unfamiliar syntax.

For a new flowchart with no semantic axis, where cross-boundary or return edges complicate placement, generate LR/TB/BT candidates together. `--presentation-only` is your assertion that direction has no semantic meaning; it is not automated semantic approval. Do not use it for local edits or meaningful axes.

```sh
node /absolute/path/mermaid-design/scripts/diagram.cjs drafts /work/a.mmd --out-dir /work/owned-drafts --presentation-only
```

The original is unchanged. JSON `drafts[].source` contains three files differing only in the declared direction. In one code-capable tool call, save the source, run `drafts`, mechanically read its returned paths, batch-render the three candidates with `review --improve`, await completion, parse the diagnostics, and return all three viewport images and required detail tiles. Render other diagrams in the same call. Do not insert model round trips solely to read candidate paths when no new judgment is needed.

Inspect the candidates, choose one, explicitly update the final source direction, and run normal `review` on that source. Verify the final source and exports match. Fix shared label defects in the original before comparing again, and check that each candidate preserves meaning. Clean up only the `draftDir` created by that invocation.

Break long boundary titles and condition labels meaningfully in the first draft. Keep incoming boundary edges clear of titles; choose direction and spacing for the viewing width rather than imposing one direction everywhere.

```sh
node /absolute/path/mermaid-design/scripts/diagram.cjs review /work/a.mmd /work/b.mmd --out-dir /work/output --improve --preview-width 1440 --browser /path/to/chrome
node /absolute/path/mermaid-design/scripts/diagram.cjs verify /work/output/a.render.json /work/output/b.render.json
```

`review --improve` compares the same three rendering profiles and produces SVG, full PNG or overview/detail tiles, and a viewing-width PNG from the selected SVG. Its JSON lines return selected diagnostics, environment, configuration hash, absolute image paths, and hash consistency. `verify` checks source/artifact hashes and returns the saved environment and configuration hash. Compare `environment` and `renderConfigSha256` when reusing review. Do not write new Playwright inspection code for every diagram.

When tools support awaiting multiple operations, split calls only where a new model decision is needed:

1. In the first work call after reading this skill, read all required sources, evidence, and prior reviews together. Include `verify` for diagrams whose review may be reused. Do not rediscover known files or working directories.
2. Save sources, run `review` for all affected diagrams, await completion, parse JSON, and return required image inputs in one call. Let shell execution wait up to 30 seconds; if a session remains, await it within the same code call and concatenate output. Do not create separate model round trips for “still running” and then image paths. Split when a long operation needs a progress update.
3. Judge the images. If repairs are necessary, group repairs with the same cause, then batch the save, affected-diagram rendering, and returned images again.
4. After checking meaning and appearance, save a short `review.md` and perform final hash verification in one call.

For a code-capable Codex tool, the pattern is below. Set `renderCommand` and `executionOptions` to the actual paths, working directory, and required execution permissions.

```javascript
let r = await tools.exec_command({ cmd: renderCommand, ...executionOptions, yield_time_ms: 30000 });
let stdout = r.output;
while (r.session_id) {
  r = await tools.write_stdin({ session_id: r.session_id, chars: '', yield_time_ms: 30000 });
  stdout += r.output;
}
if (r.exit_code !== 0) throw Error(stdout);
for (const line of stdout.trim().split('\n')) {
  const result = JSON.parse(line);
  text(result);
  for (const item of result.images || []) {
    if (item.purpose === 'review-at-viewport-width' || item.purpose === 'detail-crop')
      image((await tools.view_image({ path: item.path })).image_url);
  }
}
```

Actually view the SVG-derived `review-at-viewport-width` images and all required detail tiles as image inputs. An overview alone cannot approve detail. If images exceed the viewport/detail budgets, reconsider splitting or detail views. Check readability, overlap, clipping, boundary titles, arrow endpoints, lines through unrelated nodes, crossings, main reading paths, and contrast. Zero warnings and matching hashes do not certify meaning or readability. State that visual review is incomplete if image inputs are unavailable.

For each defect, identify its cause and expected improvement. Do not silence warnings by removing required relationships, inventing membership/intermediaries/endpoints, or directly editing SVG coordinates. If a repair does not help, reconsider notation, direction, or splitting. Do not call the result complete while material ambiguity remains. Once meaning and appearance are verified and no concrete defect remains, stop decorative iteration; do not stop required review at an arbitrary iteration count.

Reuse review only when the question, evidence, environment, configuration, source, and artifacts match. Compare `verify` hashes and saved environment/configuration with the changed diagrams' `review` results and the prior review. If anything differs, determine the necessary recheck scope. Regenerate every format for each changed source.

Before delivery, compare source facts and diagram claims in both directions and test likely misreadings. Deliver `.mmd`, SVG, necessary PNGs, and a short `review.md` recording the question, arrow/boundary meanings, images actually viewed, reused checks, and remaining issues. Leave automatic semantic/visual approval flags `false`; record the actual semantic and image review separately.
