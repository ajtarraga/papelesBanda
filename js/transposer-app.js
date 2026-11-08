/* global JSZip, jspdf, svg2pdf, verovio, Instruments, Transpose */
(function () {
  'use strict';

  const I = Instruments;
  const T = Transpose;

  // Catálogo de instrumentos (el mismo que en la página de dividir guiones, con los cambios del usuario).
  let catalog = I.cloneCatalog();
  try {
    const raw = localStorage.getItem('papelesBanda.catalog.v3');
    if (raw) { const c = JSON.parse(raw); if (Array.isArray(c) && c.length) catalog = c; }
  } catch (e) { /* sin almacenamiento */ }
  const instById = (id) => catalog.find((c) => c.id === id);
  const pitched = catalog.filter((c) => c.tuning !== 'perc');

  const $ = (s, el) => (el || document).querySelector(s);
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }
  function setStatus(msg, isError) {
    const el = $('#t-status');
    el.hidden = !msg;
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }

  // ---------- Verovio ----------
  const vrvReady = new Promise((resolve) => {
    const prev = verovio.module.onRuntimeInitialized;
    verovio.module.onRuntimeInitialized = () => { if (prev) prev(); resolve(); };
    // Por si el módulo ya había arrancado antes de llegar aquí.
    const timer = setInterval(() => {
      if (verovio.module.calledRun || (verovio.module._malloc && verovio.module.HEAPU8)) { clearInterval(timer); resolve(); }
    }, 200);
  });
  let tk = null;
  async function toolkit() {
    await vrvReady;
    if (!tk) tk = new verovio.toolkit();
    return tk;
  }
  const VRV_OPTIONS = {
    pageWidth: 2100, pageHeight: 2970, scale: 48, adjustPageHeight: false,
    pageMarginTop: 80, pageMarginBottom: 80, pageMarginLeft: 80, pageMarginRight: 80,
    breaks: 'auto', footer: 'none', header: 'auto', svgViewBox: true, svgRemoveXlink: true,
  };

  // ---------- Carga ----------
  const works = [];
  let nextId = 1;
  $('#t-btn').addEventListener('click', (e) => { e.stopPropagation(); $('#t-file').click(); });
  $('#t-dropzone').addEventListener('click', () => $('#t-file').click());
  $('#t-file').addEventListener('change', (e) => { addFiles(Array.from(e.target.files)); e.target.value = ''; });
  const dz = $('#t-dropzone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => addFiles(Array.from(e.dataTransfer.files)));
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  async function readMusicXML(file) {
    if (/\.mxl$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      let path = null;
      const container = zip.file('META-INF/container.xml');
      if (container) {
        const c = new DOMParser().parseFromString(await container.async('string'), 'application/xml');
        const rf = c.getElementsByTagName('rootfile')[0];
        if (rf) path = rf.getAttribute('full-path');
      }
      if (!path) path = Object.keys(zip.files).find((n) => /\.(musicxml|xml)$/i.test(n) && !n.startsWith('META-INF'));
      if (!path || !zip.file(path)) throw new Error('El .mxl no contiene una partitura MusicXML');
      return zip.file(path).async('string');
    }
    return file.text();
  }

  async function addFiles(files, extra) {
    let pdfs = 0;
    for (const file of files) {
      if (/\.pdf$/i.test(file.name)) { pdfs++; pdfQueue.push({ id: `p${nextId++}`, file, state: 'pendiente', msg: '' }); continue; }
      if (!/\.(musicxml|xml|mxl)$/i.test(file.name)) continue;
      try {
        setStatus(`Leyendo «${file.name}»…`);
        const xml = await readMusicXML(file);
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('el XML no es válido');
        if (!doc.getElementsByTagName('part').length) throw new Error('no parece un MusicXML de partitura');
        const info = T.inspectDocument(doc);
        const base = file.name.replace(/\.(musicxml|xml|mxl)$/i, '');
        const det = I.detect(info.name, catalog) || I.parseFileName(file.name, catalog) || I.detect(info.title, catalog);
        const from = det && instById(det.id) && det.id !== I.GUION_ID ? det.id : 'flauta';
        works.push({
          id: `t${nextId++}`, fileName: file.name, base, xml, info,
          from, to: from, clef: 'auto', octave: 0, partName: info.name,
          page: 1, view: 'transportado', result: null, ...(extra || {}),
        });
      } catch (err) {
        console.error(err);
        setStatus(`No se pudo leer «${file.name}»: ${err.message || err}`, true);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    setStatus('');
    if (pdfs) { renderPdfs(); $('#t-pdfs').scrollIntoView({ behavior: 'smooth' }); }
    await renderAll();
  }

  // ---------- Reconocer PDF (Audiveris, a través del servidor local de «Iniciar») ----------
  const pdfQueue = [];
  const omr = { checked: false, available: false, command: null, local: false };
  const omrReady = (async () => {
    omr.local = /^https?:$/.test(location.protocol) && ['localhost', '127.0.0.1'].includes(location.hostname);
    if (omr.local) {
      try {
        const r = await fetch('api/omr/status', { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); omr.available = !!j.available; omr.command = j.command; }
      } catch (e) { /* servidor sin reconocimiento */ }
    }
    omr.checked = true;
  })();

  async function renderPdfs() {
    await omrReady;
    const root = $('#t-pdfs');
    root.innerHTML = '';
    root.hidden = !pdfQueue.length;
    if (!pdfQueue.length) return;
    const card = h('div', { class: 'card' }, h('h2', null, 'PDF: reconocer la música'));
    if (omr.available) {
      card.append(h('p', null, 'Un PDF es una imagen de la partitura. «Reconocer PDF» la convierte en MusicXML con ',
        h('strong', null, 'Audiveris'), ' (en tu ordenador) y la carga aquí para transportarla. El reconocimiento puede tardar ',
        'un par de minutos por página y comete errores: revisa el resultado antes de transportar.'));
    } else {
      card.append(h('p', null, 'Un PDF es una imagen de la partitura: antes de transportarlo hay que reconocer la música (OMR). ',
        'Para hacerlo desde aquí con el botón «Reconocer PDF»:'),
      h('ol', null,
        h('li', null, 'Instala ', h('strong', null, 'Audiveris'), ' (gratuito) desde ',
          h('a', { href: 'https://github.com/Audiveris/audiveris/releases', target: '_blank', rel: 'noopener' }, 'su página de descargas'),
          ' (en Windows, el archivo «windows-x86_64.msi»; en Mac, el «.dmg»).'),
        h('li', null, 'Abre la aplicación con ', h('strong', null, '«Iniciar (Windows).bat»'), ' o ', h('strong', null, '«Iniciar (Mac-Linux).command»'),
          ' (no desde la web publicada ni abriendo el archivo directamente).'),
        h('li', null, 'Vuelve a cargar aquí el PDF.')),
      h('p', { class: 'small help' }, omr.local
        ? 'El servidor local está en marcha pero no encuentra Audiveris. Si lo has instalado en otra carpeta, indica la ruta en la variable de entorno AUDIVERIS y vuelve a abrir «Iniciar».'
        : 'Ahora mismo la página no está abierta desde «Iniciar», así que no puede usar Audiveris.'),
      h('p', { class: 'small help' }, 'También puedes convertirlo tú: ábrelo en MuseScore (Archivo → Importar PDF) o en Audiveris, corrígelo y exporta MusicXML.'));
    }
    for (const item of pdfQueue) {
      const row = h('div', { class: 't-pdf-row' },
        h('span', { class: 't-pdf-name' }, item.file.name),
        omr.available ? h('button', { class: 'primary', disabled: item.state === 'reconociendo', onclick: () => recognize(item) },
          item.state === 'reconociendo' ? 'Reconociendo…' : 'Reconocer PDF') : null,
        h('button', { class: 'ghost', disabled: item.state === 'reconociendo', onclick: () => { pdfQueue.splice(pdfQueue.indexOf(item), 1); renderPdfs(); } }, 'Quitar'),
        item.msg ? h('div', { class: `t-pdf-msg${item.state === 'error' ? ' warn' : ''}` }, item.msg) : null);
      card.append(row);
    }
    root.append(card);
  }

  async function recognize(item) {
    item.state = 'reconociendo';
    const t0 = Date.now();
    item.msg = 'Reconociendo con Audiveris… (puede tardar varios minutos)';
    renderPdfs();
    const timer = setInterval(() => {
      const sec = Math.round((Date.now() - t0) / 1000);
      item.msg = `Reconociendo con Audiveris… ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} (puede tardar varios minutos)`;
      const el = Array.from(document.querySelectorAll('.t-pdf-row')).find((r) => r.querySelector('.t-pdf-name').textContent === item.file.name);
      if (el && el.querySelector('.t-pdf-msg')) el.querySelector('.t-pdf-msg').textContent = item.msg;
    }, 1000);
    try {
      const r = await fetch(`api/omr?name=${encodeURIComponent(item.file.name)}`, { method: 'POST', body: item.file });
      const j = await r.json().catch(() => ({ error: `Respuesta no válida del servidor (${r.status})` }));
      if (!r.ok || j.error) throw new Error(j.error || `Error ${r.status}`);
      const files = j.files.map((f) => {
        const bin = atob(f.base64);
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new File([u], f.name);
      });
      clearInterval(timer);
      pdfQueue.splice(pdfQueue.indexOf(item), 1);
      await renderPdfs();
      await addFiles(files, { omr: item.file.name });
    } catch (err) {
      clearInterval(timer);
      console.error(err);
      item.state = 'error';
      item.msg = `No se pudo reconocer: ${err.message || err}`;
      renderPdfs();
    }
  }

  // ---------- Transporte ----------
  function computeResult(w) {
    const doc = new DOMParser().parseFromString(w.xml, 'application/xml');
    const from = instById(w.from);
    const to = instById(w.to);
    let iv = T.intervalBetween(from, to);
    if (w.octave) iv = T.addIntervals(iv, { d: 7 * w.octave, s: 12 * w.octave });
    const clef = w.clef === 'auto' ? (w.to !== w.from || w.octave ? T.defaultClef(to) : null) : (w.clef === 'keep' ? null : w.clef);
    const summary = T.transposeDocument(doc, {
      interval: iv,
      clef,
      partName: w.partName && w.partName !== w.info.name ? w.partName : null,
      oldName: w.info.name,
      target: w.to !== w.from ? to : undefined,
    });
    let out = new XMLSerializer().serializeToString(doc);
    if (!/^<\?xml/.test(out)) out = '<?xml version="1.0" encoding="UTF-8"?>\n' + out;
    return { xml: out, summary, clef };
  }

  async function renderPages(xml) {
    const t = await toolkit();
    t.setOptions(VRV_OPTIONS);
    if (!t.loadData(xml)) throw new Error('Verovio no pudo leer la partitura');
    const n = t.getPageCount();
    return { count: n, page: (i) => t.renderToSVG(i) };
  }

  // ---------- Vista ----------
  function instSelect(value, onchange) {
    return h('select', { onchange: (e) => onchange(e.target.value) },
      pitched.map((c) => h('option', { value: c.id, selected: c.id === value }, c.name)));
  }

  function suggestName(w) {
    const voice = (w.info.name.match(/\d+\s*[ºª]?/) || [''])[0].trim();
    const to = instById(w.to);
    return to ? `${to.name}${voice ? ' ' + voice : ''}` : w.info.name;
  }

  async function renderAll() {
    const root = $('#t-works');
    root.innerHTML = '';
    for (const w of works) root.appendChild(await renderWork(w));
    $('#t-all').hidden = works.length < 2;
  }

  async function renderWork(w) {
    const card = h('div', { class: 'card work', 'data-tw': w.id });
    let error = null;
    try { w.result = computeResult(w); } catch (err) { console.error(err); error = err.message || String(err); w.result = null; }
    const s = w.result && w.result.summary;
    const fromI = instById(w.from);
    const toI = instById(w.to);

    const rerender = async () => { const old = $(`[data-tw="${w.id}"]`); old.replaceWith(await renderWork(w)); };
    const clefOptions = [h('option', { value: 'auto', selected: w.clef === 'auto' }, 'Automática (la del instrumento de destino)'),
      h('option', { value: 'keep', selected: w.clef === 'keep' }, 'Mantener la del original'),
      ...Object.entries(T.CLEFS).map(([k, c]) => h('option', { value: k, selected: w.clef === k }, `Clave de ${c.name}`))];

    card.append(
      h('div', { class: 'work-head' },
        h('strong', { class: 'work-title' }, w.info.title || w.base),
        h('span', { class: 'work-meta' }, `${w.fileName}${w.info.name ? ' · ' + w.info.name : ''}`),
        h('div', { class: 'work-actions' },
          h('button', { class: 'ghost', onclick: () => { works.splice(works.indexOf(w), 1); renderAll(); } }, 'Quitar'))),
      h('div', { class: 't-grid' },
        h('label', { class: 'field' }, 'Escrito para', instSelect(w.from, (v) => { w.from = v; rerender(); })),
        h('label', { class: 'field' }, 'Transportar a', instSelect(w.to, (v) => { const auto = !w.partName || w.partName === suggestName(w) || w.partName === w.info.name; w.to = v; if (auto) w.partName = suggestName(w); rerender(); })),
        h('label', { class: 'field' }, 'Clave', h('select', { onchange: (e) => { w.clef = e.target.value; rerender(); } }, clefOptions)),
        h('label', { class: 'field' }, 'Octava', h('select', { onchange: (e) => { w.octave = parseInt(e.target.value, 10); rerender(); } },
          [[-1, 'Una octava más baja'], [0, 'Sin cambio'], [1, 'Una octava más alta']].map(([v, l]) => h('option', { value: v, selected: w.octave === v }, l)))),
        h('label', { class: 'field' }, 'Nombre del papel', h('input', { type: 'text', value: w.partName, onchange: (e) => { w.partName = e.target.value; rerender(); } }))),
      error ? h('div', { class: 'status error' }, `No se pudo transportar: ${error}`) : h('div', { class: 't-summary' },
        h('div', null, h('strong', null, `${fromI ? fromI.name : '?'} → ${toI ? toI.name : '?'}: `), T.describeInterval(s.interval),
          s.interval.d !== T.intervalBetween(fromI, toI).d + 7 * w.octave ? ' (escrito enarmónicamente para simplificar la armadura)' : ''),
        s.keysBefore.length ? h('div', null, 'Armadura: ', T.keyName(s.keysBefore[0]), ' → ', h('strong', null, T.keyName(s.keysAfter[0])),
          s.keysBefore.length > 1 ? ` (y ${s.keysBefore.length - 1} cambio${s.keysBefore.length > 2 ? 's' : ''} más)` : '') : null,
        h('div', null, `Clave: ${w.result.clef ? 'de ' + T.CLEFS[w.result.clef].name : 'la del original'} · ${s.notes} notas transportadas`),
        s.warnings.length ? h('div', { class: 'warn' }, s.warnings.join(' ')) : null,
        w.omr ? h('div', { class: 'warn' }, `Reconocido automáticamente desde «${w.omr}» con Audiveris: puede tener errores. ` +
          'Compáralo con el PDF («Ver original» muestra lo reconocido) y, si hace falta, descarga el MusicXML reconocido, ' +
          'corrígelo en MuseScore y vuelve a cargarlo.') : null));

    if (!error) {
      const preview = h('div', { class: 't-preview' }, h('div', { class: 'empty' }, 'Generando vista previa…'));
      const pager = h('div', { class: 't-pager' });
      card.append(h('div', { class: 'toolbar' },
        h('button', { class: 'primary', onclick: () => downloadPdf(w) }, 'Descargar PDF'),
        h('button', { onclick: () => downloadXml(w) }, 'Descargar MusicXML'),
        w.omr ? h('button', { class: 'ghost', title: 'Lo que ha reconocido Audiveris, sin transportar (para corregirlo en MuseScore)',
          onclick: () => save(new Blob([w.xml], { type: 'application/vnd.recordare.musicxml+xml' }), `${safe(w.base)} (reconocido).musicxml`) }, 'Descargar MusicXML reconocido') : null,
        h('span', { class: 't-view' },
          ['transportado', 'original'].map((v) => h('button', { class: w.view === v ? 'active-btn' : 'ghost', onclick: () => { w.view = v; w.page = 1; rerender(); } },
            v === 'transportado' ? 'Ver transportado' : 'Ver original')))), pager, preview);
      renderPages(w.view === 'original' ? w.xml : w.result.xml).then((r) => {
        w.page = Math.min(w.page, r.count);
        preview.innerHTML = r.page(w.page);
        pager.innerHTML = '';
        if (r.count > 1) {
          pager.append(
            h('button', { class: 'icon', disabled: w.page <= 1, onclick: () => { w.page--; rerender(); } }, '←'),
            h('span', null, ` Página ${w.page} de ${r.count} `),
            h('button', { class: 'icon', disabled: w.page >= r.count, onclick: () => { w.page++; rerender(); } }, '→'));
        }
      }).catch((err) => { preview.innerHTML = ''; preview.append(h('div', { class: 'status error' }, `No se pudo dibujar: ${err.message || err}`)); });
    }
    return card;
  }

  // ---------- Descargas ----------
  const safe = (s) => String(s).replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'papel';
  const outName = (w) => safe(`${w.base} (${w.partName || (instById(w.to) || {}).name || 'transportado'})`);

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function makePdf(w) {
    const r = await renderPages(w.result.xml);
    const pdf = new jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const holder = h('div', { style: 'position:absolute;left:-10000px;top:0;width:800px' });
    document.body.appendChild(holder);
    try {
      for (let i = 1; i <= r.count; i++) {
        if (i > 1) pdf.addPage('a4', 'portrait');
        holder.innerHTML = r.page(i);
        const svg = holder.querySelector('svg');
        // Verovio no pone tamaño al SVG interior: se le da el del exterior para que svg2pdf escale bien.
        const vb = (svg.getAttribute('viewBox') || '0 0 2100 2970').split(/\s+/).map(Number);
        svg.setAttribute('width', vb[2]);
        svg.setAttribute('height', vb[3]);
        svg.querySelectorAll('svg').forEach((inner) => {
          if (!inner.getAttribute('width')) inner.setAttribute('width', vb[2]);
          if (!inner.getAttribute('height')) inner.setAttribute('height', vb[3]);
        });
        // Las fuentes estándar del PDF no tienen ♭ ni ♯ (solo afecta a textos; los símbolos musicales son dibujos).
        svg.querySelectorAll('text, tspan').forEach((t) => {
          t.childNodes.forEach((n) => { if (n.nodeType === 3) n.nodeValue = n.nodeValue.replace(/♭/g, 'b').replace(/♯/g, '#'); });
        });
        await svg2pdf.svg2pdf(svg, pdf, { x: 0, y: 0, width: 210, height: 297 });
      }
    } finally {
      holder.remove();
    }
    pdf.setProperties({ title: `${w.info.title || w.base} - ${w.partName}` });
    return pdf.output('blob');
  }

  async function downloadPdf(w) {
    try {
      setStatus('Generando PDF…');
      save(await makePdf(w), `${outName(w)}.pdf`);
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus(`No se pudo generar el PDF: ${err.message || err}`, true);
    }
  }

  function downloadXml(w) {
    save(new Blob([w.result.xml], { type: 'application/vnd.recordare.musicxml+xml' }), `${outName(w)}.musicxml`);
  }

  $('#t-zip').addEventListener('click', async () => {
    try {
      const zip = new JSZip();
      for (let i = 0; i < works.length; i++) {
        const w = works[i];
        if (!w.result) continue;
        setStatus(`Generando ${i + 1} de ${works.length}…`);
        zip.file(`${outName(w)}.pdf`, await makePdf(w));
        zip.file(`${outName(w)}.musicxml`, w.result.xml);
      }
      setStatus('Comprimiendo…');
      save(await zip.generateAsync({ type: 'blob' }), 'Papeles transportados.zip');
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message || err}`, true);
    }
  });

  window.__transportar = { works, computeResult, makePdf, addFiles, renderPages, pdfQueue, omr };
})();
