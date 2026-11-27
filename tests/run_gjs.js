import { buildPreset } from '../js/presets.js';
import { generateForestLatex } from '../js/latex-gen.js';
import { parseForestLatex } from '../js/forest-parser.js';
import { renderTreeSvg } from '../js/renderer.js';
import {
  makeNode,
  makeConnector,
  makeCallout,
  insertParentAbove,
  deleteNodeById,
  unwrapNodeById,
  hexToTikzRgb,
} from '../js/state.js';

// Minimal SVG DOM mock for GJS verification of renderer.js
function makeMockEl(tag) {
  const attrs = {};
  const children = [];
  let text = '';
  const el = {
    tagName: tag,
    children,
    setAttribute(k, v) { attrs[k] = v; },
    getAttribute(k) { return attrs[k]; },
    appendChild(ch) { children.push(ch); return ch; },
    remove() {},
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        if (attrs.id === id) return el;
      } else if (tag === sel) {
        return el;
      }
      for (const c of children) {
        if (c.querySelector) {
          const f = c.querySelector(sel);
          if (f) return f;
        }
      }
      return null;
    },
    querySelectorAll() { return []; },
    set innerHTML(v) { if (v === '') children.length = 0; },
    get textContent() { return text; },
    set textContent(v) { text = v; },
  };
  return el;
}

globalThis.document = {
  createElementNS(_ns, tag) { return makeMockEl(tag); },
  createTextNode(t) { return { nodeType: 3, textContent: t }; },
};

function makeMockSvg() {
  const svg = makeMockEl('svg');
  const defs = makeMockEl('defs');
  svg.appendChild(defs);
  for (const id of ['layer-brackets', 'layer-edges', 'layer-nodes', 'layer-connectors', 'layer-callouts', 'layer-overlay']) {
    const g = makeMockEl('g');
    g.setAttribute('id', id);
    svg.appendChild(g);
  }
  return svg;
}

const out = { passed: [], failed: [], snippets: {} };
function assert(cond, msg) {
  if (!cond) out.failed.push(msg);
  else out.passed.push(msg);
}

const svg = makeMockSvg();
const presetKeys = ['blank', 'ex11', 'ex12', 'ex13', 'ex14', 'ex15', 'wh_roof', 'agree_bind'];

for (const key of presetKeys) {
  const st = buildPreset(key);
  const layout = renderTreeSvg(svg, st, { mode: 'select', selectedNodeId: st.root.id });
  assert(layout.meta.size >= 3, `Preset ${key} layout nodes=${layout.meta.size}`);
  assert(Number.isFinite(layout.bounds.width) && layout.bounds.width > 0, `Preset ${key} valid bounds`);

  const latex = generateForestLatex(st);
  assert(latex.startsWith('\\begin{forest}'), `Preset ${key} starts with \\begin{forest}`);
  assert(latex.endsWith('\\end{forest}'), `Preset ${key} ends with \\end{forest}`);

  const parsed = parseForestLatex(latex);
  assert(Boolean(parsed.root), `Preset ${key} round-trip parsed`);
  const reLatex = generateForestLatex(parsed);
  assert(reLatex.startsWith('\\begin{forest}') && reLatex.endsWith('\\end{forest}'), `Preset ${key} re-generated`);

  out.snippets[key] = latex;
}

// Custom mutations: hex colors, strikethrough, curved & right-angle arrows (with outAngle/inAngle/dropDepth/inDepth), per-branch sSep/lSep, brackets, callout, insertParentAbove, unwrap
const custom = buildPreset('blank');
const childA = custom.root.children[0];
const childB = custom.root.children[1];
childA.nodeColor = '#2563eb';
childA.lines[0].strike = true;
childA.lines[0].smallCaps = true;
childA.lines[0].color = '#c0392b';
childB.sSep = '2.5em';
childB.lSep = '1.75em';
childB.sepScope = 'children';
childB.bracket = { kind: 'square', position: 'below', dottedGuides: true, guideHeight: 2.5, color: 'teal', label: 'TP domain' };
childB.children[0].bracket = { kind: 'box', boxStyle: 'solid', position: 'below', dottedGuides: false, guideHeight: 3, color: 'orange', label: '' };
// Empty intermediate junction node (removing all lines/features yields [, coordinate ...])
const emptyJunc = makeNode([], [makeNode('Spec'), makeNode('Compl')]);
custom.root.children[0].children.push(emptyJunc);
const insertedId = insertParentAbove(custom, childA.id, 'ForceP');
assert(Boolean(insertedId), 'insertParentAbove worked');
custom.connectors.push(makeConnector(childA.id, childB.id, {
  routing: 'curved', outAngle: -100, inAngle: -80, looseness: 1.2,
  arrowHead: 'o->', linePattern: 'dashed', color: '#7c3aed', blocked: true, label: 'Curved Link',
}));
custom.connectors.push(makeConnector(childA.id, childB.children[0].id, {
  routing: 'right-angle', raMode: 'l-bend',
  fromAnchor: 'south', toAnchor: 'west', arrowHead: '->', color: 'blue',
}));
custom.connectors.push(makeConnector(childA.id, childB.children[1].id, {
  routing: 'right-angle', raMode: '7-bend',
  fromAnchor: 'east', toAnchor: 'north', arrowHead: '->', color: 'teal',
}));
custom.connectors.push(makeConnector(childB.children[1].id, childA.id, {
  routing: 'right-angle', raMode: 'c-left', dropDepth: 3.25,
  fromAnchor: 'west', toAnchor: 'west', arrowHead: '->', linePattern: 'dotted',
}));
custom.callouts.push(makeCallout(childB.id, '\\textit{note}', {
  relPos: 'right', offsetX: 1, offsetY: -2, routing: 'right-angle', color: 'orange',
}));

