import {
  LATEX_COLORS,
  makeNode,
  makeLine,
  makeFeatureLine,
  makeConnector,
  makeCallout,
  findNode,
  findParent,
  collectNodes,
  nodeSummaryLabel,
  cloneSubtreeWithNewIds,
  deleteNodeById,
  unwrapNodeById,
  insertParentAbove,
  HistoryManager,
} from './state.js?v=20261126b';
import { buildPreset } from './presets.js?v=20261126b';
import { generateForestLatex } from './latex-gen.js?v=20261126b';
import { parseForestLatex } from './forest-parser.js?v=20261126b';
import { renderTreeSvg } from './renderer.js?v=20261126b';

const STORAGE_KEY = 'syntaxforest_autosave_v1';
const SAVED_TREES_KEY = 'syntaxforest_saved_trees_v1';

// App State
let state = null;
const history = new HistoryManager(60);

const ui = {
  mode: 'select', // 'select' | 'connect'
  selectedNodeId: null,
  selectedConnectorId: null,
  selectedCalloutId: null,
  connectSourceId: null,
  mouseWorldPt: null,
  zoom: 1.0,
  panX: 340,
  panY: 40,
  showGrid: true,
  lastLayout: null,
  lastFocusedTextInput: null,
};

// DOM Elements
const svg = document.getElementById('tree-svg');
const viewportGroup = document.getElementById('viewport-group');
const canvasWrap = document.getElementById('canvas-wrap');
const nodeFloatBar = document.getElementById('node-float-bar');
const inlinePop = document.getElementById('inline-edit-pop');
const inlineInput = document.getElementById('inline-edit-input');
const latexOutput = document.getElementById('latex-output');

function populateColorSelect(sel) {
  sel.innerHTML = '';
  for (const c of LATEX_COLORS) {
    const opt = document.createElement('option');
    opt.value = c.value;
    opt.textContent = c.label;
    sel.appendChild(opt);
  }
  const cust = document.createElement('option');
  cust.value = '__custom__';
  cust.textContent = 'Custom…';
  sel.appendChild(cust);
}

function syncColorControl(selectEl, customEl, value, onChange) {
  const isNamed = LATEX_COLORS.some((c) => c.value === (value || ''));
  if (isNamed) {
    selectEl.value = value || '';
    const found = LATEX_COLORS.find((c) => c.value === (value || ''));
    if (found) customEl.value = found.css;
  } else if (value) {
    selectEl.value = '__custom__';
    if (value.startsWith('#')) customEl.value = value;
  } else {
    selectEl.value = '';
  }

  selectEl.onchange = () => {
    if (selectEl.value === '__custom__') {
      onChange(customEl.value);
    } else {
      onChange(selectEl.value);
    }
  };
  customEl.oninput = () => {
    selectEl.value = '__custom__';
    onChange(customEl.value);
  };
}

// ---------- PALETTES ----------
const CATEGORIES = [
  { label: 'CP', latex: 'CP' },
  { label: 'C̄', latex: '\\xbar{C}', overbar: true },
  { label: 'C', latex: 'C' },
  { label: 'TP', latex: 'TP' },
  { label: 'T̄', latex: '\\xbar{T}', overbar: true },
  { label: 'T', latex: 'T' },
  { label: 'DP', latex: 'DP' },
  { label: 'D̄', latex: '\\xbar{D}', overbar: true },
  { label: 'D', latex: 'D' },
  { label: 'VP', latex: 'VP' },
  { label: 'V̄', latex: '\\xbar{V}', overbar: true },
  { label: 'V', latex: 'V' },
  { label: 'vP', latex: '\\vP' },
  { label: 'v', latex: '\\littlev' },
  { label: 'NP', latex: 'NP' },
  { label: 'N̄', latex: '\\xbar{N}', overbar: true },
  { label: 'N', latex: 'N' },
  { label: 'PP', latex: 'PP' },
  { label: 'P', latex: 'P' },
  { label: 'NegP', latex: 'NegP' },
  { label: 'AuxP', latex: 'AuxP' },
  { label: 'AdjP', latex: 'AdjP' },
  { label: 'AdvP', latex: 'AdvP' },
  { label: 'VoiceP', latex: 'VoiceP' },
];

const SYMBOLS = [
  { label: '∅', latex: '$\\emptyset$' },
  { label: 'TnsPAST', latex: '\\past' },
  { label: 'TnsPRES', latex: '\\pres' },
  { label: 't₁', latex: '\\tr{1}' },
  { label: '____', latex: '\\gap' },
  { label: 'wh', latex: '\\wh' },
  { label: 'Wh', latex: '\\Wh' },
  { label: 'Ā', latex: '\\abar' },
  { label: 'MERGE', latex: '\\Merge' },
  { label: 'AGREE', latex: '\\Agree' },
  { label: 'X⁰', latex: '\\head{X}' },
  { label: '[Spec, XP]', latex: '\\spec{XP}' },
  { label: '[Comp, XP]', latex: '\\comp{XP}' },
  { label: 'ol{word}', latex: '\\ol{word}' },
];

const QUICK_FEATURES = [
  { label: '[•D•]', text: 'd', kind: 'mf', sat: false },
  { label: '[•D•]✓', text: 'd', kind: 'mf', sat: true },
  { label: '[+T+]', text: 't', kind: 'hf', sat: false },
  { label: '[+T+]✓', text: 't', kind: 'hf', sat: true },
  { label: '[⋆φ⋆]', text: '$\\varphi$', kind: 'af', sat: false },
  { label: '[⋆φ⋆]✓', text: '$\\varphi$', kind: 'af', sat: true },
  { label: '[∧wh∧]', text: 'wh', kind: 'mvf', sat: false },
  { label: '[F]', text: 'F', kind: 'feature', sat: false },
];

function buildPalettes() {
  const catGrid = document.getElementById('category-chips');
  for (const item of CATEGORIES) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = item.label;
    btn.title = item.latex;
    btn.onclick = () => {
      const mode = document.getElementById('cat-insert-mode').value;
      const sel = getSelectedNode();
      if (!sel) return;
      if (mode === 'child') {
        addChildNode(sel.id, item.latex);
      } else if (mode === 'parent') {
        doInsertParent(sel.id, item.latex);
      } else {
        if (!sel.lines.length) sel.lines.push(makeLine(item.latex));
        else sel.lines[0].text = item.latex;
        commitState();
      }
    };
    catGrid.appendChild(btn);
  }

  const symGrid = document.getElementById('symbol-chips');
  for (const item of SYMBOLS) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = item.label;
    btn.title = item.latex;
    btn.onmousedown = (e) => e.preventDefault(); // preserve focus on text input if active
    btn.onclick = () => {
      const inp = ui.lastFocusedTextInput;
      if (inp && document.body.contains(inp) && document.activeElement === inp) {
        const start = inp.selectionStart ?? inp.value.length;
        const end = inp.selectionEnd ?? inp.value.length;
        inp.value = inp.value.slice(0, start) + item.latex + inp.value.slice(end);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.focus();
        inp.setSelectionRange(start + item.latex.length, start + item.latex.length);
        return;
      }
      const sel = getSelectedNode();
      if (!sel) return;
      sel.lines.push(makeLine(item.latex));
      commitState();
    };
    symGrid.appendChild(btn);
  }

  const featGrid = document.getElementById('feature-chips');
  for (const f of QUICK_FEATURES) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = f.label;
    btn.onclick = () => {
      const sel = getSelectedNode();
      if (!sel) return;
      sel.lines.push(makeFeatureLine(f.text, f.kind, f.sat));
      commitState();
    };
    featGrid.appendChild(btn);
  }
}

