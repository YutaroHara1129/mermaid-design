#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium} = require('playwright');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
  const [input, outDir, executablePath] = process.argv.slice(2);
  if (!input || !outDir || !executablePath || process.argv.length !== 5)
    throw Error('Usage: node benchmarks/render-baseline.cjs INPUT.mmd OUT_DIR BROWSER');
  const source = fs.readFileSync(input, 'utf8');
  const out = path.resolve(outDir);
  const stem = path.basename(input, path.extname(input));
  fs.mkdirSync(out, {recursive: true});
  const browser = await chromium.launch({headless: true, executablePath});
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    await page.addScriptTag({path: path.join(path.dirname(require.resolve('mermaid')), 'mermaid.min.js')});
    const svg = await page.evaluate(async source => {
      mermaid.initialize({startOnLoad: false, securityLevel: 'strict', htmlLabels: false,
        fontFamily: 'Arial, sans-serif', flowchart: {htmlLabels: false, useMaxWidth: false},
        sequence: {useMaxWidth: false}});
      await mermaid.parse(source);
      const result = await mermaid.render('baseline_diagram', source);
      document.body.innerHTML = result.svg;
      await document.fonts.ready;
      const svg = document.querySelector('svg');
      const box = svg.viewBox.baseVal;
      svg.removeAttribute('style');
      svg.setAttribute('width', box.width);
      svg.setAttribute('height', box.height);
      return new XMLSerializer().serializeToString(svg);
    }, source);
    await page.close();
    const svgPath = path.join(out, stem + '.svg');
    fs.writeFileSync(svgPath, svg);
    const dimensions = svg.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
    const width = Math.ceil(dimensions[2]);
    const height = Math.ceil(dimensions[3]);
    const images = [];
    for (const [suffix, scale] of [['.png', Math.min(2, 8192 / width, 8192 / height,
      Math.sqrt(16000000 / (width * height)))], ['.review.png', Math.min(1, 1440 / width)]]) {
      const w = Math.ceil(width * scale), h = Math.ceil(height * scale);
      if (w * h > 16000000 || Math.max(w, h) > 8192)
        throw Error('Figure exceeds baseline raster limit; split the figure');
      const painter = await browser.newPage({viewport: {width: w, height: h}, deviceScaleFactor: 1});
      try {
        await painter.route('**/*', route => route.abort());
        await painter.setContent('<!doctype html><style>html,body{margin:0;background:white;overflow:hidden}img{display:block}</style>' +
          '<img alt="diagram" width="' + w + '" height="' + h + '" src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '">');
        await painter.evaluate(async () => {await document.querySelector('img').decode(); await document.fonts.ready;});
        const file = path.join(out, stem + suffix);
        await painter.screenshot({path: file, animations: 'disabled'});
        images.push({path: file, sha256: hash(fs.readFileSync(file)), pixels: {width: w, height: h},
          purpose: suffix === '.review.png' ? 'review-at-viewport-width' : 'full-figure'});
      } finally {await painter.close();}
    }
    if (hash(fs.readFileSync(input)) !== hash(source)) throw Error('Source changed during rendering');
    console.log(JSON.stringify({source: path.resolve(input), sourceSha256: hash(source),
      svg: svgPath, svgSha256: hash(svg), images, environment: {node: process.version,
        mermaid: '11.12.0', playwright: require('playwright/package.json').version, browser: browser.version()}}));
  } finally {await browser.close();}
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
