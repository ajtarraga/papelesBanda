// Ejecutar con: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/instruments.js');
const D = require('../js/distribute.js');

const cat = I.DEFAULT_CATALOG;
const det = (t) => { const r = I.detect(t, cat); if (r && !r.solo) delete r.solo; return r; };

test('detecta instrumento y voz', () => {
  assert.deepEqual(det('Clarinete 1º en Sib'), { id: 'clarinete', voices: [1] });
  assert.deepEqual(det('Clarinete en Sib 2'), { id: 'clarinete', voices: [2] });
  assert.deepEqual(det('2º Trompeta'), { id: 'trompeta', voices: [2] });
  assert.deepEqual(det('Trompeta 2 y 3'), { id: 'trompeta', voices: [2, 3] });
  assert.deepEqual(det('Trompa en Fa 1-3'), { id: 'trompa', voices: [1, 2, 3] });
  assert.deepEqual(det('Saxofón Alto 1º'), { id: 'saxo_alto', voices: [1] });
  assert.deepEqual(det('Saxo Barítono'), { id: 'saxo_baritono', voices: [] });
  assert.deepEqual(det('Bombardino en Si♭'), { id: 'bombardino_sib', voices: [] });
  assert.deepEqual(det('Clarinete Bajo'), { id: 'clarinete_bajo', voices: [] });
  assert.deepEqual(det('Requinto en Mib'), { id: 'requinto', voices: [] });
  assert.deepEqual(det('Bb Trumpet II'), { id: 'trompeta', voices: [2] });
  assert.deepEqual(det('Clarinete segundo'), { id: 'clarinete', voices: [2] });
  assert.deepEqual(det('Paso doble — Guion Director'), { id: I.GUION_ID, voices: [] });
  assert.equal(det('Allegro moderato'), null);
  // Cabeceras en inglés tipo Hal Leonard (OCR)
  assert.deepEqual(det('SOLO B♭ CLARINET'), { id: 'clarinete', voices: [], solo: true });
  assert.deepEqual(det('Trompeta solista'), { id: 'trompeta', voices: [], solo: true });
  assert.deepEqual(det('BARITONE T.C.'), { id: 'bombardino_sib', voices: [] });
  assert.deepEqual(det('BARITONE B.C.'), { id: 'bombardino', voices: [] });
  assert.deepEqual(det('E♭ ALTO CLARINET'), { id: 'clarinete_alto', voices: [] });
  assert.deepEqual(det('E♭ BARITONE SAXOPHONE'), { id: 'saxo_baritono', voices: [] });
  assert.deepEqual(det('MALLET PERCUSSION Bells'), { id: 'laminas', voices: [] });
  assert.deepEqual(det('F HORN 2'), { id: 'trompa', voices: [2] });
  assert.deepEqual(det(I.cleanOcr('B> CLARINET l')), { id: 'clarinete', voices: [1] });
  assert.deepEqual(det('SOLO EP ALTO SAXOPHONE'), { id: 'saxo_alto', voices: [], solo: true });
  assert.deepEqual(det('CINEMA PARADISO FHORN 1 By ENNIO'), { id: 'trompa', voices: [1] });
  assert.deepEqual(det('BbCLARINET 2'), { id: 'clarinete', voices: [2] });
  assert.deepEqual(det('Flautín'), { id: 'flautin', voices: [] });
  assert.deepEqual(det('From CINEMA PARADISO CINEMA PARADISO SOLO OBOE By ENNIO MORRICONE'), { id: 'oboe', voices: [], solo: true });
});

test('interpreta voces', () => {
  assert.deepEqual(I.parseVoices('2-3'), [2, 3]);
  assert.deepEqual(I.parseVoices('1 y 2'), [1, 2]);
  assert.deepEqual(I.parseVoices('III'), [3]);
  assert.deepEqual(I.parseVoices(''), []);
  assert.equal(I.formatVoices([1, 2, 3]), '1-3');
  assert.equal(I.formatVoices([1, 3]), '1,3');
});

const part = (inst, voices) => ({ id: `${inst}${voices.join('')}`, inst, voices, pages: [0] });

test('carpetas por máximo de voces', () => {
  const works = [
    { id: 'A', parts: [part('clarinete', [1]), part('clarinete', [2]), part('clarinete', [3])] },
    { id: 'B', parts: [part('clarinete', [1]), part('clarinete', [2])] },
  ];
  const { folders, maxVoices } = D.computeFolders(works, cat);
  assert.equal(maxVoices.clarinete, 3);
  assert.deepEqual(folders.map((f) => f.key), ['clarinete#1', 'clarinete#2', 'clarinete#3']);
});

