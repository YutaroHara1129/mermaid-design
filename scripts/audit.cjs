// Runs inside the browser. Geometry is diagnostic, never a semantic approval.
module.exports = function auditDiagram({ previewWidth, previewHeight }) {
  const svg = document.querySelector('svg');
  const vb = svg.viewBox.baseVal;
  const box = (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const root = box(svg),
    warnings = [],
    counts = {};
  const warn = (kind, detail) => {
    counts[kind] = (counts[kind] || 0) + 1;
    if (warnings.length < 60) warnings.push({ kind, ...detail });
  };
  const seen = new Set();
  const texts = [...svg.querySelectorAll('text')]
    .filter((e) => {
      const r = box(e),
        style = getComputedStyle(e);
      const key = [e.textContent, r.x, r.y, r.width, r.height].join('|');
      if (
        !e.textContent.trim() ||
        !r.width ||
        !r.height ||
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        Number(style.opacity) === 0 ||
        seen.has(key)
      )
        return false;
      seen.add(key);
      return true;
    })
    .map((e) => ({
      e,
      b: box(e),
      text: e.textContent.trim().slice(0, 140),
      owner: e.closest('.node,.cluster-label,.edgeLabel,.actor,.note,.classGroup') || e,
    }));
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    if (
      a.b.x < root.x - 2 ||
      a.b.y < root.y - 2 ||
      a.b.x + a.b.width > root.x + root.width + 2 ||
      a.b.y + a.b.height > root.y + root.height + 2
    )
      warn('text-outside-canvas', { text: a.text });
    for (let j = i + 1; j < texts.length; j++) {
      const b = texts[j];
      if (a.owner === b.owner) continue;
      const area = overlap(a.b, b.b);
      // A clipped word is important even when it is a small fraction of a long label.
      const dx = Math.min(a.b.x + a.b.width, b.b.x + b.b.width) - Math.max(a.b.x, b.b.x);
      const dy = Math.min(a.b.y + a.b.height, b.b.y + b.b.height) - Math.max(a.b.y, b.b.y);
      if (area > 8 && dx > 2 && dy > 2) warn('text-overlap', { a: a.text, b: b.text });
    }
  }
  // Opaque edge-label backgrounds can cover a heading without text-text contact.
  const boundaryTitles = texts.filter((t) => t.e.closest('.cluster-label'));
  for (const title of boundaryTitles)
    for (const label of svg.querySelectorAll('g.edgeLabel')) {
      if (label.textContent.trim() && overlap(title.b, box(label)) > 4)
        warn('edge-label-over-boundary-title', {
          title: title.text,
          label: label.textContent.trim().slice(0, 140),
        });
    }
  const nodes = [...svg.querySelectorAll('g.node')].map((e) => ({
    e,
    id: e.id,
    key: e.id.replace(/^flowchart-/, '').replace(/-\d+$/, ''),
    b: box(
      e.querySelector(
        ':scope > rect,:scope > polygon,:scope > path,:scope > circle,:scope > ellipse',
      ) || e,
    ),
  }));
  for (const t of texts)
    for (const n of nodes) {
      if (n.e.contains(t.e) || t.owner.contains(n.e)) continue;
      if (overlap(t.b, n.b) > 6) warn('label-over-unrelated-node', { label: t.text, node: n.key });
    }
  const paths = [...svg.querySelectorAll('path.flowchart-link')];
  const inRect = (p, b, pad = 3) =>
    p.x > b.x + pad && p.x < b.x + b.width - pad && p.y > b.y + pad && p.y < b.y + b.height - pad;
  const distance = (p, b) =>
    Math.hypot(
      Math.max(b.x - p.x, 0, p.x - b.x - b.width),
      Math.max(b.y - p.y, 0, p.y - b.y - b.height),
    );
  for (const path of paths) {
    const length = path.getTotalLength();
    if (!length) continue;
    const matrix = path.getScreenCTM();
    const point = (d) => {
      const p = path.getPointAtLength(d);
      return new DOMPoint(p.x, p.y).matrixTransform(matrix);
    };
    const first = point(0),
      last = point(length),
      classes = [...path.classList];
    const endpoints = classes.filter((c) => /^L[SE]-/.test(c)).map((c) => c.slice(3));
    // Some diagram versions omit endpoint classes; proximity identifies only actual endpoints.
    const endpointNodes = new Set(
      nodes.filter(
        (n) => endpoints.includes(n.key) || distance(first, n.b) < 20 || distance(last, n.b) < 20,
      ),
    );
    const hits = new Set(),
      titleHits = new Set();
    const steps = Math.min(1600, Math.ceil(length / 6));
    for (let i = 0; i <= steps; i++) {
      const p = point((length * i) / steps);
      for (const n of nodes) if (!endpointNodes.has(n) && inRect(p, n.b)) hits.add(n.key);
      for (const t of boundaryTitles) if (inRect(p, t.b, 1)) titleHits.add(t.text);
    }
    for (const node of hits)
      warn('edge-through-unrelated-node', { edge: path.id || path.getAttribute('data-id'), node });
    for (const title of titleHits)
      warn('edge-through-boundary-title', { edge: path.id || path.getAttribute('data-id'), title });
  }
  const fontSizes = texts
    .map((t) => parseFloat(getComputedStyle(t.e).fontSize))
    .filter((n) => n > 0);
  const minimumFont = fontSizes.length ? Math.min(...fontSizes) : null;
  const previewScale = Math.min(1, previewWidth / vb.width, previewHeight / vb.height);
  const nonportable = [...svg.querySelectorAll('script,foreignObject,iframe,image,use')].filter(
    (e) =>
      !['use'].includes(e.localName) ||
      !(e.getAttribute('href') || e.getAttribute('xlink:href') || '').startsWith('#'),
  );
  const activeAttributes = [...svg.querySelectorAll('*')].flatMap((e) =>
    [...e.attributes]
      .filter(
        (a) =>
          /^on/i.test(a.name) || (a.localName === 'href' && a.value && !a.value.startsWith('#')),
      )
      .map((a) => a.name),
  );
  return {
    viewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
    textCount: texts.length,
    nodeCount: nodes.length,
    flowchartEdgeCount: paths.length,
    minimumFont,
    previewFont: minimumFont === null ? null : minimumFont * previewScale,
    warnings,
    warningCounts: counts,
    nonportableElements: nonportable.map((e) => e.localName),
    activeAttributes,
    coverage: {
      textGeometry: true,
      flowchartEdgeNodeGeometry: paths.length > 0,
      edgeEdgeCrossings: false,
      contrast: false,
      meaning: false,
      visualReview: false,
    },
  };
};
