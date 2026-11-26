import { colorToCss } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null && v !== '') node.setAttribute(k, String(v));
  }
  for (const ch of children) {
    if (typeof ch === 'string') node.appendChild(document.createTextNode(ch));
    else if (ch) node.appendChild(ch);
  }
  return node;
}

function parseEm(val, fallbackPx) {
  if (!val) return fallbackPx;
  const s = String(val).trim();
  const num = parseFloat(s);
  if (Number.isNaN(num)) return fallbackPx;
  if (s.endsWith('pt')) return num * 1.333;
  return num * 15; // 1em ~ 15px
}

/**
 * Converts a LaTeX-ish linguistic line into structured display spans for SVG rendering.
 */
function formatRichLine(line) {
  let raw = line.text || '';
  if (line.type === 'feature') {
    const up = raw.toUpperCase();
    let sym = `[${up}]`;
    if (line.featureKind === 'mf') sym = `[•${up}•]`;
    else if (line.featureKind === 'hf') sym = `[+${up}+]`;
    else if (line.featureKind === 'af') sym = `[⋆${up}⋆]`;
    else if (line.featureKind === 'mvf') sym = `[∧${up}∧]`;
    return {
      segments: [{ text: sym, smallCaps: true }],
      satisfied: Boolean(line.satisfied),
      strike: Boolean(line.strike),
      bold: Boolean(line.bold),
      italic: Boolean(line.italic),
      color: line.color,
      approxWidth: sym.length * 7.8 + (line.satisfied ? 16 : 0) + 12,
    };
  }

  let strike = Boolean(line.strike);
  let bold = Boolean(line.bold);
  let italic = Boolean(line.italic);
  let color = line.color || '';

  // Unwrap inline macros if user typed them directly in a text line
  const stM = raw.match(/^\\st\{([\s\S]*)\}$/);
  if (stM) {
    strike = true;
    raw = stM[1].replace(/^\\mbox\{([\s\S]*)\}$/, '$1');
  }
  const priM = raw.match(/^\\primary\{([\s\S]*)\}$/);
  if (priM) { bold = true; raw = priM[1]; }
  const secM = raw.match(/^\\secondary\{([\s\S]*)\}$/);
  if (secM) { italic = true; raw = secM[1]; }

  // Tokenize simple linguistic macros into SVG segments
  const segments = [];
  let s = raw
    .replace(/\$\\emptyset\$|\\emptyset/g, '∅')
    .replace(/\$\\varphi\$|\\varphi/g, 'φ')
    .replace(/\$\\lambda\$/g, 'λ')
    .replace(/\\gap/g, '____')
    .replace(/\\wh/g, 'wh')
    .replace(/\\Wh/g, 'Wh')
    .replace(/\\vP/g, 'vP')
    .replace(/\\littlev/g, 'v')
    .replace(/\\Merge/g, 'MERGE')
    .replace(/\\Agree/g, 'AGREE')
    .replace(/\\abar/g, '\\xbar{A}')
    .replace(/\\textit\{([^}]*)\}/g, '$1')
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\textsc\{([^}]*)\}/g, (_, g) => g.toUpperCase());

  // Parse structured inline tokens: \xbar{X}, \head{X}, \past, \pres, \tr{i}, \ind{i}, \spec{X}, \comp{X}, $t_i$
  const tokenRegex = /\\xbar\{([^}]*)\}|\\head\{([^}]*)\}|\\(past|pres)|\\tr\{([^}]*)\}|\\ind\{([^}]*)\}|\\spec\{([^}]*)\}|\\comp\{([^}]*)\}|\$([^$]+)\$/g;
  let last = 0;
  let m;
  while ((m = tokenRegex.exec(s)) !== null) {
    if (m.index > last) {
      segments.push({ text: s.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      segments.push({ text: m[1], overbar: true });
    } else if (m[2] !== undefined) {
      segments.push({ text: m[2] });
      segments.push({ text: '0', sup: true });
    } else if (m[3] === 'past') {
      segments.push({ text: 'Tns' });
      segments.push({ text: 'PAST', sub: true });
    } else if (m[3] === 'pres') {
      segments.push({ text: 'Tns' });
      segments.push({ text: 'PRES', sub: true });
    } else if (m[4] !== undefined) {
      segments.push({ text: 't', italic: true });
      segments.push({ text: m[4], sub: true });
    } else if (m[5] !== undefined) {
      segments.push({ text: m[5], sub: true });
    } else if (m[6] !== undefined) {
      segments.push({ text: `[Spec, ${m[6]}]` });
    } else if (m[7] !== undefined) {
      segments.push({ text: `[Comp, ${m[7]}]` });
    } else if (m[8] !== undefined) {
      // simple math like t_1 or \alpha
      const mathM = m[8].match(/^([a-zA-Z]+)_\{?([^}]+)\}?$/);
      if (mathM) {
        segments.push({ text: mathM[1], italic: true });
        segments.push({ text: mathM[2], sub: true });
      } else {
        segments.push({ text: m[8] });
      }
    }
    last = tokenRegex.lastIndex;
  }
  if (last < s.length) {
    segments.push({ text: s.slice(last) });
  }
  if (segments.length === 0) segments.push({ text: '' });

  let charCount = 0;
  for (const seg of segments) {
    charCount += seg.text.length * (seg.sub || seg.sup ? 0.72 : 1);
  }
  return {
    segments,
    satisfied: false,
    strike,
    bold,
    italic,
    color,
    approxWidth: Math.max(22, charCount * 8.4 + 14),
  };
}

