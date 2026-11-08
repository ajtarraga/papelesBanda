/*
 * Transporte de papeles en MusicXML.
 *
 * Solo se cambian las alturas (notas, armaduras, alteraciones, cifrados), la clave y el nombre del
 * instrumento. Todo lo demás del archivo (matices, articulaciones, ligaduras, reguladores, textos,
 * repeticiones, ensayos...) se deja tal cual.
 *
 * Funciona en el navegador (window.Transpose) y en Node (require) para la parte sin DOM.
 */
(function (root) {
  'use strict';

  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const STEP_SEMI = [0, 2, 4, 5, 7, 9, 11];
  const STEP_ES = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

  /*
   * Transposición de cada instrumento: nota escrita = nota real + intervalo { d: grados, s: semitonos }.
   * (Clarinete en Si♭: escrito un tono por encima de lo que suena → { d: 1, s: 2 }.)
   */
  const TRANSPOSITION = {
    flautin: { d: -7, s: -12 },
    contrabajo: { d: 7, s: 12 },
    requinto: { d: -2, s: -3 },
    clarinete: { d: 1, s: 2 },
    clarinete_alto: { d: 5, s: 9 },
    clarinete_bajo: { d: 8, s: 14 },
    saxo_soprano: { d: 1, s: 2 },
    saxo_alto: { d: 5, s: 9 },
    saxo_tenor: { d: 8, s: 14 },
    saxo_baritono: { d: 12, s: 21 },
    corno_ingles: { d: 4, s: 7 },
    trompa: { d: 4, s: 7 },
    trompa_mib: { d: 5, s: 9 },
    fliscorno: { d: 1, s: 2 },
    trompeta: { d: 1, s: 2 },
    bombardino_sib: { d: 8, s: 14 },
    laminas: { d: 0, s: 0 },
  };
  const BY_TUNING = { C: { d: 0, s: 0 }, Bb: { d: 1, s: 2 }, Eb: { d: 5, s: 9 }, F: { d: 4, s: 7 }, A: { d: 2, s: 3 } };

  // Claves disponibles (MusicXML: sign + line + clef-octave-change).
  const CLEFS = {
    G2: { sign: 'G', line: 2, oct: 0, name: 'Sol' },
    F4: { sign: 'F', line: 4, oct: 0, name: 'Fa en 4ª' },
    C3: { sign: 'C', line: 3, oct: 0, name: 'Do en 3ª' },
    C4: { sign: 'C', line: 4, oct: 0, name: 'Do en 4ª' },
    C1: { sign: 'C', line: 1, oct: 0, name: 'Do en 1ª' },
    G2_8vb: { sign: 'G', line: 2, oct: -1, name: 'Sol octava baja' },
    F3: { sign: 'F', line: 3, oct: 0, name: 'Fa en 3ª' },
  };

  function transpositionOf(inst) {
    if (!inst) return { d: 0, s: 0 };
    if (TRANSPOSITION[inst.id]) return TRANSPOSITION[inst.id];
    return BY_TUNING[inst.tuning] || { d: 0, s: 0 };
  }

  function defaultClef(inst) {
    if (!inst) return 'G2';
    if (inst.id === 'tuba' || inst.id === 'trombon_bajo' || inst.id === 'contrabajo' || inst.id === 'violonchelo') return 'F4';
    if (inst.clef === 'Fa') return 'F4';
    if (inst.clef === 'Do') return 'C3';
    return 'G2';
  }

  /** Intervalo para pasar un papel escrito para "from" a uno escrito para "to" (mismo sonido). */
  function intervalBetween(from, to) {
    const a = transpositionOf(from);
    const b = transpositionOf(to);
    return { d: b.d - a.d, s: b.s - a.s };
  }

  function addIntervals(a, b) {
    return { d: a.d + b.d, s: a.s + b.s };
  }

  /** Transporta una nota { step, alter, octave } un intervalo { d, s }. */
  function transposePitch(p, iv) {
    const idx = STEPS.indexOf(p.step);
    const total = idx + p.octave * 7 + iv.d;
    const nIdx = ((total % 7) + 7) % 7;
    const nOct = Math.floor(total / 7);
    const semis = STEP_SEMI[idx] + p.octave * 12 + (p.alter || 0) + iv.s;
    const natural = STEP_SEMI[nIdx] + nOct * 12;
    return { step: STEPS[nIdx], alter: semis - natural, octave: nOct };
  }

  // Tónica (en modo mayor) de cada armadura, para transportar armaduras.
  function fifthsToTonic(f) {
    // Do mayor = 0; cada quinta sube 4 grados y 7 semitonos.
    const idx = (((f * 4) % 7) + 7) % 7;
    const semis = (((f * 7) % 12) + 12) % 12;
    let alter = semis - STEP_SEMI[idx];
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    return { step: STEPS[idx], alter };
  }

  function tonicToFifths(t) {
    for (let f = -14; f <= 14; f++) {
      const x = fifthsToTonic(f);
      if (x.step === t.step && x.alter === t.alter) return f;
    }
    return null;
  }

  function transposeFifths(fifths, iv) {
    const t = fifthsToTonic(fifths);
    const n = transposePitch({ step: t.step, alter: t.alter, octave: 4 }, iv);
    const f = tonicToFifths({ step: n.step, alter: n.alter });
    return f === null ? fifths : f;
  }

  /*
   * Si al transportar alguna armadura pasa de 7 alteraciones (p. ej. Do# mayor + 2ª mayor = Re# mayor),
   * se usa el intervalo enarmónico (3ª disminuida en vez de 2ª mayor) para que quede en Mi♭ mayor.
   */
  function chooseSpelling(iv, fifthsList) {
    const worst = (x) => Math.max(...fifthsList.map((f) => Math.abs(transposeFifths(f, x))));
    if (worst(iv) <= 6) return iv;
    let best = iv;
    let bestScore = worst(iv);
    for (const o of [{ d: iv.d + 1, s: iv.s }, { d: iv.d - 1, s: iv.s }]) {
      const w = worst(o);
      if (w < bestScore) { best = o; bestScore = w; }
    }
    return best;
  }

    /** Describe un intervalo en español: "sube una 9ª mayor". */
  function describeInterval(iv) {
    if (iv.d === 0 && iv.s === 0) return 'mismo sonido (no cambia ninguna nota)';
    const up = iv.d > 0 || (iv.d === 0 && iv.s > 0);
    const d = Math.abs(iv.d);
    const s = Math.abs(iv.s);
    const simpleD = d % 7;
    const octaves = Math.floor(d / 7);
    const simpleS = s - octaves * 12;
    const perfect = [0, 3, 4].includes(simpleD);
    const ref = [0, 2, 4, 5, 7, 9, 11][simpleD];
    const diff = simpleS - ref;
    let quality;
    if (perfect) quality = { '-2': 'doble disminuida', '-1': 'disminuida', 0: simpleD === 0 ? '' : 'justa', 1: 'aumentada', 2: 'doble aumentada' }[diff];
    else quality = { '-2': 'disminuida', '-1': 'menor', 0: 'mayor', 1: 'aumentada' }[diff];
    const number = d + 1;
    let name;
    if (simpleD === 0 && octaves > 0 && diff === 0) name = octaves === 1 ? 'una octava' : `${octaves} octavas`;
    else if (d === 0) name = `un unísono ${quality || ''}`.trim();
    else name = `una ${number}ª ${quality || ''}`.trim();
    return `${up ? 'sube' : 'baja'} ${name}`;
  }

  function keyName(fifths) {
    const t = fifthsToTonic(fifths);
    const acc = t.alter === 1 ? '♯' : t.alter === -1 ? '♭' : t.alter === 2 ? '𝄪' : t.alter === -2 ? '𝄫' : '';
    const n = Math.abs(fifths);
    const word = fifths > 0 ? (n > 1 ? 'sostenidos' : 'sostenido') : (n > 1 ? 'bemoles' : 'bemol');
    const sig = fifths === 0 ? 'sin alteraciones' : `${n} ${word}`;
    return `${STEP_ES[t.step]}${acc} mayor (${sig})`;
  }

  // Alteraciones de la armadura: nota → alteración.
  function keyAlters(fifths) {
    const sharps = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
    const map = {};
    STEPS.forEach((s) => { map[s] = 0; });
    if (fifths > 0) sharps.slice(0, Math.min(7, fifths)).forEach((s) => { map[s] = 1; });
    if (fifths < 0) sharps.slice().reverse().slice(0, Math.min(7, -fifths)).forEach((s) => { map[s] = -1; });
    return map;
  }

  const ACC_TYPE = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };

  // ---------- Parte con DOM (navegador) ----------

  const kids = (el, name) => Array.from(el.children).filter((c) => c.localName === name);
  const kid = (el, name) => kids(el, name)[0] || null;
  const text = (el, name) => { const k = kid(el, name); return k ? k.textContent.trim() : null; };

  function setChild(el, name, value, beforeNames) {
    let k = kid(el, name);
    if (value === null || value === undefined) { if (k) k.remove(); return; }
    if (!k) {
      k = el.ownerDocument.createElement(name);
      const before = Array.from(el.children).find((c) => beforeNames.includes(c.localName));
      if (before) el.insertBefore(k, before); else el.appendChild(k);
    }
    k.textContent = String(value);
  }

  function writePitch(pitchEl, p, stepTag, alterTag, octaveTag) {
    setChild(pitchEl, stepTag, p.step, [alterTag, octaveTag]);
    setChild(pitchEl, alterTag, p.alter ? p.alter : null, [octaveTag]);
    if (octaveTag) setChild(pitchEl, octaveTag, p.octave, []);
  }

  // Orden de los elementos de <note> tras <accidental> (para insertarlo en su sitio).
  const AFTER_ACCIDENTAL = ['time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];

  function partIsPercussion(partEl) {
    return Array.from(partEl.getElementsByTagName('clef')).some((c) => text(c, 'sign') === 'percussion');
  }

  /**
   * Transporta un documento MusicXML (score-partwise) en el sitio.
   * opts: { interval: {d,s}, clef: 'G2'|'F4'|...|null, partName: string|null, oldName: string|null,
   *         target: instrumento de destino (para <transpose>), partIds: [ids]|null }
   * Devuelve un resumen { interval, keys: [antes, después], notes, warnings }.
   */
  function transposeDocument(doc, opts) {
    const warnings = [];
    const parts = Array.from(doc.getElementsByTagName('part')).filter((p) => !opts.partIds || opts.partIds.includes(p.getAttribute('id')));
    if (!parts.length) throw new Error('El archivo no tiene partes (¿es un MusicXML "score-partwise"?)');
    if (doc.documentElement.localName === 'score-timewise') throw new Error('Formato MusicXML "timewise" no admitido; expórtalo como "partwise".');

    // Intervalo final, con la grafía enarmónica más legible según las armaduras.
    const fifthsList = [];
    parts.forEach((p) => Array.from(p.getElementsByTagName('key')).forEach((k) => {
      const f = parseInt(text(k, 'fifths'), 10);
      if (!Number.isNaN(f)) fifthsList.push(f);
    }));
    const iv = opts.interval.d === 0 && opts.interval.s === 0 ? opts.interval : chooseSpelling(opts.interval, fifthsList.length ? fifthsList : [0]);
    let notes = 0;
    const keysBefore = [];
    const keysAfter = [];

    for (const part of parts) {
      const percussion = partIsPercussion(part);
      if (percussion && (iv.d || iv.s)) warnings.push('Hay un papel de percusión sin altura: sus notas no se transportan.');
      let fifths = 0;
      for (const measure of kids(part, 'measure')) {
        const state = new Map(); // `${staff}|${step}${octave}` → alteración vigente en el compás
        for (const el of Array.from(measure.children)) {
          if (el.localName === 'attributes') {
            for (const key of kids(el, 'key')) {
              const fEl = kid(key, 'fifths');
              if (!fEl) continue;
              const f = parseInt(fEl.textContent, 10);
              const nf = percussion ? f : transposeFifths(f, iv);
              keysBefore.push(f);
              keysAfter.push(nf);
              fEl.textContent = String(nf);
              fifths = nf;
            }
            if (opts.clef && CLEFS[opts.clef]) {
              const c = CLEFS[opts.clef];
              for (const clef of kids(el, 'clef')) {
                if (text(clef, 'sign') === 'percussion' || text(clef, 'sign') === 'TAB') continue;
                setChild(clef, 'sign', c.sign, ['line', 'clef-octave-change']);
                setChild(clef, 'line', c.line, ['clef-octave-change']);
                setChild(clef, 'clef-octave-change', c.oct ? c.oct : null, []);
              }
            }
            if (opts.target !== undefined) {
              // <transpose> describe el instrumento transpositor (escrito → real).
              const t = transpositionOf(opts.target);
              for (const tr of kids(el, 'transpose')) tr.remove();
              if (t.d || t.s) {
                const tr = doc.createElement('transpose');
                const oct = Math.trunc(t.d / 7);
                const dEl = doc.createElement('diatonic'); dEl.textContent = String(-(t.d - oct * 7));
                const cEl = doc.createElement('chromatic'); cEl.textContent = String(-(t.s - oct * 12));
                tr.appendChild(dEl); tr.appendChild(cEl);
                if (oct) { const o = doc.createElement('octave-change'); o.textContent = String(-oct); tr.appendChild(o); }
                const before = Array.from(el.children).find((c) => ['directive', 'measure-style', 'for-part'].includes(c.localName));
                if (before) el.insertBefore(tr, before); else el.appendChild(tr);
              }
            }
            continue;
          }
          if (el.localName === 'harmony' && !percussion) {
            for (const [tag, st, al] of [['root', 'root-step', 'root-alter'], ['bass', 'bass-step', 'bass-alter']]) {
              const r = kid(el, tag);
              if (!r || !kid(r, st)) continue;
              const p = transposePitch({ step: text(r, st), alter: parseFloat(text(r, al) || '0'), octave: 4 }, iv);
              writePitch(r, p, st, al, null);
            }
            continue;
          }
          if (el.localName !== 'note') continue;
          const pitch = kid(el, 'pitch');
          if (!pitch || percussion) continue;
          const p0 = { step: text(pitch, 'step'), alter: parseFloat(text(pitch, 'alter') || '0'), octave: parseInt(text(pitch, 'octave'), 10) };
          const p = transposePitch(p0, iv);
          writePitch(pitch, p, 'step', 'alter', 'octave');
          notes++;

          // Alteraciones accidentales: se recalculan según la nueva armadura y lo ya alterado en el compás.
          const staff = text(el, 'staff') || '1';
          const k = `${staff}|${p.step}${p.octave}`;
          const expected = state.has(k) ? state.get(k) : keyAlters(fifths)[p.step];
          const tiedFrom = kids(el, 'tie').some((t) => t.getAttribute('type') === 'stop') && !state.has(k);
          const old = kid(el, 'accidental');
          const courtesy = old && (old.getAttribute('cautionary') === 'yes' || old.getAttribute('parentheses') === 'yes' || old.getAttribute('editorial') === 'yes');
          const alter = Math.round(p.alter);
          if (!tiedFrom && (alter !== expected || courtesy)) {
            let acc = old;
            if (!acc) {
              acc = doc.createElement('accidental');
              const before = Array.from(el.children).find((c) => AFTER_ACCIDENTAL.includes(c.localName));
              if (before) el.insertBefore(acc, before); else el.appendChild(acc);
            }
            acc.textContent = ACC_TYPE[alter] || 'natural';
          } else if (old) {
            old.remove();
          }
          state.set(k, alter);
          if (Math.abs(alter) > 2) warnings.push(`Nota ${p.step} con alteración ${alter}: revísala.`);
        }
      }
    }

    // Nombre del instrumento en la lista de partes y en los textos de la cabecera.
    if (opts.partName) {
      const ids = parts.map((p) => p.getAttribute('id'));
      for (const sp of Array.from(doc.getElementsByTagName('score-part'))) {
        if (!ids.includes(sp.getAttribute('id'))) continue;
        const pn = kid(sp, 'part-name');
        if (pn) pn.textContent = opts.partName;
        const pa = kid(sp, 'part-abbreviation');
        if (pa) pa.remove();
        for (const si of Array.from(sp.getElementsByTagName('instrument-name'))) si.textContent = opts.partName;
      }
      if (opts.oldName) {
        const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
        for (const cw of Array.from(doc.getElementsByTagName('credit-words'))) {
          if (norm(cw.textContent) === norm(opts.oldName)) cw.textContent = opts.partName;
        }
      }
    }
    return { interval: iv, keysBefore, keysAfter, notes, warnings: Array.from(new Set(warnings)) };
  }

  /** Lee nombre de la primera parte y su clave inicial. */
  function inspectDocument(doc) {
    const sp = doc.getElementsByTagName('score-part')[0];
    const name = sp ? (text(sp, 'part-name') || '') : '';
    const clef = doc.getElementsByTagName('clef')[0];
    const key = doc.getElementsByTagName('fifths')[0];
    const title = (doc.getElementsByTagName('work-title')[0] || doc.getElementsByTagName('movement-title')[0] || {}).textContent || '';
    const parts = Array.from(doc.getElementsByTagName('score-part')).map((x) => ({ id: x.getAttribute('id'), name: text(x, 'part-name') || x.getAttribute('id') }));
    let clefId = null;
    if (clef) {
      const s = text(clef, 'sign');
      const l = text(clef, 'line');
      const o = parseInt(text(clef, 'clef-octave-change') || '0', 10);
      clefId = Object.keys(CLEFS).find((k) => CLEFS[k].sign === s && String(CLEFS[k].line) === l && CLEFS[k].oct === o) || null;
    }
    return { name, title: title.trim(), clef: clefId, fifths: key ? parseInt(key.textContent, 10) : 0, parts };
  }

  const api = {
    STEPS, CLEFS, TRANSPOSITION,
    transpositionOf, defaultClef, intervalBetween, addIntervals, transposePitch, transposeFifths,
    chooseSpelling, describeInterval, keyName, keyAlters, transposeDocument, inspectDocument,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Transpose = api;
})(typeof self !== 'undefined' ? self : this);
