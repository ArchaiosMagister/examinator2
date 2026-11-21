/* propose.js — propuestas automáticas: palabras subrayadas, verbos para la modificación
   preverbial, evolución fonética, prefijos y latinismos */
'use strict';
(function () {
  const P = M.Propose = {};
  const CATS = [['n', 'sustantivo'], ['a', 'adjetivo'], ['p', 'pronombre'], ['v', 'verbo']];
  P.CATS = CATS;

  const lowerFirst = (s) => s ? s[0].toLowerCase() + s.slice(1) : s;
  const groupToks = (S, t) => (t.group ? t.group.map((i) => S.tokens[i]) : [t]);
  P.formOf = (S, t) => groupToks(S, t).map((x) => {
    // La lematización ya comprobó si ae/oe son diptongos. No convertir hiatos.
    const word = x.lig || x.w;
    return x.proper ? word : lowerFirst(word);
  }).join(' ');
  // Exámenes anteriores: corregir solo propuestas que aún coincidan con
  // la forma elegida del texto, sin reescribir aportaciones manuales.
  P.prevDisplay = (S, item) => {
    const value = String(item && item.txt || '');
    if (!item || !Number.isInteger(item.i) || !item.lplain) return value;
    const token = (S.tokens || [])[item.i];
    if (!token) return value;
    const unligated = groupToks(S, token).map((x) =>
      x.proper ? x.w : lowerFirst(x.w)).join(' ');
    return M.fold(unligated) === M.fold(value) ? P.formOf(S, token) : value;
  };

  /* ---------- análisis morfológico: palabras subrayadas ---------- */
  function candidates(S, cat, used) {
    const toks = (S.tokens || []).filter((t) => t.sel && t.cat === cat && !t.aux && !used.has(t.i));
    let tiers;
    if (cat === 'n') tiers = [toks.filter((t) => !t.proper && !t.amb), toks.filter((t) => !t.proper), toks];
    else if (cat === 'v') tiers = [toks.filter((t) => !t.sum && !t.amb), toks.filter((t) => !t.sum), toks];
    else tiers = [toks.filter((t) => !t.amb), toks];
    return tiers.find((x) => x.length) || [];
  }
  P.underlineOne = function (S, cat, exclude) {
    const used = new Set(exclude || []);
    for (const s of S.subr || []) if (s.cat !== cat) for (const i of s.toks) used.add(i);
    const cur = (S.subr || []).find((s) => s.cat === cat);
    let cands = candidates(S, cat, used);
    if (cur && cands.length > 1) cands = cands.filter((t) => !cur.toks.includes(t.i));
    if (!cands.length) return { cat, toks: [] };
    const t = M.pick(cands);
    return { cat, toks: t.group ? t.group.slice() : [t.i] };
  };
  P.underline = function (S) {
    S.subr = [];
    for (const [cat] of M.shuffle(CATS)) S.subr.push(P.underlineOne(S, cat));
    S.subr.sort((a, b) => CATS.findIndex((c) => c[0] === a.cat) - CATS.findIndex((c) => c[0] === b.cat));
  };

  /* ---------- modificación preverbial ---------- */
  P.prevCandidates = function (S) {
    const seen = new Map();
    for (const t of S.tokens || []) {
      if (!t.sel || t.cat !== 'v' || t.aux || !t.rows || !t.rows.length) continue;
      if (seen.has(t.lplain)) continue;
      seen.set(t.lplain, { txt: P.formOf(S, t), rows: t.rows.slice(), lplain: t.lplain, i: t.i, sum: t.sum });
    }
    return Array.from(seen.values());
  };
  const clash = (a, b) => a.lplain === b.lplain || a.rows.some((r) => b.rows.includes(r));
  P.preverbs = function (S) {
    const all = P.prevCandidates(S);
    const pool = M.shuffle(all.filter((c) => !c.sum)).concat(M.shuffle(all.filter((c) => c.sum)));
    let pair = null;
    for (let a = 0; a < pool.length && !pair; a++) for (let b = a + 1; b < pool.length; b++) if (!clash(pool[a], pool[b])) { pair = [pool[a], pool[b]]; break; }
    if (!pair) pair = pool.slice(0, 1);
    pair.sort((x, y) => x.i - y.i);
    const ns = Math.random() < 0.5 ? [3, 2] : [2, 3];
    S.prev = pair.map((c, k) => Object.assign({ n: ns[k] }, c));
    while (S.prev.length < 2) S.prev.push({ txt: '', n: ns[S.prev.length], rows: [], lplain: '' });
    return all.length;
  };
  P.preverbOne = function (S, k) {
    const other = S.prev[1 - k];
    const all = P.prevCandidates(S).filter((c) => !(other && other.lplain && clash(c, other)) && c.lplain !== (S.prev[k] && S.prev[k].lplain));
    if (!all.length) return false;
    const pool = all.filter((c) => !c.sum);
    const c = M.pick(pool.length ? pool : all);
    S.prev[k] = Object.assign({ n: S.prev[k].n }, c);
    return true;
  };

  /* ---------- evolución fonética: cuatro fenómenos distintos ---------- */
  // Una palabra puede pertenecer a varias normas. No repetirla entre los
  // cuatro apartados, aunque las etiquetas de fenómeno sean diferentes.
  P.evol = function (S) {
    const eligible = M.LexicalFilters ? M.LexicalFilters.evolPool(S) : (M.lists.evolucion || []);
    const groups = M.shuffle(eligible.filter((g) => g.palabras && g.palabras.length));
    const used = new Set();
    S.evol = [];
    for (const g of groups) {
      const available = g.palabras.filter((w) => !used.has(M.fold(w)));
      const w = M.pick(available);
      if (!w) continue;
      S.evol.push({ g: g.nombre, w });
      used.add(M.fold(w));
      if (S.evol.length === 4) break;
    }
    return S.evol.length === 4;
  };
  P.evolOne = function (S, k) {
    const others = (S.evol || []).filter((x, j) => j !== k && x);
    const usedGroups = new Set(others.map((x) => x.g));
    const usedWords = new Set(others.map((x) => M.fold(x.w)));
    const current = S.evol[k] || {};
    const pool = (M.LexicalFilters ? M.LexicalFilters.evolPool(S) : (M.lists.evolucion || []))
      .filter((g) => g.palabras && g.palabras.length && !usedGroups.has(g.nombre))
      .map((g) => ({ nombre: g.nombre, palabras: g.palabras.filter((w) => !usedWords.has(M.fold(w)) && M.fold(w) !== M.fold(current.w || '')) }))
      .filter((g) => g.palabras.length);
    const alternative = pool.filter((g) => g.nombre !== current.g);
    const g = M.pick(alternative.length ? alternative : pool);
    if (!g) return false;
    const w = M.pick(g.palabras);
    if (w) { S.evol[k] = { g: g.nombre, w }; return true; }
    return false;
  };

  // El banco fonético acredita estas ligaduras; no convertir a ciegas
  // cualquier secuencia ae/oe (p. ej., los hiatos de otras formas).
  const writtenEtima = new Map();
  const ambiguousEtima = new Set();
  const orthKey = (word) => M.fold(word).replace(/æ/g, 'ae').replace(/œ/g, 'oe');
  for (const item of (((window.EXACADEMIC_SOURCE || {}).fonetica || {}).items || [])) {
    const word = String(item.latin || '');
    if (!/[æœ]/i.test(word)) continue;
    const key = orthKey(word), existing = writtenEtima.get(key);
    if (existing && existing !== word) ambiguousEtima.add(key);
    else writtenEtima.set(key, word);
  }
  P.evolDisplay = (word) => {
    const input = String(word || ''), key = orthKey(input);
    if (ambiguousEtima.has(key)) return input;
    const canonical = writtenEtima.get(key);
    if (!canonical) return input;
    const initiallyUpper = input[0] && input[0] !== input[0].toLowerCase();
    return initiallyUpper ? canonical[0].toUpperCase() + canonical.slice(1) : canonical;
  };

  /* ---------- prefijos y latinismos ---------- */
  const PROPER = /^(Cisjordania|Anticristo|Contrarreforma)$/i;
  const prefDisplay = (w) => (PROPER.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase());
  P.prefDisplay = prefDisplay;
  const latDisplay = (t) => {
    const source = String(t && (t.termino || t) || '');
    const value = source.split(/\s*\/\s*|\s+[ou]\s+/)[0]
      .replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase();
    // El gentilicio Graecas conserva la mayúscula también en .examen antiguos.
    // æquus sí contiene diptongo; otras secuencias ae/oe no se sustituyen.
    if (value === 'ad kalendas graecas') return 'ad kalendas Graecas';
    if (value === 'ex aequo' || value === 'ex æquo') return 'ex æquo';
    return value;
  };
  P.latDisplay = latDisplay;
  function pickN(list, n, current, k) {
    const used = new Set((current || []).filter((x, j) => j !== k).map(M.fold));
    const pool = list.filter((x) => !used.has(M.fold(x)) && (k === undefined || M.fold(x) !== M.fold(current[k])));
    return k === undefined ? M.shuffle(list).slice(0, n) : M.pick(pool);
  }
  P.pref = (S) => { S.pref = pickN((M.lists.prefijos || []).map(prefDisplay), 4); };
  P.prefOne = (S, k) => { const w = pickN((M.lists.prefijos || []).map(prefDisplay), 1, S.pref, k); if (w) S.pref[k] = w; };
  const latinCandidates = (S) => (M.LexicalFilters
    ? M.LexicalFilters.latinPool(S) : (M.lists.latinismos || [])).map(latDisplay);
  P.latin = (S) => { S.latin = pickN(latinCandidates(S), 4); return S.latin.length === 4; };
  P.latinOne = (S, k) => {
    const w = pickN(latinCandidates(S), 1, S.latin, k);
    if (w) { S.latin[k] = w; return true; }
    return false;
  };

  /* ---------- referencia a partir de la cita ---------- */
  // «1.6» → «I 6»; un intervalo «1.6–1.7» → «I 6-7»
  P.citeRef = function (a, b, levels) {
    const fmt = (c) => { const p = String(c).split('.'); if (p.length > 1 && /^\d+$/.test(p[0])) p[0] = M.roman(p[0]); return p; };
    const join = (arr) => arr.length > 2 ? arr[0] + ' ' + arr.slice(1).join(', ') : arr.join(' ');
    const A = fmt(a); if (!b || b === a) return join(A);
    const B = fmt(b);
    let k = 0; while (k < A.length - 1 && k < B.length - 1 && A[k] === B[k]) k++;
    if (k === A.length - 1 && A.length === B.length) return join(A) + '-' + B[B.length - 1];
    return join(A) + ' – ' + join(B);
  };
})();
