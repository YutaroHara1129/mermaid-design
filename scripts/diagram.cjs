#!/usr/bin/env node
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const auditDiagram = require('./audit.cjs');
const runtimeRequire = require('./runtime.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const profiles = {
  baseline: {
    flowchart: {
      nodeSpacing: 45,
      rankSpacing: 65,
      wrappingWidth: 240,
      padding: 16,
      subGraphTitleMargin: { top: 12, bottom: 48 },
    },
  },
  roomy: {
    flowchart: {
      nodeSpacing: 70,
      rankSpacing: 100,
      wrappingWidth: 280,
      padding: 20,
      subGraphTitleMargin: { top: 16, bottom: 64 },
    },
    sequence: { actorMargin: 80, boxMargin: 18, messageMargin: 45 },
    state: { nodeSpacing: 70, rankSpacing: 100 },
  },
  wide: {
    flowchart: {
      nodeSpacing: 55,
      rankSpacing: 80,
      wrappingWidth: 340,
      padding: 18,
      subGraphTitleMargin: { top: 16, bottom: 56 },
    },
    sequence: { actorMargin: 100, boxMargin: 20, messageMargin: 40 },
    state: { nodeSpacing: 60, rankSpacing: 80 },
  },
};
function merge(a, b) {
  const result = { ...a };
  for (const [key, value] of Object.entries(b || {})) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw Error('Unsupported configuration key');
    result[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? merge(result[key] || {}, value)
        : value;
  }
  return result;
}
function parseArgs(argv) {
  const command = argv.shift();
  if (!command || command === '--help' || command === '-h') return { command: 'help' };
  const options = {
    command,
    files: [],
    png: 'auto',
    profile: 'baseline',
    previewWidth: 1440,
    previewHeight: 1000,
  };
  while (argv.length) {
    const arg = argv.shift();
    if (arg === '--improve') options.improve = true;
    else if (arg === '--presentation-only') options.presentationOnly = true;
    else if (
      [
        '--out-dir',
        '--browser',
        '--png',
        '--profile',
        '--preview-width',
        '--preview-height',
      ].includes(arg)
    ) {
      if (!argv.length) throw Error('Missing value for ' + arg);
      const key = {
        '--out-dir': 'outDir',
        '--browser': 'browser',
        '--png': 'png',
        '--profile': 'profile',
        '--preview-width': 'previewWidth',
        '--preview-height': 'previewHeight',
      }[arg];
      options[key] = arg.startsWith('--preview-') ? Number(argv.shift()) : argv.shift();
    } else if (arg.startsWith('-')) throw Error('Unknown option: ' + arg);
    else options.files.push(path.resolve(arg));
  }
  if (!['render', 'review', 'verify', 'drafts'].includes(command) || !options.files.length)
    throw Error('Use render INPUT.mmd or verify OUTPUT.render.json');
  if (!['auto', 'never'].includes(options.png)) throw Error('--png must be auto or never');
  if (!profiles[options.profile]) throw Error('Unknown profile: ' + options.profile);
  for (const key of ['previewWidth', 'previewHeight'])
    if (!Number.isFinite(options[key]) || options[key] < 320 || options[key] > 4096)
      throw Error('Preview dimensions must be 320..4096');
  return options;
}
function rasterPlan(audit, mode, width, height) {
  if (mode === 'never') return { kind: 'none', images: [], reason: 'explicitly-disabled' };
  const b = audit.viewBox;
  const complex =
    (audit.previewFont !== null && audit.previewFont < 12) ||
    b.width * b.height * 4 > 16_000_000 ||
    Math.max(b.width, b.height) * 2 > 8192;
  if (!complex)
    return {
      kind: 'full',
      reason: 'legible-at-preview-size',
      images: [
        {
          suffix: '.png',
          rect: b,
          scale: Math.min(
            2,
            8192 / b.width,
            8192 / b.height,
            Math.sqrt(16_000_000 / (b.width * b.height)),
          ),
        },
      ],
    };
  const images = [
    {
      suffix: '.overview.png',
      rect: b,
      scale: Math.min(1, width / b.width, height / b.height),
      purpose: 'orientation-only',
    },
  ];
  const scale = 1.5,
    tileWidth = 1440 / scale,
    tileHeight = 1200 / scale,
    overlap = 96 / scale;
  // Anchor full-size tiles at both canvas ends instead of emitting tiny trailing strips.
  const positions = (size, span) => {
    const count = Math.max(1, Math.ceil((size - span) / (span - overlap)) + 1);
    return Array.from({ length: count }, (_, i) =>
      count === 1 ? 0 : (i * (size - span)) / (count - 1),
    );
  };
  const xs = positions(b.width, tileWidth),
    ys = positions(b.height, tileHeight);
  if (xs.length * ys.length > 36)
    return { kind: 'overview-only', reason: 'tile-budget-exceeded-split-the-figure', images };
  ys.forEach((y, row) =>
    xs.forEach((x, col) =>
      images.push({
        suffix:
          '.tile-r' +
          String(row + 1).padStart(2, '0') +
          '-c' +
          String(col + 1).padStart(2, '0') +
          '.png',
        rect: {
          x: b.x + x,
          y: b.y + y,
          width: Math.min(tileWidth, b.width - x),
          height: Math.min(tileHeight, b.height - y),
        },
        scale,
        purpose: 'detail-crop',
        row: row + 1,
        column: col + 1,
      }),
    ),
  );
  return {
    kind: 'overview-and-tiles',
    reason: 'small-preview-text-or-raster-budget',
    overlapPixels: 96,
    images,
  };
}
function layoutDrafts(input, options) {
  if (!options.presentationOnly)
    throw Error('drafts requires --presentation-only: confirm direction has no semantic axis');
  const bytes = fs.readFileSync(input),
    original = bytes.toString('utf8');
  if (!Buffer.from(original).equals(bytes)) throw Error('Draft source must be valid UTF-8');
  const front = original.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  const offset = front ? front[0].length : 0,
    body = original.slice(offset);
  const first = body.match(/^(?:[ \t]*(?:%%[^\r\n]*)?\r?\n)*/)[0].length;
  const header = body
    .slice(first)
    .match(/^([ \t]*(?:flowchart|graph)[ \t]+)(TB|TD|BT|LR|RL)(?=[ \t;\r\n]|$)/);
  if (!header)
    throw Error(
      'drafts supports an explicit flowchart/graph direction on the first non-comment body line',
    );
  const index = offset + first + header[1].length,
    stem = path.basename(input, path.extname(input));
  const parent = path.resolve(options.outDir || path.dirname(input));
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, '.layout-drafts-'));
  try {
    const drafts = ['LR', 'TB', 'BT'].map((direction) => {
      const source =
        original.slice(0, index) + direction + original.slice(index + header[2].length);
      const file = path.join(dir, stem + '-' + direction + '.mmd');
      fs.writeFileSync(file, source);
      return { direction, source: file, sha256: sha(source) };
    });
    if (!fs.readFileSync(input).equals(bytes)) throw Error('Source changed while drafting');
    return {
      source: input,
      sourceSha256: sha(bytes),
      sourceUnchanged: true,
      draftDir: dir,
      drafts,
      change: 'Only the declared presentation direction; all other source text is byte-preserved',
      meaningApproved: false,
    };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
function verify(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')),
    dir = path.dirname(reportPath),
    errors = [];
  const sourcePath = path.resolve(dir, report.source.path);
  try {
    if (sha(fs.readFileSync(sourcePath)) !== report.source.sha256)
      errors.push('Source changed: ' + sourcePath);
  } catch {
    errors.push('Source unavailable: ' + sourcePath);
  }
  for (const artifact of report.artifacts) {
    if (path.basename(artifact.file) !== artifact.file)
      throw Error('Invalid artifact path in report');
    try {
      if (sha(fs.readFileSync(path.join(dir, artifact.file))) !== artifact.sha256)
        errors.push('Artifact changed: ' + artifact.file);
    } catch {
      errors.push('Artifact unavailable: ' + artifact.file);
    }
  }
  return {
    report: reportPath,
    consistent: !errors.length,
    errors,
    environment: Object.fromEntries(
      ['node', 'mermaid', 'playwright', 'browser'].map((key) => [
        key,
        report.renderer?.[key] ?? null,
      ]),
    ),
    selectedProfile: report.selectedProfile ?? null,
    renderConfigSha256: sha(JSON.stringify(report.renderConfig || {})),
    meaningApproved: false,
  };
}
function assertNoSourceAlias(inputs, out, files) {
  const sources = inputs.map((input) => ({ input, stat: fs.statSync(input) }));
  for (const file of files) {
    const target = path.join(out, file);
    if (!fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    for (const source of sources)
      if (stat.dev === source.stat.dev && stat.ino === source.stat.ino)
        throw Error('Output aliases a source file: ' + target);
  }
}
function chooseBrowser(chromium, explicit) {
  if (explicit || process.env.MERMAID_BROWSER)
    return path.resolve(explicit || process.env.MERMAID_BROWSER);
  const candidates = [
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  if (process.env.PROGRAMFILES)
    candidates.push(path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'));
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found)
    throw Error(
      'No Chromium browser found. Pass --browser PATH or install with: npx playwright install chromium',
    );
  return found;
}
async function renderOne(input, options, browser, runtime, YAML, bundle) {
  const original = fs.readFileSync(input, 'utf8'),
    sourceHash = sha(original);
  const match = original.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  const frontmatter = match ? YAML.parse(match[1]) || {} : {};
  if (typeof frontmatter !== 'object' || Array.isArray(frontmatter))
    throw Error('Frontmatter must be a mapping');
  const body = match ? original.slice(match[0].length) : original;
  const stem = path.basename(input, path.extname(input)),
    out = path.resolve(options.outDir || path.dirname(input));
  fs.mkdirSync(out, { recursive: true });
  const reportPath = path.join(out, stem + '.render.json');
  let previous = null;
  if (fs.existsSync(reportPath)) {
    previous = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (path.resolve(out, previous.source.path) !== input)
      throw Error('Output stem belongs to another source: ' + stem);
  }
  const work = fs.mkdtempSync(path.join(out, '.mermaid-design-'));
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1,
  });
  // Rendering is fully local; labels and theme CSS cannot fetch network resources.
  await page.route('**/*', (route) => route.abort());
  page.setDefaultTimeout(30000);
  try {
    await page.setContent(
      '<!doctype html><meta charset="utf-8"><body style="margin:0;background:white"></body>',
    );
    await page.addScriptTag({ path: bundle });
    const candidates = [];
    for (const name of options.improve ? Object.keys(profiles) : [options.profile]) {
      const base = {
        startOnLoad: false,
        securityLevel: 'strict',
        htmlLabels: false,
        theme: 'base',
        fontFamily: '"Hiragino Sans", "Noto Sans CJK JP", Arial, sans-serif',
        fontSize: 16,
        themeVariables: {
          fontSize: '16px',
          primaryColor: '#e6eff5',
          primaryTextColor: '#152c3b',
          primaryBorderColor: '#45677a',
          lineColor: '#526472',
          edgeLabelBackground: '#ffffff',
        },
        flowchart: { htmlLabels: false, useMaxWidth: false, curve: 'linear' },
        sequence: { useMaxWidth: false },
        state: { useMaxWidth: false },
      };
      const configured = merge(
        merge(merge(base, profiles.baseline), frontmatter.config),
        name === 'baseline' ? {} : profiles[name],
      );
      // These controls cannot be relaxed by source frontmatter.
      configured.securityLevel = 'strict';
      configured.htmlLabels = false;
      configured.flowchart = { ...configured.flowchart, htmlLabels: false };
      configured.themeCSS =
        '.edgeLabel rect,.labelBkg{fill:#ffffff!important;opacity:1!important;}\n' +
        (configured.themeCSS || '');
      const renderSource =
        '---\n' + YAML.stringify({ ...frontmatter, config: configured }) + '---\n' + body;
      const result = await page.evaluate(
        async ({ renderSource, config }) => {
          document.body.innerHTML = '';
          mermaid.initialize(config);
          const parsed = await mermaid.parse(renderSource);
          const rendered = await mermaid.render('mermaid_diagram', renderSource);
          document.body.innerHTML = rendered.svg;
          await document.fonts.ready;
          const svg = document.querySelector('svg'),
            b = svg.viewBox.baseVal;
          if (!b.width || !b.height) throw Error('Empty SVG canvas');
          svg.removeAttribute('style');
          svg.setAttribute('width', b.width);
          svg.setAttribute('height', b.height);
          svg.style.maxWidth = 'none';
          return { type: parsed.diagramType, svg: new XMLSerializer().serializeToString(svg) };
        },
        { renderSource, config: configured },
      );
      const audit = await page.evaluate(auditDiagram, {
        previewWidth: options.previewWidth,
        previewHeight: options.previewHeight,
      });
      if (audit.nonportableElements.length || audit.activeAttributes.length)
        throw Error(
          'Nonportable or active SVG content: ' +
            JSON.stringify({
              elements: audit.nonportableElements,
              attributes: audit.activeAttributes,
            }),
        );
      const severe = [
        'text-outside-canvas',
        'text-overlap',
        'label-over-unrelated-node',
        'edge-label-over-boundary-title',
      ];
      const score = [
        severe.reduce((n, k) => n + (audit.warningCounts[k] || 0), 0),
        (audit.warningCounts['edge-through-unrelated-node'] || 0) +
          (audit.warningCounts['edge-through-boundary-title'] || 0),
        Math.max(0, 12 - (audit.previewFont || 12)),
        audit.viewBox.width * audit.viewBox.height,
      ];
      candidates.push({ name, score, config: configured, ...result, audit });
    }
    candidates.sort((a, b) => {
      for (let i = 0; i < a.score.length; i++)
        if (a.score[i] !== b.score[i]) return a.score[i] - b.score[i];
      return 0;
    });
    const selected = candidates[0];
    await page.setContent(selected.svg);
    await page.evaluate(
      ({ sourceHash, bodyHash }) => {
        const svg = document.querySelector('svg');
        const metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
        metadata.id = 'mermaid-design-provenance';
        metadata.textContent = JSON.stringify({ sourceSha256: sourceHash, bodySha256: bodyHash });
        svg.prepend(metadata);
      },
      { sourceHash, bodyHash: sha(body) },
    );
    const finalSvg = await page.evaluate(() =>
      new XMLSerializer().serializeToString(document.querySelector('svg')),
    );
    const svgName = stem + '.svg';
    fs.writeFileSync(path.join(work, svgName), finalSvg);
    const artifacts = [{ file: svgName, sha256: sha(finalSvg), format: 'svg' }];
    const plan = rasterPlan(
      selected.audit,
      options.png,
      options.previewWidth,
      options.previewHeight,
    );
    let reviewPreview = 'not-requested';
    if (options.command === 'review' && options.png !== 'never') {
      const b = selected.audit.viewBox,
        scale = Math.min(1, options.previewWidth / b.width);
      const w = Math.ceil(b.width * scale),
        h = Math.ceil(b.height * scale);
      if (w * h <= 16_000_000 && Math.max(w, h) <= 8192) {
        plan.images.push({
          suffix: '.review.png',
          rect: b,
          scale,
          purpose: 'review-at-viewport-width',
        });
        reviewPreview = 'available';
      } else reviewPreview = 'budget-exceeded-use-detail-tiles-or-split';
    }
    for (const image of plan.images) {
      const width = Math.max(1, Math.ceil(image.rect.width * image.scale)),
        height = Math.max(1, Math.ceil(image.rect.height * image.scale));
      // setContent does not clear Mermaid's page state. Paint each immutable SVG
      // region in a fresh page so prior renders cannot resize or repaint it.
      const file = stem + image.suffix;
      const painter = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      try {
        await painter.route('**/*', (route) => route.abort());
        const rasterSvg =
          image.purpose === 'detail-crop'
            ? await painter.evaluate(
                ({ svg, rect, width, height, scale }) => {
                  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
                  const root = document.documentElement;
                  root.setAttribute('width', String(width));
                  root.setAttribute('height', String(height));
                  root.setAttribute(
                    'viewBox',
                    [rect.x, rect.y, width / scale, height / scale].join(' '),
                  );
                  return new XMLSerializer().serializeToString(root);
                },
                { svg: finalSvg, rect: image.rect, width, height, scale: image.scale },
              )
            : finalSvg;
        await painter.setContent(
          '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:white;overflow:hidden}img{display:block;position:absolute}</style><img alt="diagram" src="data:image/svg+xml;base64,' +
            Buffer.from(rasterSvg).toString('base64') +
            '" style="left:' +
            0 +
            'px;top:' +
            0 +
            'px;width:' +
            width +
            'px;height:' +
            height +
            'px">',
        );
        await painter.evaluate(async () => {
          await document.querySelector('img').decode();
          await document.fonts.ready;
        });
        await painter.screenshot({
          path: path.join(work, file),
          clip: { x: 0, y: 0, width, height },
          animations: 'disabled',
        });
      } finally {
        await painter.close();
      }
      artifacts.push({
        file,
        format: 'png',
        sha256: sha(fs.readFileSync(path.join(work, file))),
        pixels: { width, height },
        sourceRect: image.rect,
        purpose: image.purpose || 'full-figure',
      });
    }
    const obsolete = (previous?.artifacts || []).filter(
      (a) =>
        a.format === 'png' &&
        path.basename(a.file) === a.file &&
        a.file.startsWith(stem + '.') &&
        !artifacts.some((b) => b.file === a.file),
    );
    assertNoSourceAlias(options.files, out, [
      ...artifacts.map((a) => a.file),
      stem + '.render.json',
      ...obsolete.map((a) => a.file),
    ]);
    if (sha(fs.readFileSync(input)) !== sourceHash)
      throw Error('Source changed during rendering; no artifacts published');
    const report = {
      schemaVersion: 1,
      source: { path: path.relative(out, input), sha256: sourceHash, bodySha256: sha(body) },
      renderer: {
        ...runtime,
        browser: browser.version(),
        diagramType: selected.type,
        scriptSha256: sha(fs.readFileSync(__filename)),
        auditScriptSha256: sha(fs.readFileSync(path.join(__dirname, 'audit.cjs'))),
        lockfileSha256: sha(fs.readFileSync(path.join(__dirname, '../package-lock.json'))),
      },
      selectedProfile: selected.name,
      selection:
        'Lexicographic geometry diagnostics, then preview text size, then area; no semantic approval',
      candidates: candidates.map((c) => ({ profile: c.name, score: c.score, audit: c.audit })),
      renderConfig: selected.config,
      preview: { width: options.previewWidth, height: options.previewHeight },
      raster: { kind: plan.kind, reason: plan.reason, overlapPixels: plan.overlapPixels },
      review: {
        status: 'needs-semantic-and-visual-review',
        meaningApproved: false,
        visualReviewApproved: false,
      },
      artifacts,
    };
    fs.writeFileSync(
      path.join(work, stem + '.render.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    for (const a of artifacts) fs.renameSync(path.join(work, a.file), path.join(out, a.file));
    fs.renameSync(path.join(work, stem + '.render.json'), reportPath);
    // Remove only previously recorded raster derivatives, never unrelated source files.
    for (const a of obsolete) fs.rmSync(path.join(out, a.file), { force: true });
    if (options.command === 'review') {
      const verified = verify(reportPath);
      if (!verified.consistent) throw Error(JSON.stringify(verified.errors));
      return {
        source: input,
        report: reportPath,
        svg: path.join(out, svgName),
        selectedProfile: selected.name,
        environment: verified.environment,
        renderConfigSha256: verified.renderConfigSha256,
        audit: {
          warningCounts: selected.audit.warningCounts,
          warnings: selected.audit.warnings,
          previewFont: selected.audit.previewFont,
          viewBox: selected.audit.viewBox,
          coverage: selected.audit.coverage,
        },
        raster: report.raster,
        reviewPreview,
        images: artifacts
          .filter((a) => a.format === 'png')
          .map((a) => ({ path: path.join(out, a.file), purpose: a.purpose, pixels: a.pixels })),
        consistent: true,
        meaningApproved: false,
        visualReviewApproved: false,
      };
    }
    return {
      source: input,
      report: reportPath,
      selectedProfile: selected.name,
      diagramType: selected.type,
      warningCounts: selected.audit.warningCounts,
      raster: plan.kind,
      artifacts: artifacts.length,
      review: report.review.status,
    };
  } finally {
    await page.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') {
    console.log(`Usage:
  node scripts/diagram.cjs render INPUT.mmd [MORE.mmd] --out-dir DIR [--improve] [--png auto|never]
  node scripts/diagram.cjs review INPUT.mmd [MORE.mmd] --out-dir DIR [--improve]
  node scripts/diagram.cjs verify DIAGRAM.render.json [MORE.render.json]
  node scripts/diagram.cjs drafts INPUT.mmd --out-dir OWNED_WORK_DIR --presentation-only
Options: --profile baseline|roomy|wide, --browser PATH, --preview-width 1440, --preview-height 1000
Source files are never rewritten. SVG, PNG and the manifest are derived from the same source and selected render config.
Automatic PNG uses a full image when legible; complex figures get an overview plus overlapping detail crops.
review also emits a viewport-width PNG, selected diagnostics, environment and absolute image paths after hash verification.
verify also returns the saved environment and renderConfigSha256 for review reuse.
Geometry diagnostics do not certify meaning or visual quality. Dependencies: npm run setup.`);
    return;
  }
  if (options.command === 'drafts') {
    if (options.files.length !== 1) throw Error('drafts accepts one source');
    console.log(JSON.stringify(layoutDrafts(options.files[0], options)));
    return;
  }
  if (options.command === 'verify') {
    const results = options.files.map(verify);
    console.log(JSON.stringify(results, null, 2));
    if (results.some((r) => !r.consistent)) process.exitCode = 1;
    return;
  }
  if (
    new Set(options.files.map((f) => path.basename(f, path.extname(f)))).size !==
    options.files.length
  )
    throw Error('Batch inputs need distinct output stems');
  for (const input of options.files) {
    const stem = path.basename(input, path.extname(input));
    assertNoSourceAlias(options.files, path.resolve(options.outDir || path.dirname(input)), [
      stem + '.svg',
      stem + '.render.json',
    ]);
  }
  let chromium, YAML, bundle, runtime;
  try {
    ({ chromium } = runtimeRequire('playwright'));
    YAML = runtimeRequire('yaml');
    const entry = runtimeRequire.resolve('mermaid');
    bundle = path.join(path.dirname(entry), 'mermaid.min.js');
    const mermaidPackage = JSON.parse(
      fs.readFileSync(path.join(path.dirname(entry), '../package.json'), 'utf8'),
    );
    runtime = {
      mermaid: mermaidPackage.version,
      playwright: runtimeRequire('playwright/package.json').version,
      node: process.version,
    };
    if (!fs.existsSync(bundle)) throw Error('Mermaid browser bundle not found');
  } catch (e) {
    throw Error('Install the locked dependencies with npm run setup. ' + e.message, { cause: e });
  }
  const browser = await chromium.launch({
    headless: true,
    executablePath: chooseBrowser(chromium, options.browser),
  });
  try {
    for (const input of options.files)
      console.log(JSON.stringify(await renderOne(input, options, browser, runtime, YAML, bundle)));
  } finally {
    await browser.close();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { rasterPlan, verify, layoutDrafts, assertNoSourceAlias, chooseBrowser };
