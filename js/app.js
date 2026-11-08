/* global pdfjsLib, PDFLib, JSZip, Instruments, Distribute */
(function () {
  'use strict';

  const I = Instruments;
  const D = Distribute;
  const STORAGE_KEY = 'papelesBanda.catalog.v1';

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
  const state = {
    catalog: loadCatalog(),
    works: [],
    overrides: {}, // `${workId}|${folderKey}` -> partId | '' (sin papel)
    plan: null,
  };
  let matchers = I.buildMatchers(state.catalog);
  let nextId = 1;

  function loadCatalog() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) { /* almacenamiento no disponible */ }
    return I.cloneCatalog();
  }

  function saveCatalog() {
    matchers = I.buildMatchers(state.catalog);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.catalog)); } catch (e) { /* ignorar */ }
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
    const c = instById(id);
    return c ? c.name : id;
  }

  function partLabel(inst, voices) {
    const v = I.voiceLabel(voices);
    return instName(inst) + (v ? ' ' + v : '');
  }

  function folderLabel(f) {
    return instName(f.inst) + (f.voice ? ` ${f.voice}º` : '');
  }

  function hueFor(id) {
    if (!id) return 'transparent';
    if (id === I.IGNORE_ID) return '#999';
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
  }

  // ---------- Carga de archivos ----------
  const dz = $('#dropzone');
  const fileInput = $('#file-input');
  fileInput.addEventListener('change', () => {
    addFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => addFiles(Array.from(e.dataTransfer.files)));
  // Evitar que el navegador abra el PDF si se suelta fuera de la zona.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  function setStatus(el, msg, isError) {
    el.hidden = !msg;
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }

  async function addFiles(files) {
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!pdfs.length) return;
    await pdfReady;
    const status = $('#load-status');
    for (let i = 0; i < pdfs.length; i++) {
      const f = pdfs[i];
      setStatus(status, `Leyendo «${f.name}» (${i + 1} de ${pdfs.length})…`);
      try {
        const work = await loadWork(f);
        state.works.push(work);
        renderWorks();
        renderThumbs(work);
      } catch (err) {
        console.error(err);
        setStatus(status, `No se pudo leer «${f.name}»: ${err.message || err}`, true);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    setStatus(status, '');
  }

  async function loadWork(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
    const work = {
      id: `w${nextId++}`,
      name: file.name.replace(/\.pdf$/i, ''),
      fileName: file.name,
      data,
      pdf,
      numPages: pdf.numPages,
      pages: [],
      expanded: false,
    };
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const texts = await pageTexts(page);
      work.pages.push({ inst: null, voices: [], src: 'heredado', thumb: null, texts });
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

  function detectPage(texts) {
    // Una página con muchos instrumentos distintos es la partitura general (guion de director).
    if (I.detectAll(texts.all, state.catalog, matchers).length >= 5) return { id: I.IGNORE_ID, voices: [] };
    return I.detect(texts.top, state.catalog, matchers) || I.detect(texts.bottom, state.catalog, matchers);
  }

  function redetect(work) {
    let prev = { inst: null, voices: [] };
    for (const pg of work.pages) {
      if (pg.src === 'manual') { prev = pg; continue; }
      const d = detectPage(pg.texts);
      if (d) {
        pg.inst = d.id;
        pg.voices = d.voices;
        pg.src = 'auto';
      } else {
        pg.inst = prev.inst;
        pg.voices = prev.voices.slice();
        pg.src = 'heredado';
      }
      prev = pg;
    }
  }

  // Propaga un cambio a las páginas heredadas siguientes.
  function propagate(work, fromIndex) {
    const src = work.pages[fromIndex];
    for (let i = fromIndex + 1; i < work.pages.length; i++) {
      const pg = work.pages[i];
      if (pg.src !== 'heredado') break;
      pg.inst = src.inst;
      pg.voices = src.voices.slice();
    }
  }

  // Papeles = tramos de páginas consecutivas con el mismo instrumento y voz.
  function getParts(work) {
    const parts = [];
    let cur = null;
    work.pages.forEach((pg, i) => {
      if (!pg.inst || pg.inst === I.IGNORE_ID) { cur = null; return; }
      const key = pg.inst + '|' + pg.voices.join(',');
      if (cur && cur.key === key && cur.pages[cur.pages.length - 1] === i - 1) {
        cur.pages.push(i);
      } else {
        cur = { id: `${work.id}:${i}`, key, inst: pg.inst, voices: pg.voices.slice(), pages: [i] };
        parts.push(cur);
      }
    });
    return parts;
  }

  // ---------- Vista: obras ----------
  function renderWorks() {
    const root = $('#works');
    root.innerHTML = '';
    $('#help-cargar').hidden = false;
    state.works.forEach((w, wi) => root.appendChild(renderWork(w, wi)));
  }

  function renderWork(w, wi) {
    const parts = getParts(w);
    const unassigned = w.pages.filter((p) => !p.inst).length;
    const card = h('div', { class: 'card work', 'data-work': w.id });
    const head = h('div', { class: 'work-head' },
      h('input', { class: 'work-name', value: w.name, title: 'Nombre de la obra (nombre del PDF en cada carpeta)',
        oninput: (e) => { w.name = e.target.value; } }),
      h('span', { class: 'work-meta' },
        `${w.numPages} págs · ${parts.length} papeles` + (unassigned ? ` · ${unassigned} sin asignar` : '')),
      h('div', { class: 'work-actions' },
        h('button', { class: 'icon', title: 'Subir', disabled: wi === 0, onclick: () => moveWork(wi, -1) }, '↑'),
        h('button', { class: 'icon', title: 'Bajar', disabled: wi === state.works.length - 1, onclick: () => moveWork(wi, 1) }, '↓'),
        h('button', { onclick: () => { w.expanded = !w.expanded; renderWorks(); renderThumbs(w); } },
          w.expanded ? 'Ocultar páginas' : 'Revisar páginas'),
        h('button', { class: 'ghost', title: 'Volver a detectar todas las páginas (descarta cambios a mano)',
          onclick: () => { w.pages.forEach((p) => { p.src = 'auto'; }); redetect(w); renderWorks(); renderThumbs(w); } }, 'Redetectar'),
        h('button', { class: 'ghost', title: 'Quitar obra', onclick: () => removeWork(wi) }, 'Quitar')));
    card.appendChild(head);

    const chips = h('div', { class: 'chips' },
      parts.map((p) => h('span', { class: 'chip', style: `border-color:${hueFor(p.inst)}` },
        partLabel(p.inst, p.voices), ' ', h('span', { class: 'n' }, `(${p.pages.length})`))));
    if (!parts.length) chips.appendChild(h('span', { class: 'chip' }, 'Ningún papel detectado: revisa las páginas'));
    card.appendChild(chips);

    if (w.expanded) {
      const grid = h('div', { class: 'pages' });
      w.pages.forEach((pg, i) => grid.appendChild(renderPage(w, pg, i)));
      card.appendChild(grid);
    }
    return card;
  }

  function instOptions(selected) {
    const opts = [h('option', { value: '' }, '— Sin asignar —')];
    for (const c of state.catalog) opts.push(h('option', { value: c.id, selected: c.id === selected }, c.name));
    opts.push(h('option', { value: I.IGNORE_ID, selected: selected === I.IGNORE_ID }, 'Ignorar (no es un papel)'));
    return opts;
  }

  function renderPage(w, pg, i) {
    const thumb = pg.thumb
      ? h('img', { class: 'thumb', src: pg.thumb, alt: `Página ${i + 1}`, onclick: () => openModal(w, i) })
      : h('div', { class: 'thumb placeholder', onclick: () => openModal(w, i) }, 'cargando…');
    const srcText = { auto: 'detectado', heredado: 'heredado', manual: 'a mano' }[pg.src] || '';
    const el = h('div', { class: 'page' + (pg.inst === I.IGNORE_ID ? ' ignored' : ''), 'data-page': i, style: `--hue:${hueFor(pg.inst)}` },
      thumb,
      h('div', { class: 'page-top' }, h('span', null, `Pág. ${i + 1}`), h('span', { class: `src ${pg.src}` }, srcText)),
      h('select', {
        'aria-label': `Instrumento de la página ${i + 1}`,
        onchange: (e) => {
          pg.inst = e.target.value || null;
          if (pg.inst === I.IGNORE_ID) pg.voices = [];
          pg.src = 'manual';
          propagate(w, i);
          rerenderWork(w);
        },
      }, instOptions(pg.inst)),
      h('input', {
        type: 'text', placeholder: 'Voz (vacío = único)', value: I.formatVoices(pg.voices),
        'aria-label': `Voz de la página ${i + 1}`,
        onchange: (e) => {
          pg.voices = I.parseVoices(e.target.value);
          e.target.value = I.formatVoices(pg.voices);
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
    if (w.pdf) w.pdf.destroy();
    renderWorks();
  }

  // Miniaturas
  const thumbQueue = [];
  let thumbBusy = false;

  function renderThumbs(work) {
    work.pages.forEach((pg, i) => { if (!pg.thumb) thumbQueue.push([work, i]); });
    pumpThumbs();
  }

  async function pumpThumbs() {
    if (thumbBusy) return;
    thumbBusy = true;
    while (thumbQueue.length) {
      const [work, i] = thumbQueue.shift();
      const pg = work.pages[i];
      if (pg.thumb || !state.works.includes(work)) continue;
      try {
        const page = await work.pdf.getPage(i + 1);
        const vp0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 220 / vp0.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        pg.thumb = canvas.toDataURL('image/jpeg', 0.7);
        const tile = $(`[data-work="${work.id}"] [data-page="${i}"] .thumb`);
        if (tile) tile.replaceWith(h('img', { class: 'thumb', src: pg.thumb, alt: `Página ${i + 1}`, onclick: () => openModal(work, i) }));
      } catch (e) {
        console.warn('miniatura', e);
      }
    }
    thumbBusy = false;
  }

  // Vista ampliada
  const modal = $('#modal');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.classList.contains('modal-close')) modal.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.hidden = true; });

  async function openModal(work, i) {
    const page = await work.pdf.getPage(i + 1);
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
  function buildPlan() {
    const works = state.works.map((w) => ({ id: w.id, name: w.name, parts: getParts(w) }));
    const plan = D.computePlan(works, state.catalog);
    plan.works = works;
    // Aplicar elecciones manuales
    for (const w of works) {
      for (const f of plan.folders) {
        const key = `${w.id}|${f.key}`;
        if (!(key in state.overrides)) continue;
        const pid = state.overrides[key];
        if (pid === '') {
          plan.assignments[w.id][f.key] = { type: 'manual', part: null, fromInst: null, auto: plan.assignments[w.id][f.key] };
        } else {
          const p = w.parts.find((x) => x.id === pid);
          if (p) plan.assignments[w.id][f.key] = { type: 'manual', part: p, fromInst: p.inst, auto: plan.assignments[w.id][f.key] };
          else delete state.overrides[key];
        }
      }
    }
    state.plan = plan;
    return plan;
  }

  function describe(a) {
    if (!a || !a.part) return '— Sin papel —';
    return partLabel(a.part.inst, a.part.voices);
  }

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
      const tr = h('tr', { class: f.inst !== lastInst ? 'inst-start' : '' }, h('td', null, folderLabel(f)));
      lastInst = f.inst;
      for (const w of plan.works) {
        const a = plan.assignments[w.id][f.key];
        const type = a.type === 'manual' && !a.part ? 'manual' : a.type;
        counts[a.type]++;
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
        tr.appendChild(h('td', { class: `cell cell-${a.type === 'falta' ? 'falta' : type}`, title: titleFor(a, f) }, sel));
      }
      tbody.appendChild(tr);
    }
    table.appendChild(thead);
    table.appendChild(tbody);

    const nInst = new Set(plan.folders.map((f) => f.inst)).size;
    const summary = $('#plan-summary');
    summary.innerHTML = '';
    const stat = (n, label) => h('div', { class: 'stat' }, h('b', null, String(n)), label);
    summary.append(
      stat(plan.works.length, 'obras'),
      stat(nInst, 'instrumentos'),
      stat(plan.folders.length, 'carpetas'),
      stat(counts.propio, 'papeles propios'),
      stat(counts.voz, 'de otra voz'),
      stat(counts.familia, 'de otro instrumento'),
      stat(counts.falta, 'sin papel'));
  }

  function titleFor(a, f) {
    switch (a.type) {
      case 'propio': return 'Papel propio de la obra';
      case 'voz': return `No existe ${folderLabel(f)} en esta obra: se reparte ${describe(a)}`;
      case 'familia': return `No hay ${instName(f.inst)} en esta obra: se usa ${describe(a)} (misma familia y afinación)`;
      case 'falta': return 'No hay ningún papel compatible en esta obra';
      case 'manual': return 'Elegido a mano';
      default: return '';
    }
  }

  // ---------- Exportar ----------
  $('#btn-export').addEventListener('click', exportZip);

  function safeName(s) {
    return String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'sin nombre';
  }

  // Helvetica estándar solo admite WinAnsi: sustituimos lo que no sepa dibujar.
  function winAnsi(s) {
    return String(s).replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[^\x20-\x7e\xa0-\xff]/g, '');
  }

  async function exportZip() {
    const status = $('#export-status');
    if (!state.works.length) { setStatus(status, 'Primero carga algún guion.', true); return; }
    const btn = $('#btn-export');
    btn.disabled = true;
    try {
      const plan = buildPlan();
      const stamp = $('#opt-stamp').checked;
      const book = $('#opt-book').checked;
      const report = $('#opt-report').checked;
      const zipName = safeName($('#opt-zipname').value || 'Papeles banda');
      const zip = new JSZip();
      const root = zip.folder(zipName);

      setStatus(status, 'Preparando PDFs…');
      const srcDocs = {};
      for (const w of state.works) {
        srcDocs[w.id] = await PDFLib.PDFDocument.load(w.data, { ignoreEncryption: true });
      }

      // Nombres de archivo únicos por obra
      const fileNames = {};
      const used = new Set();
      plan.works.forEach((w, i) => {
        let base = safeName(w.name);
        let n = base;
        let k = 2;
        while (used.has(n.toLowerCase())) n = `${base} (${k++})`;
        used.add(n.toLowerCase());
        fileNames[w.id] = `${n}.pdf`;
        void i;
      });

      const pad = String(plan.folders.length).length < 2 ? 2 : String(plan.folders.length).length;
      const csv = [['Carpeta', 'Obra', 'Tipo', 'Papel usado', 'Páginas'].join(';')];
      const typeText = { propio: 'Propio', voz: 'Otra voz', familia: 'Otro instrumento (familia)', falta: 'Sin papel', manual: 'Elegido a mano' };
      let done = 0;

      for (const f of plan.folders) {
        const folderName = `${String(f.order).padStart(pad, '0')} ${safeName(folderLabel(f))}`;
        const folder = root.folder(folderName);
        const bookDoc = book ? await PDFLib.PDFDocument.create() : null;
        const bookFont = bookDoc ? await bookDoc.embedFont(PDFLib.StandardFonts.Helvetica) : null;

        for (const w of plan.works) {
          const a = plan.assignments[w.id][f.key];
          const pages = a.part ? a.part.pages : [];
          csv.push([folderLabel(f), w.name, typeText[a.type], a.part ? partLabel(a.part.inst, a.part.voices) : '',
            pages.map((p) => p + 1).join(' ')].map(csvCell).join(';'));
          if (!a.part) continue;

          const isSub = a.type !== 'propio' && !(a.type === 'manual' && a.part.inst === f.inst &&
            (!a.part.voices.length || a.part.voices.includes(f.voice || 1)));
          const note = isSub && stamp ? winAnsi(`${folderLabel(f)}: se toca el papel de ${partLabel(a.part.inst, a.part.voices)}`) : null;

          const out = await PDFLib.PDFDocument.create();
          const font = note ? await out.embedFont(PDFLib.StandardFonts.Helvetica) : null;
          const copied = await out.copyPages(srcDocs[w.id], pages);
          copied.forEach((pg) => { out.addPage(pg); if (note) stampPage(pg, note, font); });
          out.setTitle(`${w.name} - ${folderLabel(f)}`);
          folder.file(fileNames[w.id], await out.save());

          if (bookDoc) {
            const c2 = await bookDoc.copyPages(srcDocs[w.id], pages);
            c2.forEach((pg) => { bookDoc.addPage(pg); if (note) stampPage(pg, note, bookFont); });
          }
        }
        if (bookDoc && bookDoc.getPageCount()) {
          bookDoc.setTitle(folderLabel(f));
          folder.file(`00 Cuadernillo ${safeName(folderLabel(f))}.pdf`, await bookDoc.save());
        }
        done++;
        setStatus(status, `Generando carpetas… ${done} de ${plan.folders.length}`);
      }

      if (report) root.file('Informe.csv', '﻿' + csv.join('\r\n'));

      setStatus(status, 'Comprimiendo ZIP…');
      const blob = await zip.generateAsync({ type: 'blob' }, (m) => setStatus(status, `Comprimiendo ZIP… ${Math.round(m.percent)} %`));
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `${zipName}.zip` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus(status, `Listo: ${plan.folders.length} carpetas para ${plan.works.length} obras.`);
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

  function stampPage(page, text, font) {
    const { width } = page.getSize();
    const size = 8;
    const tw = font.widthOfTextAtSize(text, size);
    const x = Math.max(6, (width - tw) / 2);
    page.drawRectangle({ x: x - 4, y: 4, width: tw + 8, height: size + 5, color: PDFLib.rgb(1, 1, 1), opacity: 0.85 });
    page.drawText(text, { x, y: 7, size, font, color: PDFLib.rgb(0.35, 0.35, 0.35) });
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
      ['Instrumento', 'Familia', 'Afinación', 'Clave', 'Nombres en la cabecera', 'Sustitutos (por preferencia)', ''].map((t) => h('th', null, t)))));
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
  window.__papeles = { state, getParts, buildPlan };
})();
