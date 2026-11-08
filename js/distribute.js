/*
 * Algoritmo de reparto de papeles.
 *
 * Entrada:
 *   works: [{ id, name, parts: [{ id, inst, voices: [n...] , pages: [...] }] }]
 *          voices vacío = papel único (vale para todas las voces de ese instrumento).
 *   catalog: lista de instrumentos (ver instruments.js)
 *
 * Reglas:
 *   1. Para cada instrumento se calcula el número máximo de voces entre todas las obras.
 *      Se crea una carpeta por cada voz (Clarinete 1º ... Clarinete Nº).
 *   2. Si la obra tiene el papel de esa voz, se usa (tipo "propio").
 *   3. Si la obra tiene ese instrumento pero no esa voz, se reparten las voces existentes
 *      de forma equilibrada: primero la menos cargada en esa obra, después la que menos
 *      veces se ha usado como sustituta en las obras anteriores (rotación), y por último
 *      la más cercana en altura (tipo "voz").
 *   4. Si la obra no tiene el instrumento, se busca el primer sustituto de su lista
 *      (misma familia y afinación) que sí esté en la obra y se reparte igual (tipo "familia").
 *   5. Si no hay sustituto posible, la carpeta se queda sin ese papel (tipo "falta").
 */
(function (root) {
  'use strict';

  function voicesKey(voices) {
    return voices && voices.length ? voices.join(',') : 'u';
  }

  function maxVoiceOf(part) {
    return part.voices && part.voices.length ? Math.max.apply(null, part.voices) : 1;
  }

  function position(voice, max) {
    return max > 1 ? (voice - 1) / (max - 1) : 0;
  }

  function partPosition(part, max) {
    if (!part.voices || !part.voices.length) return 0.5;
    const mean = part.voices.reduce((a, b) => a + b, 0) / part.voices.length;
    return position(mean, max);
  }

  function computeFolders(works, catalog) {
    const maxVoices = {};
    for (const w of works) {
      for (const p of w.parts) {
        maxVoices[p.inst] = Math.max(maxVoices[p.inst] || 0, maxVoiceOf(p));
      }
    }
    const folders = [];
    let order = 0;
    const known = new Set(catalog.map((c) => c.id));
    const ordered = catalog.map((c) => c.id).concat(Object.keys(maxVoices).filter((id) => !known.has(id)).sort());
    for (const id of ordered) {
      const max = maxVoices[id];
      if (!max) continue;
      for (let v = 1; v <= max; v++) {
        order++;
        folders.push({ key: max > 1 ? `${id}#${v}` : id, inst: id, voice: max > 1 ? v : null, max, order });
      }
    }
    return { folders, maxVoices };
  }

  /**
   * Reparte equilibradamente las fuentes entre las carpetas objetivo.
   */
  function balance(targets, sources, opts) {
    const { maxTarget, maxSource, usage, usagePrefix, initialLoad } = opts;
    const result = new Map();
    // Un papel único (sin número) vale para todas las voces.
    const unique = sources.find((s) => !s.voices || !s.voices.length);
    if (unique) {
      for (const t of targets) result.set(t.key, unique);
      return result;
    }
    const load = new Map(sources.map((s) => [s, initialLoad ? initialLoad(s) : 0]));
    for (const t of targets) {
      const posT = position(t.voice || 1, maxTarget);
      let best = null;
      let bestScore = null;
      for (const s of sources) {
        const uKey = usagePrefix + voicesKey(s.voices);
        const mean = s.voices.reduce((x, y) => x + y, 0) / s.voices.length;
        const score = [
          load.get(s), // equilibrio dentro de la obra
          usage[uKey] || 0, // rotación entre obras
          Math.abs((t.voice || 1) - mean), // misma voz o la más cercana
          Math.abs(posT - partPosition(s, maxSource)), // posición relativa
          maxVoiceOf(s),
        ];
        if (!best || lexLess(score, bestScore)) {
          best = s;
          bestScore = score;
        }
      }
      result.set(t.key, best);
      load.set(best, load.get(best) + 1);
      const uKey = usagePrefix + voicesKey(best.voices);
      usage[uKey] = (usage[uKey] || 0) + 1;
    }
    return result;
  }

  function lexLess(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) < 1e-9) continue;
      return a[i] < b[i];
    }
    return false;
  }

  /**
   * Calcula el plan completo.
   * Devuelve { folders, maxVoices, assignments: { [workId]: { [folderKey]: {type, part, fromInst} } } }
   */
  function computePlan(works, catalog) {
    const { folders, maxVoices } = computeFolders(works, catalog);
    const byId = Object.fromEntries(catalog.map((c) => [c.id, c]));
    const foldersByInst = {};
    for (const f of folders) (foldersByInst[f.inst] = foldersByInst[f.inst] || []).push(f);

    const usage = {};
    const assignments = {};

    for (const w of works) {
      const a = (assignments[w.id] = {});
      const byInst = {};
      for (const p of w.parts) (byInst[p.inst] = byInst[p.inst] || []).push(p);

      for (const inst of Object.keys(foldersByInst)) {
        const targets = foldersByInst[inst];
        const max = maxVoices[inst];
        const own = byInst[inst];

        if (own && own.length) {
          const missing = [];
          for (const t of targets) {
            const v = t.voice || 1;
            const exact = own.find((p) => p.voices && p.voices.includes(v));
            const unique = own.find((p) => !p.voices || !p.voices.length);
            if (exact) a[t.key] = { type: 'propio', part: exact, fromInst: inst };
            else if (unique) a[t.key] = { type: 'propio', part: unique, fromInst: inst };
            else missing.push(t);
          }
          if (missing.length) {
            const res = balance(missing, own, {
              maxTarget: max,
              maxSource: max,
              usage,
              usagePrefix: `${inst}>${inst}:`,
              // Cada papel ya cubre su(s) propia(s) carpeta(s).
              initialLoad: (s) => (s.voices ? s.voices.filter((v) => v <= max).length : 1),
            });
            for (const t of missing) a[t.key] = { type: 'voz', part: res.get(t.key), fromInst: inst };
          }
          continue;
        }

        const subs = (byId[inst] && byId[inst].subs) || [];
        const cand = subs.find((s) => byInst[s] && byInst[s].length);
        if (cand) {
          const res = balance(targets, byInst[cand], {
            maxTarget: max,
            maxSource: maxVoices[cand] || 1,
            usage,
            usagePrefix: `${inst}>${cand}:`,
          });
          for (const t of targets) a[t.key] = { type: 'familia', part: res.get(t.key), fromInst: cand };
        } else {
          for (const t of targets) a[t.key] = { type: 'falta', part: null, fromInst: null };
        }
      }
    }
    return { folders, maxVoices, assignments };
  }

  const api = { computePlan, computeFolders, voicesKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Distribute = api;
})(typeof self !== 'undefined' ? self : this);