test('rotación equilibrada de voces que faltan', () => {
  const works = ['A', 'B', 'C', 'D'].map((id) => ({ id, parts: [part('clarinete', [1]), part('clarinete', [2])] }));
  works.unshift({ id: 'X', parts: [part('clarinete', [1]), part('clarinete', [2]), part('clarinete', [3])] });
  const plan = D.computePlan(works, cat);
  const used = ['A', 'B', 'C', 'D'].map((id) => plan.assignments[id]['clarinete#3']);
  used.forEach((u) => assert.equal(u.type, 'voz'));
  const counts = {};
  used.forEach((u) => (counts[u.part.voices[0]] = (counts[u.part.voices[0]] || 0) + 1));
  assert.deepEqual(counts, { 1: 2, 2: 2 });
  assert.equal(plan.assignments.X['clarinete#3'].type, 'propio');
});

test('reparto equilibrado dentro de una obra', () => {
  const works = [
    { id: 'X', parts: [1, 2, 3, 4].map((v) => part('trompeta', [v])) },
    { id: 'A', parts: [part('trompeta', [1]), part('trompeta', [2])] },
  ];
  const plan = D.computePlan(works, cat);
  const a = plan.assignments.A;
  const got = [a['trompeta#3'].part.voices[0], a['trompeta#4'].part.voices[0]].sort();
  assert.deepEqual(got, [1, 2]);
});

test('sustitución por familia y afinación', () => {
  const works = [
    { id: 'X', parts: [part('fliscorno', [1]), part('fliscorno', [2]), part('trompeta', [1])] },
    { id: 'A', parts: [part('trompeta', [1]), part('trompeta', [2])] },
    { id: 'B', parts: [part('saxo_alto', [])] },
  ];
  const plan = D.computePlan(works, cat);
  assert.equal(plan.assignments.A['fliscorno#1'].type, 'familia');
  assert.equal(plan.assignments.A['fliscorno#1'].fromInst, 'trompeta');
  assert.deepEqual(plan.assignments.A['fliscorno#1'].part.voices, [1]);
  assert.deepEqual(plan.assignments.A['fliscorno#2'].part.voices, [2]);
  // Saxo alto (Mi♭) no puede tocar papel de trompeta/fliscorno (Si♭)
  assert.equal(plan.assignments.B['fliscorno#1'].type, 'falta');
});

test('papel único cubre todas las voces', () => {
  const works = [
    { id: 'X', parts: [part('trompa', [1]), part('trompa', [2])] },
    { id: 'A', parts: [part('trompa', [])] },
  ];
  const plan = D.computePlan(works, cat);
  assert.equal(plan.assignments.A['trompa#2'].type, 'propio');
});

test('papel combinado 2-3', () => {
  const works = [{ id: 'A', parts: [part('clarinete', [1]), part('clarinete', [2, 3])] }];
  const plan = D.computePlan(works, cat);
  assert.equal(plan.assignments.A['clarinete#3'].type, 'propio');
  assert.deepEqual(plan.assignments.A['clarinete#3'].part.voices, [2, 3]);
});

test('los solistas tienen carpeta propia y no se sustituyen', () => {
  const works = [
    { id: 'X', parts: [part('flauta~solo', []), part('flauta', [])] },
    { id: 'A', parts: [part('flauta', [])] },
  ];
  const plan = D.computePlan(works, cat);
  assert.deepEqual(plan.folders.map((f) => f.key), ['flauta', 'flauta~solo']);
  assert.equal(plan.assignments.A['flauta~solo'].type, 'falta');
});

test('instrumento grave toma la voz más grave del sustituto', () => {
  const works = [
    { id: 'X', parts: [part('clarinete_bajo', [])] },
    { id: 'A', parts: [1, 2, 3].map((v) => part('clarinete', [v])) },
  ];
  const plan = D.computePlan(works, cat);
  assert.equal(plan.assignments.A.clarinete_bajo.fromInst, 'clarinete');
  assert.deepEqual(plan.assignments.A.clarinete_bajo.part.voices, [3]);
});

