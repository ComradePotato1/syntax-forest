import { collectNodes, hexToTikzRgb } from './state.js?v=20261126b';

function formatColorOpt(color) {
  if (!color) return '';
  if (color.startsWith('#')) return hexToTikzRgb(color);
  return color;
}

function formatLineLatex(line) {
  let content = (line.text || '').trim();
  if (line.type === 'feature') {
    const k = line.featureKind || 'mf';
    if (k === 'feature') {
      content = `\\feature{${content}}`;
    } else {
      const macro = line.satisfied ? `s${k}` : k;
      content = `\\${macro}{${content}}`;
    }
  }

  if (line.bold) {
    content = `\\primary{${content}}`;
  }
  if (line.italic) {
    content = `\\secondary{${content}}`;
  }
  if (line.smallCaps) {
    content = `\\textsc{${content}}`;
  }
  if (line.strike) {
    // soul's \st needs \mbox around macros or math
    if (content.includes('\\') || content.includes('$')) {
      content = `\\st{\\mbox{${content}}}`;
    } else {
      content = `\\st{${content}}`;
    }
  }
  if (line.color) {
    if (line.color.startsWith('#')) {
      content = `\\textcolor[HTML]{${line.color.slice(1).toUpperCase()}}{${content}}`;
    } else {
      content = `\\textcolor{${line.color}}{${content}}`;
    }
  }
  // Protect any literal [ or ] inside node text from forest's bracket scanner
  if (/[\[\]]/.test(content)) {
    content = `{${content}}`;
  }
  return content;
}

function sanitizeNodeName(raw, fallback) {
  const cleaned = (raw || '').replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned || fallback;
}

/**
 * Generates strictly \begin{forest} ... \end{forest} code compatible with ling-200b.cls.
 */
