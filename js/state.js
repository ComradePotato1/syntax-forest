// Tree state, undo/redo, color helpers, and tree mutation utilities

let uidCounter = 1;
export function genId(prefix = 'id') {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

export const LATEX_COLORS = [
  { label: 'Default', value: '', css: '#0f172a' },
  { label: 'Red', value: 'red', css: '#dc2626' },
  { label: 'Blue', value: 'blue', css: '#2563eb' },
  { label: 'Teal', value: 'teal', css: '#0d9488' },
  { label: 'Green', value: 'green!60!black', css: '#15803d' },
  { label: 'Orange', value: 'orange', css: '#ea580c' },
  { label: 'Purple', value: 'purple', css: '#9333ea' },
  { label: 'Violet', value: 'violet', css: '#7c3aed' },
  { label: 'Magenta', value: 'magenta', css: '#db2777' },
  { label: 'Brown', value: 'brown', css: '#92400e' },
  { label: 'Gray', value: 'gray', css: '#64748b' },
];

export function colorToCss(val) {
  if (!val) return '#0f172a';
  const found = LATEX_COLORS.find((c) => c.value === val);
  if (found) return found.css;
  if (val.startsWith('#')) return val;
  return val;
}

/**
 * Converts a #RRGGBB hex string into an exact comma-free xcolor expression
 * using {red, yellow, green, cyan, blue, magenta} + white + black.
 */
export function hexToTikzRgb(hex) {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return 'black';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const M = Math.max(r, g, b);
  const m = Math.min(r, g, b);
  if (M <= 0.01) return 'black';
  if (M - m <= 0.01) {
    const p = Math.round(M * 100);
    return p >= 99 ? 'white' : `white!${p}!black`;
  }
  const rn = (r - m) / (M - m);
  const gn = (g - m) / (M - m);
  const bn = (b - m) / (M - m);

  let hue;
  if (rn >= gn && gn >= bn) {
    const p = Math.round((1 - gn) * 100);
    hue = p >= 99 ? 'red' : p <= 1 ? 'yellow' : `red!${p}!yellow`;
  } else if (gn >= rn && rn >= bn) {
    const p = Math.round((1 - rn) * 100);
    hue = p >= 99 ? 'green' : p <= 1 ? 'yellow' : `green!${p}!yellow`;
  } else if (gn >= bn && bn >= rn) {
    const p = Math.round((1 - bn) * 100);
    hue = p >= 99 ? 'green' : p <= 1 ? 'cyan' : `green!${p}!cyan`;
  } else if (bn >= gn && gn >= rn) {
    const p = Math.round((1 - gn) * 100);
    hue = p >= 99 ? 'blue' : p <= 1 ? 'cyan' : `blue!${p}!cyan`;
  } else if (bn >= rn && rn >= gn) {
    const p = Math.round((1 - rn) * 100);
    hue = p >= 99 ? 'blue' : p <= 1 ? 'magenta' : `blue!${p}!magenta`;
  } else {
    const p = Math.round((1 - bn) * 100);
    hue = p >= 99 ? 'red' : p <= 1 ? 'magenta' : `red!${p}!magenta`;
  }

  let expr = hue;
  const pw = Math.round((1 - m / M) * 100);
  if (pw < 99) expr = `${expr}!${pw}!white`;
  const pb = Math.round(M * 100);
  if (pb < 99) expr = `${expr}!${pb}!black`;
  return expr;
}

export function makeLine(text = 'XP', extra = {}) {
  return {
    id: genId('ln'),
    type: 'text', // 'text' | 'feature'
    text,
    featureKind: 'mf', // 'feature' | 'mf' | 'hf' | 'af' | 'mvf'
    satisfied: false,
    strike: false,
    bold: false,
    italic: false,
    smallCaps: false,
    color: '',
    ...extra,
  };
}

export function makeFeatureLine(text = 'd', featureKind = 'mf', satisfied = false) {
  return makeLine(text, { type: 'feature', featureKind, satisfied });
}

export function makeNode(linesOrText = 'XP', children = [], opts = {}) {
  let lines;
  if (typeof linesOrText === 'string') {
    lines = [makeLine(linesOrText)];
  } else if (Array.isArray(linesOrText)) {
    lines = linesOrText.map((l) => (typeof l === 'string' ? makeLine(l) : { id: genId('ln'), ...l }));
  } else {
    lines = [makeLine('XP')];
  }
  return {
    id: genId('n'),
    name: '',
    lines,
    nodeColor: '',
    unpronounced: false,
    edgeStyle: 'solid', // 'solid' | 'roof' | 'dotted' | 'dashed' | 'thick' | 'none'
    edgeColor: '',
    sSep: '', // per-node sibling separation e.g. '1.5em' or '' (inherit)
    lSep: '', // per-node level separation e.g. '1.5em' or '' (inherit)
    sepScope: 'children', // 'children' | 'subtree'
    projFeature: null, // null or { featureKind: 'mf', text: 'd', satisfied: true }
    bracket: null, // null or { kind: 'brace'|'square'|'box', position: 'below'|'above', dottedGuides: true, guideHeight: 3, color: '', label: '' }
    children,
    ...opts,
  };
}

export function makeConnector(fromId, toId, opts = {}) {
  const dir = opts.direction || 'below';
  const defRaMode = dir === 'above' ? 'u-above' : dir === 'side' ? 'l-bend' : 'u-below';
  return {
    id: genId('c'),
    fromId,
    toId,
    stylePreset: 'mvt',
    routing: 'right-angle', // 'right-angle' | 'curved' | 'straight'
    raMode: defRaMode, // 'l-bend' | '7-bend' | 'u-below' | 'u-above' | 'c-left' | 'c-right'
    direction: dir, // 'below' | 'above' | 'side'
    dropDepth: 1.8,
    roundedCorners: true,
    outAngle: -90,
    inAngle: -90,
    looseness: 1.0,
    fromAnchor: 'south',
    toAnchor: 'south',
    fromYShift: 0,
    toYShift: 0,
    fromXShift: 0,
    toXShift: 0,
    arrowHead: '->', // '->' | '<-' | '<->' | 'o->' | 'o-o' | 'none'
    linePattern: 'solid', // 'solid' | 'dashed' | 'densely dashed' | 'dotted'
    thickness: 'semithick',
    color: '',
    blocked: false,
    label: '',
    labelPos: 'below',
    labelItalic: true,
    labelFraction: 0.25,
    ...opts,
  };
}

export function makeCallout(targetNodeId, text = '\\textit{do}-support', opts = {}) {
  return {
    id: genId('cal'),
    targetNodeId,
    text,
    relPos: 'left',
    offsetX: -1,
    offsetY: -4,
    hasArrow: true,
    routing: 'curved',
    outAngle: 0,
    inAngle: 225,
    targetAnchor: 'south west',
    targetXShift: 1,
    targetYShift: 0,
    color: '',
    ...opts,
  };
}

export function cloneData(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function findNode(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function findParent(root, id, parent = null) {
  if (!root) return null;
  if (root.id === id) return parent;
  for (const child of root.children) {
    const found = findParent(child, id, root);
    if (found) return found;
  }
  return null;
}

export function collectNodes(root, list = []) {
  if (!root) return list;
  list.push(root);
  for (const ch of root.children) collectNodes(ch, list);
  return list;
}

export function isNodeEmpty(node) {
  if (!node || !node.lines || node.lines.length === 0) return true;
  return node.lines.every((l) => l.type !== 'feature' && !(l.text || '').trim());
}

export function nodeSummaryLabel(node) {
  if (!node || isNodeEmpty(node)) {
    return node && node.children && node.children.length > 0 ? '(junction)' : '(empty)';
  }
  const first = node.lines[0];
  let txt = first.text || '(empty)';
  txt = txt.replace(/\\xbar\{([^}]*)\}/g, "$1'").replace(/\\head\{([^}]*)\}/g, '$1⁰').replace(/\\vP/g, 'vP').replace(/\\littlev/g, 'v');
  if (node.name) return `${txt} (${node.name})`;
  return txt;
}

export function cloneSubtreeWithNewIds(node) {
  const copy = cloneData(node);
  function reassign(n) {
    n.id = genId('n');
    n.name = '';
    n.lines = (n.lines || []).map((l) => ({ ...l, id: genId('ln') }));
    n.children = (n.children || []).map(reassign);
    return n;
  }
  return reassign(copy);
}

export function deleteNodeById(state, id) {
  if (state.root.id === id) return false;
  const parent = findParent(state.root, id);
  if (!parent) return false;
  const target = findNode(state.root, id);
  const removedIds = new Set(collectNodes(target).map((n) => n.id));
  parent.children = parent.children.filter((c) => c.id !== id);
  state.connectors = state.connectors.filter((c) => !removedIds.has(c.fromId) && !removedIds.has(c.toId));
  state.callouts = state.callouts.filter((cal) => !removedIds.has(cal.targetNodeId));
  return parent.id;
}

export function unwrapNodeById(state, id) {
  if (state.root.id === id) {
    if (state.root.children.length === 1) {
      const onlyChild = state.root.children[0];
      state.root = onlyChild;
      state.connectors = state.connectors.filter((c) => c.fromId !== id && c.toId !== id);
      state.callouts = state.callouts.filter((cal) => cal.targetNodeId !== id);
      return onlyChild.id;
    }
    return false;
  }
  const parent = findParent(state.root, id);
  if (!parent) return false;
  const idx = parent.children.findIndex((c) => c.id === id);
  const node = parent.children[idx];
  parent.children.splice(idx, 1, ...node.children);
  state.connectors = state.connectors.filter((c) => c.fromId !== id && c.toId !== id);
  state.callouts = state.callouts.filter((cal) => cal.targetNodeId !== id);
  return node.children[0]?.id || parent.id;
}

export function insertParentAbove(state, id, label = 'XP') {
  const newNode = makeNode(label, []);
  if (state.root.id === id) {
    newNode.children = [state.root];
    state.root = newNode;
    return newNode.id;
  }
  const parent = findParent(state.root, id);
  if (!parent) return null;
  const idx = parent.children.findIndex((c) => c.id === id);
  const target = parent.children[idx];
  newNode.children = [target];
  parent.children.splice(idx, 1, newNode);
  return newNode.id;
}

export class HistoryManager {
  constructor(limit = 60) {
    this.stack = [];
    this.index = -1;
    this.limit = limit;
  }
  push(state) {
    const snap = JSON.stringify(state);
    if (this.index >= 0 && this.stack[this.index] === snap) return;
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(snap);
    if (this.stack.length > this.limit) {
      this.stack.shift();
    } else {
      this.index += 1;
    }
    this.index = this.stack.length - 1;
  }
  canUndo() { return this.index > 0; }
  canRedo() { return this.index < this.stack.length - 1; }
  undo() {
    if (!this.canUndo()) return null;
    this.index -= 1;
    return JSON.parse(this.stack[this.index]);
  }
  redo() {
    if (!this.canRedo()) return null;
    this.index += 1;
    return JSON.parse(this.stack[this.index]);
  }
}