test('detección por nombre de archivo', () => {
  const f = (n) => I.parseFileName(n, cat);
  assert.deepEqual(f('clte-1.pdf'), { id: 'clarinete', voices: [1], solo: false });
  assert.deepEqual(f('CLTE-2-3.pdf'), { id: 'clarinete', voices: [2, 3], solo: false });
  assert.deepEqual(f('CLTE-B.pdf'), { id: 'clarinete_bajo', voices: [], solo: false });
  assert.deepEqual(f('CLTE-P.pdf'), { id: 'clarinete', voices: [], solo: true });
  assert.deepEqual(f('tpa-1-e.pdf'), { id: 'trompa_mib', voices: [1], solo: false });
  assert.deepEqual(f('tpa-1-f.pdf'), { id: 'trompa', voices: [1], solo: false });
  assert.deepEqual(f('tpta-2.pdf'), { id: 'trompeta', voices: [2], solo: false });
  assert.deepEqual(f('tbon-3.pdf'), { id: 'trombon', voices: [3], solo: false });
  assert.deepEqual(f('BDINO-1-C.pdf'), { id: 'bombardino', voices: [1], solo: false });
  assert.deepEqual(f('bdino-2-b.pdf'), { id: 'bombardino_sib', voices: [2], solo: false });
  assert.deepEqual(f('sax-a-1.pdf'), { id: 'saxo_alto', voices: [1], solo: false });
  assert.deepEqual(f('sax-t-2.pdf'), { id: 'saxo_tenor', voices: [2], solo: false });
  assert.deepEqual(f('sax-b.pdf'), { id: 'saxo_baritono', voices: [], solo: false });
  assert.deepEqual(f('sax-sop.pdf'), { id: 'saxo_soprano', voices: [], solo: false });
  assert.deepEqual(f('flis-2.pdf'), { id: 'fliscorno', voices: [2], solo: false });
  assert.equal(f('BAJOS.pdf').id, 'tuba');
  assert.equal(f('CAJA.pdf').id, 'caja');
  assert.equal(f('pandereta-almirez.pdf').id, 'percusion');
  assert.equal(f('campanas.pdf').id, 'laminas');
  assert.equal(f('timbales.pdf').id, 'timbales');
  assert.equal(f('requinto.pdf').id, 'requinto');
  assert.equal(f('FAGOT.pdf').id, 'fagot');
  assert.equal(f('txistus.pdf').id, 'txistu');
  assert.deepEqual(f('violin 2.pdf'), { id: 'violin', voices: [2], solo: false });
  assert.equal(f('guion.pdf').id, I.GUION_ID);
  assert.equal(f('El reloj sincopado Guion.pdf').id, I.GUION_ID);
  assert.deepEqual(f('NAVI CL1.pdf'), { id: 'clarinete', voices: [1], solo: false });
  assert.equal(f('NAV CL B.pdf').id, 'clarinete_bajo');
  assert.equal(f('NAV TRPT.pdf').id, 'trompeta');
  assert.equal(f('NAV TPA.pdf').id, 'trompa');
  assert.equal(f('NAV TB.pdf').id, 'tuba');
  assert.equal(f('NAV SA.pdf').id, 'saxo_alto');
  assert.equal(f('7.pdf'), null);
  assert.equal(f('All i want for christmas is you.pdf'), null);
});

test('plantilla de la banda', () => {
  const tpl = [
    { key: 'Fl', inst: 'flauta', voice: 1 },
    { key: 'Ob', inst: 'oboe', voice: 1 },
    { key: 'Cl1', inst: 'clarinete', voice: 1 },
    { key: 'Cl2', inst: 'clarinete', voice: 2 },
    { key: 'ClB', inst: 'clarinete_bajo', voice: 1 },
    { key: 'Trpt', inst: 'trompeta', voice: 1 },
    { key: 'Per', all: true, insts: ['percusion', 'caja', 'timbales', 'laminas'] },
  ];
  const works = [
    { id: 'P', parts: [part('clarinete~solo', []), part('clarinete', [1]), part('clarinete', [2, 3]), part('flauta', []),
      part('trompeta', [1]), part('trompeta', [2]), part('caja', []), part('percusion', []), part('clarinete_bajo', [])] },
    { id: 'R', parts: [part('flauta', []), part('saxo_tenor', []), part('clarinete', [1]), part('timbales', [])] },
  ];
  const plan = D.computePlan(works, cat, { folders: tpl });
  const P = plan.assignments.P;
  const R = plan.assignments.R;
  assert.deepEqual(P.Cl1.part.voices, [1]);
  assert.deepEqual(P.Cl2.part.voices, [2, 3]);
  assert.equal(P.Trpt.parts.length, 1);
  assert.deepEqual(P.Per.parts.map((p) => p.inst), ['caja', 'percusion']);
  assert.equal(P.Ob.type, 'familia'); // Oboe ← Flauta
  assert.equal(R.ClB.fromInst, 'saxo_tenor'); // Clarinete bajo ← Saxo tenor (como en el ejemplo)
  assert.equal(R.Cl2.type, 'voz'); // Clarinete 2 ← Clarinete 1
  assert.deepEqual(R.Per.parts.map((p) => p.inst), ['timbales']);
});

