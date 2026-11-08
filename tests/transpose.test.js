const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/transpose.js');
const I = require('../js/instruments.js');
const inst = (id) => I.DEFAULT_CATALOG.find((c) => c.id === id);

test('transporta notas', () => {
  assert.deepEqual(T.transposePitch({ step: 'C', alter: 0, octave: 4 }, { d: 1, s: 2 }), { step: 'D', alter: 0, octave: 4 });
  assert.deepEqual(T.transposePitch({ step: 'B', alter: -1, octave: 3 }, { d: 1, s: 2 }), { step: 'C', alter: 0, octave: 4 });
  assert.deepEqual(T.transposePitch({ step: 'E', alter: 0, octave: 4 }, { d: 1, s: 2 }), { step: 'F', alter: 1, octave: 4 });
  assert.deepEqual(T.transposePitch({ step: 'C', alter: 0, octave: 3 }, { d: 8, s: 14 }), { step: 'D', alter: 0, octave: 4 });
  assert.deepEqual(T.transposePitch({ step: 'F', alter: 1, octave: 5 }, { d: -2, s: -3 }), { step: 'D', alter: 1, octave: 5 });
});

test('intervalos entre instrumentos', () => {
  assert.deepEqual(T.intervalBetween(inst('bombardino'), inst('bombardino_sib')), { d: 8, s: 14 });
  assert.deepEqual(T.intervalBetween(inst('saxo_alto'), inst('trompa')), { d: -1, s: -2 });
  assert.deepEqual(T.intervalBetween(inst('trompeta'), inst('fliscorno')), { d: 0, s: 0 });
  assert.deepEqual(T.intervalBetween(inst('flauta'), inst('clarinete')), { d: 1, s: 2 });
  assert.equal(T.describeInterval({ d: 8, s: 14 }), 'sube una 9ª mayor');
  assert.equal(T.describeInterval({ d: -1, s: -2 }), 'baja una 2ª mayor');
  assert.equal(T.describeInterval({ d: 7, s: 12 }), 'sube una octava');
  assert.equal(T.describeInterval({ d: 4, s: 7 }), 'sube una 5ª justa');
  assert.equal(T.describeInterval({ d: 2, s: 3 }), 'sube una 3ª menor');
});

test('armaduras', () => {
  assert.equal(T.transposeFifths(-1, { d: 1, s: 2 }), 1); // Fa M → Sol M
  assert.equal(T.transposeFifths(-3, { d: 8, s: 14 }), -1); // Mi♭ M + 9ª M → Fa M
  assert.equal(T.transposeFifths(0, { d: 5, s: 9 }), 3); // Do M + 6ª M → La M
  assert.equal(T.keyName(-2), 'Si♭ mayor (2 bemoles)');
  // Do♯ mayor + 2ª M daría Re♯ mayor (9♯): se escribe Mi♭ mayor
  const iv = T.chooseSpelling({ d: 1, s: 2 }, [7]);
  assert.equal(T.transposeFifths(7, iv), -3);
});
