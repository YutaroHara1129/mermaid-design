'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { chromium } = require('../scripts/runtime.cjs')('playwright');
const audit = require('../scripts/audit.cjs');
const { verify, chooseBrowser } = require('../scripts/diagram.cjs');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, '.test-output'),
  script = path.join(root, 'scripts/diagram.cjs');
const names = [
  'context',
  'container',
  'state-cycle',
  'sequence',
  'entity',
  'inheritance',
  'shared-cycle',
];
const hashes = () =>
  names.map((n) =>
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.mmd')))
      .digest('hex'),
  );
const run = (args) =>
  spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', timeout: 180000 });
async function runBrowserTests() {
  const original = hashes();
  const render = run([
    'render',
    ...names.map((n) => path.join(__dirname, 'fixtures', n + '.mmd')),
    '--out-dir',
    out,
    '--improve',
  ]);
  assert.equal(render.status, 0, render.stderr);
  assert.deepEqual(hashes(), original, 'Rendering must not rewrite semantic sources');
  let tiles = 0;
  for (const name of names) {
    const file = path.join(out, name + '.render.json'),
      report = JSON.parse(fs.readFileSync(file));
    assert.equal(verify(file).consistent, true);
    assert.equal(report.review.meaningApproved, false);
    assert.equal(report.candidates.length, 3);
    assert.ok(report.artifacts.some((a) => a.format === 'svg'));
    const svg = fs.readFileSync(path.join(out, name + '.svg'), 'utf8');
    assert.ok(svg.includes(report.source.sha256), 'SVG must identify its exact Mermaid source');
    assert.ok(!svg.includes('<foreignObject') && !svg.includes('<script'));
    for (const artifact of report.artifacts.filter((a) => a.format === 'png')) {
      const png = fs.readFileSync(path.join(out, artifact.file));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), artifact.pixels.width);
      assert.equal(png.readUInt32BE(20), artifact.pixels.height);
      assert.ok(artifact.pixels.width * artifact.pixels.height <= 16_000_000);
    }
    const detail = report.artifacts.filter((a) => a.purpose === 'detail-crop');
    if (detail.length) {
      tiles += detail.length;
      const widths = detail.map((a) => a.sourceRect.width),
        heights = detail.map((a) => a.sourceRect.height);
      assert.ok(
        Math.min(...widths) >= Math.max(...widths) * 0.99 &&
          Math.min(...heights) >= Math.max(...heights) * 0.99,
        'Avoid tiny trailing raster strips',
      );
      const b = report.candidates[0].audit.viewBox;
      // Inspect coverage on an independent grid, including canvas edges and corners.
      for (let yi = 0; yi <= 30; yi++)
        for (let xi = 0; xi <= 30; xi++) {
          const x = b.x + (b.width * xi) / 30,
            y = b.y + (b.height * yi) / 30;
          assert.ok(
            detail.some(
              (a) =>
                x >= a.sourceRect.x - 0.01 &&
                y >= a.sourceRect.y - 0.01 &&
                x <= a.sourceRect.x + a.sourceRect.width + 0.01 &&
                y <= a.sourceRect.y + a.sourceRect.height + 0.01,
            ),
            'PNG detail crops must cover the canvas',
          );
        }
    }
  }
  assert.ok(tiles > 0, 'Large/long-label figures must exercise detail rasterization');
  const reviewOut = path.join(out, 'review');
  const reviewRun = run([
    'review',
    ...['context', 'sequence'].map((n) => path.join(__dirname, 'fixtures', n + '.mmd')),
    '--out-dir',
    reviewOut,
    '--improve',
  ]);
  assert.equal(reviewRun.status, 0, reviewRun.stderr);
  const reviewResults = reviewRun.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(reviewResults.length, 2);
  assert.deepEqual(hashes(), original);
  for (const result of reviewResults) {
    assert.equal(result.consistent, true);
    assert.equal(result.meaningApproved, false);
    assert.equal(result.visualReviewApproved, false);
    assert.equal(result.reviewPreview, 'available');
    const preview = result.images.find((image) => image.purpose === 'review-at-viewport-width');
    assert.ok(preview && path.isAbsolute(preview.path));
    assert.ok(preview.pixels.width <= 1440);
    const verified = verify(result.report);
    assert.equal(verified.consistent, true);
    assert.deepEqual(result.environment, verified.environment);
    assert.equal(result.environment.node, process.version);
    assert.match(result.renderConfigSha256, /^[0-9a-f]{64}$/);
    assert.equal(result.renderConfigSha256, verified.renderConfigSha256);
    const bytes = fs.readFileSync(preview.path);
    try {
      fs.appendFileSync(preview.path, 'tamper');
      assert.equal(verify(result.report).consistent, false);
    } finally {
      fs.writeFileSync(preview.path, bytes);
    }
  }
  const reportFile = path.join(out, 'context.render.json'),
    report = JSON.parse(fs.readFileSync(reportFile));
  for (const a of report.artifacts) {
    const p = path.join(out, a.file),
      saved = fs.readFileSync(p);
    try {
      fs.appendFileSync(p, 'tamper');
      assert.equal(verify(reportFile).consistent, false, 'Edited derivatives must be detected');
    } finally {
      fs.writeFileSync(p, saved);
    }
    try {
      fs.unlinkSync(p);
      assert.equal(verify(reportFile).consistent, false, 'Missing derivatives must be detected');
    } finally {
      fs.writeFileSync(p, saved);
    }
  }
  const source = path.resolve(out, report.source.path),
    savedSource = fs.readFileSync(source);
  try {
    fs.appendFileSync(source, '\n%% changed\n');
    assert.equal(verify(reportFile).consistent, false, 'Stale source must be detected');
  } finally {
    fs.writeFileSync(source, savedSource);
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-design-test-'));
  try {
    fs.writeFileSync(path.join(temp, 'invalid.mmd'), 'this is not Mermaid');
    const bad = run([
      'render',
      path.join(temp, 'invalid.mmd'),
      '--out-dir',
      path.join(temp, 'rendered'),
    ]);
    assert.notEqual(bad.status, 0);
    assert.equal(fs.existsSync(path.join(temp, 'rendered', 'invalid.render.json')), false);
    assert.ok(
      !fs.readdirSync(path.join(temp, 'rendered')).some((n) => n.startsWith('.mermaid-design-')),
    );
    fs.mkdirSync(path.join(temp, 'one'));
    fs.mkdirSync(path.join(temp, 'two'));
    const duplicate = run([
      'render',
      path.join(temp, 'one', 'same.mmd'),
      path.join(temp, 'two', 'same.mmd'),
      '--out-dir',
      temp,
    ]);
    assert.notEqual(duplicate.status, 0, 'Conflicting output stems must fail before publication');
    const mainSource = path.join(temp, 'example.mmd'),
      staleSource = path.join(temp, 'example.overview.png');
    fs.writeFileSync(mainSource, 'flowchart LR\nA-->B\n');
    fs.writeFileSync(staleSource, 'flowchart TB\nC-->D\n');
    fs.writeFileSync(
      path.join(temp, 'example.render.json'),
      JSON.stringify({
        source: { path: 'example.mmd' },
        artifacts: [{ file: 'example.overview.png', format: 'png' }],
      }),
    );
    const sourceCopies = [mainSource, staleSource].map((file) => fs.readFileSync(file));
    const cleanupAlias = run([
      'render',
      mainSource,
      staleSource,
      '--out-dir',
      temp,
      '--png',
      'never',
    ]);
    assert.notEqual(cleanupAlias.status, 0);
    assert.match(cleanupAlias.stderr, /Output aliases a source file/);
    [mainSource, staleSource].forEach((file, index) =>
      assert.deepEqual(
        fs.readFileSync(file),
        sourceCopies[index],
        'Stale cleanup must not delete a batch source',
      ),
    );
    assert.equal(
      fs.existsSync(path.join(temp, 'example.svg')),
      false,
      'Alias rejection must precede artifact publication',
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  const browserPath = chooseBrowser(chromium);
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const page = await browser.newPage();
    const imageCases = [];
    for (const { dir, report } of [
      ...names.map((name) => ({ dir: out, report: path.join(out, name + '.render.json') })),
      ...reviewResults.map((result) => ({ dir: reviewOut, report: result.report })),
    ]) {
      const data = JSON.parse(fs.readFileSync(report));
      for (const artifact of data.artifacts.filter((a) => a.format === 'png'))
        imageCases.push({ dir, report: data, artifact });
    }
    for (const { dir, report, artifact } of imageCases) {
      const svg = report.artifacts.find((a) => a.format === 'svg');
      const { width, height } = artifact.pixels;
      const reference = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      let expected;
      try {
        await reference.setContent(
          '<!doctype html><style>html,body{margin:0;background:white;overflow:hidden}svg{display:block;position:absolute;left:0;top:0;max-width:none}</style>' +
            fs.readFileSync(path.join(dir, svg.file), 'utf8'),
        );
        // A fresh inline SVG document isolates font and layout state for each reference.
        await reference.evaluate(
          async ({ artifact }) => {
            const svg = document.querySelector('svg');
            const { width, height } = artifact.pixels;
            svg.setAttribute('width', String(width));
            svg.setAttribute('height', String(height));
            if (artifact.purpose === 'detail-crop') {
              const rect = artifact.sourceRect;
              svg.setAttribute('viewBox', [rect.x, rect.y, width / 1.5, height / 1.5].join(' '));
            }
            await document.fonts.ready;
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          },
          { artifact },
        );
        expected = await reference.screenshot({ animations: 'disabled' });
      } finally {
        await reference.close();
      }
      const mismatch = await page.evaluate(
        async ({ expected, png, width, height }) => {
          const load = (base64) =>
            new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = reject;
              image.src = 'data:image/png;base64,' + base64;
            });
          const images = await Promise.all([load(expected), load(png)]);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          const pixels = images.map((image) => {
            context.clearRect(0, 0, width, height);
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, width, height).data;
          });
          let different = 0;
          for (let i = 0; i < pixels[0].length; i += 4)
            if (
              Math.max(...[0, 1, 2, 3].map((c) => Math.abs(pixels[0][i + c] - pixels[1][i + c]))) >
              24
            )
              different++;
          return different / (width * height);
        },
        {
          expected: expected.toString('base64'),
          png: fs.readFileSync(path.join(dir, artifact.file)).toString('base64'),
          width,
          height,
        },
      );
      assert.ok(
        mismatch < 0.015,
        'PNG must paint the recorded SVG region without clipping/repetition: ' +
          artifact.file +
          ' mismatch ' +
          mismatch,
      );
    }
    await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="250" viewBox="0 0 500 250">
      <g class="node" id="flowchart-A-0"><rect x="0" y="50" width="80" height="40"/><text x="5" y="75">A</text></g>
      <g class="node" id="flowchart-C-1"><rect x="200" y="50" width="80" height="40"/><text x="205" y="75">C</text></g>
      <g class="node" id="flowchart-B-2"><rect x="400" y="50" width="80" height="40"/><text x="405" y="75">B</text></g>
      <path id="L_A_B_0" class="flowchart-link LS-A LE-B" d="M 80 70 L 400 70"/>
      <text x="20" y="200">Overlapping One</text><text x="20" y="200">Overlapping Two</text>
      <text x="510" y="120">Clipped text</text></svg>`);
    const diagnostic = await page.evaluate(audit, { previewWidth: 1440, previewHeight: 1000 });
    assert.ok(
      diagnostic.warnings.some((w) => w.kind === 'edge-through-unrelated-node' && w.node === 'C'),
    );
    assert.ok(diagnostic.warningCounts['text-overlap'] > 0);
    assert.ok(diagnostic.warningCounts['text-outside-canvas'] > 0);
    // Small partial contact and opaque label padding were missed by area-ratio checks.
    await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="250" viewBox="0 0 500 250">
      <text x="20" y="40" textLength="200" lengthAdjust="spacingAndGlyphs">A long label</text>
      <text x="215" y="40">B</text>
      <g class="cluster-label"><text x="20" y="120">Boundary title</text></g>
      <g class="edgeLabel"><rect x="80" y="100" width="200" height="30" fill="white"/><text x="180" y="120">Edge label</text></g>
      </svg>`);
    const partial = await page.evaluate(audit, { previewWidth: 1440, previewHeight: 1000 });
    assert.ok(
      partial.warningCounts['text-overlap'] > 0,
      'Small overlaps must not be hidden by long-label area ratios',
    );
    assert.ok(
      partial.warningCounts['edge-label-over-boundary-title'] > 0,
      'Opaque edge-label padding must not obscure a boundary heading',
    );
  } finally {
    await browser.close();
  }
  const summary = {
    diagramFixtures: names.length,
    types: ['flowchart', 'state', 'sequence', 'ER', 'class'],
    sourceUnchanged: true,
    artifactConsistency: true,
    tamperedSvgAndPngDetected: true,
    missingArtifactsDetected: true,
    staleSourceDetected: true,
    malformedSourceRejected: true,
    outputCollisionRejected: true,
    pngCoverageChecked: true,
    detailTiles: tiles,
    knownGeometryFaultsDetected: true,
    partialTextAndHeadingObscurationDetected: true,
    meaningAutomaticallyApproved: false,
    batchReviewChecked: true,
    reviewTamperDetected: true,
    svgToPngPixelFidelityChecked: true,
    compactEnvironmentAndConfigContractChecked: true,
  };
  fs.writeFileSync(path.join(out, 'test-results.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}
if (require.main === module)
  runBrowserTests().catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  });
module.exports = runBrowserTests;