test('nombres de archivo del segundo ejemplo', () => {
  const f = (n) => I.parseFileName(n, cat);
  assert.deepEqual(f('Clarinete 1º.pdf'), { id: 'clarinete', voices: [1], solo: false });
  assert.deepEqual(f('Trompeta 2ª.pdf'), { id: 'trompeta', voices: [2], solo: false });
  assert.deepEqual(f('Trompa Fa.pdf'), { id: 'trompa', voices: [], solo: false });
  assert.equal(f('Saxo Alto.pdf').id, 'saxo_alto');
  assert.equal(f('Saxo Barítono.pdf').id, 'saxo_baritono');
  assert.deepEqual(f('18 Intermedio - Trombón  2.pdf'), { id: 'trombon', voices: [2], solo: false });
  assert.deepEqual(f('15 Intermedio08 - Trompeta 1en Sib.pdf'), { id: 'trompeta', voices: [1], solo: false });
  assert.deepEqual(f('16 Intermedio - Trompeta 2-3 en Sib.pdf'), { id: 'trompeta', voices: [2, 3], solo: false });
  assert.deepEqual(f('12 Intermedio - Trompa 1-2 en Fa.pdf'), { id: 'trompa', voices: [1, 2], solo: false });
  assert.deepEqual(f('10 Intermedio - Saxo Tenor 1º-2º.pdf'), { id: 'saxo_tenor', voices: [1, 2], solo: false });
  assert.deepEqual(f('04 Intermedio- Clarinete Pral en  Sib.pdf'), { id: 'clarinete', voices: [], solo: true });
  assert.equal(f('03 Intermedio- Requinto en Mib.pdf').id, 'requinto');
  assert.equal(f('02 Intermedio - Oboes..pdf').id, 'oboe');
  assert.equal(f('01 Intermedio - Flautas..pdf').id, 'flauta');
  assert.equal(f('14 Intermedio - Fliscornos.pdf').id, 'fliscorno');
  assert.equal(f('20 Intermedio - Bombardinos en Do.pdf').id, 'bombardino');
  assert.equal(f('21 Intermedio- Bombardinos en Sib.pdf').id, 'bombardino_sib');
  assert.equal(f('23 Intermedio - Violochelos.pdf').id, 'violonchelo');
  assert.equal(f('24 Intermedio - Saxofón Soprano.pdf').id, 'saxo_soprano');
  assert.equal(f('26 Intermedio - Clarinete Bajo.pdf').id, 'clarinete_bajo');
  assert.deepEqual(f('07 Intermedio - Clarinete 3º en Sib.pdf'), { id: 'clarinete', voices: [3], solo: false });
  assert.equal(f('00 Intermedio- Partitura A4.pdf').id, I.GUION_ID);
  assert.equal(f('The Tempest_Guio.pdf').id, I.GUION_ID);
  assert.equal(f('The Tempest_Instrumentacio.pdf'), null);
  assert.equal(f('LOS CHICOS DEL CORO.pdf'), null);
  assert.equal(f('1492 CONQUEST OF PARADISE.PDF'), null);
  assert.equal(f('Memorias de Africa.pdf'), null);
});

test('cabeceras en neerlandés y catalán', () => {
  assert.equal(det('FLUIT C 1 + II Flute OUT OF AFRICA').id, 'flauta');
  assert.equal(det('Bb TENOR Tenor SAXOFOON').id, 'saxo_tenor');
  assert.equal(det('Trombó 1').id, 'trombon');
  assert.equal(det('Fiscorn 2').id, 'fliscorno');
  assert.equal(det('Hoorn in F 1').id, 'trompa');
  assert.equal(det('Bb CLARINETS').id, 'clarinete');
});

test('añadir también (flautín con la flauta)', () => {
  const works = [{ id: 'M', parts: [part('flauta', [1, 2]), part('flautin', [])] }, { id: 'T', parts: [part('flauta', [])] }];
  const plan = D.computePlan(works, cat, { folders: [{ key: 'Fl', inst: 'flauta', voice: 1, also: ['flautin'] }] });
  assert.deepEqual(plan.assignments.M.Fl.parts.map((p) => p.inst), ['flauta', 'flautin']);
  assert.deepEqual(plan.assignments.T.Fl.parts.map((p) => p.inst), ['flauta']);
});

test('plurales en inglés y voces "1 + II"', () => {
  assert.equal(det('Eb ALTO SAXOPHONES THE TEMPEST').id, 'saxo_alto');
  assert.deepEqual(det('FLUIT C 1 + II'), { id: 'flauta', voices: [1, 2] });
});