const customLayout = renderTreeSvg(svg, custom, { mode: 'select', selectedNodeId: childA.id });
assert(customLayout.meta.size >= 4, 'Custom layout rendered');

// Verify per-branch positive and negative sSep both reflect in SVG X-positions
const tpKids = childB.children;
const gapBase = customLayout.meta.get(tpKids[1].id).x - customLayout.meta.get(tpKids[0].id).x;
childB.sSep = '0em';
const lZero = renderTreeSvg(svg, custom, { mode: 'select', selectedNodeId: childB.id });
const gapZero = lZero.meta.get(tpKids[1].id).x - lZero.meta.get(tpKids[0].id).x;
childB.sSep = '-1em';
const lNeg = renderTreeSvg(svg, custom, { mode: 'select', selectedNodeId: childB.id });
const gapNeg = lNeg.meta.get(tpKids[1].id).x - lNeg.meta.get(tpKids[0].id).x;
assert(gapBase > gapZero && gapZero > gapNeg, `Per-branch sSep SVG gaps: 2.5em=${gapBase} > 0em=${gapZero} > -1em=${gapNeg}`);
childB.sSep = '2.5em';
renderTreeSvg(svg, custom, { mode: 'select', selectedNodeId: childA.id });

const customLatex = generateForestLatex(custom);
assert(customLatex.startsWith('\\begin{forest}') && customLatex.endsWith('\\end{forest}'), 'Custom tree strictly forest block');
assert(customLatex.includes('s sep=2.5em') && customLatex.includes('l sep=1.75em'), 'Per-branch s sep and l sep emitted');
assert(customLatex.includes('\\textsc{'), 'Small caps \\textsc{} emitted');
assert(customLatex.includes('rectangle') && customLatex.includes('rounded corners=3pt'), 'Constituent box emitted');
assert(customLatex.includes(') |- (') && customLatex.includes(') -| ('), 'Right-angle L-bend and 7-bend emitted');
assert(customLatex.includes('++(-3.25em, 0) |-'), 'Right-angle left C-route emitted');
assert(customLatex.includes('[, coordinate'), 'Empty intermediate node emits [, coordinate');
assert(customLatex.includes('*->'), 'Dot-to-arrow *-> emitted');
assert(customLatex.includes('{\\nej}'), 'Blocked cross \\nej emitted');
assert(/to\[out=-100, in=-80[^\]]*\][\s\S]*node \[pos=0\.5[^\]]*\] \{\\nej\}[\s\S]*node \[pos=0\.5[^\]]*\] \{Curved Link\} \(/.test(customLatex), 'Blocked cross and curved label placed before target coord');
const parsedCustom = parseForestLatex(customLatex);
assert(parsedCustom.root.children[1].sSep === '2.5em', 'Per-branch sSep round-tripped');
assert(parsedCustom.root.children[0].children[0].lines[0].smallCaps === true, 'Small caps round-tripped');
assert(parsedCustom.connectors.some((c) => c.routing === 'curved' && c.arrowHead === 'o->' && c.blocked === true && c.label === 'Curved Link'), 'Dot-to-arrow, blocked cross, and curved arrow label round-tripped');
const parsedJunc = parsedCustom.root.children[0].children[0].children.find((n) => n.children.length === 2);
assert(Boolean(parsedJunc) && parsedJunc.lines.length === 0, 'Empty coordinate junction round-tripped');
out.snippets.custom_mutations = customLatex;

const mix = hexToTikzRgb('#2563eb');
assert(!mix.includes(',') && mix.includes('!'), `hexToTikzRgb valid xcolor mix: ${mix}`);

// Test unwrap & delete
const delTarget = custom.root.children[1].children[0];
assert(Boolean(unwrapNodeById(custom, insertedId)), 'unwrapNodeById worked');
assert(Boolean(deleteNodeById(custom, delTarget.id)), 'deleteNodeById worked');

print(JSON.stringify(out));