// ---------- STATE & HISTORY ----------
function getSelectedNode() {
  return ui.selectedNodeId ? findNode(state.root, ui.selectedNodeId) : null;
}

function renderCanvasAndCode() {
  ui.lastLayout = renderTreeSvg(svg, state, ui);
  applyTransform();
  latexOutput.textContent = generateForestLatex(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function commitState(skipHistory = false) {
  if (!skipHistory) history.push(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
  updateUndoRedoButtons();
  renderAll();
}

function updateUndoRedoButtons() {
  document.getElementById('undo-btn').disabled = !history.canUndo();
  document.getElementById('redo-btn').disabled = !history.canRedo();
}

function applyTransform() {
  viewportGroup.setAttribute('transform', `translate(${ui.panX}, ${ui.panY}) scale(${ui.zoom})`);
  document.getElementById('zoom-label').textContent = `${Math.round(ui.zoom * 100)}%`;
  positionFloatingBar();
}

function fitToView() {
  if (!ui.lastLayout) return;
  const { bounds } = ui.lastLayout;
  const rect = canvasWrap.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10 || !Number.isFinite(bounds.width)) return;
  const scaleX = (rect.width - 48) / Math.max(120, bounds.width);
  const scaleY = (rect.height - 48) / Math.max(120, bounds.height);
  ui.zoom = Math.max(0.35, Math.min(1.45, Math.min(scaleX, scaleY)));
  ui.panX = rect.width / 2 - (bounds.minX + bounds.width / 2) * ui.zoom;
  ui.panY = (rect.height - bounds.height * ui.zoom) / 2 - bounds.minY * ui.zoom;
  applyTransform();
}

function positionFloatingBar() {
  if (ui.mode !== 'select' || !ui.selectedNodeId || !ui.lastLayout) {
    nodeFloatBar.classList.add('hidden');
    return;
  }
  const m = ui.lastLayout.meta.get(ui.selectedNodeId);
  if (!m) {
    nodeFloatBar.classList.add('hidden');
    return;
  }
  const sx = m.nodeBox.cx * ui.zoom + ui.panX;
  const sy = m.nodeBox.top * ui.zoom + ui.panY - 36;
  const rect = canvasWrap.getBoundingClientRect();
  nodeFloatBar.style.left = `${Math.max(130, Math.min(rect.width - 130, sx))}px`;
  nodeFloatBar.style.top = `${Math.max(8, sy < 10 ? m.nodeBox.bottom * ui.zoom + ui.panY + 8 : sy)}px`;
  nodeFloatBar.classList.remove('hidden');
}

// ---------- NODE ACTIONS ----------
function addChildNode(parentId, label = 'XP') {
  const p = findNode(state.root, parentId);
  if (!p) return;
  const child = makeNode(label);
  p.children.push(child);
  ui.selectedNodeId = child.id;
  commitState();
}

function doInsertParent(nodeId, label = 'XP') {
  const newId = insertParentAbove(state, nodeId, label);
  if (newId) {
    ui.selectedNodeId = newId;
    commitState();
  }
}

function addSibling(nodeId, side = 'right') {
  const p = findParent(state.root, nodeId);
  if (!p) return;
  const idx = p.children.findIndex((c) => c.id === nodeId);
  const sib = makeNode('XP');
  p.children.splice(side === 'left' ? idx : idx + 1, 0, sib);
  ui.selectedNodeId = sib.id;
  commitState();
}

function moveSibling(nodeId, delta) {
  const p = findParent(state.root, nodeId);
  if (!p) return;
  const idx = p.children.findIndex((c) => c.id === nodeId);
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= p.children.length) return;
  const [item] = p.children.splice(idx, 1);
  p.children.splice(targetIdx, 0, item);
  commitState();
}

function duplicateNode(nodeId) {
  const p = findParent(state.root, nodeId);
  if (!p) return;
  const idx = p.children.findIndex((c) => c.id === nodeId);
  const copy = cloneSubtreeWithNewIds(p.children[idx]);
  p.children.splice(idx + 1, 0, copy);
  ui.selectedNodeId = copy.id;
  commitState();
}

function deleteSelectedNode() {
  if (!ui.selectedNodeId) return;
  const nextId = deleteNodeById(state, ui.selectedNodeId);
  if (nextId) {
    ui.selectedNodeId = nextId;
    commitState();
  }
}

function unwrapSelectedNode() {
  if (!ui.selectedNodeId) return;
  const nextId = unwrapNodeById(state, ui.selectedNodeId);
  if (nextId) {
    ui.selectedNodeId = nextId;
    commitState();
  }
}

// ---------- MODE & TABS ----------
function setMode(mode) {
  ui.mode = mode;
  ui.connectSourceId = null;
  ui.mouseWorldPt = null;
  document.getElementById('mode-select-btn').classList.toggle('active', mode === 'select');
  document.getElementById('mode-connect-btn').classList.toggle('active', mode === 'connect');
  svg.classList.toggle('connect-mode', mode === 'connect');
  const banner = document.getElementById('connect-banner');
  if (mode === 'connect') {
    banner.classList.remove('hidden');
    document.getElementById('connect-banner-text').innerHTML = 'Click the <strong>source node</strong> where the arrow starts…';
  } else {
    banner.classList.add('hidden');
  }
  renderAll();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === `tab-${tabName}`));
}