function renderRichTextElement(rich, x, y, defaultColor) {
  const lineColor = rich.color ? colorToCss(rich.color) : defaultColor;
  const g = el('g');
  const txt = el('text', {
    x,
    y,
    class: 'svg-text-line',
    fill: lineColor,
    'font-weight': rich.bold ? '700' : '400',
    'font-style': rich.italic ? 'italic' : 'normal',
  });

  let overbarIndices = [];
  rich.segments.forEach((seg, idx) => {
    const tspan = el('tspan', {
      'font-size': seg.sub || seg.sup ? '10.5' : seg.smallCaps ? '12.5' : '15',
      'font-style': seg.italic ? 'italic' : undefined,
      'baseline-shift': seg.sub ? '-3' : seg.sup ? '5' : undefined,
      'text-decoration': seg.overbar ? 'overline' : undefined,
    }, [seg.text]);
    if (seg.overbar) overbarIndices.push(idx);
    txt.appendChild(tspan);
  });

  if (rich.satisfied) {
    txt.appendChild(el('tspan', { 'font-size': '11.5', dx: '2' }, ['✓']));
  }

  g.appendChild(txt);

  if (rich.strike) {
    const halfW = Math.max(12, (rich.approxWidth - 10) / 2);
    g.appendChild(el('line', {
      x1: x - halfW,
      y1: y,
      x2: x + halfW,
      y2: y,
      stroke: lineColor,
      'stroke-width': '1.25',
    }));
  }
  return g;
}

function getAnchorPoint(box, anchor = 'south', xShift = 0, yShift = 0) {
  let x = box.cx;
  let y = box.bottom;
  switch (anchor) {
    case 'north': x = box.cx; y = box.top; break;
    case 'south': x = box.cx; y = box.bottom; break;
    case 'west': x = box.left; y = box.cy; break;
    case 'east': x = box.right; y = box.cy; break;
    case 'north west': x = box.left; y = box.top; break;
    case 'north east': x = box.right; y = box.top; break;
    case 'south west': x = box.left; y = box.bottom; break;
    case 'south east': x = box.right; y = box.bottom; break;
    case 'center': x = box.cx; y = box.cy; break;
  }
  return { x: x + xShift * 15, y: y - yShift * 1.333 };
}

/**
 * Computes layout and renders the complete syntax tree into the SVG layers.
 * Returns layout map { boxes, subtreeBoxes } for hit-testing & floating bars.
 */
