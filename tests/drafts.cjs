'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { layoutDrafts } = require('../scripts/diagram.cjs');
const script = path.resolve(__dirname, '../scripts/diagram.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// Exercises source transformations without a renderer or browser.
function runDraftTests() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-drafts-test-'));
  let checks = 0;
  try {
    const out = path.join(temp, 'owned');
    fs.mkdirSync(out);
    const sentinel = path.join(out, 'keep.txt');
    fs.writeFileSync(sentinel, 'unrelated output must survive');
    const fixtures = [
      {
        name: 'unicode',
        prefix: 'flowchart ',
        direction: 'LR',
        suffix: '\n  A["Observation🔎 e\u0301"] -->|record| B["Result🧪"]\n%% flowchart BT\n',
      },
      {
        name: 'crlf-frontmatter-comments',
        prefix:
          '---\r\ntitle: "flowchart LR is a title"\r\nconfig:\r\n  themeVariables:\r\n    fontFamily: "Example Sans"\r\n---\r\n\r\n  %% flowchart RL is a comment\r\n\t%% graph BT\r\n\tgraph ',
        direction: 'TD',
        suffix: '; A["Name🧩"] --> B["Dependency"]\r\n%% graph TB\r\n',
      },
      {
        name: 'semicolon-tail',
        prefix: ' \tflowchart ',
        direction: 'RL',
        suffix: '; A --> B; B --> C; %% flowchart LR\n',
      },
      { name: 'end-of-file', prefix: 'graph ', direction: 'BT', suffix: '' },
      {
        name: 'leading-comments-tabs',
        prefix: '\n\t%% graph LR\n\t\n  flowchart\t',
        direction: 'TB',
        suffix: '\t\nA["English text"] --> B\n',
      },
    ];
    const created = [];
    for (const fixture of fixtures) {
      const input = path.join(temp, fixture.name + '.mmd');
      const prefix = Buffer.from(fixture.prefix),
        suffix = Buffer.from(fixture.suffix);
      const original = Buffer.concat([prefix, Buffer.from(fixture.direction), suffix]);
      fs.writeFileSync(input, original);
      const result = layoutDrafts(input, { presentationOnly: true, outDir: out });
      assert.equal(result.source, input);
      assert.equal(result.sourceSha256, sha(original));
      assert.equal(result.sourceUnchanged, true);
      assert.equal(result.meaningApproved, false, 'Layout generation cannot approve meaning');
      assert.equal(path.dirname(result.draftDir), out);
      assert.match(path.basename(result.draftDir), /^\.layout-drafts-/);
      assert.ok(
        !created.includes(result.draftDir),
        'Each invocation owns a fresh output directory',
      );
      created.push(result.draftDir);
      assert.deepEqual(
        result.drafts.map((d) => d.direction),
        ['LR', 'TB', 'BT'],
      );
      assert.deepEqual(
        fs.readdirSync(result.draftDir).sort(),
        ['BT', 'LR', 'TB'].map((d) => fixture.name + '-' + d + '.mmd').sort(),
      );
      for (const draft of result.drafts) {
        const expected = Buffer.concat([prefix, Buffer.from(draft.direction), suffix]);
        assert.equal(path.dirname(draft.source), result.draftDir);
        assert.deepEqual(
          fs.readFileSync(draft.source),
          expected,
          'Only the explicit header direction may change: ' + fixture.name + ' ' + draft.direction,
        );
        assert.equal(draft.sha256, sha(expected));
      }
      assert.deepEqual(fs.readFileSync(input), original, 'Original Mermaid bytes must not change');
      const repeat = layoutDrafts(input, { presentationOnly: true, outDir: out });
      assert.notEqual(
        repeat.draftDir,
        result.draftDir,
        'Repeated calls must not overwrite earlier drafts',
      );
      created.push(repeat.draftDir);
      for (const draft of result.drafts)
        assert.equal(
          sha(fs.readFileSync(draft.source)),
          draft.sha256,
          'Earlier draft contents must survive repeated calls',
        );
      checks++;
    }
    const input = path.join(temp, 'unicode.mmd');
    const before = fs.readFileSync(input);
    const defaultOut = layoutDrafts(input, { presentationOnly: true });
    assert.equal(
      path.dirname(defaultOut.draftDir),
      temp,
      'Without outDir, a private directory is created beside the source',
    );
    assert.deepEqual(fs.readFileSync(input), before);
    checks++;

    const cases = [
      {
        name: 'missing-flag',
        bytes: Buffer.from('flowchart LR\nA-->B\n'),
        options: {},
        pattern: /requires --presentation-only/,
      },
      {
        name: 'non-flowchart',
        bytes: Buffer.from('sequenceDiagram\nA->>B: test\n'),
        options: { presentationOnly: true },
        pattern: /explicit flowchart\/graph direction/,
      },
      {
        name: 'missing-direction',
        bytes: Buffer.from('flowchart\nA-->B\n'),
        options: { presentationOnly: true },
        pattern: /explicit flowchart\/graph direction/,
      },
      {
        name: 'direction-prefix',
        bytes: Buffer.from('flowchart LRX\nA-->B\n'),
        options: { presentationOnly: true },
        pattern: /explicit flowchart\/graph direction/,
      },
      {
        name: 'misleading-comment',
        bytes: Buffer.from('%% flowchart LR\nsequenceDiagram\nA->>B: test\n'),
        options: { presentationOnly: true },
        pattern: /explicit flowchart\/graph direction/,
      },
      {
        name: 'invalid-utf8',
        bytes: Buffer.concat([
          Buffer.from('flowchart LR\nA['),
          Buffer.from([0xc3, 0x28]),
          Buffer.from(']-->B\n'),
        ]),
        options: { presentationOnly: true },
        pattern: /valid UTF-8/,
      },
    ];
    for (const fixture of cases) {
      const file = path.join(temp, fixture.name + '.mmd');
      fs.writeFileSync(file, fixture.bytes);
      const listing = fs.readdirSync(out).sort();
      assert.throws(
        () => layoutDrafts(file, { ...fixture.options, outDir: out }),
        fixture.pattern,
        fixture.name,
      );
      assert.deepEqual(
        fs.readFileSync(file),
        fixture.bytes,
        'Rejected source must remain byte-identical',
      );
      assert.deepEqual(
        fs.readdirSync(out).sort(),
        listing,
        'Rejected input must not publish partial drafts',
      );
      checks++;
    }
    // Count/flag validation is part of the public CLI, rather than layoutDrafts.
    const cli = (args) =>
      spawnSync(process.execPath, [script, 'drafts', ...args], {
        encoding: 'utf8',
        timeout: 10000,
      });
    const cliOut = path.join(temp, 'cli-out');
    const good = cli([input, '--out-dir', cliOut, '--presentation-only']);
    assert.equal(good.status, 0, good.stderr);
    const receipt = JSON.parse(good.stdout.trim());
    assert.equal(receipt.drafts.length, 3);
    assert.equal(receipt.meaningApproved, false);
    assert.equal(receipt.sourceSha256, sha(before));
    assert.equal(receipt.sourceUnchanged, true);
    assert.deepEqual(fs.readFileSync(input), before);
    checks++;
    for (const [name, args, pattern] of [
      [
        'multiple-inputs',
        [
          input,
          path.join(temp, 'crlf-frontmatter-comments.mmd'),
          '--out-dir',
          cliOut,
          '--presentation-only',
        ],
        /accepts one source/,
      ],
      ['missing-cli-flag', [input, '--out-dir', cliOut], /requires --presentation-only/],
      [
        'invalid-cli-utf8',
        [path.join(temp, 'invalid-utf8.mmd'), '--out-dir', cliOut, '--presentation-only'],
        /valid UTF-8/,
      ],
    ]) {
      const listing = fs.readdirSync(cliOut).sort(),
        result = cli(args);
      assert.notEqual(result.status, 0, name + ' must be rejected');
      assert.match(result.stderr, pattern);
      assert.equal(result.stdout, '', 'Rejected CLI requests must not emit a successful receipt');
      assert.deepEqual(
        fs.readdirSync(cliOut).sort(),
        listing,
        'Rejected CLI requests must not create output',
      );
      assert.deepEqual(fs.readFileSync(input), before);
      checks++;
    }
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'unrelated output must survive');
    return {
      checks,
      validSourceFixtures: fixtures.length,
      directionsPerFixture: 3,
      browserLaunched: false,
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
if (require.main === module) console.log(JSON.stringify({ draftTests: runDraftTests() }));
module.exports = runDraftTests;