// ---------- INSPECTOR RENDERING ----------
function renderNodeInspector() {
  const node = getSelectedNode();
  const emptyMsg = document.getElementById('no-node-msg');
  const body = document.getElementById('node-inspector-body');
  if (!node) {
    emptyMsg.classList.remove('hidden');
    body.classList.add('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');
  body.classList.remove('hidden');

  const nameInp = document.getElementById('node-name-input');
  nameInp.value = node.name || '';
  nameInp.onchange = () => {
    node.name = nameInp.value.trim();
    commitState();
  };

  syncColorControl(
    document.getElementById('node-color-select'),
    document.getElementById('node-color-custom'),
    node.nodeColor,
    (val) => { node.nodeColor = val; commitState(); },
  );

  // Lines list
  const linesList = document.getElementById('lines-list');
  linesList.innerHTML = '';
  node.lines.forEach((line, idx) => {
    const card = document.createElement('div');
    card.className = 'line-card';

    const top = document.createElement('div');
    top.className = 'line-card-top';

    const kindSel = document.createElement('select');
    kindSel.innerHTML = `
      <option value="text">Text</option>
      <option value="mf">Merge [•X•]</option>
      <option value="hf">Head [+X+]</option>
      <option value="af">Agree [⋆X⋆]</option>
      <option value="mvf">Mvt [∧X∧]</option>
      <option value="feature">Feat [X]</option>
    `;
    kindSel.value = line.type === 'feature' ? (line.featureKind || 'mf') : 'text';
    kindSel.onchange = () => {
      if (kindSel.value === 'text') {
        line.type = 'text';
      } else {
        line.type = 'feature';
        line.featureKind = kindSel.value;
      }
      commitState();
    };

    const txtInp = document.createElement('input');
    txtInp.type = 'text';
    txtInp.value = line.text || '';
    txtInp.placeholder = line.type === 'feature' ? 'd / aux / wh' : 'Label or word';
    txtInp.onfocus = () => { ui.lastFocusedTextInput = txtInp; };
    txtInp.oninput = () => {
      line.text = txtInp.value;
      renderCanvasAndCode();
    };
    txtInp.onchange = () => commitState();

    top.appendChild(kindSel);
    top.appendChild(txtInp);
    card.appendChild(top);

    const bar = document.createElement('div');
    bar.className = 'line-card-bar';

    const fmt = document.createElement('div');
    fmt.className = 'fmt-group';

    if (line.type === 'feature') {
      const satBtn = document.createElement('button');
      satBtn.className = `fmt-btn ${line.satisfied ? 'active' : ''}`;
      satBtn.textContent = '✓';
      satBtn.title = 'Satisfied feature (\\smf, \\shf, \\saf)';
      satBtn.onclick = () => { line.satisfied = !line.satisfied; commitState(); };
      fmt.appendChild(satBtn);
    }

    const bBtn = document.createElement('button');
    bBtn.className = `fmt-btn ${line.bold ? 'active' : ''}`;
    bBtn.textContent = 'B';
    bBtn.title = 'Bold (\\primary{...})';
    bBtn.onclick = () => { line.bold = !line.bold; commitState(); };

    const iBtn = document.createElement('button');
    iBtn.className = `fmt-btn ${line.italic ? 'active' : ''}`;
    iBtn.textContent = 'I';
    iBtn.title = 'Italic (\\secondary{...})';
    iBtn.onclick = () => { line.italic = !line.italic; commitState(); };

    const scBtn = document.createElement('button');
    scBtn.className = `fmt-btn sc ${line.smallCaps ? 'active' : ''}`;
    scBtn.textContent = 'Sc';
    scBtn.title = 'Small Caps (\\textsc{...})';
    scBtn.onclick = () => { line.smallCaps = !line.smallCaps; commitState(); };

    const sBtn = document.createElement('button');
    sBtn.className = `fmt-btn strike ${line.strike ? 'active' : ''}`;
    sBtn.textContent = 'S';
    sBtn.title = 'Strikethrough (\\st{...})';
    sBtn.onclick = () => { line.strike = !line.strike; commitState(); };

    const colSel = document.createElement('select');
    colSel.style.height = '20px';
    colSel.style.fontSize = '10.5px';
    colSel.style.maxWidth = '68px';
    for (const c of LATEX_COLORS) {
      const o = document.createElement('option');
      o.value = c.value;
      o.textContent = c.label;
      colSel.appendChild(o);
    }
    colSel.value = line.color || '';
    colSel.onchange = () => { line.color = colSel.value; commitState(); };

    fmt.append(bBtn, iBtn, scBtn, sBtn, colSel);

    const ops = document.createElement('div');
    ops.className = 'fmt-group';
    const upBtn = document.createElement('button');
    upBtn.className = 'btn-mini';
    upBtn.textContent = '↑';
    upBtn.disabled = idx === 0;
    upBtn.onclick = () => {
      [node.lines[idx - 1], node.lines[idx]] = [node.lines[idx], node.lines[idx - 1]];
      commitState();
    };
    const dnBtn = document.createElement('button');
    dnBtn.className = 'btn-mini';
    dnBtn.textContent = '↓';
    dnBtn.disabled = idx === node.lines.length - 1;
    dnBtn.onclick = () => {
      [node.lines[idx + 1], node.lines[idx]] = [node.lines[idx], node.lines[idx + 1]];
      commitState();
    };
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-mini btn-mini-danger';
    delBtn.textContent = '✕';
    delBtn.disabled = node.lines.length <= 1;
    delBtn.onclick = () => {
      node.lines.splice(idx, 1);
      commitState();
    };
    ops.append(upBtn, dnBtn, delBtn);

    bar.append(fmt, ops);
    card.appendChild(bar);
    linesList.appendChild(card);
  });

  // Branch & unpronounced
  const edgeSel = document.getElementById('node-edge-select');
  edgeSel.value = node.edgeStyle || 'solid';
  edgeSel.onchange = () => { node.edgeStyle = edgeSel.value; commitState(); };

  syncColorControl(
    document.getElementById('node-edge-color-select'),
    document.getElementById('node-edge-color-custom'),
    node.edgeColor,
    (val) => { node.edgeColor = val; commitState(); },
  );

  const unpChk = document.getElementById('node-unpronounced-chk');
  unpChk.checked = Boolean(node.unpronounced);
  unpChk.onchange = () => { node.unpronounced = unpChk.checked; commitState(); };

  // Per-branch node separation (s sep / l sep)
  const sepScopeEl = document.getElementById('node-sep-scope');
  const sSepInp = document.getElementById('node-ssep-input');
  const lSepInp = document.getElementById('node-lsep-input');
  sepScopeEl.value = node.sepScope || 'children';
  sSepInp.value = node.sSep ? parseFloat(node.sSep) : '';
  lSepInp.value = node.lSep ? parseFloat(node.lSep) : '';
  sepScopeEl.onchange = () => { node.sepScope = sepScopeEl.value; commitState(); };
  sSepInp.oninput = () => {
    const v = parseFloat(sSepInp.value);
    node.sSep = sSepInp.value === '' || Number.isNaN(v) ? '' : `${v}em`;
    renderCanvasAndCode();
  };
  sSepInp.onchange = () => commitState();
  lSepInp.oninput = () => {
    const v = parseFloat(lSepInp.value);
    node.lSep = lSepInp.value === '' || Number.isNaN(v) ? '' : `${v}em`;
    renderCanvasAndCode();
  };
  lSepInp.onchange = () => commitState();

  // Projected feature
  const pfChk = document.getElementById('proj-feature-chk');
  const pfFields = document.getElementById('proj-feature-fields');
  pfChk.checked = Boolean(node.projFeature);
  pfFields.classList.toggle('hidden', !node.projFeature);
  pfChk.onchange = () => {
    node.projFeature = pfChk.checked ? { featureKind: 'mf', text: 'd', satisfied: true } : null;
    commitState();
  };
  if (node.projFeature) {
    const kEl = document.getElementById('proj-feat-kind');
    const tEl = document.getElementById('proj-feat-text');
    const sEl = document.getElementById('proj-feat-sat');
    kEl.value = node.projFeature.featureKind || 'mf';
    tEl.value = node.projFeature.text || '';
    sEl.checked = Boolean(node.projFeature.satisfied);
    kEl.onchange = () => { node.projFeature.featureKind = kEl.value; commitState(); };
    tEl.oninput = () => { node.projFeature.text = tEl.value; renderCanvasAndCode(); };
    tEl.onchange = () => commitState();
    sEl.onchange = () => { node.projFeature.satisfied = sEl.checked; commitState(); };
  }
}

function renderConnectorsInspector() {
  const badge = document.getElementById('conn-count-badge');
  badge.textContent = String(state.connectors.length);

  const list = document.getElementById('connectors-list');
  list.innerHTML = '';
  const allNodes = collectNodes(state.root);
  const byId = new Map(allNodes.map((n) => [n.id, n]));

  if (!state.connectors.length) {
    list.innerHTML = '<div class="hint-text">No arrows or lines yet. Click <strong>+ Draw on Tree</strong> to connect two nodes.</div>';
  }

  state.connectors.forEach((c) => {
    const row = document.createElement('div');
    row.className = `item-row ${ui.selectedConnectorId === c.id ? 'active' : ''}`;
    const fn = nodeSummaryLabel(byId.get(c.fromId));
    const tn = nodeSummaryLabel(byId.get(c.toId));
    const shapeTag = c.routing === 'curved' ? '◠' : (c.routing === 'right-angle' ? '└┘' : '—');
    row.innerHTML = `<span>${shapeTag} ${fn} → ${tn}${c.label ? ` <em>(${c.label})</em>` : ''}</span>`;
    row.onclick = () => {
      ui.selectedConnectorId = c.id;
      renderAll();
    };
    list.appendChild(row);
  });

  const editor = document.getElementById('conn-editor');
  if (!ui.selectedConnectorId && state.connectors.length > 0) {
    ui.selectedConnectorId = state.connectors[0].id;
  }
  const conn = state.connectors.find((c) => c.id === ui.selectedConnectorId);
  if (!conn) {
    editor.classList.add('hidden');
    return;
  }
  editor.classList.remove('hidden');
  conn.routing = conn.routing || 'right-angle';

  const fromSel = document.getElementById('conn-from-select');
  const toSel = document.getElementById('conn-to-select');
  [fromSel, toSel].forEach((sel) => {
    sel.innerHTML = '';
    for (const n of allNodes) {
      const o = document.createElement('option');
      o.value = n.id;
      o.textContent = nodeSummaryLabel(n);
      sel.appendChild(o);
    }
  });
  fromSel.value = conn.fromId;
  toSel.value = conn.toId;
  fromSel.onchange = () => { conn.fromId = fromSel.value; commitState(); };
  toSel.onchange = () => { conn.toId = toSel.value; commitState(); };

  document.getElementById('conn-swap-btn').onclick = () => {
    [conn.fromId, conn.toId] = [conn.toId, conn.fromId];
    [conn.fromAnchor, conn.toAnchor] = [conn.toAnchor, conn.fromAnchor];
    [conn.fromYShift, conn.toYShift] = [conn.toYShift, conn.fromYShift];
    commitState();
  };
  document.getElementById('conn-delete-btn').onclick = () => {
    state.connectors = state.connectors.filter((x) => x.id !== conn.id);
    ui.selectedConnectorId = state.connectors[0]?.id || null;
    commitState();
  };

  // Style preset pills
  document.querySelectorAll('#conn-style-pills .pill-btn').forEach((btn) => {
    btn.onclick = () => {
      const p = btn.dataset.cpreset;
      if (p === 'mvt') {
        conn.arrowHead = '->'; conn.linePattern = 'solid'; conn.thickness = 'semithick';
      } else if (p === 'mvt-dashed') {
        conn.arrowHead = '->'; conn.linePattern = 'dashed'; conn.thickness = 'semithick';
      } else if (p === 'agree') {
        conn.arrowHead = 'o-o'; conn.linePattern = 'dotted'; conn.thickness = 'very thick';
      } else if (p === 'binding') {
        conn.arrowHead = 'o-o'; conn.linePattern = 'solid'; conn.thickness = 'semithick';
      } else if (p === 'dotted') {
        conn.arrowHead = '->'; conn.linePattern = 'dotted'; conn.thickness = 'thick';
      }
      commitState();
    };
  });

  // Routing segmented toggle
  document.querySelectorAll('#conn-routing-seg .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.routing === conn.routing);
    btn.onclick = () => {
      conn.routing = btn.dataset.routing;
      commitState();
    };
  });

  document.getElementById('conn-right-angle-opts').classList.toggle('hidden', conn.routing !== 'right-angle');
  document.getElementById('conn-curved-opts').classList.toggle('hidden', conn.routing !== 'curved');

  // Right angle controls (L-bend, 7-bend, U/C bends & flexible Drop/Height)
  const curRaMode = conn.raMode || (conn.direction === 'above' ? 'u-above' : conn.direction === 'side' ? 'l-bend' : 'u-below');
  document.querySelectorAll('#conn-ra-modes .pill-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.ramode === curRaMode);
    btn.onclick = () => {
      const m = btn.dataset.ramode;
      conn.raMode = m;
      const fm = ui.lastLayout?.meta?.get(conn.fromId)?.nodeBox;
      const tm = ui.lastLayout?.meta?.get(conn.toId)?.nodeBox;
      if (m === 'l-bend') {
        conn.direction = 'side';
        if (fm && tm) {
          conn.fromAnchor = tm.cy >= fm.cy ? 'south' : 'north';
          conn.toAnchor = tm.cx >= fm.cx ? 'west' : 'east';
        } else {
          conn.fromAnchor = 'south'; conn.toAnchor = 'west';
        }
      } else if (m === '7-bend') {
        conn.direction = 'side';
        if (fm && tm) {
          conn.fromAnchor = tm.cx >= fm.cx ? 'east' : 'west';
          conn.toAnchor = tm.cy >= fm.cy ? 'north' : 'south';
        } else {
          conn.fromAnchor = 'east'; conn.toAnchor = 'north';
        }
      } else if (m === 'u-below') {
        conn.direction = 'below'; conn.fromAnchor = 'south'; conn.toAnchor = 'south';
      } else if (m === 'u-above') {
        conn.direction = 'above'; conn.fromAnchor = 'north'; conn.toAnchor = 'north';
      } else if (m === 'c-left') {
        conn.direction = 'side'; conn.fromAnchor = 'west'; conn.toAnchor = 'west';
      } else if (m === 'c-right') {
        conn.direction = 'side'; conn.fromAnchor = 'east'; conn.toAnchor = 'east';
      }
      commitState();
    };
  });

  const dropWrap = document.getElementById('conn-drop-wrap');
  if (dropWrap) dropWrap.classList.toggle('hidden', curRaMode === 'l-bend' || curRaMode === '7-bend');

  const dropRange = document.getElementById('conn-drop-range');
  const dropNum = document.getElementById('conn-drop-num');
  const dropVal = document.getElementById('conn-drop-val');
  if (dropRange && dropNum && dropVal) {
    const curDrop = conn.dropDepth ?? 1.8;
    dropRange.value = Math.max(0, Math.min(10, curDrop));
    dropNum.value = curDrop;
    dropVal.textContent = String(curDrop);
    const applyDrop = (val, fromRange) => {
      const n = parseFloat(val);
      if (Number.isNaN(n)) return;
      conn.dropDepth = n;
      dropRange.value = Math.max(0, Math.min(10, n));
      if (fromRange) dropNum.value = n;
      dropVal.textContent = String(n);
      renderCanvasAndCode();
    };
    dropRange.oninput = () => applyDrop(dropRange.value, true);
    dropRange.onchange = () => commitState();
    dropNum.oninput = () => applyDrop(dropNum.value, false);
    dropNum.onchange = () => commitState();
  }

  const roundChk = document.getElementById('conn-rounded-chk');
  if (roundChk) {
    roundChk.checked = conn.roundedCorners !== false;
    roundChk.onchange = () => { conn.roundedCorners = roundChk.checked; commitState(); };
  }

  // Curved controls
  document.querySelectorAll('#conn-curve-presets .pill-btn').forEach((btn) => {
    btn.onclick = () => {
      const a = btn.dataset.carc;
      if (a === 'below') {
        conn.fromAnchor = 'south'; conn.toAnchor = 'south'; conn.outAngle = -100; conn.inAngle = -80; conn.looseness = 1.0;
      } else if (a === 'above') {
        conn.fromAnchor = 'north'; conn.toAnchor = 'north'; conn.outAngle = 100; conn.inAngle = 80; conn.looseness = 1.0;
      } else if (a === 'left') {
        conn.fromAnchor = 'west'; conn.toAnchor = 'west'; conn.outAngle = 180; conn.inAngle = 180; conn.looseness = 1.2;
      } else if (a === 'right') {
        conn.fromAnchor = 'east'; conn.toAnchor = 'east'; conn.outAngle = 0; conn.inAngle = 0; conn.looseness = 1.2;
      } else if (a === 'scurve') {
        conn.fromAnchor = 'east'; conn.toAnchor = 'west'; conn.outAngle = 0; conn.inAngle = 180; conn.looseness = 1.0;
      }
      commitState();
    };
  });

  const outR = document.getElementById('conn-out-range');
  const inR = document.getElementById('conn-in-range');
  const looseR = document.getElementById('conn-loose-range');
  outR.value = conn.outAngle ?? -90;
  inR.value = conn.inAngle ?? -90;
  looseR.value = conn.looseness ?? 1.0;
  document.getElementById('conn-out-val').textContent = String(outR.value);
  document.getElementById('conn-in-val').textContent = String(inR.value);
  document.getElementById('conn-loose-val').textContent = String(looseR.value);

  outR.oninput = () => { conn.outAngle = parseFloat(outR.value); document.getElementById('conn-out-val').textContent = outR.value; renderCanvasAndCode(); };
  outR.onchange = () => commitState();
  inR.oninput = () => { conn.inAngle = parseFloat(inR.value); document.getElementById('conn-in-val').textContent = inR.value; renderCanvasAndCode(); };
  inR.onchange = () => commitState();
  looseR.oninput = () => { conn.looseness = parseFloat(looseR.value); document.getElementById('conn-loose-val').textContent = looseR.value; renderCanvasAndCode(); };
  looseR.onchange = () => commitState();

  // Stroke / Anchors / Labels
  const ahSel = document.getElementById('conn-arrowhead');
  ahSel.value = conn.arrowHead || '->';
  ahSel.onchange = () => { conn.arrowHead = ahSel.value; commitState(); };

  const patSel = document.getElementById('conn-pattern');
  patSel.value = conn.linePattern || 'solid';
  patSel.onchange = () => { conn.linePattern = patSel.value; commitState(); };

  const thSel = document.getElementById('conn-thickness');
  thSel.value = conn.thickness || 'semithick';
  thSel.onchange = () => { conn.thickness = thSel.value; commitState(); };

  const faSel = document.getElementById('conn-from-anchor');
  const taSel = document.getElementById('conn-to-anchor');
  faSel.value = conn.fromAnchor || 'south';
  taSel.value = conn.toAnchor || 'south';
  faSel.onchange = () => { conn.fromAnchor = faSel.value; commitState(); };
  taSel.onchange = () => { conn.toAnchor = taSel.value; commitState(); };

  syncColorControl(
    document.getElementById('conn-color-select'),
    document.getElementById('conn-color-custom'),
    conn.color,
    (val) => { conn.color = val; commitState(); },
  );

  const fys = document.getElementById('conn-from-yshift');
  const tys = document.getElementById('conn-to-yshift');
  fys.value = conn.fromYShift ?? 0;
  tys.value = conn.toYShift ?? 0;
  fys.onchange = () => { conn.fromYShift = parseFloat(fys.value) || 0; commitState(); };
  tys.onchange = () => { conn.toYShift = parseFloat(tys.value) || 0; commitState(); };

  const lblInp = document.getElementById('conn-label-input');
  const lblPos = document.getElementById('conn-label-pos');
  const lblIt = document.getElementById('conn-label-italic');
  lblInp.value = conn.label || '';
  lblPos.value = conn.labelPos || 'below';
  lblIt.checked = conn.labelItalic !== false;
  lblInp.oninput = () => { conn.label = lblInp.value; renderCanvasAndCode(); };
  lblInp.onchange = () => commitState();
  lblPos.onchange = () => { conn.labelPos = lblPos.value; commitState(); };
  lblIt.onchange = () => { conn.labelItalic = lblIt.checked; commitState(); };
}

