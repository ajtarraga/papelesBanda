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
      aliases: ['flautin', 'piccolo', 'ottavino', 'petite flute', 'flauti', 'piccolo fluit', 'picc'], subs: ['flauta', 'oboe'] },
    { id: 'flauta', name: 'Flauta', family: 'Madera', tuning: 'C', clef: 'Sol',
      aliases: ['flauta', 'flautas', 'flute', 'flutes', 'flauto', 'flauti', 'flote', 'grosse flote', 'fluit', 'fluiten', 'fluit c'], subs: ['flautin', 'oboe'] },
    { id: 'oboe', name: 'Oboe', family: 'Madera', tuning: 'C', clef: 'Sol',
      aliases: ['oboe', 'oboes', 'hautbois', 'oboi', 'hobo', 'hobos'], subs: ['flauta', 'flautin'] },
    { id: 'corno_ingles', name: 'Corno inglés', family: 'Madera', tuning: 'F', clef: 'Sol',
      aliases: ['corno ingles', 'english horn', 'cor anglais'], subs: ['trompa'] },
    { id: 'fagot', low: true, name: 'Fagot', family: 'Madera', tuning: 'C', clef: 'Fa',
      aliases: ['fagot', 'fagots', 'bassoon', 'bassoons', 'fagotto', 'fagotti', 'basson', 'fagott', 'fagotten'], subs: ['bombardino', 'trombon', 'tuba'] },
    { id: 'requinto', name: 'Requinto', family: 'Madera', tuning: 'Eb', clef: 'Sol',
      aliases: ['requinto', 'requint', 'klarinet in es', 'es klarinet', 'clarinete en mib', 'clarinete mib', 'eb clarinet', 'clarinet in eb', 'clarinetto piccolo'],
      subs: ['saxo_alto', 'saxo_baritono'] },
    { id: 'clarinete', name: 'Clarinete', family: 'Madera', tuning: 'Bb', clef: 'Sol',
      aliases: ['clarinete', 'clarinet', 'clarinetto', 'clarinette', 'clarinetes', 'clarinets', 'clarinetti', 'klarinette', 'klarinet', 'klarinetten', 'clarinet sib'],
      subs: ['saxo_soprano', 'saxo_tenor', 'clarinete_bajo'] },
    { id: 'clarinete_alto', name: 'Clarinete alto', family: 'Madera', tuning: 'Eb', clef: 'Sol',
      aliases: ['clarinete alto', 'alto clarinet', 'clarinetto contralto', 'clarinette alto', 'altklarinette'],
      subs: ['saxo_alto', 'requinto', 'saxo_baritono'] },
    { id: 'clarinete_bajo', low: true, name: 'Clarinete bajo', family: 'Madera', tuning: 'Bb', clef: 'Sol',
      aliases: ['clarinete bajo', 'bass clarinet', 'clarinetto basso', 'clarinette basse', 'bassklarinette', 'clarinete bajo en sib', 'basklarinet', 'clarinet baix', 'clarinete baixo', 'bass clarinets'],
      subs: ['saxo_tenor', 'clarinete', 'bombardino_sib'] },
    { id: 'saxo_soprano', name: 'Saxo soprano', family: 'Madera', tuning: 'Bb', clef: 'Sol',
      aliases: ['saxo soprano', 'saxofon soprano', 'soprano sax', 'soprano saxophone', 'soprano saxophones', 'sax soprano', 'saxophone soprano', 'sassofono soprano', 'sopransaxophon', 'sopraansaxofoon', 'saxo soprano sib'],
      subs: ['clarinete', 'saxo_tenor'] },
    { id: 'saxo_alto', name: 'Saxo alto', family: 'Madera', tuning: 'Eb', clef: 'Sol',
      aliases: ['saxo alto', 'saxofon alto', 'alto sax', 'alto saxophone', 'sax alto', 'saxofon mib alto', 'saxo mib',
        'saxophone alto', 'sassofono contralto', 'sassofono alto', 'altsaxophon', 'saxos altos', 'saxofones altos',
        'altsaxofoon', 'alt saxofoon', 'saxo alt', 'saxofon alt', 'alto saxophones', 'alto saxes', 'alto saxs'],
      subs: ['saxo_baritono', 'requinto'] },
    { id: 'saxo_tenor', low: true, name: 'Saxo tenor', family: 'Madera', tuning: 'Bb', clef: 'Sol',
      aliases: ['saxo tenor', 'saxofon tenor', 'tenor sax', 'tenor saxophone', 'sax tenor', 'saxophone tenor',
        'sassofono tenore', 'tenorsaxophon', 'saxos tenores', 'saxofones tenores', 'tenorsaxofoon', 'tenor saxofoon', 'tenor saxophones', 'tenor saxes'],
      subs: ['clarinete_bajo', 'saxo_soprano', 'bombardino_sib', 'clarinete'] },
    { id: 'saxo_baritono', low: true, name: 'Saxo barítono', family: 'Madera', tuning: 'Eb', clef: 'Sol',
      aliases: ['saxo baritono', 'saxofon baritono', 'baritone sax', 'baritone saxophone', 'sax baritono', 'saxophone baryton',
        'sassofono baritono', 'baritonsaxophon', 'baritonsaxofoon', 'bariton saxofoon', 'baritone saxophones'],
      subs: ['saxo_alto'] },
    { id: 'trompa', name: 'Trompa', family: 'Metal', tuning: 'F', clef: 'Sol',
      aliases: ['trompa', 'trompas', 'horn in f', 'french horn', 'horn', 'horns', 'corno', 'corni', 'cor', 'trompa en fa', 'hoorn', 'hoorns', 'hoorn in f'], subs: ['corno_ingles'] },
    { id: 'trompa_mib', name: 'Trompa Mi♭', family: 'Metal', tuning: 'Eb', clef: 'Sol',
      aliases: ['trompa en mib', 'trompa mib', 'trompas en mib', 'horn in eb', 'eb horn', 'alto horn', 'trompa mi b'],
      subs: ['saxo_alto'] },
    { id: 'fliscorno', name: 'Fliscorno', family: 'Metal', tuning: 'Bb', clef: 'Sol',
      aliases: ['fliscorno', 'fliscornos', 'flugelhorn', 'flicorno', 'fiscorno', 'bugle', 'flicorno soprano', 'bugel', 'bugels', 'fiscorn', 'fiscorns'], subs: ['trompeta'] },
    { id: 'trompeta', name: 'Trompeta', family: 'Metal', tuning: 'Bb', clef: 'Sol',
      aliases: ['trompeta', 'trompetas', 'trumpet', 'trumpets', 'tromba', 'trombe', 'trompette', 'trompete', 'cornetin', 'cornet', 'trompet', 'trompetten', 'kornet'], subs: ['fliscorno'] },
    { id: 'trombon', name: 'Trombón', family: 'Metal', tuning: 'C', clef: 'Fa',
      aliases: ['trombon', 'trombones', 'trombone', 'tromboni', 'posaune', 'trombo', 'trombons', 'trombonen'], subs: ['bombardino', 'trombon_bajo'] },
    { id: 'trombon_bajo', low: true, name: 'Trombón bajo', family: 'Metal', tuning: 'C', clef: 'Fa',
      aliases: ['trombon bajo', 'bass trombone', 'trombone basso', 'bassposaune'], subs: ['trombon', 'tuba', 'bombardino'] },
    { id: 'bombardino', low: true, name: 'Bombardino', family: 'Metal', tuning: 'C', clef: 'Fa',
      aliases: ['bombardino', 'bombardinos', 'euphonium', 'eufonio', 'baritono', 'baritone', 'bombardino en do', 'bombardino do',
        'baritone b c', 'baritone bc', 'euphonium b c', 'euphonium bc', 'bombardino b c', 'bombardi', 'bombardins', 'bariton', 'euphoniums'],
      subs: ['trombon', 'fagot', 'tuba'] },
    { id: 'bombardino_sib', name: 'Bombardino Si♭', family: 'Metal', tuning: 'Bb', clef: 'Sol',
      aliases: ['bombardino en sib', 'bombardino sib', 'bombardino si b', 'euphonium in bb', 'euphonium bb',
        'euphonium tc', 'baritone tc', 'baritono en sib', 'baritono sib', 'baritone t c', 'euphonium t c', 'baritono t c',
        'bombardino t c', 'tenorhorn'],
      subs: ['saxo_tenor', 'fliscorno'] },
    { id: 'tuba', low: true, name: 'Tuba', family: 'Metal', tuning: 'C', clef: 'Fa',
      aliases: ['tuba', 'tubas', 'helicon', 'sousafon', 'sousaphone', 'bajo en do', 'bajos', 'tuba in c', 'tuba en do'],
      subs: ['trombon_bajo', 'bombardino', 'fagot'] },
    { id: 'contrabajo', low: true, name: 'Contrabajo', family: 'Cuerda', tuning: 'C', clef: 'Fa',
      aliases: ['contrabajo', 'string bass', 'double bass', 'contrabbasso', 'contrebasse', 'kontrabass', 'electric bass', 'bajo electrico', 'contrabas', 'contrabaix', 'string bass'], subs: ['tuba'] },
    { id: 'violin', name: 'Violín', family: 'Cuerda', tuning: 'C', clef: 'Sol',
      aliases: ['violin', 'violines', 'violino', 'violini', 'violon', 'violine'], subs: [] },
    { id: 'violonchelo', name: 'Violonchelo', family: 'Cuerda', tuning: 'C', clef: 'Fa',
      aliases: ['violonchelo', 'violonchelos', 'violochelo', 'violochelos', 'violoncello', 'violoncelli', 'cello', 'cellos', 'chelo', 'chelos'], subs: [] },
    { id: 'txistu', name: 'Txistu', family: 'Madera', tuning: 'C', clef: 'Sol',
      aliases: ['txistu', 'txistus', 'chistu', 'chistus'], subs: [] },
    { id: 'timbales', name: 'Timbales', family: 'Percusión', tuning: 'perc', clef: 'Fa',
      aliases: ['timbales', 'timpani', 'timbal', 'timbales sinfonicos', 'pauken', 'timbals', 'timbalen'], subs: [] },
    { id: 'laminas', name: 'Láminas', family: 'Percusión', tuning: 'C', clef: 'Sol',
      aliases: ['laminas', 'xilofono', 'xylophone', 'glockenspiel', 'lira', 'vibrafono', 'vibraphone',
        'marimba', 'campanolo', 'mallets', 'carillon', 'mallet percussion', 'mallet perc', 'orchestra bells', 'chimes', 'campanas tubulares', 'campanas', 'campanolo', 'klokkenspel', 'klokken', 'xylofoon', 'vibrafoon', 'campanes'], subs: [] },
    { id: 'caja', name: 'Caja', family: 'Percusión', tuning: 'perc', clef: 'Perc.',
      aliases: ['caja', 'redoblante', 'snare drum', 'snare', 'tambor', 'caixa', 'kleine trom', 'snaredrum'], subs: ['percusion'] },
    { id: 'bombo', name: 'Bombo', family: 'Percusión', tuning: 'perc', clef: 'Perc.',
      aliases: ['bombo', 'bass drum', 'bombo y platos', 'bombo platos', 'grote trom', 'bassdrum'], subs: ['platos', 'percusion'] },
    { id: 'platos', name: 'Platos', family: 'Percusión', tuning: 'perc', clef: 'Perc.',
      aliases: ['platos', 'cymbals', 'plato', 'crash cymbals', 'plats', 'bekkens', 'bekken'], subs: ['bombo', 'percusion'] },
    { id: 'percusion', name: 'Percusión', family: 'Percusión', tuning: 'perc', clef: 'Perc.',
      aliases: ['percusion', 'percussion', 'bateria', 'drum set', 'drumset', 'accesorios', 'percussioni', 'percussions', 'schlagzeug', 'auxiliary percussion',
        'pandereta', 'almirez', 'slagwerk', 'percussio', 'percussions', 'percu', 'drums', 'triangulo', 'triangle', 'castanuelas', 'cascabeles', 'sleigh bells', 'tambourine',
        'claves', 'maracas', 'zambomba', 'gong', 'tam tam', 'carraca', 'woodblock', 'caja china'], subs: ['caja', 'bombo', 'platos'] },
  ];

  // Páginas que no son papeles de instrumento (guion de director, portadas...).
  const IGNORE_ID = '_ignorar';
  // Guion del director (partitura general, portada "Conductor"...).
  const GUION_ID = '_guion';
  const GUION_ALIASES = ['guion', 'guion director', 'director', 'partitura general', 'full score',
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
      .replace(/[^a-z0-9ºª\/\-&,+\s]/g, ' ')
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
    for (const a of GUION_ALIASES) list.push({ id: GUION_ID, alias: normalize(a) });
    list.sort((x, y) => y.alias.length - x.alias.length);
    for (const m of list) {
      // Admite la afinación pegada al nombre ("FHORN", "BbCLARINET"), algo típico del OCR.
      m.re = new RegExp('(?:^|[^a-z0-9])(?:bb|eb|b|e|f|c)?(' + escapeRegex(m.alias).replace(/ /g, '\\s+') + ')(?![a-z])', 'g');
    }
    return list;
  }

  /** Corrige errores típicos del OCR antes de buscar instrumentos. */
  function cleanOcr(text) {
    return String(text || '')
      .replace(/[|¦]/g, ' 1 ')
      .replace(/(^|\s)[lI]\s*(?=$|\s)/g, '$1 1 ')
      .replace(/(\d)\s*[°o](?=\s|$)/g, '$1º');
  }

  // "Solo B♭ Clarinet", "Solista en Sib Trompeta"... (admite la afinación mal leída por el OCR: "EP", "B>")
  const SOLO_BEFORE = /(?:^|\s)(?:solo|solista|soloist|soloiste)\s+(?:(?:en|in)\s+)?(?:(?:sib|mib|si b|mi b|[a-z]{1,2})\s*)?$/;
  const SOLO_AFTER = /^\s*(?:(?:en|in)\s+(?:sib|mib|bb|eb|fa|do|f|c)\s+)?(?:\d\s*[ºª]?\s+)?(?:solo|solista|soloist)(?![a-z])/;

  /**
   * Devuelve todos los instrumentos encontrados en el texto, por orden de aparición:
   * [{ id, voices, solo, start }]
   */
  function detectCandidates(text, catalog, matchers) {
    const t = normalize(text);
    if (!t) return [];
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
    found.sort((a, b) => a.start - b.start);
    return found.map((f) => {
      if (f.id === GUION_ID) return { id: GUION_ID, voices: [], solo: false, start: f.start };
      const solo = SOLO_BEFORE.test(t.slice(Math.max(0, f.start - 20), f.start)) || SOLO_AFTER.test(t.slice(f.end, f.end + 20));
      return { id: f.id, voices: findVoicesNear(t, f.start, f.end), solo, start: f.start };
    });
  }

  /**
   * Detecta el instrumento y la voz en un texto (el primero que aparece).
   * Devuelve { id, voices, solo } o null.
   */
  function detect(text, catalog, matchers) {
    const c = detectCandidates(text, catalog, matchers)[0];
    return c ? { id: c.id, voices: c.voices, solo: c.solo } : null;
  }

  /** Devuelve los distintos instrumentos mencionados en un texto (para reconocer páginas de guion). */
  function detectAll(text, catalog, matchers) {
    const ids = new Set();
    for (const c of detectCandidates(text, catalog, matchers)) if (c.id !== GUION_ID) ids.add(c.id);
    return Array.from(ids);
  }

  // Abreviaturas habituales en los nombres de archivo de los papeles (clte-1.pdf, tpa-1-f.pdf, NAV TRPT.pdf...).
  const FILE_ABBR = {
    clte: 'clarinete', clt: 'clarinete', clts: 'clarinete', cl: 'clarinete', cla: 'clarinete', clar: 'clarinete',
    clarinet: 'clarinete', clarinete: 'clarinete', clarinetes: 'clarinete', clarinets: 'clarinete',
    tpa: 'trompa', tpas: 'trompa', trpa: 'trompa', trp: 'trompa', trompa: 'trompa', trompas: 'trompa', hn: 'trompa', horn: 'trompa',
    tpta: 'trompeta', tptas: 'trompeta', tpt: 'trompeta', trpt: 'trompeta', tp: 'trompeta', tr: 'trompeta',
    tbon: 'trombon', tbn: 'trombon', trb: 'trombon', tbones: 'trombon',
    bdino: 'bombardino', bdno: 'bombardino', bno: 'bombardino', bomb: 'bombardino', bdinos: 'bombardino', euph: 'bombardino',
    fl: 'flauta', flt: 'flauta', fla: 'flauta', flis: 'fliscorno', fli: 'fliscorno', flisc: 'fliscorno', flg: 'fliscorno',
    ob: 'oboe', fg: 'fagot', fag: 'fagot', req: 'requinto', pic: 'flautin', picc: 'flautin',
    sa: 'saxo alto', st: 'saxo tenor', sb: 'saxo baritono', ss: 'saxo soprano', asx: 'saxo alto', tsx: 'saxo tenor',
    tb: 'tuba', tba: 'tuba', bajo: 'tuba', bajos: 'tuba',
    per: 'percusion', perc: 'percusion', timb: 'timbales', lam: 'laminas', xil: 'laminas',
    vl: 'violin', vln: 'violin', vn: 'violin', cb: 'contrabajo',
  };
  const SAX_WORDS = new Set(['sax', 'saxo', 'saxos', 'saxofon', 'saxofones', 'saxophone', 'saxophones', 'saxofoon', 'saxofoons']);
  const SAX_KIND = { a: 'saxo_alto', alto: 'saxo_alto', altos: 'saxo_alto', t: 'saxo_tenor', tenor: 'saxo_tenor', tenores: 'saxo_tenor',
    b: 'saxo_baritono', bar: 'saxo_baritono', bari: 'saxo_baritono', baritono: 'saxo_baritono', baritone: 'saxo_baritono',
    s: 'saxo_soprano', sop: 'saxo_soprano', soprano: 'saxo_soprano', alt: 'saxo_alto', sopraan: 'saxo_soprano', bariton: 'saxo_baritono' };
  const GUION_WORDS = new Set(['guion', 'guiones', 'director', 'score', 'conductor', 'partitura', 'general', 'full']);

  /**
   * Detecta instrumento y voz en el nombre de un archivo de papel suelto.
   * Devuelve { id, voices, solo } o null si el nombre no dice nada (p. ej. "7.pdf").
   */
  function parseFileName(fileName, catalog, matchers) {
    const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
    const tokens = normalize(base.replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z])/g, '$1 $2'))
      .split(/[^a-z0-9ºª]+/).map((t) => t.replace(/^(\d+)[ºª]$/, '$1')).filter(Boolean);
    if (!tokens.length) return null;
    // Guion del director: guion, guió (catalán), conductor, partitura, full score...
    if (tokens.some((t) => ['guion', 'guiones', 'guio', 'guions', 'conductor', 'partitura', 'partituur', 'directie', 'direccion'].includes(t)) ||
        (tokens.includes('score') && tokens.includes('full'))) {
      return { id: GUION_ID, voices: [], solo: false };
    }
    let id = null;
    let at = -1;
    let solo = false;
    for (let i = 0; i < tokens.length && !id; i++) {
      const t = tokens[i];
      const next = tokens[i + 1];
      if (SAX_WORDS.has(t) && next && SAX_KIND[next]) { id = SAX_KIND[next]; at = i + 1; break; }
      const abbr = FILE_ABBR[t];
      if (abbr === 'clarinete') {
        at = i;
        if (next === 'b' || next === 'bajo' || next === 'bass') { id = 'clarinete_bajo'; at = i + 1; }
        else if (next === 'alto' || next === 'a') { id = 'clarinete_alto'; at = i + 1; }
        else if (next === 'mib' || next === 'req' || next === 'eb') { id = 'requinto'; at = i + 1; }
        else if (next === 'p' || next === 'pral' || next === 'principal' || next === 'solista' || next === 'solo') { id = 'clarinete'; solo = true; at = i + 1; }
        else id = 'clarinete';
      }
    }
    if (!id) {
      // Texto con las abreviaturas desarrolladas y búsqueda normal de nombres de instrumento.
      const text = tokens.map((t) => FILE_ABBR[t] || t).join(' ');
      const c = detectCandidates(text, catalog, matchers).find((x) => x.id !== GUION_ID);
      if (!c) return null;
      id = c.id;
      solo = c.solo;
      // Posición aproximada del instrumento para leer las voces que vienen detrás.
      const words = text.split(' ');
      const pos = text.slice(0, c.start).split(' ').length - 1;
      at = Math.min(tokens.length - 1, Math.max(0, pos - (words.length - tokens.length)));
    }
    const rest = tokens.slice(at + 1);
    // Afinación indicada con una letra: tpa-1-e (Mi♭), tpa-1-f (Fa), bdino-1-b (Si♭), bdino-1-c (Do).
    const keys = new Set(rest.filter((t) => /^[a-z]{1,3}$/.test(t)));
    if ((id === 'trompa' || id === 'trompa_mib') && (keys.has('e') || keys.has('es') || keys.has('mib') || keys.has('eb'))) id = 'trompa_mib';
    else if (id === 'trompa_mib' && (keys.has('f') || keys.has('fa'))) id = 'trompa';
    if ((id === 'bombardino' || id === 'bombardino_sib') && (keys.has('b') || keys.has('sib') || keys.has('bb') || keys.has('tc'))) id = 'bombardino_sib';
    else if (id === 'bombardino_sib' && (keys.has('c') || keys.has('do') || keys.has('bc'))) id = 'bombardino';
    if (rest.includes('solo') || rest.includes('solista')) solo = true;
    const voices = Array.from(new Set(rest.filter((t) => /^[1-9]$/.test(t)).map(Number))).sort((x, y) => x - y);
    return { id, voices, solo };
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
    GUION_ID,
    parseFileName,
    normalize,
    parseVoices,
    formatVoices,
    voiceLabel,
    buildMatchers,
    detect,
    detectAll,
    detectCandidates,
    cleanOcr,
    autoSubs,
    cloneCatalog,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Instruments = api;
})(typeof self !== 'undefined' ? self : this);