export function generateForestLatex(state) {
  const allNodes = collectNodes(state.root);
  const referencedIds = new Set();
  for (const c of state.connectors || []) {
    referencedIds.add(c.fromId);
    referencedIds.add(c.toId);
  }
  for (const cal of state.callouts || []) {
    referencedIds.add(cal.targetNodeId);
  }
  for (const n of allNodes) {
    if (n.projFeature || n.bracket) referencedIds.add(n.id);
  }

  // Assign deterministic unique TikZ names and pre-order index for every referenced or explicitly named node
  const usedNames = new Set();
  const nodeNameMap = new Map(); // nodeId -> { nodeName, fitName, base, order, isFitOnly }
  let autoIdx = 1;

  allNodes.forEach((n, order) => {
    const needsName = referencedIds.has(n.id) || Boolean(n.name);
    if (!needsName) return;
    let base = sanitizeNodeName(n.name, `n${autoIdx++}`);
    while (usedNames.has(base)) {
      base = `${sanitizeNodeName(n.name, 'n')}_${autoIdx++}`;
    }
    usedNames.add(base);

    let fitName = base;
    let nodeName = base;
    let isFitOnly = false;
    if (n.bracket && n.children && n.children.length > 0) {
      if (n.projFeature) {
        fitName = `${base}Fit`;
        usedNames.add(fitName);
      } else {
        fitName = base;
        nodeName = '';
        isFitOnly = true;
      }
    }
    nodeNameMap.set(n.id, { nodeName, fitName, base, order, isFitOnly });
  });

  // Partition connectors: those touching a fit-only subtree node go inside the later node's tikz={}
  // so both TikZ fit nodes already exist and forest doesn't try to resolve \forest@id@of@...
  const inlineNodeDraws = new Map(); // nodeId -> array of connector objects
  const inlineNodeCallouts = new Map(); // nodeId -> array of { cal, idx }
  const postTreeConnectors = [];
  for (const c of state.connectors || []) {
    const fm = nodeNameMap.get(c.fromId);
    const tm = nodeNameMap.get(c.toId);
    if (!fm || !tm) continue;
    if (fm.isFitOnly || tm.isFitOnly) {
      const hostId = fm.order >= tm.order ? c.fromId : c.toId;
      if (!inlineNodeDraws.has(hostId)) inlineNodeDraws.set(hostId, []);
      inlineNodeDraws.get(hostId).push(c);
    } else {
      postTreeConnectors.push(c);
    }
  }
  (state.callouts || []).forEach((cal, idx) => {
    const tm = nodeNameMap.get(cal.targetNodeId);
    if (!tm) return;
    if (!inlineNodeCallouts.has(cal.targetNodeId)) inlineNodeCallouts.set(cal.targetNodeId, []);
    inlineNodeCallouts.get(cal.targetNodeId).push({ cal, idx });
  });

  const extraPics = [];

  function buildNodeTikz(node, fitName, indent) {
    const b = node.bracket;
    const extraConns = inlineNodeDraws.get(node.id) || [];
    const extraCals = inlineNodeCallouts.get(node.id) || [];
    if (!b && extraConns.length === 0 && extraCals.length === 0) return '';
    const lines = [];
    if (b) {
      lines.push(`\\node [inner sep=0pt, fit to=tree] (${fitName}) {};`);
      const cOpt = b.color ? `, ${formatColorOpt(b.color)}` : '';
      const isBelow = (b.position || 'below') === 'below';

      if (b.kind === 'brace') {
        if (isBelow) {
          lines.push(`\\draw [decoration={brace, amplitude=6pt, mirror}, decorate, semithick${cOpt}] (${fitName}.south west) -- (${fitName}.south east);`);
        } else {
          lines.push(`\\draw [decoration={brace, amplitude=6pt}, decorate, semithick${cOpt}] (${fitName}.north west) -- (${fitName}.north east);`);
        }
      } else if (b.kind === 'square') {
        if (isBelow) {
          lines.push(`\\draw [semithick${cOpt}] ([yshift=4pt]${fitName}.south west) -- (${fitName}.south west) -- (${fitName}.south east) -- ([yshift=4pt]${fitName}.south east);`);
        } else {
          lines.push(`\\draw [semithick${cOpt}] ([yshift=-4pt]${fitName}.north west) -- (${fitName}.north west) -- (${fitName}.north east) -- ([yshift=-4pt]${fitName}.north east);`);
        }
      } else if (b.kind === 'box') {
        lines.push(`\\draw [dashed, semithick, rounded corners=3pt${cOpt}] (${fitName}.south west) rectangle (${fitName}.north east);`);
      }

      if (b.dottedGuides && b.kind !== 'box') {
        const gh = b.guideHeight != null ? b.guideHeight : 3;
        if (isBelow) {
          lines.push(`\\draw [dotted, thick${cOpt}] (${fitName}.south west) -- (${fitName}.west);`);
          lines.push(`\\draw [dotted, thick${cOpt}] (${fitName}.south east) -- ([yshift=${gh}em]${fitName}.east);`);
        } else {
          lines.push(`\\draw [dotted, thick${cOpt}] (${fitName}.north west) -- (${fitName}.west);`);
          lines.push(`\\draw [dotted, thick${cOpt}] (${fitName}.north east) -- ([yshift=-${gh}em]${fitName}.east);`);
        }
      }

      if (b.label && b.label.trim()) {
        const anchor = isBelow ? `${fitName}.south` : `${fitName}.north`;
        const posWord = isBelow ? 'below=8pt' : 'above=8pt';
        lines.push(`\\node [${posWord}, font=\\itshape\\small${cOpt ? `, text=${formatColorOpt(b.color)}` : ''}] at (${anchor}) {${b.label.trim()}};`);
      }
    }

    for (const c of extraConns) {
      const rendered = renderConnector(c);
      if (rendered) lines.push(rendered.trim());
    }
    for (const { cal, idx } of extraCals) {
      const rendered = renderCallout(cal, idx);
      if (rendered) {
        rendered.split('\n').forEach((ln) => lines.push(ln.trim()));
      }
    }

    const innerPad = `${indent}        `;
    return `tikz={\n${lines.map((l) => `${innerPad}${l}`).join('\n')}\n${indent}    }`;
  }

  function renderNode(node, depth = 1) {
    const indent = '    '.repeat(depth);
    const labelStr = (node.lines || []).map(formatLineLatex).join('\\\\') || ' ';

    const opts = [];
    // Root tree options and per-node separation options
    const ft = [];
    if (depth === 1 && state.treeOptions) {
      if (state.treeOptions.sSep && state.treeOptions.sSep !== '0em') {
        ft.push(`s sep=${state.treeOptions.sSep}`);
      }
      if (state.treeOptions.lSep && state.treeOptions.lSep !== '1em') {
        ft.push(`l sep=${state.treeOptions.lSep}`);
      }
    }
    if (node.sepScope === 'subtree') {
      if (node.sSep) ft.push(`s sep=${node.sSep}`);
      if (node.lSep) ft.push(`l sep=${node.lSep}`);
    } else {
      if (node.sSep) opts.push(`s sep=${node.sSep}`);
      if (node.lSep) opts.push(`l sep=${node.lSep}`);
    }
    if (ft.length > 0) {
      opts.unshift(`for tree={${ft.join(', ')}}`);
    }

    const names = nodeNameMap.get(node.id);
    if (names && names.nodeName) {
      opts.push(`name=${names.nodeName}`);
    }
    if (node.unpronounced) {
      opts.push('unpronounced');
    }
    if (node.nodeColor) {
      opts.push(`text=${formatColorOpt(node.nodeColor)}`);
    }
    if (node.edgeStyle === 'roof') {
      opts.push('roof');
    } else if (node.edgeStyle && node.edgeStyle !== 'solid') {
      const eParts = [];
      if (node.edgeStyle === 'none') {
        eParts.push('draw=none');
      } else {
        eParts.push(node.edgeStyle);
      }
      if (node.edgeColor) eParts.push(formatColorOpt(node.edgeColor));
      opts.push(eParts.length === 1 && !eParts[0].includes('=') ? `edge=${eParts[0]}` : `edge={${eParts.join(', ')}}`);
    } else if (node.edgeColor) {
      opts.push(`edge={semithick, ${formatColorOpt(node.edgeColor)}}`);
    }

    if ((node.bracket || inlineNodeDraws.has(node.id) || inlineNodeCallouts.has(node.id)) && names) {
      const tikzBlock = buildNodeTikz(node, names.fitName, indent);
      if (tikzBlock) opts.push(tikzBlock);
    }

    if (node.projFeature && names) {
      const pf = node.projFeature;
      const macro = pf.featureKind === 'feature' ? 'feature' : (pf.satisfied ? `s${pf.featureKind}` : pf.featureKind);
      const refName = names.nodeName || names.base;
      extraPics.push(`\\pic {proj-feature={${refName}}{\\${macro}{${pf.text || 'x'}}}};`);
    }

    const head = opts.length > 0 ? `${labelStr}, ${opts.join(', ')}` : labelStr;

    if (!node.children || node.children.length === 0) {
      return `${indent}[${head}]`;
    }
    const childrenStr = node.children.map((c) => renderNode(c, depth + 1)).join('\n');
    return `${indent}[${head}\n${childrenStr}\n${indent}]`;
  }

  function renderConnector(c) {
    const fromMeta = nodeNameMap.get(c.fromId);
    const toMeta = nodeNameMap.get(c.toId);
    if (!fromMeta || !toMeta) return null;

    const fromRef = fromMeta.fitName || fromMeta.nodeName;
    const toRef = toMeta.fitName || toMeta.nodeName;

    const drawOpts = [];
    // Arrowhead / o-o style
    if (c.arrowHead === 'o-o') {
      drawOpts.push('o', 'rounded corners=1pt');
    } else {
      if (c.arrowHead && c.arrowHead !== 'none') drawOpts.push(c.arrowHead);
      if (c.routing === 'right-angle' && c.roundedCorners !== false) {
        drawOpts.push('rounded corners=1pt');
      }
    }
    if (c.thickness) drawOpts.push(c.thickness);
    if (c.linePattern && c.linePattern !== 'solid') drawOpts.push(c.linePattern);
    if (c.color) drawOpts.push(formatColorOpt(c.color));

    function coordExpr(ref, anchor, xShift, yShift) {
      const shifts = [];
      if (xShift) shifts.push(`xshift=${xShift}em`);
      if (yShift) shifts.push(`yshift=${yShift}pt`);
      const base = `${ref}.${anchor || 'south'}`;
      return shifts.length > 0 ? `([${shifts.join(', ')}]${base})` : `(${base})`;
    }

    const startCoord = coordExpr(fromRef, c.fromAnchor, c.fromXShift, c.fromYShift);
    const endCoord = coordExpr(toRef, c.toAnchor, c.toXShift, c.toYShift);

    let labelPart = '';
    if (c.label && c.label.trim()) {
      const raMode = c.raMode || (c.direction === 'above' ? 'u-above' : c.direction === 'side' ? 'l-bend' : 'u-below');
      const posFrac = c.routing === 'right-angle'
        ? (raMode === 'l-bend' ? 0.75 : (c.labelFraction ?? 0.25))
        : 0.5;
      const lOpts = [`pos=${posFrac}`];
      if (c.labelItalic !== false) lOpts.push('font=\\itshape\\small');
      else lOpts.push('font=\\small');
      if (c.labelPos) lOpts.push(c.labelPos);
      if (c.color) lOpts.push(`text=${formatColorOpt(c.color)}`);
      labelPart = ` node [${lOpts.join(', ')}] {${c.label.trim()}}`;
    }

    if (c.routing === 'curved') {
      const outA = c.outAngle != null ? c.outAngle : -90;
      const inA = c.inAngle != null ? c.inAngle : -90;
      const loose = c.looseness != null && Number(c.looseness) !== 1 ? `, looseness=${c.looseness}` : '';
      // In TikZ, node labels on a `to[...]` path must appear before the target coordinate
      return `    \\draw [${drawOpts.join(', ')}] ${startCoord} to[out=${outA}, in=${inA}${loose}]${labelPart ? `\n       ${labelPart}` : ''} ${endCoord};`;
    }

    let pathStr = '';
    if (c.routing === 'right-angle') {
      const drop = Number(c.dropDepth ?? 1.8);
      const raMode = c.raMode || (c.direction === 'above' ? 'u-above' : c.direction === 'side' ? 'l-bend' : 'u-below');
      if (raMode === 'l-bend') {
        pathStr = `${startCoord} |- ${endCoord}`;
      } else if (raMode === '7-bend') {
        pathStr = `${startCoord} -| ${endCoord}`;
      } else if (raMode === 'u-above') {
        pathStr = `${startCoord} -- ++(0, ${+drop.toFixed(2)}em) -| ${endCoord}`;
      } else if (raMode === 'c-left') {
        pathStr = `${startCoord} -- ++(${+(-drop).toFixed(2)}em, 0) |- ${endCoord}`;
      } else if (raMode === 'c-right') {
        pathStr = `${startCoord} -- ++(${+drop.toFixed(2)}em, 0) |- ${endCoord}`;
      } else {
        pathStr = `${startCoord} -- ++(0, ${+(-drop).toFixed(2)}em) -| ${endCoord}`;
      }
    } else {
      pathStr = `${startCoord} -- ${endCoord}`;
    }

    return `    \\draw [${drawOpts.join(', ')}] ${pathStr}${labelPart ? `\n       ${labelPart}` : ''};`;
  }

  function renderCallout(cal, idx) {
    const targetMeta = nodeNameMap.get(cal.targetNodeId);
    if (!targetMeta) return null;
    const tRef = targetMeta.nodeName || targetMeta.fitName;
    const calName = `cal${idx + 1}`;
    const cOpt = cal.color ? `, text=${formatColorOpt(cal.color)}` : '';
    const drawColor = cal.color ? `, ${formatColorOpt(cal.color)}` : '';

    let posSpec = '';
    const ox = Number(cal.offsetX || 0);
    const oy = Number(cal.offsetY || 0);
    if (cal.relPos === 'left') {
      posSpec = `left=${Math.abs(ox)}em of ${tRef}, yshift=${oy}em, anchor=east`;
    } else if (cal.relPos === 'right') {
      posSpec = `right=${Math.abs(ox)}em of ${tRef}, yshift=${oy}em, anchor=west`;
    } else if (cal.relPos === 'above') {
      posSpec = `above=${Math.abs(oy)}em of ${tRef}, xshift=${ox}em, anchor=south`;
    } else {
      posSpec = `below=${Math.abs(oy)}em of ${tRef}, xshift=${ox}em, anchor=north`;
    }

    const lines = [`    \\node [${posSpec}${cOpt}] (${calName}) {${cal.text || 'note'}};`];
    if (cal.hasArrow) {
      const startAnchor = cal.relPos === 'left' ? `${calName}.east`
        : cal.relPos === 'right' ? `${calName}.west`
        : cal.relPos === 'above' ? `${calName}.south`
        : `${calName}.north`;
      const endAnchor = cal.targetAnchor || 'south west';
      const endX = cal.targetXShift ? `[xshift=${cal.targetXShift}em]` : '';
      const endCoord = endX ? `(${endX}${tRef}.${endAnchor})` : `(${tRef}.${endAnchor})`;

      let conn = '';
      if (cal.routing === 'curved') {
        conn = `to[out=${cal.outAngle ?? 0}, in=${cal.inAngle ?? 225}]`;
      } else if (cal.routing === 'right-angle') {
        conn = '-|';
      } else {
        conn = '--';
      }
      lines.push(`    \\draw [->, mvt, thick${drawColor}] (${startAnchor}) ${conn} ${endCoord};`);
    }
    return lines.join('\n');
  }

  const treeLines = renderNode(state.root, 1);
  const picLines = extraPics.map((p) => `    ${p}`);
  const connLines = postTreeConnectors.map(renderConnector).filter(Boolean);

  const parts = ['\\begin{forest}', treeLines];
  if (picLines.length) parts.push(...picLines);
  if (connLines.length) parts.push(...connLines);
  parts.push('\\end{forest}');
  return parts.join('\n');
}