function renderBracketsAndCalloutsInspector() {
  const node = getSelectedNode();
  const brChk = document.getElementById('bracket-enable-chk');
  const brFields = document.getElementById('bracket-fields');
  brChk.disabled = !node;
  brChk.checked = Boolean(node && node.bracket);
  brFields.classList.toggle('hidden', !node || !node.bracket);

  brChk.onchange = () => {
    if (!node) return;
    node.bracket = brChk.checked
      ? { kind: 'brace', position: 'below', dottedGuides: true, guideHeight: 3, color: '', label: '' }
      : null;
    commitState();
  };

  if (node && node.bracket) {
    const b = node.bracket;
    const kindEl = document.getElementById('bracket-kind');
    const posEl = document.getElementById('bracket-pos');
    const lblEl = document.getElementById('bracket-label-input');
    const gChk = document.getElementById('bracket-guides-chk');
    const gWrap = document.getElementById('bracket-guide-height-wrap');
    const gRange = document.getElementById('bracket-guide-range');
    const gVal = document.getElementById('bracket-guide-val');

    kindEl.value = b.kind || 'brace';
    posEl.value = b.position || 'below';
    lblEl.value = b.label || '';
    gChk.checked = Boolean(b.dottedGuides);
    gRange.value = b.guideHeight ?? 3;
    gVal.textContent = String(gRange.value);
    gWrap.classList.toggle('hidden', !b.dottedGuides || b.kind === 'box');

    kindEl.onchange = () => { b.kind = kindEl.value; commitState(); };
    posEl.onchange = () => { b.position = posEl.value; commitState(); };
    lblEl.oninput = () => { b.label = lblEl.value; renderCanvasAndCode(); };
    lblEl.onchange = () => commitState();
    gChk.onchange = () => { b.dottedGuides = gChk.checked; commitState(); };
    gRange.oninput = () => { b.guideHeight = parseFloat(gRange.value); gVal.textContent = gRange.value; renderCanvasAndCode(); };
    gRange.onchange = () => commitState();

    syncColorControl(
      document.getElementById('bracket-color-select'),
      document.getElementById('bracket-color-custom'),
      b.color,
      (val) => { b.color = val; commitState(); },
    );
  }

  // Callouts
  const calList = document.getElementById('callouts-list');
  calList.innerHTML = '';
  const allNodes = collectNodes(state.root);
  const byId = new Map(allNodes.map((n) => [n.id, n]));

  if (!state.callouts.length) {
    calList.innerHTML = '<div class="hint-text">No callout notes yet.</div>';
  }
  state.callouts.forEach((cal) => {
    const row = document.createElement('div');
    row.className = `item-row ${ui.selectedCalloutId === cal.id ? 'active' : ''}`;
    row.textContent = `${cal.text} → ${nodeSummaryLabel(byId.get(cal.targetNodeId))}`;
    row.onclick = () => {
      ui.selectedCalloutId = cal.id;
      renderAll();
    };
    calList.appendChild(row);
  });

  const calEd = document.getElementById('callout-editor');
  const cal = state.callouts.find((c) => c.id === ui.selectedCalloutId);
  if (!cal) {
    calEd.classList.add('hidden');
    return;
  }
  calEd.classList.remove('hidden');

  const txtEl = document.getElementById('callout-text-input');
  const tgtEl = document.getElementById('callout-target-select');
  const sideEl = document.getElementById('callout-side');
  const oxEl = document.getElementById('callout-ox');
  const oyEl = document.getElementById('callout-oy');
  const arrEl = document.getElementById('callout-arrow-chk');
  const rtEl = document.getElementById('callout-routing');
  const outEl = document.getElementById('callout-out');
  const inEl = document.getElementById('callout-in');

  tgtEl.innerHTML = '';
  for (const n of allNodes) {
    const o = document.createElement('option');
    o.value = n.id;
    o.textContent = nodeSummaryLabel(n);
    tgtEl.appendChild(o);
  }

  txtEl.value = cal.text || '';
  tgtEl.value = cal.targetNodeId;
  sideEl.value = cal.relPos || 'left';
  oxEl.value = cal.offsetX ?? -1;
  oyEl.value = cal.offsetY ?? -4;
  arrEl.checked = cal.hasArrow !== false;
  rtEl.value = cal.routing || 'curved';
  outEl.value = cal.outAngle ?? 0;
  inEl.value = cal.inAngle ?? 225;
  document.getElementById('callout-curve-row').classList.toggle('hidden', cal.routing !== 'curved');

  txtEl.oninput = () => { cal.text = txtEl.value; renderCanvasAndCode(); };
  txtEl.onchange = () => commitState();
  tgtEl.onchange = () => { cal.targetNodeId = tgtEl.value; commitState(); };
  sideEl.onchange = () => { cal.relPos = sideEl.value; commitState(); };
  oxEl.onchange = () => { cal.offsetX = parseFloat(oxEl.value) || 0; commitState(); };
  oyEl.onchange = () => { cal.offsetY = parseFloat(oyEl.value) || 0; commitState(); };
  arrEl.onchange = () => { cal.hasArrow = arrEl.checked; commitState(); };
  rtEl.onchange = () => { cal.routing = rtEl.value; commitState(); };
  outEl.onchange = () => { cal.outAngle = parseFloat(outEl.value) || 0; commitState(); };
  inEl.onchange = () => { cal.inAngle = parseFloat(inEl.value) || 0; commitState(); };

  syncColorControl(
    document.getElementById('callout-color-select'),
    document.getElementById('callout-color-custom'),
    cal.color,
    (val) => { cal.color = val; commitState(); },
  );

  document.getElementById('callout-delete-btn').onclick = () => {
    state.callouts = state.callouts.filter((x) => x.id !== cal.id);
    ui.selectedCalloutId = state.callouts[0]?.id || null;
    commitState();
  };
}