export function renderTreeSvg(svg, state, ui) {
  const lBrackets = svg.querySelector('#layer-brackets');
  const lEdges = svg.querySelector('#layer-edges');
  const lNodes = svg.querySelector('#layer-nodes');
  const lConnectors = svg.querySelector('#layer-connectors');
  const lCallouts = svg.querySelector('#layer-callouts');
  const lOverlay = svg.querySelector('#layer-overlay');

  [lBrackets, lEdges, lNodes, lConnectors, lCallouts, lOverlay].forEach((l) => (l.innerHTML = ''));

  const sSep = Math.max(8, parseEm(state.treeOptions?.sSep, 4) + 10);
  const lSep = Math.max(22, parseEm(state.treeOptions?.lSep, 15) + 14);
  const lineHeight = 19;
  const padY = 6;

  const meta = new Map(); // id -> { node, richLines, w, h, x, y, subtreeBox, nodeBox }

  // 1. Measure every node
  function measure(node, inheritedGray = false) {
    const isGray = inheritedGray || Boolean(node.unpronounced);
    const richLines = (node.lines || []).map(formatRichLine);
    let maxW = 28;
    for (const r of richLines) {
      if (r.approxWidth > maxW) maxW = r.approxWidth;
    }
    if (node.projFeature) maxW += 14;
    const h = Math.max(24, richLines.length * lineHeight + padY * 2);
    meta.set(node.id, { node, richLines, isGray, w: maxW, h, subtreeW: maxW, relX: 0, x: 0, y: 0 });
    for (const ch of node.children || []) measure(ch, isGray);
  }
  measure(state.root, false);

  // 2. Bottom-up subtree width & relative x offsets
  function layoutBottomUp(node) {
    const m = meta.get(node.id);
    if (!node.children || node.children.length === 0) {
      m.subtreeW = m.w;
      return;
    }
    for (const ch of node.children) layoutBottomUp(ch);

    let totalChildrenW = 0;
    node.children.forEach((ch, idx) => {
      totalChildrenW += meta.get(ch.id).subtreeW;
      if (idx > 0) totalChildrenW += sSep;
    });

    let cursor = -totalChildrenW / 2;
    for (const ch of node.children) {
      const cm = meta.get(ch.id);
      cm.relX = cursor + cm.subtreeW / 2;
      cursor += cm.subtreeW + sSep;
    }

    // Center parent over first & last child centers (linguistics style!)
    const firstCx = meta.get(node.children[0].id).relX;
    const lastCx = meta.get(node.children[node.children.length - 1].id).relX;
    const mid = (firstCx + lastCx) / 2;
    for (const ch of node.children) {
      meta.get(ch.id).relX -= mid;
    }
    m.subtreeW = Math.max(m.w, totalChildrenW);
  }
  layoutBottomUp(state.root);

  // 3. Top-down absolute coordinates (top y per node)
  function layoutTopDown(node, absX, topY) {
    const m = meta.get(node.id);
    m.x = absX;
    m.y = topY;
    m.nodeBox = {
      left: absX - m.w / 2,
      right: absX + m.w / 2,
      top: topY,
      bottom: topY + m.h,
      cx: absX,
      cy: topY + m.h / 2,
    };
    const childTopY = topY + m.h + lSep;
    for (const ch of node.children || []) {
      const cm = meta.get(ch.id);
      layoutTopDown(ch, absX + cm.relX, childTopY);
    }
  }
  layoutTopDown(state.root, 0, 0);

  // 4. Compute subtree bounding boxes (for `fit to=tree` brackets!)
  function computeSubtreeBoxes(node) {
    const m = meta.get(node.id);
    let box = { ...m.nodeBox };
    for (const ch of node.children || []) {
      const cb = computeSubtreeBoxes(ch);
      box.left = Math.min(box.left, cb.left);
      box.right = Math.max(box.right, cb.right);
      box.top = Math.min(box.top, cb.top);
      box.bottom = Math.max(box.bottom, cb.bottom);
    }
    box.cx = (box.left + box.right) / 2;
    box.cy = (box.top + box.bottom) / 2;
    m.subtreeBox = box;
    return box;
  }
  computeSubtreeBoxes(state.root);

  // 5. Render Edges (Branches)
  function drawEdges(node) {
    const pm = meta.get(node.id);
    for (const ch of node.children || []) {
      const cm = meta.get(ch.id);
      const isGray = cm.isGray;
      const strokeColor = cm.node.edgeColor ? colorToCss(cm.node.edgeColor) : (isGray ? '#94a3b8' : '#1e293b');
      const style = cm.node.edgeStyle || 'solid';

      if (style !== 'none') {
        const x1 = pm.x;
        const y1 = pm.nodeBox.bottom - 1;
        const y2 = cm.nodeBox.top + 1;

        if (style === 'roof') {
          const leftX = cm.nodeBox.left + 4;
          const rightX = cm.nodeBox.right - 4;
          lEdges.appendChild(el('polygon', {
            points: `${x1},${y1} ${leftX},${y2} ${rightX},${y2}`,
            class: 'svg-edge',
            stroke: strokeColor,
            'stroke-width': '1.4',
            'stroke-linejoin': 'round',
          }));
        } else {
          let dash = null;
          let sw = '1.4';
          if (style === 'dotted') dash = '2 3';
          else if (style === 'dashed') dash = '6 4';
          else if (style === 'thick') sw = '2.4';

          lEdges.appendChild(el('line', {
            x1, y1, x2: cm.x, y2,
            class: 'svg-edge',
            stroke: strokeColor,
            'stroke-width': sw,
            'stroke-dasharray': dash,
          }));
        }
      }
      drawEdges(ch);
    }
  }
  drawEdges(state.root);

  // 6. Render Nodes & Projected Features
  for (const m of meta.values()) {
    const { node, richLines, isGray, w, h, x, y } = m;
    const isSelected = ui.selectedNodeId === node.id;
    const isSource = ui.connectSourceId === node.id;
    const cls = ['svg-node-group', isSelected ? 'selected' : '', isSource ? 'connect-source' : ''].filter(Boolean).join(' ');

    const g = el('g', { class: cls, 'data-node-id': node.id });
    g.appendChild(el('rect', {
      x: x - w / 2,
      y,
      width: w,
      height: h,
      class: 'svg-node-bg',
    }));

    const baseColor = node.nodeColor ? colorToCss(node.nodeColor) : (isGray ? '#94a3b8' : '#0f172a');
    richLines.forEach((r, idx) => {
      const ly = y + padY + idx * lineHeight + lineHeight / 2;
      g.appendChild(renderRichTextElement(r, x, ly, baseColor));
    });

    if (node.projFeature) {
      const pf = node.projFeature;
      const pRich = formatRichLine({
        type: 'feature',
        text: pf.text || 'x',
        featureKind: pf.featureKind || 'mf',
        satisfied: pf.satisfied,
      });
      g.appendChild(renderRichTextElement(pRich, m.nodeBox.right + 16, y + padY + lineHeight / 2, baseColor));
    }

    lNodes.appendChild(g);
  }

  // 7. Render Brackets / Braces + Dotted Guide Lines
  for (const m of meta.values()) {
    const b = m.node.bracket;
    if (!b) continue;
    const box = m.subtreeBox;
    const color = b.color ? colorToCss(b.color) : (m.isGray ? '#94a3b8' : '#1e293b');
    const isBelow = (b.position || 'below') === 'below';
    const xL = box.left - 3;
    const xR = box.right + 3;
    const baseY = isBelow ? box.bottom + 3 : box.top - 3;
    const midX = (xL + xR) / 2;

    if (b.kind === 'brace') {
      const amp = 7;
      const dir = isBelow ? 1 : -1;
      const d = [
        `M ${xL} ${baseY}`,
        `Q ${xL} ${baseY + dir * amp}, ${Math.min(midX, xL + 10)} ${baseY + dir * amp}`,
        `L ${Math.max(midX - 6, xL + 10)} ${baseY + dir * amp}`,
        `Q ${midX} ${baseY + dir * amp}, ${midX} ${baseY + dir * amp * 1.85}`,
        `Q ${midX} ${baseY + dir * amp}, ${Math.min(xR - 10, midX + 6)} ${baseY + dir * amp}`,
        `L ${Math.max(midX, xR - 10)} ${baseY + dir * amp}`,
        `Q ${xR} ${baseY + dir * amp}, ${xR} ${baseY}`,
      ].join(' ');
      lBrackets.appendChild(el('path', {
        d, fill: 'none', stroke: color, 'stroke-width': '1.4', 'stroke-linecap': 'round',
      }));
    } else if (b.kind === 'square') {
      const dir = isBelow ? -1 : 1;
      const d = `M ${xL} ${baseY + dir * 6} L ${xL} ${baseY} L ${xR} ${baseY} L ${xR} ${baseY + dir * 6}`;
      lBrackets.appendChild(el('path', {
        d, fill: 'none', stroke: color, 'stroke-width': '1.5',
      }));
    } else if (b.kind === 'box') {
      lBrackets.appendChild(el('rect', {
        x: xL,
        y: box.top - 3,
        width: xR - xL,
        height: box.bottom - box.top + 6,
        rx: 4,
        fill: 'none',
        stroke: color,
        'stroke-width': '1.4',
        'stroke-dasharray': '5 3',
      }));
    }

    if (b.dottedGuides && b.kind !== 'box') {
      const ghPx = (b.guideHeight != null ? b.guideHeight : 3) * 15;
      const targetLeftY = box.cy;
      const targetRightY = isBelow ? Math.max(box.top, box.cy - ghPx) : Math.min(box.bottom, box.cy + ghPx);
      lBrackets.appendChild(el('line', {
        x1: xL, y1: baseY, x2: xL, y2: targetLeftY,
        stroke: color, 'stroke-width': '1.6', 'stroke-dasharray': '2 3',
      }));
      lBrackets.appendChild(el('line', {
        x1: xR, y1: baseY, x2: xR, y2: targetRightY,
        stroke: color, 'stroke-width': '1.6', 'stroke-dasharray': '2 3',
      }));
    }

    if (b.label && b.label.trim()) {
      const ly = isBelow ? baseY + 21 : baseY - 17;
      lBrackets.appendChild(el('text', {
        x: midX, y: ly,
        'text-anchor': 'middle',
        'font-family': 'var(--font-tree)',
        'font-style': 'italic',
        'font-size': '12.5',
        fill: color,
      }, [b.label.trim()]));
    }
  }

  // 8. Render Connectors (Arrows & Lines)
  const defs = svg.querySelector('defs');
  // Clean dynamic markers
  Array.from(defs.querySelectorAll('.dyn-marker')).forEach((d) => d.remove());

  function ensureMarker(kind, color, idSuffix) {
    if (kind === 'none') return null;
    const mid = `mk_${kind}_${idSuffix}`;
    if (kind === 'arrow-end' || kind === 'arrow-start') {
      const mk = el('marker', {
        id: mid,
        class: 'dyn-marker',
        markerWidth: '8',
        markerHeight: '8',
        refX: '6.5',
        refY: '4',
        orient: kind === 'arrow-start' ? 'auto-start-reverse' : 'auto',
      }, [
        el('path', { d: 'M 1 1.2 L 7 4 L 1 6.8 L 2.5 4 Z', fill: color }),
      ]);
      defs.appendChild(mk);
      return `url(#${mid})`;
    }
    if (kind === 'dot') {
      const mk = el('marker', {
        id: mid,
        class: 'dyn-marker',
        markerWidth: '7',
        markerHeight: '7',
        refX: '3.5',
        refY: '3.5',
      }, [
        el('circle', { cx: '3.5', cy: '3.5', r: '2.5', fill: color }),
      ]);
      defs.appendChild(mk);
      return `url(#${mid})`;
    }
    return null;
  }

  (state.connectors || []).forEach((c, idx) => {
    const fm = meta.get(c.fromId);
    const tm = meta.get(c.toId);
    if (!fm || !tm) return;

    const fBox = (fm.node.bracket && fm.node.children.length > 0) ? fm.subtreeBox : fm.nodeBox;
    const tBox = (tm.node.bracket && tm.node.children.length > 0) ? tm.subtreeBox : tm.nodeBox;

    const p1 = getAnchorPoint(fBox, c.fromAnchor || 'south', c.fromXShift || 0, c.fromYShift || 0);
    const p2 = getAnchorPoint(tBox, c.toAnchor || 'south', c.toXShift || 0, c.toYShift || 0);

    const color = colorToCss(c.color) || '#0f172a';
    let sw = '1.5';
    if (c.thickness === 'thin') sw = '1';
    else if (c.thickness === 'thick') sw = '2.2';
    else if (c.thickness === 'very thick') sw = '2.9';

    let dash = null;
    if (c.linePattern === 'dashed') dash = '6 4';
    else if (c.linePattern === 'densely dashed') dash = '4 2.5';
    else if (c.linePattern === 'dotted') dash = '2 3.2';

    let d = '';
    let labelPt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    if (c.routing === 'right-angle') {
      const dropPx = (c.dropDepth != null ? c.dropDepth : 1.8) * 15;
      if (c.direction === 'side') {
        const cornerX = p2.x;
        const cornerY = p1.y;
        d = `M ${p1.x} ${p1.y} L ${cornerX} ${cornerY} L ${p2.x} ${p2.y}`;
        labelPt = { x: (p1.x + cornerX) / 2, y: cornerY };
      } else {
        const dir = c.direction === 'above' ? -1 : 1;
        const midY = p1.y + dir * dropPx;
        const r = c.roundedCorners !== false ? Math.min(4, Math.abs(p2.x - p1.x) / 3, dropPx / 2) : 0;
        if (r > 0.5 && Math.abs(p2.x - p1.x) > 4) {
          const sx = Math.sign(p2.x - p1.x);
          const sy = Math.sign(midY - p1.y) || dir;
          const sy2 = Math.sign(p2.y - midY) || -dir;
          d = [
            `M ${p1.x} ${p1.y}`,
            `L ${p1.x} ${midY - sy * r}`,
            `Q ${p1.x} ${midY}, ${p1.x + sx * r} ${midY}`,
            `L ${p2.x - sx * r} ${midY}`,
            `Q ${p2.x} ${midY}, ${p2.x} ${midY + sy2 * r}`,
            `L ${p2.x} ${p2.y}`,
          ].join(' ');
        } else {
          d = `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
        }
        labelPt = { x: (p1.x + p2.x) / 2, y: midY };
      }
    } else if (c.routing === 'curved') {
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 40;
      const loose = (c.looseness != null ? c.looseness : 1.0) * Math.max(32, dist * 0.45);
      // Note: TikZ angles have +Y upward, SVG has +Y downward, so negate sin(angle)
      const radOut = ((c.outAngle ?? -90) * Math.PI) / 180;
      const radIn = ((c.inAngle ?? -90) * Math.PI) / 180;
      const c1x = p1.x + Math.cos(radOut) * loose;
      const c1y = p1.y - Math.sin(radOut) * loose;
      const c2x = p2.x + Math.cos(radIn) * loose;
      const c2y = p2.y - Math.sin(radIn) * loose;
      d = `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
      // Cubic bezier midpoint at t=0.5
      labelPt = {
        x: 0.125 * p1.x + 0.375 * c1x + 0.375 * c2x + 0.125 * p2.x,
        y: 0.125 * p1.y + 0.375 * c1y + 0.375 * c2y + 0.125 * p2.y,
      };
    } else {
      d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    }

    let mStart = null;
    let mEnd = null;
    if (c.arrowHead === '->') mEnd = ensureMarker('arrow-end', color, idx);
    else if (c.arrowHead === '<-') mStart = ensureMarker('arrow-start', color, idx);
    else if (c.arrowHead === '<->') {
      mStart = ensureMarker('arrow-start', color, idx);
      mEnd = ensureMarker('arrow-end', color, idx);
    } else if (c.arrowHead === 'o-o') {
      mStart = ensureMarker('dot', color, idx);
      mEnd = ensureMarker('dot', color, idx);
    }

    const cg = el('g', { 'data-connector-id': c.id });
    if (ui.selectedConnectorId === c.id) {
      cg.appendChild(el('path', { d, class: 'svg-connector-sel' }));
    }
    cg.appendChild(el('path', {
      d,
      fill: 'none',
      stroke: color,
      'stroke-width': sw,
      'stroke-dasharray': dash,
      'marker-start': mStart,
      'marker-end': mEnd,
    }));
    cg.appendChild(el('path', { d, class: 'svg-connector-hit' }));

    if (c.label && c.label.trim()) {
      let lx = labelPt.x;
      let ly = labelPt.y;
      let anchor = 'middle';
      if (c.labelPos === 'below') ly += 14;
      else if (c.labelPos === 'above') ly -= 10;
      else if (c.labelPos === 'left') { lx -= 8; anchor = 'end'; }
      else if (c.labelPos === 'right') { lx += 8; anchor = 'start'; }

      cg.appendChild(el('text', {
        x: lx,
        y: ly,
        'text-anchor': anchor,
        'font-family': 'var(--font-tree)',
        'font-style': c.labelItalic !== false ? 'italic' : 'normal',
        'font-size': '13',
        fill: color,
      }, [c.label.trim()]));
    }

    lConnectors.appendChild(cg);
  });

  // 9. Render Floating Callouts
  (state.callouts || []).forEach((cal, idx) => {
    const tm = meta.get(cal.targetNodeId);
    if (!tm) return;
    const tBox = tm.nodeBox;
    const ox = (cal.offsetX || 0) * 15;
    const oy = -(cal.offsetY || 0) * 15; // LaTeX +y is up
    let cx = tBox.cx + ox;
    let cy = tBox.cy + oy;
    let textAnchor = 'middle';
    if (cal.relPos === 'left') { cx = tBox.left - Math.abs(ox) - 18; textAnchor = 'end'; }
    else if (cal.relPos === 'right') { cx = tBox.right + Math.abs(ox) + 18; textAnchor = 'start'; }
    else if (cal.relPos === 'above') { cy = tBox.top - Math.abs(oy) - 12; }
    else if (cal.relPos === 'below') { cy = tBox.bottom + Math.abs(oy) + 12; }

    const color = colorToCss(cal.color) || '#0f172a';
    const rich = formatRichLine({ type: 'text', text: cal.text || 'note' });
    const cg = el('g', { 'data-callout-id': cal.id, style: 'cursor:pointer' });

    const labelEl = renderRichTextElement(rich, cx, cy, color);
    const tNode = labelEl.querySelector('text');
    if (tNode) tNode.setAttribute('text-anchor', textAnchor);
    cg.appendChild(labelEl);

    if (cal.hasArrow) {
      const startPt = {
        x: cal.relPos === 'left' ? cx + 6 : cal.relPos === 'right' ? cx - 6 : cx,
        y: cal.relPos === 'above' ? cy + 8 : cal.relPos === 'below' ? cy - 8 : cy,
      };
      const endPt = getAnchorPoint(tBox, cal.targetAnchor || 'south west', cal.targetXShift || 0, cal.targetYShift || 0);
      const mk = ensureMarker('arrow-end', color, `cal_${idx}`);
      let pathD = `M ${startPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}`;
      if (cal.routing === 'curved') {
        const dist = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) * 0.45;
        const r1 = ((cal.outAngle ?? 0) * Math.PI) / 180;
        const r2 = ((cal.inAngle ?? 225) * Math.PI) / 180;
        const c1x = startPt.x + Math.cos(r1) * dist;
        const c1y = startPt.y - Math.sin(r1) * dist;
        const c2x = endPt.x + Math.cos(r2) * dist;
        const c2y = endPt.y - Math.sin(r2) * dist;
        pathD = `M ${startPt.x} ${startPt.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endPt.x} ${endPt.y}`;
      } else if (cal.routing === 'right-angle') {
        pathD = `M ${startPt.x} ${startPt.y} L ${endPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}`;
      }
      cg.appendChild(el('path', {
        d: pathD,
        fill: 'none',
        stroke: color,
        'stroke-width': '1.8',
        'marker-end': mk,
      }));
    }
    lCallouts.appendChild(cg);
  });

  // 10. Rubber-band line if currently drawing an arrow
  if (ui.mode === 'connect' && ui.connectSourceId && ui.mouseWorldPt) {
    const sm = meta.get(ui.connectSourceId);
    if (sm) {
      lOverlay.appendChild(el('line', {
        x1: sm.nodeBox.cx,
        y1: sm.nodeBox.bottom,
        x2: ui.mouseWorldPt.x,
        y2: ui.mouseWorldPt.y,
        stroke: '#7c3aed',
        'stroke-width': '2',
        'stroke-dasharray': '5 4',
      }));
    }
  }

  // Compute overall bounds for Fit-to-View
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of meta.values()) {
    minX = Math.min(minX, m.subtreeBox.left - 40);
    maxX = Math.max(maxX, m.subtreeBox.right + 40);
    minY = Math.min(minY, m.subtreeBox.top - 40);
    maxY = Math.max(maxY, m.subtreeBox.bottom + 70);
  }

  return {
    meta,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
  };
}
