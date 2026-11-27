import { makeNode, makeLine, makeFeatureLine, makeConnector, makeCallout } from './state.js?v=20261126c';

/**
 * Parses a \begin{forest}...\end{forest} block (or raw bracket tree) into our TreeState.
 */
export function parseForestLatex(rawInput) {
  let src = (rawInput || '').trim();
  const m = src.match(/\\begin\{forest\}([\s\S]*?)\\end\{forest\}/);
  if (m) src = m[1].trim();

  // Strip % comments (not escaped \%)
  src = src.replace(/(^|[^\\])%[^\n]*/g, '$1');

  // Find root '['
  const firstBracket = src.indexOf('[');
  if (firstBracket === -1) {
    throw new Error('Could not find a root "[" bracket inside the forest block.');
  }

  let pos = firstBracket;
  const namedNodeMap = new Map(); // tikzName -> node.id
  const fitNodeMap = new Map();   // fitName -> node.id
  const pendingPics = [];
  const embeddedTikzBlocks = [];
  const treeOptions = { sSep: '0em', lSep: '1em' };

  function skipWs() {
    while (pos < src.length && /\s/.test(src[pos])) pos += 1;
  }

  function readBalancedBraces() {
    // expects src[pos] === '{'
    let depth = 0;
    let out = '';
    while (pos < src.length) {
      const ch = src[pos];
      out += ch;
      if (ch === '{' && src[pos - 1] !== '\\') depth += 1;
      else if (ch === '}' && src[pos - 1] !== '\\') {
        depth -= 1;
        if (depth === 0) {
          pos += 1;
          return out;
        }
      }
      pos += 1;
    }
    return out;
  }

  function parseHeaderAndOptions(rawHeader) {
    // Split on top-level commas (outside {...})
    const parts = [];
    let cur = '';
    let braceDepth = 0;
    for (let i = 0; i < rawHeader.length; i++) {
      const ch = rawHeader[i];
      if (ch === '{' && rawHeader[i - 1] !== '\\') braceDepth += 1;
      else if (ch === '}' && rawHeader[i - 1] !== '\\') braceDepth = Math.max(0, braceDepth - 1);
      if (ch === ',' && braceDepth === 0) {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function parseLineItem(rawLine) {
    let s = rawLine.trim();
    // Unwrap outer protective braces if wrapped around bracketed text like {\textcolor[HTML]...}
    if (s.startsWith('{') && s.endsWith('}')) {
      const inner = s.slice(1, -1);
      // Only unwrap if braces match
      let d = 0, valid = true;
      for (let i = 0; i < inner.length; i++) {
        if (inner[i] === '{') d++;
        if (inner[i] === '}') { d--; if (d < 0) { valid = false; break; } }
      }
      if (valid && d === 0 && (inner.startsWith('\\textcolor') || inner.includes('['))) {
        s = inner;
      }
    }

    let color = '';
    let strike = false;
    let bold = false;
    let italic = false;
    let smallCaps = false;

    const tcHtml = s.match(/^\\textcolor\[HTML\]\{([0-9A-Fa-f]{6})\}\{([\s\S]*)\}$/);
    if (tcHtml) {
      color = `#${tcHtml[1].toLowerCase()}`;
      s = tcHtml[2];
    } else {
      const tcNamed = s.match(/^\\textcolor\{([^}]+)\}\{([\s\S]*)\}$/);
      if (tcNamed) {
        color = tcNamed[1];
        s = tcNamed[2];
      }
    }

    const stMatch = s.match(/^\\st\{([\s\S]*)\}$/);
    if (stMatch) {
      strike = true;
      s = stMatch[1];
      const mbox = s.match(/^\\mbox\{([\s\S]*)\}$/);
      if (mbox) s = mbox[1];
    }

    let unwrapped = true;
    while (unwrapped) {
      unwrapped = false;
      const scMatch = s.match(/^\\textsc\{([\s\S]*)\}$/);
      if (scMatch) { smallCaps = true; s = scMatch[1]; unwrapped = true; continue; }
      const priMatch = s.match(/^\\primary\{([\s\S]*)\}$/);
      if (priMatch) { bold = true; s = priMatch[1]; unwrapped = true; continue; }
      const secMatch = s.match(/^\\secondary\{([\s\S]*)\}$/);
      if (secMatch) { italic = true; s = secMatch[1]; unwrapped = true; continue; }
    }

    const featMatch = s.match(/^\\(s?)(mf|hf|af|mvf)\{([\s\S]*)\}$/);
    if (featMatch) {
      const line = makeFeatureLine(featMatch[3], featMatch[2], featMatch[1] === 's');
      line.strike = strike;
      line.bold = bold;
      line.italic = italic;
      line.smallCaps = smallCaps;
      line.color = color;
      return line;
    }
    const plainFeat = s.match(/^\\feature\{([\s\S]*)\}$/);
    if (plainFeat) {
      const line = makeFeatureLine(plainFeat[1], 'feature', false);
      line.strike = strike;
      line.bold = bold;
      line.italic = italic;
      line.smallCaps = smallCaps;
      line.color = color;
      return line;
    }

    return makeLine(s, { strike, bold, italic, smallCaps, color });
  }

  function parseSubtree(depth = 0) {
    skipWs();
    if (src[pos] !== '[') {
      throw new Error(`Expected "[" at index ${pos}`);
    }
    pos += 1; // skip '['

    // Read header up to child '[' or closing ']'
    let header = '';
    let braceDepth = 0;
    while (pos < src.length) {
      const ch = src[pos];
      if (ch === '{' && src[pos - 1] !== '\\') {
        header += readBalancedBraces();
        continue;
      }
      if ((ch === '[' || ch === ']') && braceDepth === 0) {
        break;
      }
      header += ch;
      pos += 1;
    }

    const parts = parseHeaderAndOptions(header);
    const labelPart = parts.shift() || '';
    const rawLines = labelPart.split(/\\\\/).map((x) => x.trim()).filter((x, i, arr) => x !== '' || arr.length === 1);
    const lines = rawLines.length ? rawLines.map(parseLineItem) : [makeLine('')];

    const node = makeNode(lines, []);

    for (const opt of parts) {
      if (!opt) continue;
      if (opt.startsWith('for tree=')) {
        const inner = opt.slice('for tree='.length).replace(/^\{|\}$/g, '');
        const sSepM = inner.match(/s sep=([^,}]+)/);
        const lSepM = inner.match(/l sep=([^,}]+)/);
        if (depth === 0) {
          if (sSepM) treeOptions.sSep = sSepM[1].trim();
          if (lSepM) treeOptions.lSep = lSepM[1].trim();
        } else {
          node.sepScope = 'subtree';
          if (sSepM) node.sSep = sSepM[1].trim();
          if (lSepM) node.lSep = lSepM[1].trim();
        }
      } else if (opt.startsWith('s sep=')) {
        node.sSep = opt.slice(6).trim();
      } else if (opt.startsWith('l sep=')) {
        node.lSep = opt.slice(6).trim();
      } else if (opt.startsWith('name=')) {
        node.name = opt.slice(5).trim();
        namedNodeMap.set(node.name, node.id);
      } else if (opt === 'unpronounced') {
        node.unpronounced = true;
      } else if (opt === 'roof') {
        node.edgeStyle = 'roof';
      } else if (opt.startsWith('text=')) {
        node.nodeColor = opt.slice(5).trim();
      } else if (opt.startsWith('edge=')) {
        const ev = opt.slice(5).trim().replace(/^\{|\}$/g, '');
        if (ev.includes('draw=none')) node.edgeStyle = 'none';
        else if (ev.includes('dotted')) node.edgeStyle = 'dotted';
        else if (ev.includes('dashed')) node.edgeStyle = 'dashed';
        else if (ev.includes('very thick') || ev.includes('thick')) node.edgeStyle = 'thick';
        const colM = ev.match(/\b(red|blue|teal|orange|purple|violet|gray|brown|cyan|magenta|green!60!black)\b/);
        if (colM) node.edgeColor = colM[1];
      } else if (opt.startsWith('tikz=')) {
        const tikzBody = opt.slice(5).trim().replace(/^\{|\}$/g, '');
        embeddedTikzBlocks.push(tikzBody);
        const fitM = tikzBody.match(/fit to=tree\]\s*\(([^)]+)\)/);
        if (fitM) {
          const fitName = fitM[1].trim();
          fitNodeMap.set(fitName, node.id);
          if (!node.name) node.name = fitName;
        }
        if (tikzBody.includes('brace') || tikzBody.includes('rectangle') || tikzBody.includes('south west) --')) {
          const isAbove = tikzBody.includes('north west') && !tikzBody.includes('mirror');
          const kind = tikzBody.includes('rectangle') ? 'box' : (tikzBody.includes('brace') ? 'brace' : 'square');
          const hasDotted = tikzBody.includes('dotted');
          const yShiftM = tikzBody.match(/yshift=([0-9.]+)em/);
          const boxStyle = kind === 'box'
            ? (tikzBody.includes('dotted') ? 'dotted' : tikzBody.includes('dashed') ? 'dashed' : 'solid')
            : 'dashed';
          node.bracket = {
            kind,
            boxStyle,
            position: isAbove ? 'above' : 'below',
            dottedGuides: hasDotted,
            guideHeight: yShiftM ? parseFloat(yShiftM[1]) : 3,
            color: '',
            label: '',
          };
        }
      }
    }

    // Parse children
    while (pos < src.length) {
      skipWs();
      if (src[pos] === '[') {
        node.children.push(parseSubtree(depth + 1));
      } else if (src[pos] === ']') {
        pos += 1;
        break;
      } else {
        // Ignore stray whitespace/text
        pos += 1;
      }
    }

    return node;
  }

  const root = parseSubtree();
  const rest = src.slice(pos).trim();
  const allTikz = [rest, ...embeddedTikzBlocks].join('\n');

  // Parse post-tree \pic and \draw commands
  const connectors = [];
  const callouts = [];

  // Parse callout \node [left=... of target, ...] (calName) {text};
  const calloutNodeMap = new Map();
  const calNodeRegex = /\\node\s*\[([^\]]*)\]\s*\(([^)]+)\)\s*\{([\s\S]*?)\}\s*;/g;
  let cnm;
  while ((cnm = calNodeRegex.exec(allTikz)) !== null) {
    const nOpts = cnm[1];
    const calName = cnm[2].trim();
    const calText = cnm[3].trim();
    const ofM = nOpts.match(/(left|right|above|below)=([0-9.]+)em\s+of\s+([a-zA-Z0-9_]+)/);
    if (!ofM) continue;
    const tid = namedNodeMap.get(ofM[3]) || fitNodeMap.get(ofM[3]);
    if (!tid) continue;
    const yM = nOpts.match(/yshift=(-?[0-9.]+)em/);
    const xM = nOpts.match(/xshift=(-?[0-9.]+)em/);
    const dist = parseFloat(ofM[2]);
    const side = ofM[1];
    const cal = makeCallout(tid, calText, {
      relPos: side,
      offsetX: side === 'left' ? -dist : side === 'right' ? dist : (xM ? parseFloat(xM[1]) : 0),
      offsetY: side === 'below' ? -dist : side === 'above' ? dist : (yM ? parseFloat(yM[1]) : 0),
      hasArrow: false,
    });
    callouts.push(cal);
    calloutNodeMap.set(calName, cal);
  }

  // \pic {proj-feature={Tbar}{\smf{d}}};
  const picRegex = /\\pic\s*\{proj-feature=\{([^}]+)\}\{(\\[^}]+(?:\{[^}]*\})?)\}\}\s*;/g;
  let pm;
  while ((pm = picRegex.exec(allTikz)) !== null) {
    pendingPics.push({ target: pm[1].trim(), featRaw: pm[2].trim() });
  }
  for (const pic of pendingPics) {
    const nid = namedNodeMap.get(pic.target) || fitNodeMap.get(pic.target);
    if (!nid) continue;
    const node = findNodeSync(root, nid);
    if (!node) continue;
    const fm = pic.featRaw.match(/^\\(s?)(mf|hf|af|mvf)\{([^}]*)\}$/);
    if (fm) {
      node.projFeature = { featureKind: fm[2], text: fm[3], satisfied: fm[1] === 's' };
    } else {
      const pf = pic.featRaw.match(/^\\feature\{([^}]*)\}$/);
      if (pf) node.projFeature = { featureKind: 'feature', text: pf[1], satisfied: false };
    }
  }

  // Parse \draw commands (skip brace/fit-to-tree decoration draws)
  const drawRegex = /\\draw\s*\[([^\]]*)\]\s*([\s\S]*?);/g;
  let dm;
  while ((dm = drawRegex.exec(allTikz)) !== null) {
    const opts = dm[1];
    const body = dm[2].trim();
    if (
      opts.includes('brace') ||
      opts.includes('decorate') ||
      body.includes('.south west) --') ||
      body.includes('.south east) --') ||
      body.includes('.north west) --') ||
      body.includes('.north east) --') ||
      body.includes('rectangle')
    ) continue;

    // Extract node label before scanning coordinates so parenthesized label text never interferes
    let label = '';
    let labelPos = 'below';
    const nodeLabelM = body.match(/node\s*\[([^\]]*)\]\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
    const bodyNoNode = nodeLabelM ? body.replace(nodeLabelM[0], '') : body;
    if (nodeLabelM) {
      label = nodeLabelM[2].trim();
      if (nodeLabelM[1].includes('above')) labelPos = 'above';
      else if (nodeLabelM[1].includes('left')) labelPos = 'left';
      else if (nodeLabelM[1].includes('right')) labelPos = 'right';
    }

    // Match coordinates like (T.south) or ([yshift=-8pt]T.south)
    const coordPattern = /\((?:\[([^\]]*)\])?([a-zA-Z0-9_]+)(?:\.([a-z ]+))?\)/g;
    const coords = [];
    let cm;
    while ((cm = coordPattern.exec(bodyNoNode)) !== null) {
      coords.push({ shift: cm[1] || '', name: cm[2], anchor: (cm[3] || 'south').trim() });
    }
    if (coords.length < 2) continue;
    const c1 = coords[0];
    const c2 = coords[coords.length - 1];

    // Check if this \draw belongs to a callout node
    if (calloutNodeMap.has(c1.name)) {
      const cal = calloutNodeMap.get(c1.name);
      cal.hasArrow = true;
      cal.targetAnchor = c2.anchor || 'south west';
      const xm = c2.shift.match(/xshift=(-?[0-9.]+)em/);
      if (xm) cal.targetXShift = parseFloat(xm[1]);
      if (body.includes('to[')) {
        cal.routing = 'curved';
        const outM = body.match(/out=(-?[0-9.]+)/);
        const inM = body.match(/in=(-?[0-9.]+)/);
        if (outM) cal.outAngle = parseFloat(outM[1]);
        if (inM) cal.inAngle = parseFloat(inM[1]);
      } else if (body.includes('-|')) {
        cal.routing = 'right-angle';
      } else {
        cal.routing = 'straight';
      }
      continue;
    }

    const fromId = namedNodeMap.get(c1.name) || fitNodeMap.get(c1.name);
    const toId = namedNodeMap.get(c2.name) || fitNodeMap.get(c2.name);
    if (!fromId || !toId) continue;

    let routing = 'straight';
    let raMode = 'u-below';
    let direction = 'below';
    let dropDepth = 1.8;
    let outAngle = -90;
    let inAngle = -90;
    let looseness = 1.0;

    if (body.includes('-|') || body.includes('|-')) {
      routing = 'right-angle';
      const stepM = body.match(/\+\+\(\s*(-?[0-9.]+)(?:em)?\s*,\s*(-?[0-9.]+)(?:em)?\s*\)/);
      if (stepM) {
        const dx = parseFloat(stepM[1]);
        const dy = parseFloat(stepM[2]);
        dropDepth = +(Math.hypot(dx, dy)).toFixed(2);
        if (Math.abs(dx) < 0.01) {
          direction = dy < 0 ? 'below' : 'above';
          raMode = dy < 0 ? 'u-below' : 'u-above';
        } else {
          direction = 'side';
          raMode = dx < 0 ? 'c-left' : 'c-right';
        }
      } else {
        direction = 'side';
        raMode = body.includes('|-') ? 'l-bend' : '7-bend';
      }
    } else if (body.includes('to[')) {
      routing = 'curved';
      const outM = body.match(/out=(-?[0-9.]+)/);
      const inM = body.match(/in=(-?[0-9.]+)/);
      const looseM = body.match(/looseness=([0-9.]+)/);
      if (outM) outAngle = parseFloat(outM[1]);
      if (inM) inAngle = parseFloat(inM[1]);
      if (looseM) looseness = parseFloat(looseM[1]);
    }

    let arrowHead = 'none';
    if (opts.includes('<->')) arrowHead = '<->';
    else if (opts.includes('->') || opts.includes('mvt')) arrowHead = '->';
    else if (opts.includes('<-')) arrowHead = '<-';
    else if (opts.includes('binding') || opts.includes('agree') || /\bo\b/.test(opts)) arrowHead = 'o-o';

    let linePattern = 'solid';
    if (opts.includes('densely dashed')) linePattern = 'densely dashed';
    else if (opts.includes('dashed')) linePattern = 'dashed';
    else if (opts.includes('dotted') || opts.includes('agree')) linePattern = 'dotted';

    let thickness = 'semithick';
    if (opts.includes('very thick')) thickness = 'very thick';
    else if (opts.includes('thick')) thickness = 'thick';
    else if (opts.includes('thin')) thickness = 'thin';

    let color = '';
    const colM = opts.match(/\b(red|blue|teal|orange|purple|violet|gray|brown|cyan|magenta|green!60!black)\b/);
    if (colM) color = colM[1];

    const ys1 = c1.shift.match(/yshift=(-?[0-9.]+)pt/);
    const ys2 = c2.shift.match(/yshift=(-?[0-9.]+)pt/);

    connectors.push(makeConnector(fromId, toId, {
      routing,
      raMode,
      direction,
      dropDepth,
      outAngle,
      inAngle,
      looseness,
      fromAnchor: c1.anchor,
      toAnchor: c2.anchor,
      fromYShift: ys1 ? parseFloat(ys1[1]) : 0,
      toYShift: ys2 ? parseFloat(ys2[1]) : 0,
      arrowHead,
      linePattern,
      thickness,
      color,
      label,
      labelPos,
    }));
  }

  return { treeOptions, root, connectors, callouts };
}

function findNodeSync(node, id) {
  if (node.id === id) return node;
  for (const c of node.children || []) {
    const f = findNodeSync(c, id);
    if (f) return f;
  }
  return null;
}