function renderTreeSettingsInspector() {
  const sSel = document.getElementById('tree-ssep-select');
  const lSel = document.getElementById('tree-lsep-select');
  sSel.value = state.treeOptions?.sSep || '0em';
  lSel.value = state.treeOptions?.lSep || '1em';
  sSel.onchange = () => {
    state.treeOptions.sSep = sSel.value;
    commitState();
  };
  lSel.onchange = () => {
    state.treeOptions.lSep = lSel.value;
    commitState();
  };

  renderSavedTreesList();
}

function renderSavedTreesList() {
  const wrap = document.getElementById('saved-trees-list');
  wrap.innerHTML = '';
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(SAVED_TREES_KEY) || '[]');
  } catch {}
  if (!saved.length) {
    wrap.innerHTML = '<div class="hint-text">No saved trees yet.</div>';
    return;
  }
  saved.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const title = document.createElement('span');
    title.textContent = entry.title;
    const btns = document.createElement('div');
    btns.className = 'fmt-group';
    const loadB = document.createElement('button');
    loadB.className = 'btn-mini';
    loadB.textContent = 'Load';
    loadB.onclick = () => {
      state = entry.data;
      ui.selectedNodeId = state.root.id;
      ui.selectedConnectorId = state.connectors[0]?.id || null;
      commitState();
      setTimeout(fitToView, 20);
    };
    const delB = document.createElement('button');
    delB.className = 'btn-mini btn-mini-danger';
    delB.textContent = '✕';
    delB.onclick = () => {
      saved.splice(idx, 1);
      localStorage.setItem(SAVED_TREES_KEY, JSON.stringify(saved));
      renderSavedTreesList();
    };
    btns.append(loadB, delB);
    row.append(title, btns);
    wrap.appendChild(row);
  });
}

