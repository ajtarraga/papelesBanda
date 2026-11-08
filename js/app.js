/* global pdfjsLib, PDFLib, JSZip, Instruments, Distribute, Tesseract */
(function () {
  'use strict';

  const I = Instruments;
  const D = Distribute;
  const STORAGE_KEY = 'papelesBanda.catalog.v3';
  const TEMPLATE_KEY = 'papelesBanda.template.v1';
  const MODE_KEY = 'papelesBanda.mode.v1';

  // Plantilla por defecto: las carpetas de la banda (como en el ejemplo).
  const DEFAULT_TEMPLATE = [
    { name: 'Fl', insts: ['flauta'], voice: 1, all: false },
    { name: 'Ob', insts: ['oboe'], voice: 1, all: false },
    { name: 'Cl 1', insts: ['clarinete'], voice: 1, all: false },
    { name: 'Cl 2', insts: ['clarinete'], voice: 2, all: false },
    { name: 'Cl B', insts: ['clarinete_bajo'], voice: null, all: false },
    { name: 'SA', insts: ['saxo_alto'], voice: 1, all: false },
    { name: 'ST', insts: ['saxo_tenor'], voice: 1, all: false },
    { name: 'Trp', insts: ['trompa'], voice: 1, all: false },
    { name: 'Trpt', insts: ['trompeta'], voice: 1, all: false },
    { name: 'Tbn', insts: ['trombon'], voice: 1, all: false },
    { name: 'Bno', insts: ['bombardino'], voice: 1, all: false },
    { name: 'Tb', insts: ['tuba'], voice: null, all: false },
    { name: 'Per', insts: ['percusion', 'caja', 'bombo', 'platos', 'timbales', 'laminas'], voice: null, all: true },
  ];

  // ---------- pdf.js ----------
  // Con file:// los Web Workers no se pueden cargar; en ese caso pdf.js trabaja en el hilo principal.
  const pdfReady = new Promise((resolve) => {
    if (location.protocol === 'file:') {
      const s = document.createElement('script');
      s.src = 'vendor/pdf.worker.min.js';
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      resolve();
    }
  });

  // ---------- Estado ----------
  function loadJSON(key, fallback, valid) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!valid || valid(parsed)) return parsed;
      }
    } catch (e) { /* almacenamiento no disponible */ }
    return fallback;
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignorar */ }
  }

  const state = {
    catalog: loadJSON(STORAGE_KEY, I.cloneCatalog(), (x) => Array.isArray(x) && x.length),
    template: loadJSON(TEMPLATE_KEY, JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)), (x) => Array.isArray(x)),
    mode: loadJSON(MODE_KEY, 'plantilla', (x) => x === 'plantilla' || x === 'auto'),
    works: [],
    overrides: {}, // `${workId}|${folderKey}` -> partId | '' (sin papel)
    plan: null,
  };
  let matchers = I.buildMatchers(state.catalog);
  let nextId = 1;

  function saveCatalog() {
    matchers = I.buildMatchers(state.catalog);
    saveJSON(STORAGE_KEY, state.catalog);
  }

  function saveTemplate() {
    saveJSON(TEMPLATE_KEY, state.template);
  }

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }

  function instById(id) {
    return state.catalog.find((c) => c.id === id);
  }

  function instName(id) {
    if (id === I.IGNORE_ID) return 'Ignorar';
    if (id === I.GUION_ID) return 'Guion del director';
    if (id && id.endsWith('~solo')) return `${instName(id.slice(0, -5))} solista`;
    const c = instById(id);
    return c ? c.name : id;
  }

  function partLabel(inst, voices) {
    const v = I.voiceLabel(voices);
    return instName(inst) + (v ? ' ' + v : '');
  }

  function folderLabel(f) {
    if (f.name) return f.name;
    return instName(f.inst) + (f.voice ? ` ${f.voice}º` : '');
  }

  // Qué recibe una carpeta de la plantilla, en palabras.
  function folderHint(f) {
    if (!f.name) return '';
    if (f.all) return (f.insts || []).map(instName).join(', ');
    const alt = (f.extraSubs || []).length ? ` (o ${f.extraSubs.map(instName).join(', ')})` : '';
    return instName(f.inst) + (f.shownVoice ? ` ${f.shownVoice}º` : '') + alt;
  }

  function hueFor(id) {
    if (!id) return 'transparent';
    if (id.endsWith('~solo')) id = id.slice(0, -5);
    if (id === I.IGNORE_ID) return '#999';
    if (id === I.GUION_ID) return '#555';
    let x = 0;
    for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) % 360;
    const idx = state.catalog.findIndex((c) => c.id === id);
    const hue = idx >= 0 ? (idx * 47) % 360 : x;
    return `hsl(${hue} 60% 50%)`;
  }

  // ---------- Pestañas ----------
  $$('.tab').forEach((b) =>
    b.addEventListener('click', () => showView(b.dataset.view)));

  function showView(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    if (name === 'reparto') renderPlan();
    if (name === 'instrumentos') renderInstruments();
    if (name === 'banda') renderTemplate();
  }

  // ---------- Carga de archivos ----------
  const dz = $('#dropzone');
  const fileInput = $('#file-input');
  const dirInput = $('#dir-input');
  fileInput.addEventListener('change', () => {
    addEntries(Array.from(fileInput.files).map((f) => ({ file: f, path: f.name })));
    fileInput.value = '';
  });
  dirInput.addEventListener('change', () => {
    addEntries(Array.from(dirInput.files).map((f) => ({ file: f, path: f.webkitRelativePath || f.name })));
    dirInput.value = '';
  });
  $('#btn-files').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  $('#btn-dir').addEventListener('click', (e) => { e.stopPropagation(); dirInput.click(); });
  dz.addEventListener('click', () => fileInput.click());
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => { entriesFromDrop(e.dataTransfer).then(addEntries); });
  // Evitar que el navegador abra el PDF si se suelta fuera de la zona.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // Recorre las carpetas soltadas (con sus subcarpetas) y devuelve [{ file, path }].
  function entriesFromDrop(dt) {
    // Las entradas hay que pedirlas ya, antes de cualquier espera.
    const roots = Array.from(dt.items || []).map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    const plain = Array.from(dt.files || []);
    if (!roots.length) return Promise.resolve(plain.map((f) => ({ file: f, path: f.name })));
    const out = [];
    const readAll = (reader) => new Promise((resolve, reject) => {
      const acc = [];
      const step = () => reader.readEntries((batch) => {
        if (!batch.length) return resolve(acc);
        acc.push(...batch);
        step();
      }, reject);
      step();
    });
    const walk = async (entry, prefix) => {
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        out.push({ file, path: prefix + file.name });
      } else if (entry.isDirectory) {
        for (const child of await readAll(entry.createReader())) await walk(child, `${prefix}${entry.name}/`);
      }
    };
    return (async () => {
      for (const r of roots) await walk(r, '');
      return out;
    })();
  }

  function setStatus(el, msg, isError) {
    el.hidden = !msg;
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }

  const byPath = (a, b) => a.path.localeCompare(b.path, 'es', { numeric: true, sensitivity: 'base' });
  const median = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
  };
  const stripExt = (name) => name.replace(/\.pdf$/i, '');

  /*
   * Agrupa los archivos en obras:
   * - Cada subcarpeta es una obra (con todos sus PDF: un archivo por papel, guion...).
   * - Una carpeta sola con papeles cortos es una obra.
   * - Un PDF suelto (o una carpeta de PDF largos) es una obra por archivo (guion completo con todos los papeles).
   */
  function groupEntries(list) {
    const dirsOf = (e) => e.path.split('/').slice(0, -1);
    let common = null;
    for (const e of list) {
      const d = dirsOf(e);
      if (common === null) { common = d; continue; }
      let k = 0;
      while (k < common.length && k < d.length && common[k] === d[k]) k++;
      common = common.slice(0, k);
    }
    common = common || [];
    const hasSub = list.some((e) => dirsOf(e).length > common.length);
    const groups = [];
    const byKey = new Map();
    const add = (key, name, e) => {
      if (!byKey.has(key)) { const g = { key, name, entries: [] }; byKey.set(key, g); groups.push(g); }
      byKey.get(key).entries.push(e);
    };
    const loose = [];
    for (const e of list.slice().sort(byPath)) {
      const rest = dirsOf(e).slice(common.length);
      if (rest.length) add(`d:${rest[0]}`, rest[0], e);
      else if (common.length && !hasSub) add('d:', common[common.length - 1], e);
      else loose.push(e);
    }
    if (loose.length > 1 && !hasSub && median(loose.map((e) => e.pdf.numPages)) <= 4) {
      loose.forEach((e) => add('loose', 'Obra nueva', e));
    } else {
      loose.forEach((e) => add(`f:${e.path}`, stripExt(e.file.name), e));
    }
    // Una carpeta llena de PDF largos es una colección de obras, no una obra.
    const out = [];
    for (const g of groups) {
      if (g.entries.length > 1 && median(g.entries.map((e) => e.pdf.numPages)) > 6) {
        g.entries.forEach((e) => out.push({ key: `f:${e.path}`, name: stripExt(e.file.name), entries: [e] }));
      } else out.push(g);
    }
    return out;
  }

  async function addEntries(list) {
    const pdfs = list.filter((e) => /\.pdf$/i.test(e.file.name) || e.file.type === 'application/pdf');
    if (!pdfs.length) return;
    await pdfReady;
    const status = $('#load-status');
    const failed = [];
    const opened = [];
    for (let i = 0; i < pdfs.length; i++) {
      const e = pdfs[i];
      setStatus(status, `Abriendo archivos… ${i + 1} de ${pdfs.length}`);
      try {
        const data = new Uint8Array(await e.file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
        opened.push({ file: e.file, path: e.path, data, pdf });
      } catch (err) {
        console.error(err);
        failed.push(e.path);
      }
    }
    const groups = groupEntries(opened);
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const prefix = `«${g.name}» (obra ${gi + 1} de ${groups.length})`;
      try {
        const work = await loadWork(g, (msg) => setStatus(status, `${prefix}: ${msg}`));
        state.works.push(work);
        renderWorks();
      } catch (err) {
        console.error(err);
        failed.push(g.name);
      }
    }
    if (failed.length) setStatus(status, `No se pudieron leer: ${failed.join(', ')}`, true);
    else setStatus(status, '');
  }

  // ---------- OCR (páginas escaneadas) ----------
  let ocrPromise = null;

  function getOcr() {
    if (ocrPromise) return ocrPromise;
    ocrPromise = (async () => {
      if (typeof Tesseract === 'undefined') throw new Error('No se pudo cargar el OCR');
      // Con file:// el navegador no deja cargar los archivos locales del OCR: se usan desde internet.
      const local = location.protocol !== 'file:';
      const base = new URL('vendor/tesseract/', location.href).href;
      const opts = local
        ? { workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang' }
        : { workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
          corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
          langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int' };
      const langs = local ? 'eng+spa' : 'eng';
      const scheduler = Tesseract.createScheduler();
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
      for (let i = 0; i < n; i++) {
        const worker = await Tesseract.createWorker(langs, 1, opts);
        await worker.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '300' });
        scheduler.addWorker(worker);
      }
      return scheduler;
    })();
    ocrPromise.catch(() => { ocrPromise = null; });
    return ocrPromise;
  }

  // ---------- Análisis de páginas ----------
  const STAFF_SCORE_MIN = 55; // líneas de pentagrama (normalizado) a partir de las que es partitura general
  const DUP_MIN_SIM = 0.7; // similitud a partir de la que una página es copia de otra

  function grayData(canvas, w, h, sx, sy, sw, sh) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return g;
  }

  // Cuenta líneas de pentagrama por franjas verticales (tolera escaneos torcidos).
  function countStaffLines(canvas) {
    const H = 1100;
    const W = Math.max(200, Math.round((H * canvas.width) / canvas.height));
    const g = grayData(canvas, W, H, 0, 0, canvas.width, canvas.height);
    const counts = [];
    const strips = 8;
    for (let k = 0; k < strips; k++) {
      const x0 = Math.floor(W * (0.1 + (0.8 * k) / strips));
      const x1 = Math.floor(W * (0.1 + (0.8 * (k + 1)) / strips));
      let runs = 0;
      let prev = false;
      for (let y = 0; y < H; y++) {
        let dark = 0;
        for (let x = x0; x < x1; x++) if (g[y * W + x] < 150) dark++;
        const on = dark / (x1 - x0) > 0.6;
        if (on && !prev) runs++;
        prev = on;
      }
      counts.push(runs);
    }
    counts.sort((a, b) => a - b);
    return counts[Math.floor(strips / 2)];
  }

  // Huella de la zona de música para reconocer copias repetidas del mismo papel.
  function fingerprint(canvas) {
    const sx = canvas.width * 0.05;
    const sy = canvas.height * 0.18;
    const sw = canvas.width * 0.9;
    const sh = canvas.height * 0.67;
    const w = 150;
    const h = Math.round((w * sh) / sw);
    const g = grayData(canvas, w, h, sx, sy, sw, sh);
    for (let i = 0; i < g.length; i++) g[i] = 255 - g[i];
    return { w, h, data: g };
  }

  function similarity(a, b) {
    if (!a || !b || a.w !== b.w || Math.abs(a.h - b.h) > 2) return 0;
    const s = 3;
    const W = a.w;
    const H = Math.min(a.h, b.h);
    const n = (W - 2 * s) * (H - 2 * s);
    const stats = (arr, dx, dy) => {
      let sum = 0;
      let sq = 0;
      for (let y = s; y < H - s; y++) {
        for (let x = s; x < W - s; x++) {
          const v = arr[(y + dy) * W + x + dx];
          sum += v;
          sq += v * v;
        }
      }
      const mean = sum / n;
      return { mean, std: Math.sqrt(Math.max(1e-6, sq / n - mean * mean)) };
    };
    const sb = stats(b.data, 0, 0);
    let best = -1;
    for (let dy = -s; dy <= s; dy++) {
      for (let dx = -s; dx <= s; dx++) {
        const sa = stats(a.data, dx, dy);
        let acc = 0;
        for (let y = s; y < H - s; y++) {
          for (let x = s; x < W - s; x++) {
            acc += (a.data[(y + dy) * W + x + dx] - sa.mean) * (b.data[y * W + x] - sb.mean);
          }
        }
        best = Math.max(best, acc / n / (sa.std * sb.std));
      }
    }
    return best;
  }

  function pageSimilarity(work, i, j) {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (!(key in work.simCache)) work.simCache[key] = similarity(work.pages[i].fp, work.pages[j].fp);
    return work.simCache[key];
  }

  async function analyzePage(page, needOcr) {
    const vp0 = page.getViewport({ scale: 1 });
    const target = needOcr ? 2000 : 1000;
    const vp = page.getViewport({ scale: target / Math.min(vp0.width, vp0.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const tw = 220;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = tw;
    thumbCanvas.height = Math.round((tw * canvas.height) / canvas.width);
    const tctx = thumbCanvas.getContext('2d');
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

    let band = null;
    if (needOcr) {
      // Franja superior, donde suele estar el nombre del instrumento.
      band = document.createElement('canvas');
      band.width = canvas.width;
      band.height = Math.round(canvas.height * 0.22);
      band.getContext('2d').drawImage(canvas, 0, 0);
    }
    return {
      thumb: thumbCanvas.toDataURL('image/jpeg', 0.75),
      staves: countStaffLines(canvas),
      fp: fingerprint(canvas),
      band,
    };
  }

  // Abre todos los PDF de una obra y analiza sus páginas.
  async function loadWork(group, progress) {
    const work = {
      id: `w${nextId++}`,
      name: group.name,
      files: [],
      pages: [],
      expanded: false,
      simCache: {},
      ocrUsed: false,
      ocrError: null,
    };
    const wantOcr = $('#opt-ocr').checked;
    const totalPages = group.entries.reduce((n, e) => n + e.pdf.numPages, 0);
    let scheduler = null;
    const ocrJobs = [];
    let ocrDone = 0;
    let count = 0;
    for (const e of group.entries) {
      const fileIdx = work.files.length;
      const file = {
        name: e.file.name,
        path: e.path,
        data: e.data,
        pdf: e.pdf,
        numPages: e.pdf.numPages,
        firstPage: work.pages.length,
        fileDet: I.parseFileName(e.file.name, state.catalog, matchers),
      };
      work.files.push(file);
      // Un papel suelto con nombre reconocible no necesita OCR para saber qué es.
      const trustName = file.fileDet && file.numPages <= 3;
      for (let p = 1; p <= file.numPages; p++) {
        count++;
        progress(`página ${count} de ${totalPages}`);
        const page = await file.pdf.getPage(p);
        const texts = await pageTexts(page);
        const hasText = texts.all.replace(/\s/g, '').length >= 15;
        let needOcr = wantOcr && !hasText && !trustName && !work.ocrError;
        if (needOcr && !scheduler) {
          try {
            progress('preparando el reconocimiento de texto (OCR)…');
            scheduler = await getOcr();
          } catch (err) {
            console.warn(err);
            work.ocrError = location.protocol === 'file:'
              ? 'No se pudo activar el OCR: abriendo el archivo directamente hace falta conexión a internet. ' +
                'Usa la versión publicada (GitHub Pages) o «Iniciar» para trabajar sin conexión.'
              : `No se pudo activar el OCR (${err.message || err}).`;
            needOcr = false;
          }
        }
        const a = await analyzePage(page, needOcr);
        const pg = {
          fileIdx, pageNum: p, inst: null, voices: [], solo: false, src: 'heredado', thumb: a.thumb, texts,
          staves: a.staves, fp: a.fp, score: false, notDup: false, dupOf: null, firstLike: false, unknownStart: false,
        };
        work.pages.push(pg);
        if (needOcr) {
          work.ocrUsed = true;
          ocrJobs.push(scheduler.addJob('recognize', a.band).then((r) => {
            pg.texts.top = I.cleanOcr(r.data.text);
            ocrDone++;
            progress(`reconociendo texto ${ocrDone} de ${ocrJobs.length}`);
          }).catch((err) => console.warn('OCR', err)));
        }
        page.cleanup();
      }
    }
    if (ocrJobs.length) {
      progress(`reconociendo texto ${ocrDone} de ${ocrJobs.length}`);
      await Promise.all(ocrJobs);
    }
    redetect(work);
    work.expanded = work.pages.some((pg) => !pg.inst);
    return work;
  }

  // Extrae el texto de la franja superior, inferior y de toda la página.
  async function pageTexts(page) {
    const content = await page.getTextContent();
    const [, y0, , y1] = page.view;
    const height = y1 - y0 || 1;
    const items = content.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, size: Math.abs(it.transform[3]) || 10 }));
    const join = (list) => {
      list.sort((a, b) => (Math.abs(b.y - a.y) > a.size * 0.5 ? b.y - a.y : a.x - b.x));
      let out = '';
      let prev = null;
      for (const it of list) {
        if (prev) {
          const sameLine = Math.abs(prev.y - it.y) <= prev.size * 0.5;
          const gap = it.x - (prev.x + prev.w);
          out += sameLine && gap < prev.size * 0.2 ? '' : (sameLine ? ' ' : ' \n ');
        }
        out += it.str;
        prev = it;
      }
      return out;
    };
    const top = items.filter((it) => it.y >= y1 - height * 0.3);
    const bottom = items.filter((it) => it.y <= y0 + height * 0.12);
    return { top: join(top), bottom: join(bottom), all: join(items.slice()) };
  }

  function pageCandidates(texts) {
    const c = I.detectCandidates(texts.top, state.catalog, matchers);
    return c.length ? c : I.detectCandidates(texts.bottom, state.catalog, matchers);
  }

  const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

  function redetect(work) {
    const n = work.pages.length;
    // Partitura general (guion de director): muchas líneas de pentagrama o muchos instrumentos nombrados.
    work.pages.forEach((pg) => {
      pg.score = pg.staves >= STAFF_SCORE_MIN || I.detectAll(pg.texts.all, state.catalog, matchers).length >= 7;
    });
    const cands = work.pages.map((pg) => (pg.score ? [] : pageCandidates(pg.texts)));
    // Un instrumento que aparece en casi todas las páginas suele ser parte del título de la obra.
    const freq = {};
    cands.forEach((c) => new Set(c.map((x) => x.id)).forEach((id) => { freq[id] = (freq[id] || 0) + 1; }));
    const isTitle = (id) => n >= 4 && freq[id] / n > 0.6;

    // Palabras del título de la obra: aparecen en la cabecera de la mayoría de las primeras páginas.
    const wordsOf = (t) => new Set(I.normalize(t).split(' ').filter((x) => x.length >= 4 && !/\d/.test(x)));
    const headed = work.pages.filter((pg, i) => cands[i].length && !pg.score);
    const wc = {};
    headed.forEach((pg) => wordsOf(pg.texts.top).forEach((x) => { wc[x] = (wc[x] || 0) + 1; }));
    const titleWords = headed.length >= 3 ? Object.keys(wc).filter((x) => wc[x] / headed.length >= 0.6) : [];
    work.pages.forEach((pg) => {
      if (titleWords.length < 2) { pg.firstLike = false; return; }
      const ws = wordsOf(pg.texts.top);
      pg.firstLike = titleWords.filter((x) => ws.has(x)).length / titleWords.length >= 0.6;
    });

    const choose = (i) => {
      if (work.pages[i].score) return { id: I.GUION_ID, voices: [], solo: false };
      const c = cands[i];
      return c.find((x) => !isTitle(x.id)) || c[0] || null;
    };

    work.files.forEach((file) => {
      const idx = range(file.firstPage, file.firstPage + file.numPages);
      const fd = file.fileDet;
      // El nombre del archivo manda, salvo que el contenido muestre varios instrumentos (PDF con todos los papeles).
      const contentIds = new Set(idx.map(choose).filter((d) => d && d.id !== I.GUION_ID).map((d) => d.id));
      const nScore = idx.filter((i) => work.pages[i].score).length;
      const useName = !!fd && (fd.id === I.GUION_ID || (contentIds.size <= 1 && nScore <= idx.length / 2));
      let prev = { inst: null, voices: [], solo: false };
      for (const i of idx) {
        const pg = work.pages[i];
        pg.unknownStart = false;
        if (pg.src === 'manual') { prev = pg; continue; }
        if (useName) {
          pg.inst = fd.id;
          pg.voices = fd.voices.slice();
          pg.solo = !!fd.solo;
          pg.src = 'archivo';
          prev = pg;
          continue;
        }
        const d = choose(i);
        if (d) {
          pg.inst = d.id;
          pg.voices = d.voices;
          pg.solo = !!d.solo;
          pg.src = 'auto';
        } else if (pg.firstLike || i === file.firstPage) {
          // Empieza un papel pero no se ha podido leer el instrumento: no heredar.
          pg.inst = null;
          pg.voices = [];
          pg.solo = false;
          pg.src = 'auto';
          pg.unknownStart = true;
        } else {
          pg.inst = prev.inst;
          pg.voices = prev.voices.slice();
          pg.solo = prev.solo;
          pg.src = 'heredado';
        }
        prev = pg;
      }
    });
  }

  // Propaga un cambio a las páginas siguientes del mismo archivo que no tienen cabecera propia.
  function propagate(work, fromIndex) {
    const src = work.pages[fromIndex];
    for (let i = fromIndex + 1; i < work.pages.length; i++) {
      const pg = work.pages[i];
      if (pg.fileIdx !== src.fileIdx) break;
      if (pg.src !== 'heredado' && pg.src !== 'archivo') break;
      pg.inst = src.inst;
      pg.voices = src.voices.slice();
      pg.solo = src.solo;
      if (pg.src === 'archivo') pg.src = 'heredado';
    }
  }

  /*
   * Papeles = tramos de páginas consecutivas (del mismo archivo) con el mismo instrumento y voz.
   * Se toman TODAS las páginas del papel. Solo se descarta una página si es la portada de una copia
   * repetida del mismo papel (misma cabecera y música casi idéntica); con ella se descartan las
   * páginas que la siguen sin cabecera.
   */
  function getParts(work) {
    const dedupe = $('#opt-dedupe') ? $('#opt-dedupe').checked : true;
    const parts = [];
    const firstPart = {};
    let cur = null;
    let inDup = null;
    work.pages.forEach((pg, i) => {
      pg.dupOf = null;
      const newFile = i > 0 && work.pages[i - 1].fileIdx !== pg.fileIdx;
      if (newFile) { cur = null; inDup = null; }
      if (!pg.inst || pg.inst === I.IGNORE_ID) { cur = null; inDup = null; return; }
      const key = pg.inst + '|' + pg.voices.join(',') + (pg.solo ? '|solo' : '');
      const header = pg.src === 'auto' || pg.src === 'manual';
      if (!header && inDup !== null) { pg.dupOf = inDup; return; }
      if (header) {
        inDup = null;
        const orig = firstPart[key];
        if (dedupe && orig && pg.inst !== I.GUION_ID && !pg.notDup && pg.firstLike &&
            pageSimilarity(work, orig.pages[0], i) >= DUP_MIN_SIM) {
          pg.dupOf = orig.pages[0];
          inDup = orig.pages[0];
          orig.copies++;
          cur = null;
          return;
        }
      }
      if (cur && cur.key === key && cur.pages[cur.pages.length - 1] === i - 1) {
        cur.pages.push(i);
      } else {
        cur = {
          id: `${work.id}:${i}`, key, baseInst: pg.inst, solo: pg.solo, fileIdx: pg.fileIdx,
          inst: pg.solo ? `${pg.inst}~solo` : pg.inst, voices: pg.voices.slice(), pages: [i], copies: 1,
        };
        parts.push(cur);
        if (!firstPart[key]) firstPart[key] = cur;
      }
    });
    // Un papel que ocupa un archivo entero se copia tal cual, sin tocarlo.
    for (const p of parts) {
      const f = work.files[p.fileIdx];
      p.whole = p.pages.length === f.numPages && p.pages[0] === f.firstPage;
    }
    return parts;
  }

  // ---------- Vista: obras ----------
  function renderWorks() {
    const root = $('#works');
    root.innerHTML = '';
    state.works.forEach((w, wi) => root.appendChild(renderWork(w, wi)));
  }

  function renderWork(w, wi) {
    const parts = getParts(w);
    const unassigned = w.pages.filter((p) => !p.inst).length;
    const card = h('div', { class: 'card work', 'data-work': w.id });
    const meta = [
      w.files.length > 1 ? `${w.files.length} archivos` : null,
      `${w.pages.length} pág${w.pages.length > 1 ? 's' : ''}`,
      `${parts.filter((p) => p.inst !== I.GUION_ID).length} papeles`,
      unassigned ? `${unassigned} sin asignar` : null,
    ].filter(Boolean).join(' · ');
    const head = h('div', { class: 'work-head' },
      h('input', { class: 'work-name', value: w.name, title: 'Nombre de la obra',
        oninput: (e) => { w.name = e.target.value; } }),
      h('span', { class: 'work-meta' }, meta),
      h('div', { class: 'work-actions' },
        h('button', { class: 'icon', title: 'Subir', disabled: wi === 0, onclick: () => moveWork(wi, -1) }, '↑'),
        h('button', { class: 'icon', title: 'Bajar', disabled: wi === state.works.length - 1, onclick: () => moveWork(wi, 1) }, '↓'),
        h('button', { onclick: () => { w.expanded = !w.expanded; rerenderWork(w); } },
          w.expanded ? 'Ocultar páginas' : 'Revisar páginas'),
        h('button', { class: 'ghost', title: 'Volver a detectar todas las páginas (descarta cambios a mano)',
          onclick: () => { w.pages.forEach((p) => { p.src = 'auto'; p.notDup = false; }); redetect(w); rerenderWork(w); } }, 'Redetectar'),
        w.files.length > 1 ? h('button', { class: 'ghost', title: 'Convertir cada archivo en una obra distinta',
          onclick: () => separateWork(wi) }, 'Separar archivos') : null,
        wi > 0 ? h('button', { class: 'ghost', title: 'Juntar estos archivos con la obra de arriba',
          onclick: () => mergeWithPrevious(wi) }, 'Unir con la de arriba') : null,
        h('button', { class: 'ghost', title: 'Quitar obra', onclick: () => removeWork(wi) }, 'Quitar')));
    card.appendChild(head);

    const chips = h('div', { class: 'chips' },
      parts.map((p) => h('span', { class: 'chip' + (p.inst === I.GUION_ID ? ' chip-guion' : ''), style: `border-color:${hueFor(p.inst)}` },
        partLabel(p.inst, p.voices), ' ',
        h('span', { class: 'n' },
          `(${p.whole && w.files.length > 1 ? w.files[p.fileIdx].name + ' · ' : ''}${p.pages.length} pág${p.pages.length > 1 ? 's' : ''}` +
          `${p.copies > 1 ? ` · ${p.copies} copias` : ''})`))));
    if (!parts.length) chips.appendChild(h('span', { class: 'chip' }, 'Ningún papel detectado: revisa las páginas'));
    card.appendChild(chips);
    const notes = [];
    if (w.ocrUsed) notes.push('Hay páginas escaneadas: el instrumento se ha leído con OCR, revisa las páginas.');
    if (w.ocrError) notes.push(w.ocrError);
    const nDup = w.pages.filter((p) => p.dupOf !== null && p.dupOf !== undefined).length;
    if (nDup) notes.push(`${nDup} página${nDup > 1 ? 's' : ''} de copias repetidas descartada${nDup > 1 ? 's' : ''}.`);
    if (notes.length) card.appendChild(h('div', { class: 'work-notes' }, notes.map((t) => h('div', null, t))));

    if (w.expanded) {
      const grid = h('div', { class: 'pages' });
      w.pages.forEach((pg, i) => grid.appendChild(renderPage(w, pg, i)));
      card.appendChild(grid);
    }
    return card;
  }

  function instOptions(selected) {
    const opts = [h('option', { value: '' }, '— Sin asignar —')];
    opts.push(h('option', { value: I.GUION_ID, selected: selected === I.GUION_ID }, 'Guion del director'));
    for (const c of state.catalog) opts.push(h('option', { value: c.id, selected: c.id === selected }, c.name));
    opts.push(h('option', { value: I.IGNORE_ID, selected: selected === I.IGNORE_ID }, 'Ignorar (no es un papel)'));
    return opts;
  }

  function voiceText(pg) {
    return [I.formatVoices(pg.voices), pg.solo ? 'solo' : ''].filter(Boolean).join(' ');
  }

  function renderPage(w, pg, i) {
    const thumb = h('img', { class: 'thumb', src: pg.thumb, alt: `Página ${i + 1}`, onclick: () => openModal(w, i) });
    let srcText = { auto: 'detectado', heredado: 'heredado', manual: 'a mano', archivo: 'por el nombre' }[pg.src] || '';
    if (pg.src === 'auto' && pg.score) srcText = 'partitura general';
    if (pg.unknownStart) srcText = 'sin reconocer';
    const isDup = pg.dupOf !== null && pg.dupOf !== undefined;
    const file = w.files[pg.fileIdx];
    const classes = ['page'];
    if (pg.inst === I.IGNORE_ID || isDup) classes.push('ignored');
    const pageLabel = w.files.length > 1 ? `${file.name}${file.numPages > 1 ? ` · ${pg.pageNum}` : ''}` : `Pág. ${i + 1}`;
    const el = h('div', { class: classes.join(' '), 'data-page': i, style: `--hue:${hueFor(pg.inst)}` },
      thumb,
      h('div', { class: 'page-top' }, h('span', { class: 'page-label', title: file.path }, pageLabel), h('span', { class: `src ${pg.src}` }, srcText)),
      isDup ? h('div', { class: 'dup' },
        h('span', null, `Copia de la pág. ${pg.dupOf + 1}`),
        pg.src !== 'heredado'
          ? h('button', { class: 'link', title: 'Usar esta página como un papel distinto',
            onclick: () => { pg.notDup = true; rerenderWork(w); } }, 'No es copia')
          : null) : null,
      h('select', {
        'aria-label': `Instrumento de la página ${i + 1}`,
        onchange: (e) => {
          pg.inst = e.target.value || null;
          if (pg.inst === I.IGNORE_ID || pg.inst === I.GUION_ID) { pg.voices = []; pg.solo = false; }
          pg.src = 'manual';
          propagate(w, i);
          rerenderWork(w);
        },
      }, instOptions(pg.inst)),
      h('input', {
        type: 'text', placeholder: 'Voz (vacío = único)', value: voiceText(pg),
        title: 'Ejemplos: 1 · 2-3 · 1 y 2 · solo · vacío = papel único',
        'aria-label': `Voz de la página ${i + 1}`,
        onchange: (e) => {
          pg.solo = /\b(solo|solista)\b/i.test(e.target.value);
          pg.voices = I.parseVoices(e.target.value.replace(/\b(solo|solista)\b/gi, ''));
          e.target.value = voiceText(pg);
          pg.src = 'manual';
          propagate(w, i);
          rerenderWork(w);
        },
      }));
    return el;
  }

  function rerenderWork(w) {
    const old = $(`[data-work="${w.id}"]`);
    const wi = state.works.indexOf(w);
    if (!old) return renderWorks();
    const scroll = window.scrollY;
    old.replaceWith(renderWork(w, wi));
    window.scrollTo(0, scroll);
  }

  function moveWork(i, d) {
    const j = i + d;
    if (j < 0 || j >= state.works.length) return;
    [state.works[i], state.works[j]] = [state.works[j], state.works[i]];
    renderWorks();
  }

  function removeWork(i) {
    const w = state.works[i];
    if (!confirm(`¿Quitar «${w.name}»?`)) return;
    state.works.splice(i, 1);
    w.files.forEach((f) => f.pdf && f.pdf.destroy());
    renderWorks();
  }

  // Cada archivo de la obra pasa a ser una obra.
  function separateWork(wi) {
    const w = state.works[wi];
    const created = w.files.map((f, fi) => {
      const pages = w.pages.filter((pg) => pg.fileIdx === fi).map((pg) => Object.assign(pg, { fileIdx: 0 }));
      const nw = {
        id: `w${nextId++}`, name: stripExt(f.name), files: [Object.assign(f, { firstPage: 0 })], pages,
        expanded: false, simCache: {}, ocrUsed: w.ocrUsed, ocrError: w.ocrError,
      };
      redetect(nw);
      return nw;
    });
    state.works.splice(wi, 1, ...created);
    renderWorks();
  }

  // Junta los archivos de una obra con la obra anterior.
  function mergeWithPrevious(wi) {
    const prev = state.works[wi - 1];
    const w = state.works[wi];
    const fileOffset = prev.files.length;
    const pageOffset = prev.pages.length;
    w.files.forEach((f) => { f.firstPage += pageOffset; prev.files.push(f); });
    w.pages.forEach((pg) => { pg.fileIdx += fileOffset; prev.pages.push(pg); });
    prev.simCache = {};
    prev.ocrUsed = prev.ocrUsed || w.ocrUsed;
    state.works.splice(wi, 1);
    redetect(prev);
    renderWorks();
  }

  // Vista ampliada
  const modal = $('#modal');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.classList.contains('modal-close')) modal.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.hidden = true; });

  async function openModal(work, i) {
    const pg = work.pages[i];
    const page = await work.files[pg.fileIdx].pdf.getPage(pg.pageNum);
    const vp0 = page.getViewport({ scale: 1 });
    const target = Math.min(1000, window.innerWidth - 40);
    const ratio = window.devicePixelRatio || 1;
    const vp = page.getViewport({ scale: (target / vp0.width) * ratio });
    const canvas = $('#modal-canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    canvas.style.width = `${Math.ceil(vp.width / ratio)}px`;
    modal.hidden = false;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }

  // ---------- Reparto ----------
  function templateFolders() {
    return state.template
      .filter((t) => t.insts && t.insts.length && t.name)
      .map((t, i) => ({
        key: `t${i}`, name: t.name, inst: t.insts[0], voice: t.all ? null : (t.voice || 1), shownVoice: t.voice, all: !!t.all,
        insts: t.insts.slice(), extraSubs: t.insts.slice(1),
      }));
  }

  function buildPlan() {
    const works = state.works.map((w) => {
      const all = getParts(w);
      return { id: w.id, name: w.name, parts: all.filter((p) => p.inst !== I.GUION_ID), guion: all.filter((p) => p.inst === I.GUION_ID) };
    });
    const template = state.mode === 'plantilla';
    const plan = D.computePlan(works, state.catalog, { folders: template ? templateFolders() : undefined });
    plan.works = works;
    plan.template = template;
    // Aplicar elecciones manuales
    for (const w of works) {
      for (const f of plan.folders) {
        if (f.all) continue;
        const key = `${w.id}|${f.key}`;
        if (!(key in state.overrides)) continue;
        const pid = state.overrides[key];
        const auto = plan.assignments[w.id][f.key];
        if (pid === '') {
          plan.assignments[w.id][f.key] = { type: 'manual', part: null, parts: [], fromInst: null, auto };
        } else {
          const p = w.parts.find((x) => x.id === pid);
          if (p) plan.assignments[w.id][f.key] = { type: 'manual', part: p, parts: [p], fromInst: p.inst, auto };
          else delete state.overrides[key];
        }
      }
    }
    // Papeles que no van a ninguna carpeta (para avisar).
    plan.unused = works.map((w) => {
      const used = new Set();
      for (const f of plan.folders) plan.assignments[w.id][f.key].parts.forEach((p) => used.add(p.id));
      return { work: w, parts: w.parts.filter((p) => !used.has(p.id)) };
    }).filter((x) => x.parts.length);
    state.plan = plan;
    return plan;
  }

  function describe(a) {
    if (!a || !a.parts || !a.parts.length) return '— Sin papel —';
    return a.parts.map((p) => partLabel(p.inst, p.voices)).join(' + ');
  }

  $('#plan-mode').value = state.mode;
  $('#plan-mode').addEventListener('change', (e) => {
    state.mode = e.target.value;
    saveJSON(MODE_KEY, state.mode);
    state.overrides = {};
    renderPlan();
  });

  function renderPlan() {
    const has = state.works.length > 0;
    $('#plan-empty').hidden = has;
    $('#plan-wrap').hidden = !has;
    if (!has) return;
    const plan = buildPlan();
    const table = $('#plan-table');
    table.innerHTML = '';

    const counts = { propio: 0, voz: 0, familia: 0, falta: 0, manual: 0 };
    const thead = h('thead', null, h('tr', null, h('th', null, 'Carpeta'), plan.works.map((w) => h('th', null, w.name))));
    const tbody = h('tbody');
    let lastInst = null;
    for (const f of plan.folders) {
      const hint = folderHint(f);
      const tr = h('tr', { class: !plan.template && f.inst !== lastInst ? 'inst-start' : '' },
        h('td', null, folderLabel(f), hint ? h('div', { class: 'folder-hint' }, hint) : null));
      lastInst = f.inst;
      for (const w of plan.works) {
        const a = plan.assignments[w.id][f.key];
        counts[a.type]++;
        if (f.all) {
          tr.appendChild(h('td', { class: `cell cell-${a.parts.length ? 'propio' : 'falta'}`, title: 'Todos los papeles de estos instrumentos' },
            h('div', { class: 'cell-text' }, describe(a))));
          continue;
        }
        const sel = h('select', {
          'aria-label': `${folderLabel(f)} en ${w.name}`,
          onchange: (e) => {
            const key = `${w.id}|${f.key}`;
            if (e.target.value === 'auto') delete state.overrides[key];
            else state.overrides[key] = e.target.value === 'none' ? '' : e.target.value;
            renderPlan();
          },
        });
        const auto = a.type === 'manual' ? a.auto : a;
        sel.appendChild(h('option', { value: 'auto', selected: a.type !== 'manual' }, `Auto: ${describe(auto)}`));
        for (const p of w.parts) {
          sel.appendChild(h('option', { value: p.id, selected: a.type === 'manual' && a.part === p }, partLabel(p.inst, p.voices)));
        }
        sel.appendChild(h('option', { value: 'none', selected: a.type === 'manual' && !a.part }, '— Sin papel —'));
        tr.appendChild(h('td', { class: `cell cell-${a.type}`, title: titleFor(a, f) }, sel));
      }
      tbody.appendChild(tr);
    }
    if ($('#opt-guiones').checked) {
      const tr = h('tr', { class: 'inst-start' }, h('td', null, 'Guiones', h('div', { class: 'folder-hint' }, 'Guion del director')));
      for (const w of plan.works) {
        const n = w.guion.reduce((acc, p) => acc + p.pages.length, 0);
        tr.appendChild(h('td', { class: `cell cell-${n ? 'propio' : 'falta'}` },
          h('div', { class: 'cell-text' }, n ? `Guion (${n} pág${n > 1 ? 's' : ''})` : '— Sin guion —')));
      }
      tbody.appendChild(tr);
    }
    table.appendChild(thead);
    table.appendChild(tbody);

    const summary = $('#plan-summary');
    summary.innerHTML = '';
    const stat = (n, label) => h('div', { class: 'stat' }, h('b', null, String(n)), label);
    summary.append(
      stat(plan.works.length, 'obras'),
      stat(plan.folders.length, 'carpetas'),
      stat(counts.propio, 'papeles propios'),
      stat(counts.voz, 'de otra voz'),
      stat(counts.familia, 'de otro instrumento'),
      stat(counts.falta, 'sin papel'));

    const unused = $('#plan-unused');
    unused.innerHTML = '';
    if (plan.unused.length) {
      unused.append(
        h('strong', null, 'Papeles que no van a ninguna carpeta: '),
        h('span', null, plan.unused.map((u) => `${u.work.name}: ${u.parts.map((p) => partLabel(p.inst, p.voices)).join(', ')}`).join(' · ')),
        h('div', { class: 'small' }, plan.template ? 'Si quieres alguno, añade una carpeta en «Mi banda».' : ''));
    }
    unused.hidden = !plan.unused.length;
  }

  function titleFor(a, f) {
    switch (a.type) {
      case 'propio': return 'Papel propio de la obra';
      case 'voz': return `No existe esa voz en esta obra: se usa ${describe(a)}`;
      case 'familia': return `No hay ${instName(f.inst)} en esta obra: se usa ${describe(a)} (misma familia y afinación)`;
      case 'falta': return 'No hay ningún papel compatible en esta obra';
      case 'manual': return 'Elegido a mano';
      default: return '';
    }
  }

  // ---------- Exportar ----------
  $('#btn-export').addEventListener('click', exportZip);

  function safeName(s) {
    return String(s).replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'sin nombre';
  }

  // Evita nombres repetidos dentro de una carpeta: "clte-1.pdf" → "clte-1 (Adeste fideles).pdf".
  function uniqueName(used, name, workName) {
    const clean = safeName(name);
    const m = clean.match(/^(.*?)(\.[a-z0-9]+)?$/i);
    const base = m[1];
    const ext = m[2] || '.pdf';
    let candidate = `${base}${ext}`;
    if (used.has(candidate.toLowerCase())) candidate = `${base} (${safeName(workName)})${ext}`;
    let k = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base} (${safeName(workName)} ${k++})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  }

  async function exportZip() {
    const status = $('#export-status');
    if (!state.works.length) { setStatus(status, 'Primero carga algún guion.', true); return; }
    const btn = $('#btn-export');
    btn.disabled = true;
    try {
      const plan = buildPlan();
      const book = $('#opt-book').checked;
      const report = $('#opt-report').checked;
      const guiones = $('#opt-guiones').checked;
      const zipName = safeName($('#opt-zipname').value || 'Papeles banda');
      const zip = new JSZip();
      const root = zip.folder(zipName);
      const worksById = Object.fromEntries(state.works.map((w) => [w.id, w]));

      // Los PDF originales solo se abren para extraer páginas; nunca se modifican.
      const docCache = {};
      const srcDoc = async (work, fi) => {
        const key = `${work.id}:${fi}`;
        if (!docCache[key]) docCache[key] = await PDFLib.PDFDocument.load(work.files[fi].data, { ignoreEncryption: true });
        return docCache[key];
      };
      const pageIdx = (work, p) => p.pages.map((i) => work.pages[i].pageNum - 1);

      // Papeles que son un archivo entero: se copian byte a byte. Los que salen de un PDF con
      // varios papeles: se extraen sus páginas (todas) a un PDF nuevo con el nombre de la obra.
      async function writeParts(folder, used, work, parts, extractName, renameWhole) {
        const whole = parts.filter((p) => p.whole);
        const rest = parts.filter((p) => !p.whole);
        for (const p of whole) {
          const file = work.files[p.fileIdx];
          const name = renameWhole && whole.length === 1 && !rest.length ? extractName : file.name;
          folder.file(uniqueName(used, name, work.name), file.data, { binary: true });
        }
        if (rest.length) {
          const out = await PDFLib.PDFDocument.create();
          for (const p of rest) {
            const copied = await out.copyPages(await srcDoc(work, p.fileIdx), pageIdx(work, p));
            copied.forEach((pg) => out.addPage(pg));
          }
          folder.file(uniqueName(used, extractName, work.name), await out.save());
        }
      }

      const pad = String(plan.folders.length).length < 2 ? 2 : String(plan.folders.length).length;
      const csv = [['Carpeta', 'Obra', 'Tipo', 'Papel usado', 'Archivo de origen', 'Páginas'].join(';')];
      const typeText = { propio: 'Propio', voz: 'Otra voz', familia: 'Otro instrumento (familia)', falta: 'Sin papel', manual: 'Elegido a mano' };
      let done = 0;

      for (const f of plan.folders) {
        const folderName = plan.template ? safeName(f.name) : `${String(f.order).padStart(pad, '0')} ${safeName(folderLabel(f))}`;
        const folder = root.folder(folderName);
        const used = new Set();
        const bookDoc = book ? await PDFLib.PDFDocument.create() : null;
        const bookmarks = [];

        for (const w of plan.works) {
          const work = worksById[w.id];
          const a = plan.assignments[w.id][f.key];
          const parts = a.parts;
          csv.push([folderLabel(f), w.name, typeText[a.type], parts.map((p) => partLabel(p.inst, p.voices)).join(' + '),
            [...new Set(parts.map((p) => work.files[p.fileIdx].name))].join(' + '),
            parts.map((p) => pageIdx(work, p).map((x) => x + 1).join(' ')).join(' / ')].map(csvCell).join(';'));
          if (!parts.length) continue;
          await writeParts(folder, used, work, parts, `${w.name}.pdf`, false);
          if (bookDoc) {
            bookmarks.push({ title: w.name, pageIndex: bookDoc.getPageCount() });
            for (const p of parts) {
              const copied = await bookDoc.copyPages(await srcDoc(work, p.fileIdx), pageIdx(work, p));
              copied.forEach((pg) => bookDoc.addPage(pg));
            }
          }
        }
        if (bookDoc && bookDoc.getPageCount()) {
          bookDoc.setTitle(`${folderLabel(f)} - Todas las obras`);
          addOutline(bookDoc, bookmarks);
          folder.file(uniqueName(used, `00 ${folderLabel(f)} - Todas las obras.pdf`, ''), await bookDoc.save());
        }
        done++;
        setStatus(status, `Generando carpetas… ${done} de ${plan.folders.length}`);
      }

      if (guiones) {
        const gf = root.folder('Guiones');
        const used = new Set();
        for (const w of plan.works) {
          if (!w.guion.length) continue;
          await writeParts(gf, used, worksById[w.id], w.guion, `${w.name} guion.pdf`, true);
        }
      }

      if (report) root.file('Informe.csv', '﻿' + csv.join('\r\n'));

      setStatus(status, 'Comprimiendo ZIP…');
      const blob = await zip.generateAsync({ type: 'blob' }, (m) => setStatus(status, `Comprimiendo ZIP… ${Math.round(m.percent)} %`));
      const url = URL.createObjectURL(blob);
      const link = h('a', { href: url, download: `${zipName}.zip` });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus(status, `Listo: ${plan.folders.length} carpetas${guiones ? ' + Guiones' : ''} para ${plan.works.length} obras.`);
    } catch (err) {
      console.error(err);
      setStatus(status, `Error al generar el ZIP: ${err.message || err}`, true);
    } finally {
      btn.disabled = false;
    }
  }

  function csvCell(v) {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  // ---------- Mi banda (plantilla de carpetas) ----------
  $('#btn-add-folder').addEventListener('click', () => {
    state.template.push({ name: 'Nueva', insts: [], voice: 1, all: false });
    saveTemplate();
    renderTemplate();
  });
  $('#btn-reset-template').addEventListener('click', () => {
    if (!confirm('¿Restaurar las carpetas por defecto? Se perderán tus cambios.')) return;
    state.template = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
    saveTemplate();
    renderTemplate();
  });

  function namesToIds(text) {
    const missing = [];
    const ids = text.split(',').map((s) => s.trim()).filter(Boolean).map((name) => {
      const n = I.normalize(name);
      const found = state.catalog.find((c) => I.normalize(c.name) === n || c.id === name);
      if (!found) missing.push(name);
      return found ? found.id : null;
    }).filter(Boolean);
    return { ids: Array.from(new Set(ids)), missing };
  }

  function renderTemplate() {
    const table = $('#tpl-table');
    table.innerHTML = '';
    table.appendChild(h('thead', null, h('tr', null,
      ['Carpeta', 'Instrumento (y alternativas si falta)', 'Voz', 'Todos los papeles', ''].map((t) => h('th', null, t)))));
    const tbody = h('tbody');
    state.template.forEach((t, i) => {
      const warn = h('div', { class: 'warn' });
      const voiceInput = h('input', {
        type: 'number', min: '1', max: '9', value: t.voice || '', placeholder: '1', disabled: !!t.all, style: 'max-width:5em',
        onchange: (e) => { t.voice = parseInt(e.target.value, 10) || null; saveTemplate(); },
      });
      tbody.appendChild(h('tr', null,
        h('td', null, h('input', { value: t.name, style: 'max-width:9em', onchange: (e) => { t.name = e.target.value.trim(); saveTemplate(); } })),
        h('td', null,
          h('input', {
            value: t.insts.map(instName).join(', '),
            placeholder: 'p. ej. Flauta',
            onchange: (e) => {
              const { ids, missing } = namesToIds(e.target.value);
              t.insts = ids;
              saveTemplate();
              e.target.value = t.insts.map(instName).join(', ');
              warn.textContent = missing.length ? `No encontrados: ${missing.join(', ')} (añádelos en «Instrumentos»)` : '';
            },
          }), warn),
        h('td', null, voiceInput),
        h('td', null, h('input', {
          type: 'checkbox', checked: !!t.all, style: 'width:auto',
          title: 'Mete en la carpeta todos los papeles de estos instrumentos (todas las voces y páginas)',
          onchange: (e) => { t.all = e.target.checked; voiceInput.disabled = t.all; saveTemplate(); },
        })),
        h('td', { class: 'actions' },
          h('button', { class: 'icon', title: 'Subir', disabled: i === 0, onclick: () => moveFolder(i, -1) }, '↑'),
          h('button', { class: 'icon', title: 'Bajar', disabled: i === state.template.length - 1, onclick: () => moveFolder(i, 1) }, '↓'),
          h('button', { class: 'icon', title: 'Eliminar', onclick: () => { state.template.splice(i, 1); saveTemplate(); renderTemplate(); } }, '×'))));
    });
    table.appendChild(tbody);
  }

  function moveFolder(i, d) {
    const j = i + d;
    [state.template[i], state.template[j]] = [state.template[j], state.template[i]];
    saveTemplate();
    renderTemplate();
  }

  // Marcadores del PDF (índice lateral del lector): uno por obra.
  function addOutline(doc, entries) {
    if (!entries.length) return;
    const { PDFName, PDFHexString } = PDFLib;
    const ctx = doc.context;
    const pages = doc.getPages();
    const rootRef = ctx.nextRef();
    const refs = entries.map(() => ctx.nextRef());
    entries.forEach((e, i) => {
      const item = ctx.obj({
        Title: PDFHexString.fromText(e.title),
        Parent: rootRef,
        Dest: [pages[e.pageIndex].ref, 'XYZ', null, null, null],
      });
      if (i > 0) item.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < refs.length - 1) item.set(PDFName.of('Next'), refs[i + 1]);
      ctx.assign(refs[i], item);
    });
    ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1], Count: refs.length }));
    doc.catalog.set(PDFName.of('Outlines'), rootRef);
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  }


  // ---------- Instrumentos ----------
  $('#btn-add-inst').addEventListener('click', () => {
    let n = 1;
    while (instById(`inst_${n}`)) n++;
    state.catalog.push({ id: `inst_${n}`, name: 'Nuevo instrumento', family: 'Otros', tuning: 'C', clef: 'Sol', aliases: [], subs: [] });
    saveCatalog();
    renderInstruments();
  });
  $('#btn-reset-inst').addEventListener('click', () => {
    if (!confirm('¿Restaurar la tabla de instrumentos por defecto? Se perderán tus cambios.')) return;
    state.catalog = I.cloneCatalog();
    saveCatalog();
    renderInstruments();
  });

  function subsToText(subs) {
    return (subs || []).map((id) => (instById(id) ? instById(id).name : id)).join(', ');
  }

  function textToSubs(text, selfId) {
    const missing = [];
    const ids = text.split(',').map((s) => s.trim()).filter(Boolean).map((name) => {
      const n = I.normalize(name);
      const found = state.catalog.find((c) => I.normalize(c.name) === n || c.id === name);
      if (!found) missing.push(name);
      return found ? found.id : null;
    }).filter((id) => id && id !== selfId);
    return { ids: Array.from(new Set(ids)), missing };
  }

  function renderInstruments() {
    const table = $('#inst-table');
    table.innerHTML = '';
    const tuningOpts = [['C', 'Do'], ['Bb', 'Si♭'], ['Eb', 'Mi♭'], ['F', 'Fa'], ['A', 'La'], ['perc', 'Percusión']];
    table.appendChild(h('thead', null, h('tr', null,
      ['Instrumento', 'Familia', 'Afinación', 'Clave', 'Grave', 'Nombres en la cabecera', 'Sustitutos (por preferencia)', ''].map((t) => h('th', null, t)))));
    const tbody = h('tbody');
    state.catalog.forEach((c, i) => {
      const subsInfo = h('div', { class: 'warn' });
      const tr = h('tr', null,
        h('td', null, h('input', { value: c.name, onchange: (e) => { c.name = e.target.value.trim() || c.name; saveCatalog(); } })),
        h('td', null, h('input', { value: c.family, onchange: (e) => { c.family = e.target.value.trim(); saveCatalog(); } })),
        h('td', null, h('select', { onchange: (e) => { c.tuning = e.target.value; saveCatalog(); } },
          tuningOpts.map(([v, l]) => h('option', { value: v, selected: c.tuning === v }, l)))),
        h('td', null, h('select', { onchange: (e) => { c.clef = e.target.value; saveCatalog(); } },
          ['Sol', 'Fa', 'Do', 'Perc.'].map((v) => h('option', { value: v, selected: c.clef === v }, v)))),
        h('td', null, h('input', { type: 'checkbox', checked: !!c.low, style: 'width:auto',
          title: 'Si falta, toma la voz más grave del instrumento sustituto',
          onchange: (e) => { c.low = e.target.checked; saveCatalog(); } })),
        h('td', null, h('textarea', {
          onchange: (e) => { c.aliases = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); saveCatalog(); },
        }, (c.aliases || []).join(', '))),
        h('td', null,
          h('input', {
            value: subsToText(c.subs),
            onchange: (e) => {
              const { ids, missing } = textToSubs(e.target.value, c.id);
              c.subs = ids;
              saveCatalog();
              e.target.value = subsToText(c.subs);
              subsInfo.textContent = missing.length ? `No encontrados: ${missing.join(', ')}` : '';
            },
          }),
          h('button', { class: 'ghost small', style: 'margin-top:4px', title: 'Misma familia, afinación y clave',
            onclick: () => { c.subs = I.autoSubs(c, state.catalog); saveCatalog(); renderInstruments(); } }, 'Sugerir'),
          subsInfo),
        h('td', { class: 'actions' },
          h('button', { class: 'icon', title: 'Subir', disabled: i === 0, onclick: () => moveInst(i, -1) }, '↑'),
          h('button', { class: 'icon', title: 'Bajar', disabled: i === state.catalog.length - 1, onclick: () => moveInst(i, 1) }, '↓'),
          h('button', { class: 'icon', title: 'Eliminar', onclick: () => deleteInst(i) }, '×')));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function moveInst(i, d) {
    const j = i + d;
    [state.catalog[i], state.catalog[j]] = [state.catalog[j], state.catalog[i]];
    saveCatalog();
    renderInstruments();
  }

  function deleteInst(i) {
    const c = state.catalog[i];
    if (!confirm(`¿Eliminar «${c.name}» de la tabla?`)) return;
    state.catalog.splice(i, 1);
    state.catalog.forEach((o) => { o.subs = (o.subs || []).filter((s) => s !== c.id); });
    saveCatalog();
    renderInstruments();
  }


  // Exponer para pruebas automáticas
  window.__papeles = { state, getParts, buildPlan, redetect };
})();
