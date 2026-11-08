/*
 * Catálogo de instrumentos de banda y detección del instrumento/voz
 * a partir del texto de la cabecera de una página.
 *
 * Funciona tanto en el navegador (window.Instruments) como en Node (require).
 */
(function (root) {
  'use strict';

  // Orden de partitura: determina el orden de las carpetas.
  // tuning: afinación (C = Do, Bb = Si♭, Eb = Mi♭, F = Fa, perc = percusión)
  // subs: sustitutos por orden de preferencia (misma familia y afinación).
  const DEFAULT_CATALOG = [
    { id: 'flautin', name: 'Flautín', family: 'Madera', tuning: 'C', clef: 'Sol',
      aliases: ['flautin', 'piccolo', 'ottavino', 'petite flute'], subs: ['flauta', 'oboe'] },
    { id: 'flauta', name: 'Flauta', family: 'Madera', tuning: 'C', clef: 'Sol',
      aliases: ['flauta', 'flute', 'flauto', 'flote'], subs: ['flautin', 'oboe'] },
    { id: 'oboe', name: 'Oboe', family: 'Madera', tuning: 'C', clef: 'Sol',
      aliases: ['oboe', 'hautbois', 'oboi'], subs: ['flauta', 'flautin'] },
    { id: 'corno_ingles', name: 'Corno inglés', family: 'Madera', tuning: 'F', clef: 'Sol',
      aliases: ['corno ingles', 'english horn', 'cor anglais'], subs: ['trompa'] },
    { id: 'fagot', name: 'Fagot', family: 'Madera', tuning: 'C', clef: 'Fa',
      aliases: ['fagot', 'bassoon', 'fagotto', 'basson'], subs: ['bombardino', 'trombon', 'tuba'] },
    { id: 'requinto', name: 'Requinto', family: 'Madera', tuning: 'Eb', clef: 'Sol',
      aliases: ['requinto', 'clarinete en mib', 'clarinete mib', 'eb clarinet', 'clarinet in eb', 'clarinetto piccolo'],
      subs: ['saxo_alto', 'saxo_baritono'] },
    { id: 'clarinete', name: 'Clarinete', family: 'Madera', tuning: 'Bb', clef: 'Sol',
      aliases: ['clarinete', 'clarinet', 'clarinetto', 'clarinette', 'clarinetes', 'clarinets'],
      subs: ['saxo_soprano', 'saxo_tenor', 'clarinete_bajo'] },
    { id: 'clarinete_bajo', name: 'Clarinete bajo', family: 'Madera', tuning: 'Bb', clef: 'Sol',
      aliases: ['clarinete bajo', 'bass clarinet', 'clarinetto basso', 'clarinette basse'],
      subs: ['saxo_tenor', 'clarinete', 'bombardino_sib'] },
    { id: 'saxo_soprano', name: 'Saxo soprano', family: 'Madera', tuning: 'Bb', clef: 'Sol',
      aliases: ['saxo soprano', 'saxofon soprano', 'soprano sax', 'soprano saxophone', 'sax soprano'],
      subs: ['clarinete', 'saxo_tenor'] },
    { id: 'saxo_alto', name: 'Saxo alto', family: 'Madera', tuning: 'Eb', clef: 'Sol',
      aliases: ['saxo alto', 'saxofon alto', 'alto sax', 'alto saxophone', 'sax alto', 'saxofon mib alto', 'saxo mib'],
      subs: ['saxo_baritono', 'requinto'] },
    { id: 'saxo_tenor', name: 'Saxo tenor', family: 'Madera', tuning: 'Bb', clef: 'Sol',
      aliases: ['saxo tenor', 'saxofon tenor', 'tenor sax', 'tenor saxophone', 'sax tenor'],
      subs: ['clarinete_bajo', 'saxo_soprano', 'bombardino_sib', 'clarinete'] },
    { id: 'saxo_baritono', name: 'Saxo barítono', family: 'Madera', tuning: 'Eb', clef: 'Sol',
      aliases: ['saxo baritono', 'saxofon baritono', 'baritone sax', 'baritone saxophone', 'sax baritono'],
      subs: ['saxo_alto'] },
    { id: 'trompa', name: 'Trompa', family: 'Metal', tuning: 'F', clef: 'Sol',
      aliases: ['trompa', 'trompas', 'horn in f', 'french horn', 'horn', 'corno', 'cor'], subs: ['corno_ingles'] },
    { id: 'fliscorno', name: 'Fliscorno', family: 'Metal', tuning: 'Bb', clef: 'Sol',
      aliases: ['fliscorno', 'flugelhorn', 'flicorno', 'fiscorno', 'bugle'], subs: ['trompeta'] },
    { id: 'trompeta', name: 'Trompeta', family: 'Metal', tuning: 'Bb', clef: 'Sol',
      aliases: ['trompeta', 'trompetas', 'trumpet', 'tromba', 'trompette', 'cornetin', 'cornet'], subs: ['fliscorno'] },
    { id: 'trombon', name: 'Trombón', family: 'Metal', tuning: 'C', clef: 'Fa',
      aliases: ['trombon', 'trombones', 'trombone', 'posaune'], subs: ['bombardino', 'trombon_bajo'] },
    { id: 'trombon_bajo', name: 'Trombón bajo', family: 'Metal', tuning: 'C', clef: 'Fa',
      aliases: ['trombon bajo', 'bass trombone', 'trombone basso'], subs: ['trombon', 'tuba', 'bombardino'] },
    { id: 'bombardino', name: 'Bombardino', family: 'Metal', tuning: 'C', clef: 'Fa',
      aliases: ['bombardino', 'euphonium', 'eufonio', 'baritono', 'baritone', 'bombardino en do', 'bombardino do'],
      subs: ['trombon', 'fagot', 'tuba'] },
    { id: 'bombardino_sib', name: 'Bombardino Si♭', family: 'Metal', tuning: 'Bb', clef: 'Sol',
      aliases: ['bombardino en sib', 'bombardino sib', 'bombardino si b', 'euphonium in bb', 'euphonium bb',
        'euphonium tc', 'baritone tc', 'baritono en sib', 'baritono sib'],
      subs: ['saxo_tenor', 'fliscorno'] },
    { id: 'tuba', name: 'Tuba', family: 'Metal', tuning: 'C', clef: 'Fa',
      aliases: ['tuba', 'tubas', 'helicon', 'sousafon', 'sousaphone', 'bajo en do', 'bajos'],
      subs: ['trombon_bajo', 'bombardino', 'fagot'] },
    { id: 'contrabajo', name: 'Contrabajo', family: 'Cuerda', tuning: 'C', clef: 'Fa',
      aliases: ['contrabajo', 'string bass', 'double bass', 'contrabbasso'], subs: ['tuba'] },
    { id: 'timbales', name: 'Timbales', family: 'Percusión', tuning: 'perc', clef: 'Fa',
      aliases: ['timbales', 'timpani', 'timbal', 'timbales sinfonicos'], subs: [] },
    { id: 'laminas', name: 'Láminas', family: 'Percusión', tuning: 'C', clef: 'Sol',
      aliases: ['laminas', 'xilofono', 'xylophone', 'glockenspiel', 'lira', 'vibrafono', 'vibraphone',
        'marimba', 'campanolo', 'mallets', 'carillon'], subs: [] },
    { id: 'caja', name: 'Caja', family: 'Percusión', tuning: 'perc', clef: 'Perc.',
      aliases: ['caja', 'redoblante', 'snare drum', 'snare', 'tambor'], subs: ['percusion'] },
    { id: 'bombo', name: 'Bombo', family: 'Percusión', tuning: 'perc', clef: 'Perc.',
      aliases: ['bombo', 'bass drum', 'bombo y platos', 'bombo platos'], subs: ['platos', 'percusion'] },
    { id: 'platos', name: 'Platos', family: 'Percusión', tuning: 'perc', clef: 'Perc.',
      aliases: ['platos', 'cymbals', 'plato', 'crash cymbals'], subs: ['bombo', 'percusion'] },
    { id: 'percusion', name: 'Percusión', family: 'Percusión', tuning: 'perc', clef: 'Perc.',
      aliases: ['percusion', 'percussion', 'bateria', 'drum set', 'accesorios'], subs: ['caja', 'bombo', 'platos'] },
  ];

  // Páginas que no son papeles de instrumento (guion de director, portadas...).
  const IGNORE_ID = '_ignorar';
  const IGNORE_ALIASES = ['guion', 'guion director', 'director', 'partitura general', 'full score',
    'conductor', 'score', 'partitura completa', 'condensed score'];

  const ORDINAL_WORDS = {
    primer: 1, primero: 1, primera: 1, first: 1, '1er': 1, '1o': 1, '1a': 1,
    segundo: 2, segunda: 2, second: 2,
    tercer: 3, tercero: 3, tercera: 3, third: 3,
    cuarto: 4, cuarta: 4, fourth: 4,
    quinto: 5, quinta: 5, fifth: 5,
  };
  const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

  function normalize(text) {
    return String(text || '')
      .replace(/♭/g, 'b')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[º°]/g, 'º')
      .replace(/[^a-z0-9ºª\/\-&,\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Interpreta un texto de voces: "1", "2-3", "1 y 2", "1,2", "II", "" (= papel único).
   * Devuelve un array ordenado de números (vacío = papel único que vale para todas las voces).
   */
  function parseVoices(text) {
    const t = normalize(text);
    if (!t) return [];
    const out = new Set();
    const tokens = t.split(/\s*(?:,|y|e|&|\/|\+)\s*/).filter(Boolean);
    for (const tok of tokens) {
      const range = tok.match(/^(\d+|[iv]+)\s*[ºªoa]?\s*-\s*(\d+|[iv]+)\s*[ºªoa]?$/);
      if (range) {
        const a = toNumber(range[1]);
        const b = toNumber(range[2]);
        if (a && b) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
          continue;
        }
      }
      const n = toNumber(tok.replace(/\s*(ºª|º|ª|st|nd|rd|th)$/, '').replace(/^(\d+)[oa]$/, '$1'));
      if (n) out.add(n);
    }
    return Array.from(out).sort((a, b) => a - b);
  }

  function toNumber(tok) {
    tok = String(tok).trim();
    if (/^\d+$/.test(tok)) {
      const n = parseInt(tok, 10);
      return n >= 1 && n <= 12 ? n : 0;
    }
    if (ROMAN[tok]) return ROMAN[tok];
    if (ORDINAL_WORDS[tok]) return ORDINAL_WORDS[tok];
    return 0;
  }

  function formatVoices(voices) {
    if (!voices || !voices.length) return '';
    const parts = [];
    let start = voices[0];
    let prev = voices[0];
    for (let i = 1; i <= voices.length; i++) {
      const v = voices[i];
      if (v === prev + 1) { prev = v; continue; }
      parts.push(start === prev ? `${start}` : (prev === start + 1 ? `${start},${prev}` : `${start}-${prev}`));
      start = prev = v;
    }
    return parts.join(',');
  }

  function voiceLabel(voices) {
    if (!voices || !voices.length) return '';
    if (voices.length === 1) return `${voices[0]}º`;
    const last = voices[voices.length - 1];
    const contiguous = last - voices[0] === voices.length - 1;
    if (contiguous && voices.length > 2) return `${voices[0]}º-${last}º`;
    return voices.slice(0, -1).map((v) => `${v}º`).join(', ') + ` y ${last}º`;
  }

  // Busca la voz alrededor de la coincidencia del nombre del instrumento.
  const KEY_ANNOT = '(?:(?:en|in)\\s+)?(?:sib|si b|mib|mi b|fa|do|bb|eb|b b|e b|f|c)\\s+';
  const NUM = '(\\d{1,2}|i{1,3}|iv|vi?)\\s*(?:ºª|º|ª|o|a|st|nd|rd|th)?';
  const AFTER_RE = new RegExp(
    '^\\s*(?:' + KEY_ANNOT + ')?' + NUM +
    '(?:\\s*(-|y|e|\\/|&|,|\\+)\\s*' + NUM + ')?(?:\\s*(?:y|e|,|&|\\/)\\s*' + NUM + ')?(?![0-9a-z])');
  const BEFORE_RE = /(?:^|\s)(\d)\s*(?:º|ª|o|a|st|nd|rd|th|er)?\s*$/;

  function findVoicesNear(t, start, end) {
    const after = t.slice(end, end + 30);
    const m = after.match(AFTER_RE);
    if (m) {
      const parts = [m[1], m[2] ? m[2] : null, m[3], m[4]].filter((x) => x !== undefined && x !== null);
      const sep = m[2];
      let str;
      if (m[3]) str = sep === '-' ? `${m[1]}-${m[3]}` : `${m[1]},${m[3]}`;
      else str = m[1];
      if (m[4]) str += `,${m[4]}`;
      const v = parseVoices(str);
      if (v.length && parts.length) return v;
    }
    // Ordinal en palabras después: "Clarinete primero"
    const wordAfter = after.match(/^\s*(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa])(?![a-z])/);
    if (wordAfter) return [ORDINAL_WORDS[wordAfter[1]]];

    const before = t.slice(Math.max(0, start - 14), start);
    const wordBefore = before.match(/(?:^|\s)(1er|primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|first|second|third|fourth)\s*$/);
    if (wordBefore) return [ORDINAL_WORDS[wordBefore[1]]];
    const b = before.match(BEFORE_RE);
    if (b) return [parseInt(b[1], 10)];
    return [];
  }

  function buildMatchers(catalog) {
    const list = [];
    for (const inst of catalog) {
      for (const a of inst.aliases || []) {
        const na = normalize(a);
        if (na) list.push({ id: inst.id, alias: na });
      }
    }
    for (const a of IGNORE_ALIASES) list.push({ id: IGNORE_ID, alias: normalize(a) });
    list.sort((x, y) => y.alias.length - x.alias.length);
    for (const m of list) {
      m.re = new RegExp('(?:^|[^a-z0-9])(' + escapeRegex(m.alias).replace(/ /g, '\\s+') + ')(?![a-z])', 'g');
    }
    return list;
  }

  /**
   * Detecta el instrumento y la voz en un texto.
   * Devuelve { id, voices } o null.
   */
  function detect(text, catalog, matchers) {
    const t = normalize(text);
    if (!t) return null;
    matchers = matchers || buildMatchers(catalog || DEFAULT_CATALOG);
    const taken = [];
    const found = [];
    for (const m of matchers) {
      m.re.lastIndex = 0;
      let r;
      while ((r = m.re.exec(t)) !== null) {
        const start = r.index + r[0].length - r[1].length;
        const end = start + r[1].length;
        if (taken.some(([s, e]) => start < e && end > s)) continue;
        taken.push([start, end]);
        found.push({ id: m.id, start, end });
      }
    }
    if (!found.length) return null;
    // Preferimos un instrumento real sobre "guion/director" si aparecen ambos.
    found.sort((a, b) => a.start - b.start);
    const real = found.find((f) => f.id !== IGNORE_ID);
    const best = real || found[0];
    if (best.id === IGNORE_ID) return { id: IGNORE_ID, voices: [] };
    return { id: best.id, voices: findVoicesNear(t, best.start, best.end) };
  }

  /** Devuelve los distintos instrumentos mencionados en un texto (para reconocer páginas de guion). */
  function detectAll(text, catalog, matchers) {
    const t = normalize(text);
    if (!t) return [];
    matchers = matchers || buildMatchers(catalog || DEFAULT_CATALOG);
    const taken = [];
    const ids = new Set();
    for (const m of matchers) {
      m.re.lastIndex = 0;
      let r;
      while ((r = m.re.exec(t)) !== null) {
        const start = r.index + r[0].length - r[1].length;
        const end = start + r[1].length;
        if (taken.some(([s, e]) => start < e && end > s)) continue;
        taken.push([start, end]);
        if (m.id !== IGNORE_ID) ids.add(m.id);
      }
    }
    return Array.from(ids);
  }

  /** Genera la lista de sustitutos por defecto: misma familia + misma afinación + misma clave. */
  function autoSubs(inst, catalog) {
    return catalog
      .filter((o) => o.id !== inst.id && o.family === inst.family && o.tuning === inst.tuning && o.clef === inst.clef)
      .map((o) => o.id);
  }

  function cloneCatalog(catalog) {
    return JSON.parse(JSON.stringify(catalog || DEFAULT_CATALOG));
  }

  const api = {
    DEFAULT_CATALOG,
    IGNORE_ID,
    normalize,
    parseVoices,
    formatVoices,
    voiceLabel,
    buildMatchers,
    detect,
    detectAll,
    autoSubs,
    cloneCatalog,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Instruments = api;
})(typeof self !== 'undefined' ? self : this);