// ---------- RENDER ALL ----------
function renderAll() {
  ui.lastLayout = renderTreeSvg(svg, state, ui);
  applyTransform();
  latexOutput.textContent = generateForestLatex(state);
  renderNodeInspector();
  renderConnectorsInspector();
  renderBracketsAndCalloutsInspector();
  renderTreeSettingsInspector();
}

// ---------- CANVAS INTERACTIONS ----------
function screenToWorld(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  return {
    x: (clientX - rect.left - ui.panX) / ui.zoom,
    y: (clientY - rect.top - ui.panY) / ui.zoom,
  };
}

function setupCanvasInteractions() {
  let panning = false;
  let panStart = { x: 0, y: 0, ox: 0, oy: 0 };

  svg.addEventListener('mousedown', (e) => {
    const nodeGrp = e.target.closest('.svg-node-group');
    const connGrp = e.target.closest('[data-connector-id]');
    const calGrp = e.target.closest('[data-callout-id]');

    if (nodeGrp) {
      const nid = nodeGrp.getAttribute('data-node-id');
      if (ui.mode === 'connect') {
        e.stopPropagation();
        if (!ui.connectSourceId) {
          ui.connectSourceId = nid;
          document.getElementById('connect-banner-text').innerHTML =
            'Now click the <strong>target node</strong> where the arrow ends…';
          renderAll();
        } else {
          // Create new connector
          const srcNode = findNode(state.root, ui.connectSourceId);
          const dstNode = findNode(state.root, nid);
          const conn = makeConnector(ui.connectSourceId, nid, {
            fromYShift: srcNode?.bracket && srcNode.bracket.position !== 'above' ? -8 : 0,
            toYShift: dstNode?.bracket && dstNode.bracket.position !== 'above' ? -8 : 0,
          });
          state.connectors.push(conn);
          ui.selectedConnectorId = conn.id;
          setMode('select');
          switchTab('connectors');
          commitState();
        }
        return;
      }

      ui.selectedNodeId = nid;
      renderAll();
      return;
    }

    if (connGrp && ui.mode === 'select') {
      ui.selectedConnectorId = connGrp.getAttribute('data-connector-id');
      switchTab('connectors');
      renderAll();
      return;
    }

    if (calGrp && ui.mode === 'select') {
      ui.selectedCalloutId = calGrp.getAttribute('data-callout-id');
      switchTab('brackets');
      renderAll();
      return;
    }

    // Pan background
    if (e.button === 0) {
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, ox: ui.panX, oy: ui.panY };
      svg.classList.add('panning');
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (panning) {
      ui.panX = panStart.ox + (e.clientX - panStart.x);
      ui.panY = panStart.oy + (e.clientY - panStart.y);
      applyTransform();
    } else if (ui.mode === 'connect' && ui.connectSourceId) {
      ui.mouseWorldPt = screenToWorld(e.clientX, e.clientY);
      ui.lastLayout = renderTreeSvg(svg, state, ui);
    }
  });

  window.addEventListener('mouseup', () => {
    if (panning) {
      panning = false;
      svg.classList.remove('panning');
    }
  });

  svg.addEventListener('dblclick', (e) => {
    const nodeGrp = e.target.closest('.svg-node-group');
    if (!nodeGrp || ui.mode !== 'select') return;
    const nid = nodeGrp.getAttribute('data-node-id');
    const node = findNode(state.root, nid);
    const m = ui.lastLayout?.meta.get(nid);
    if (!node || !m) return;

    inlinePop.style.left = `${m.nodeBox.cx * ui.zoom + ui.panX}px`;
    inlinePop.style.top = `${m.nodeBox.cy * ui.zoom + ui.panY}px`;
    inlineInput.value = node.lines[0]?.text || '';
    inlinePop.classList.remove('hidden');
    inlineInput.focus();
    inlineInput.select();

    const finish = (save) => {
      inlinePop.classList.add('hidden');
      if (save) {
        if (!node.lines.length) node.lines.push(makeLine(inlineInput.value));
        else node.lines[0].text = inlineInput.value;
        commitState();
      }
      inlineInput.onkeydown = null;
      document.getElementById('inline-edit-ok').onclick = null;
    };

    inlineInput.onkeydown = (ev) => {
      if (ev.key === 'Enter') finish(true);
      if (ev.key === 'Escape') finish(false);
    };
    document.getElementById('inline-edit-ok').onclick = () => finish(true);
  });

  canvasWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.09 : 0.91;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const nextZoom = Math.max(0.28, Math.min(2.6, ui.zoom * factor));
    ui.panX = mx - ((mx - ui.panX) / ui.zoom) * nextZoom;
    ui.panY = my - ((my - ui.panY) / ui.zoom) * nextZoom;
    ui.zoom = nextZoom;
    applyTransform();
  }, { passive: false });
}

