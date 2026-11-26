import { makeNode, makeLine, makeFeatureLine, makeConnector, makeCallout } from './state.js?v=20261125d';

export function buildPreset(key) {
  switch (key) {
    case 'blank': {
      const root = makeNode('CP', [
        makeNode([makeLine('C'), makeLine('$\\emptyset$')]),
        makeNode('TP', [
          makeNode('DP', [makeNode([makeLine('D'), makeLine('the')]), makeNode([makeLine('N'), makeLine('student')])]),
          makeNode('\\xbar{T}', [
            makeNode([makeLine('T'), makeLine('\\past')]),
            makeNode('VP', [makeNode([makeLine('V'), makeLine('drew')]), makeNode('DP', [makeNode([makeLine('D'), makeLine('a')]), makeNode([makeLine('N'), makeLine('tree')])])]),
          ]),
        ]),
      ]);
      return {
        treeOptions: { sSep: '0.25em', lSep: '1em' },
        root,
        connectors: [],
        callouts: [],
      };
    }

    case 'ex11': {
      // instructions.tex lines 359-374: I have drawn a tree
      const tbar = makeNode('\\xbar{T}', [
        makeNode([makeLine('T'), makeLine('have'), makeFeatureLine('v', 'mf', true), makeFeatureLine('d', 'mf', false)]),
        makeNode('VP', [
          makeNode([makeLine('V'), makeLine('drawn'), makeFeatureLine('d', 'mf', true)]),
          makeNode('DP', [
            makeNode([makeLine('D'), makeLine('a'), makeFeatureLine('n', 'mf', true)]),
            makeNode([makeLine('N'), makeLine('tree')]),
          ]),
        ]),
      ], {
        name: 'Tbar',
        projFeature: { featureKind: 'mf', text: 'd', satisfied: true },
      });
      const root = makeNode('TP', [
        makeNode([makeLine('D'), makeLine('I')]),
        tbar,
      ]);
      return {
        treeOptions: { sSep: '0em', lSep: '1em' },
        root,
        connectors: [],
        callouts: [],
      };
    }

    case 'ex12': {
      // instructions.tex lines 379-399: Everyone should eat kale.
      const root = makeNode('CP', [
        makeNode([makeLine('C'), makeLine('$\\emptyset$')]),
        makeNode('TP', [
          makeNode('DP', [
            makeNode([makeLine('D'), makeLine('every')]),
            makeNode([makeLine('N'), makeLine('-one')]),
          ]),
          makeNode('\\xbar{T}', [
            makeNode([makeLine('T'), makeLine('should')]),
            makeNode('VP', [
              makeNode([makeLine('V'), makeLine('eat')]),
              makeNode('DP', [
                makeNode([makeLine('D'), makeLine('$\\emptyset$')]),
                makeNode([makeLine('N'), makeLine('kale')]),
              ]),
            ]),
          ]),
        ]),
      ]);
      return {
        treeOptions: { sSep: '0em', lSep: '1em' },
        root,
        connectors: [],
        callouts: [],
      };
    }

    case 'ex13': {
      // instructions.tex lines 404-445: Affix Hopping
      const tNode = makeNode([
        makeLine('T'),
        makeLine('\\past'),
        makeFeatureLine('aux', 'hf', true),
        makeFeatureLine('neg', 'hf', true),
      ], [], { name: 'T' });

      const vNode = makeNode([makeLine('V'), makeLine('think')], [], { name: 'V' });

      const root = makeNode('CP', [
        makeNode([makeLine('C'), makeLine('$\\emptyset$')]),
        makeNode('TP', [
          makeNode('DP', [
            makeNode([makeLine('D'), makeLine('the')]),
            makeNode([makeLine('N'), makeLine('cat')]),
          ]),
          makeNode('\\xbar{T}', [
            tNode,
            makeNode('VP', [
              vNode,
              makeNode('CP', [
                makeNode([makeLine('C'), makeLine('that')]),
                makeNode('TP', [
                  makeNode('DP', [
                    makeNode([makeLine('D'), makeLine('the')]),
                    makeNode([makeLine('N'), makeLine('dog')]),
                  ]),
                  makeNode('\\xbar{T}', [
                    makeNode([makeLine('T'), makeLine('should')]),
                    makeNode('VP', [
                      makeNode([makeLine('V'), makeLine('stay')]),
                      makeNode('PP', [
                        makeNode([makeLine('P'), makeLine('in')]),
                        makeNode('DP', [
                          makeNode([makeLine('D'), makeLine('the')]),
                          makeNode([makeLine('N'), makeLine('yard')]),
                        ]),
                      ]),
                    ]),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]);

      return {
        treeOptions: { sSep: '0.5em', lSep: '1em' },
        root,
        connectors: [
          makeConnector(tNode.id, vNode.id, {
            stylePreset: 'mvt-dashed',
            routing: 'right-angle',
            direction: 'below',
            dropDepth: 2,
            linePattern: 'dashed',
            arrowHead: '->',
            label: 'Affix Hopping',
            labelPos: 'below',
            labelItalic: true,
            labelFraction: 0.25,
          }),
        ],
        callouts: [],
      };
    }

    case 'ex14': {
      // instructions.tex lines 450-506: Hasn't the package arrived?
      const tinC = makeNode('T', [
        makeNode('T', [
          makeNode([makeLine('T'), makeLine('\\pres'), makeFeatureLine('aux', 'hf', true), makeFeatureLine('neg', 'hf', true)]),
          makeNode([makeLine('Aux'), makeLine('have')]),
        ]),
        makeNode([makeLine('Neg'), makeLine("n't")]),
      ], {
        name: 'TinC',
        bracket: { kind: 'brace', position: 'below', dottedGuides: true, guideHeight: 3, color: '', label: '' },
      });

      const auxT = makeNode([makeLine('Aux'), makeLine('have', { strike: true })], [], { name: 'AuxT' });
      const negT = makeNode([makeLine('Neg'), makeLine("n't", { strike: true })], [], { name: 'NegT' });

      const tSub = makeNode('T', [
        makeNode('T', [
          makeNode([makeLine('T'), makeLine('\\pres', { strike: true }), makeFeatureLine('aux', 'hf', true), makeFeatureLine('neg', 'hf', true)]),
          auxT,
        ]),
        negT,
      ], {
        name: 'T',
        unpronounced: true,
        bracket: { kind: 'brace', position: 'below', dottedGuides: true, guideHeight: 3, color: '', label: '' },
      });

      const negLow = makeNode([makeLine('Neg'), makeLine("n't", { strike: true })], [], { name: 'Neg', unpronounced: true });
      const auxLow = makeNode([makeLine('Aux'), makeLine('have', { strike: true })], [], { name: 'Aux', unpronounced: true });

      const root = makeNode('CP', [
        makeNode('C', [
          makeNode([makeLine('C'), makeLine('$\\emptyset$'), makeFeatureLine('t', 'hf', true)]),
          tinC,
        ]),
        makeNode('TP', [
          makeNode('DP', [
            makeNode([makeLine('D'), makeLine('the')]),
            makeNode([makeLine('N'), makeLine('package')]),
          ]),
          makeNode('\\xbar{T}', [
            tSub,
            makeNode('NegP', [
              negLow,
              makeNode('AuxP', [
                auxLow,
                makeNode([makeLine('V'), makeLine('arrived')]),
              ]),
            ]),
          ]),
        ]),
      ]);

      return {
        treeOptions: { sSep: '0pt', lSep: '1em' },
        root,
        connectors: [
          makeConnector(auxLow.id, auxT.id, {
            routing: 'right-angle',
            direction: 'below',
            dropDepth: 1,
            arrowHead: '->',
            linePattern: 'solid',
          }),
          makeConnector(negLow.id, negT.id, {
            routing: 'right-angle',
            direction: 'below',
            dropDepth: 1,
            arrowHead: '->',
            linePattern: 'solid',
          }),
          makeConnector(tSub.id, tinC.id, {
            routing: 'right-angle',
            direction: 'below',
            dropDepth: 1,
            fromYShift: -8,
            toYShift: -8,
            arrowHead: '->',
            linePattern: 'solid',
          }),
        ],
        callouts: [],
      };
    }

    case 'ex15': {
      // instructions.tex lines 511-534: Did the package arrive?
      const tinC = makeNode([
        makeLine('T'),
        makeLine('\\past'),
        makeFeatureLine('aux', 'hf', true),
        makeFeatureLine('neg', 'hf', true),
      ], [], { name: 'TinC' });

      const tNode = makeNode([
        makeLine('T'),
        makeLine('\\past', { strike: true }),
        makeFeatureLine('aux', 'hf', true),
        makeFeatureLine('neg', 'hf', true),
      ], [], { name: 'T' });

      const root = makeNode('CP', [
        makeNode('C', [
          makeNode([makeLine('C'), makeLine('$\\emptyset$'), makeFeatureLine('t', 'hf', true)]),
          tinC,
        ]),
        makeNode('TP', [
          makeNode('DP', [
            makeNode([makeLine('D'), makeLine('the')]),
            makeNode([makeLine('N'), makeLine('package')]),
          ]),
          makeNode('\\xbar{T}', [
            tNode,
            makeNode([makeLine('V'), makeLine('arrive')]),
          ]),
        ]),
      ]);

      return {
        treeOptions: { sSep: '0pt', lSep: '1em' },
        root,
        connectors: [
          makeConnector(tNode.id, tinC.id, {
            routing: 'right-angle',
            direction: 'below',
            dropDepth: 1,
            arrowHead: '->',
          }),
        ],
        callouts: [
          makeCallout(tinC.id, '\\textit{do}-support', {
            relPos: 'left',
            offsetX: -1,
            offsetY: -4,
            hasArrow: true,
            routing: 'curved',
            outAngle: 0,
            inAngle: 225,
            targetAnchor: 'south west',
            targetXShift: 1,
          }),
        ],
      };
    }

    case 'wh_roof': {
      const whSpec = makeNode([makeLine('DP'), makeLine('what', { bold: true, color: 'blue' })], [], { name: 'WhSpec' });
      const whObj = makeNode([makeLine('DP'), makeLine('$t_1$', { color: 'blue' })], [], { name: 'WhTrace' });
      const subj = makeNode('DP', [makeNode('the linguistics student', [], { edgeStyle: 'roof' })]);
      const root = makeNode('CP', [
        whSpec,
        makeNode('\\xbar{C}', [
          makeNode([makeLine('C'), makeLine('did'), makeFeatureLine('wh', 'mvf', true)]),
          makeNode('TP', [
            subj,
            makeNode('\\xbar{T}', [
              makeNode([makeLine('T'), makeLine('\\st{did}')]),
              makeNode('VP', [
                makeNode([makeLine('V'), makeLine('read')]),
                whObj,
              ]),
            ]),
          ]),
        ]),
      ]);
      return {
        treeOptions: { sSep: '0.5em', lSep: '1em' },
        root,
        connectors: [
          makeConnector(whObj.id, whSpec.id, {
            routing: 'curved',
            outAngle: -115,
            inAngle: -90,
            looseness: 1.15,
            fromAnchor: 'south',
            toAnchor: 'south',
            arrowHead: '->',
            linePattern: 'solid',
            color: 'blue',
            label: 'wh-mvt',
            labelPos: 'below',
          }),
        ],
        callouts: [],
      };
    }

    case 'agree_bind': {
      const probe = makeNode([makeLine('T'), makeFeatureLine('$\\varphi$', 'af', true)], [], { name: 'Probe' });
      const goal = makeNode([makeLine('DP\\ind{1}'), makeLine('she', { color: 'teal' })], [], { name: 'Goal' });
      const anaphor = makeNode([makeLine('DP\\ind{1}'), makeLine('herself', { color: 'purple' })], [], { name: 'Anaph' });
      const root = makeNode('TP', [
        goal,
        makeNode('\\xbar{T}', [
          probe,
          makeNode('VP', [
            makeNode([makeLine('V'), makeLine('admires')]),
            anaphor,
          ]),
        ]),
      ]);
      return {
        treeOptions: { sSep: '0.5em', lSep: '1em' },
        root,
        connectors: [
          makeConnector(probe.id, goal.id, {
            stylePreset: 'agree',
            routing: 'curved',
            outAngle: 120,
            inAngle: 55,
            fromAnchor: 'north',
            toAnchor: 'north',
            arrowHead: 'o-o',
            linePattern: 'dotted',
            thickness: 'very thick',
            color: 'teal',
            label: 'Agree',
            labelPos: 'above',
          }),
          makeConnector(goal.id, anaphor.id, {
            stylePreset: 'binding',
            routing: 'right-angle',
            direction: 'below',
            dropDepth: 2.2,
            arrowHead: 'o-o',
            linePattern: 'solid',
            thickness: 'semithick',
            color: 'purple',
            label: 'Binding',
            labelPos: 'below',
          }),
        ],
        callouts: [],
      };
    }

    default:
      return buildPreset('ex13');
  }
}
