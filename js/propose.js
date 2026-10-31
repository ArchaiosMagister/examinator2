/* propose.js — propuestas automáticas: palabras subrayadas, verbos para la modificación
   preverbial, evolución fonética, prefijos y latinismos */
'use strict';
(function () {
  const P = M.Propose = {};
  const CATS = [['n', 'sustantivo'], ['a', 'adjetivo'], ['p', 'pronombre'], ['v', 'verbo']];
  P.CATS = CATS;

  const lowerFirst = (s) => s ? s[0].toLowerCase() + s.slice(1) : s;
  const groupToks = (S, t) => (t.group ? t.group.map((i) => S.tokens[i]) : [t]);
  P.formOf = (S, t) => groupToks(S, t).map((x) => x.proper ? x.w : lowerFirst(x.w)).join(' ');

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
  P.evol = function (S) {
    const gs = M.shuffle((M.lists.evolucion || []).filter((g) => g.palabras.length)).slice(0, 4);
    S.evol = gs.map((g) => ({ g: g.nombre, w: M.pick(g.palabras) }));
  };
  P.evolOne = function (S, k) {
    const used = new Set(S.evol.filter((x, j) => j !== k && x).map((x) => x.g));
    const cur = S.evol[k] || {};
    let gs = (M.lists.evolucion || []).filter((g) => g.palabras.length && !used.has(g.nombre));
    const others = gs.filter((g) => g.nombre !== cur.g);
    if (others.length) gs = others;
    const g = M.pick(gs); if (!g) return;
    S.evol[k] = { g: g.nombre, w: M.pick(g.palabras) };
  };

  /* ---------- prefijos y latinismos ---------- */
  const PROPER = /^(Cisjordania|Anticristo|Contrarreforma)$/;
  const prefDisplay = (w) => (PROPER.test(w) ? w : w.toLowerCase());
  const latDisplay = (t) => String(t.termino || t).split(/\s+[ou]\s+/)[0].replace(/\s*\(.*?\)\s*/g, ' ').trim();
  P.latDisplay = latDisplay;
  function pickN(list, n, current, k) {
    const used = new Set((current || []).filter((x, j) => j !== k).map(M.fold));
    const pool = list.filter((x) => !used.has(M.fold(x)) && (k === undefined || M.fold(x) !== M.fold(current[k])));
    return k === undefined ? M.shuffle(list).slice(0, n) : M.pick(pool);
  }
  P.pref = (S) => { S.pref = pickN((M.lists.prefijos || []).map(prefDisplay), 4); };
  P.prefOne = (S, k) => { const w = pickN((M.lists.prefijos || []).map(prefDisplay), 1, S.pref, k); if (w) S.pref[k] = w; };
  P.latin = (S) => { S.latin = pickN((M.lists.latinismos || []).map(latDisplay), 4); };
  P.latinOne = (S, k) => { const w = pickN((M.lists.latinismos || []).map(latDisplay), 1, S.latin, k); if (w) S.latin[k] = w; };

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