// ---------- BUTTONS & MODALS ----------
function wireEvents() {
  // Mode buttons
  document.getElementById('mode-select-btn').onclick = () => setMode('select');
  document.getElementById('mode-connect-btn').onclick = () => setMode('connect');
  document.getElementById('connect-cancel-btn').onclick = () => setMode('select');
  document.getElementById('conn-draw-mode-btn').onclick = () => setMode('connect');

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.onclick = () => switchTab(b.dataset.tab);
  });

  // Left palette node actions
  document.getElementById('act-add-child').onclick = () => ui.selectedNodeId && addChildNode(ui.selectedNodeId, 'XP');
  document.getElementById('act-insert-parent').onclick = () => ui.selectedNodeId && doInsertParent(ui.selectedNodeId, 'XP');
  document.getElementById('act-add-sib-left').onclick = () => ui.selectedNodeId && addSibling(ui.selectedNodeId, 'left');
  document.getElementById('act-add-sib-right').onclick = () => ui.selectedNodeId && addSibling(ui.selectedNodeId, 'right');
  document.getElementById('act-move-left').onclick = () => ui.selectedNodeId && moveSibling(ui.selectedNodeId, -1);
  document.getElementById('act-move-right').onclick = () => ui.selectedNodeId && moveSibling(ui.selectedNodeId, 1);
  document.getElementById('act-dup-node').onclick = () => ui.selectedNodeId && duplicateNode(ui.selectedNodeId);
  document.getElementById('act-del-node').onclick = deleteSelectedNode;
  document.getElementById('act-del-keep-children').onclick = unwrapSelectedNode;

  // Floating bar
  nodeFloatBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !ui.selectedNodeId) return;
    const node = getSelectedNode();
    if (!node) return;
    const act = btn.dataset.q;
    if (act === 'child') addChildNode(node.id, 'XP');
    else if (act === 'parent') doInsertParent(node.id, 'XP');
    else if (act === 'arrow') {
      setMode('connect');
      ui.connectSourceId = node.id;
      document.getElementById('connect-banner-text').innerHTML =
        'Click the <strong>target node</strong> where the arrow ends…';
      renderAll();
    } else if (act === 'brace') {
      node.bracket = node.bracket ? null : { kind: 'brace', position: 'below', dottedGuides: true, guideHeight: 3, color: '', label: '' };
      commitState();
    } else if (act === 'roof') {
      node.edgeStyle = node.edgeStyle === 'roof' ? 'solid' : 'roof';
      commitState();
    } else if (act === 'unpronounced') {
      node.unpronounced = !node.unpronounced;
      commitState();
    } else if (act === 'delete') {
      deleteSelectedNode();
    }
  });

  // Add lines & features
  document.getElementById('add-line-btn').onclick = () => {
    const node = getSelectedNode();
    if (!node) return;
    node.lines.push(makeLine('word'));
    commitState();
  };
  document.getElementById('add-feature-btn').onclick = () => {
    const node = getSelectedNode();
    if (!node) return;
    node.lines.push(makeFeatureLine('d', 'mf', false));
    commitState();
  };

  // Manual connector & callout buttons
  document.getElementById('conn-add-manual-btn').onclick = () => {
    const nodes = collectNodes(state.root);
    if (nodes.length < 2) return;
    const fromId = ui.selectedNodeId || nodes[0].id;
    const toId = nodes.find((n) => n.id !== fromId)?.id || nodes[0].id;
    const conn = makeConnector(fromId, toId);
    state.connectors.push(conn);
    ui.selectedConnectorId = conn.id;
    commitState();
  };

  document.getElementById('callout-add-btn').onclick = () => {
    const tid = ui.selectedNodeId || state.root.id;
    const cal = makeCallout(tid, '\\textit{do}-support');
    state.callouts.push(cal);
    ui.selectedCalloutId = cal.id;
    switchTab('brackets');
    commitState();
  };

  // Undo / Redo
  document.getElementById('undo-btn').onclick = () => {
    const prev = history.undo();
    if (prev) { state = prev; ui.selectedNodeId = state.root.id; commitState(true); }
  };
  document.getElementById('redo-btn').onclick = () => {
    const next = history.redo();
    if (next) { state = next; ui.selectedNodeId = state.root.id; commitState(true); }
  };

  // Presets
  const presetSel = document.getElementById('preset-select');
  presetSel.onchange = () => {
    if (!presetSel.value) return;
    state = buildPreset(presetSel.value);
    ui.selectedNodeId = state.root.id;
    ui.selectedConnectorId = state.connectors[0]?.id || null;
    ui.selectedCalloutId = state.callouts[0]?.id || null;
    commitState();
    setTimeout(fitToView, 20);
    presetSel.value = '';
  };

  // Zoom / Grid
  document.getElementById('zoom-in-btn').onclick = () => { ui.zoom = Math.min(2.6, ui.zoom * 1.15); applyTransform(); };
  document.getElementById('zoom-out-btn').onclick = () => { ui.zoom = Math.max(0.28, ui.zoom * 0.87); applyTransform(); };
  document.getElementById('zoom-fit-btn').onclick = fitToView;
  document.getElementById('toggle-grid-btn').onclick = (e) => {
    ui.showGrid = !ui.showGrid;
    e.currentTarget.classList.toggle('active', ui.showGrid);
    document.getElementById('svg-bg').setAttribute('fill', ui.showGrid ? 'url(#draft-grid)' : '#fcfdff');
  };

  // Copy & Download LaTeX
  async function copyLatex() {
    const txt = generateForestLatex(state);
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const toast = document.getElementById('copy-toast');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 1800);
  }
  document.getElementById('copy-latex-top-btn').onclick = copyLatex;
  document.getElementById('drawer-copy-btn').onclick = copyLatex;

  document.getElementById('drawer-download-btn').onclick = () => {
    const blob = new Blob([generateForestLatex(state) + '\n'], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'syntax-tree.tex';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById('drawer-toggle-btn').onclick = (e) => {
    const drawer = document.getElementById('latex-drawer');
    const collapsed = drawer.classList.toggle('collapsed');
    e.currentTarget.textContent = collapsed ? '▴' : '▾';
  };

  // Export SVG
  document.getElementById('export-svg-btn').onclick = () => {
    const clone = svg.cloneNode(true);
    clone.querySelector('#svg-bg')?.remove();
    clone.querySelector('#layer-overlay')?.remove();
    const { bounds } = ui.lastLayout;
    clone.setAttribute('viewBox', `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`);
    clone.querySelector('#viewport-group').removeAttribute('transform');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `.svg-text-line{font-family:"Linux Libertine O","Georgia",serif;font-size:15px;text-anchor:middle;dominant-baseline:central}.svg-node-bg{fill:none;stroke:none}.svg-connector-sel,.svg-connector-hit{display:none}`;
    clone.prepend(style);
    const data = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'syntax-tree.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Import modal
  const importModal = document.getElementById('import-modal');
  const openImport = () => {
    document.getElementById('import-textarea').value = generateForestLatex(state);
    document.getElementById('import-error').classList.add('hidden');
    importModal.classList.remove('hidden');
  };
  document.getElementById('import-btn').onclick = openImport;
  document.getElementById('drawer-import-btn').onclick = openImport;
  document.getElementById('import-close-btn').onclick = () => importModal.classList.add('hidden');
  document.getElementById('import-cancel-btn').onclick = () => importModal.classList.add('hidden');
  document.getElementById('import-confirm-btn').onclick = () => {
    try {
      const parsed = parseForestLatex(document.getElementById('import-textarea').value);
      state = parsed;
      ui.selectedNodeId = state.root.id;
      ui.selectedConnectorId = state.connectors[0]?.id || null;
      importModal.classList.add('hidden');
      commitState();
      setTimeout(fitToView, 20);
    } catch (err) {
      const errBox = document.getElementById('import-error');
      errBox.textContent = err.message || String(err);
      errBox.classList.remove('hidden');
    }
  };

  // Help modal
  const helpModal = document.getElementById('help-modal');
  document.getElementById('help-btn').onclick = () => helpModal.classList.remove('hidden');
  document.getElementById('help-close-btn').onclick = () => helpModal.classList.add('hidden');

  // Save tree
  document.getElementById('save-tree-btn').onclick = () => {
    const title = prompt('Name for this saved syntax tree:', nodeSummaryLabel(state.root));
    if (!title) return;
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(SAVED_TREES_KEY) || '[]'); } catch {}
    saved.unshift({ title, data: JSON.parse(JSON.stringify(state)) });
    localStorage.setItem(SAVED_TREES_KEY, JSON.stringify(saved.slice(0, 25)));
    renderSavedTreesList();
  };

  // Optional local pdflatex compile preview
  const compileBtn = document.getElementById('compile-pdf-btn');
  const pdfModal = document.getElementById('pdf-modal');
  document.getElementById('pdf-close-btn').onclick = () => pdfModal.classList.add('hidden');

  fetch('/api/health').then((r) => (r.ok ? r.json() : null)).then((info) => {
    if (info && info.pdflatex) {
      compileBtn.classList.remove('hidden');
      compileBtn.onclick = async () => {
        pdfModal.classList.remove('hidden');
        const status = document.getElementById('pdf-status');
        const wrap = document.getElementById('pdf-preview-wrap');
        const logBox = document.getElementById('pdf-log-box');
        status.textContent = 'Compiling LaTeX with pdflatex…';
        wrap.innerHTML = '';
        logBox.classList.add('hidden');
        try {
          const resp = await fetch('/api/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latex: generateForestLatex(state) }),
          });
          const res = await resp.json();
          if (res.ok && res.imageBase64) {
            status.textContent = 'Compiled successfully with pdflatex + forest [linguistics].';
            const img = document.createElement('img');
            img.src = `data:image/png;base64,${res.imageBase64}`;
            wrap.appendChild(img);
          } else {
            status.textContent = 'LaTeX compilation failed.';
            logBox.textContent = res.log || res.error || 'Unknown error';
            logBox.classList.remove('hidden');
          }
        } catch (err) {
          status.textContent = 'Could not reach local compile endpoint.';
          logBox.textContent = String(err);
          logBox.classList.remove('hidden');
        }
      };
    }
  }).catch(() => {});

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement?.tagName;
    const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      if (isTyping) return;
      e.preventDefault();
      if (e.shiftKey) document.getElementById('redo-btn').click();
      else document.getElementById('undo-btn').click();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      if (isTyping) return;
      e.preventDefault();
      document.getElementById('redo-btn').click();
      return;
    }

    if (e.key === 'Escape') {
      if (ui.mode === 'connect') setMode('select');
      importModal.classList.add('hidden');
      helpModal.classList.add('hidden');
      pdfModal.classList.add('hidden');
      inlinePop.classList.add('hidden');
      return;
    }

    if (isTyping) return;

    if (e.key === 'Enter' && ui.selectedNodeId) {
      e.preventDefault();
      addChildNode(ui.selectedNodeId, 'XP');
    } else if (e.key.toLowerCase() === 'p' && ui.selectedNodeId) {
      e.preventDefault();
      doInsertParent(ui.selectedNodeId, 'XP');
    } else if (e.key.toLowerCase() === 'c') {
      e.preventDefault();
      setMode(ui.mode === 'connect' ? 'select' : 'connect');
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedNodeId) {
      e.preventDefault();
      deleteSelectedNode();
    }
  });
}

// ---------- INIT ----------
function init() {
  populateColorSelect(document.getElementById('node-color-select'));
  populateColorSelect(document.getElementById('node-edge-color-select'));
  populateColorSelect(document.getElementById('conn-color-select'));
  populateColorSelect(document.getElementById('bracket-color-select'));
  populateColorSelect(document.getElementById('callout-color-select'));

  buildPalettes();
  setupCanvasInteractions();
  wireEvents();

  let loaded = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) loaded = JSON.parse(raw);
  } catch {}

  state = loaded && loaded.root ? loaded : buildPreset('ex13');
  ui.selectedNodeId = state.root.id;
  ui.selectedConnectorId = state.connectors[0]?.id || null;
  ui.selectedCalloutId = state.callouts[0]?.id || null;

  commitState();
  requestAnimationFrame(() => fitToView());
}

init();
