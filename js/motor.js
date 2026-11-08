(function () {
"use strict";
const defs = {}, cache = {};
defs["engine/engine.js"] = function (module, exports, require) {
/*
 * engine.js — Motor de Examinator (hilo aparte): biblioteca de Perseus latín,
 * análisis del texto del examen y listas de preguntas.
 * Licencia GNU GPL v3.
 */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const X = require('./lat');
const { convertTei } = require('../core/tei');
const Dis = require('./disamb');

const { appDir, dataRoot } = workerData;
const DATA = path.join(appDir, 'data');
const TEXTS = path.join(dataRoot, 'textos');
const LISTS = path.join(dataRoot, 'listas');

const event = (name, data) => parentPort.postMessage({ type: 'event', name, data });

/* ---------- léxico ---------- */
let byUid = null;
let homModel = null;
function L() {
  const c = X.lat(DATA);
  if (!byUid) { byUid = new Map(); for (const l of c.lemmes.values()) byUid.set(l.uid, l); }
  return c;
}

/* ---------- listas ---------- */
const LIST_NAMES = ['preverbios', 'evolucion', 'prefijos', 'latinismos'];
function readList(name) {
  const user = path.join(LISTS, name + '.json');
  try { if (fs.existsSync(user)) return JSON.parse(fs.readFileSync(user, 'utf8')); } catch (e) { /* copia dañada: la de fábrica */ }
  return JSON.parse(fs.readFileSync(path.join(DATA, 'listas', name + '.json'), 'utf8'));
}
let prevIndex = null;
function preverbIndex() {
  if (prevIndex) return prevIndex;
  const rows = readList('preverbios');
  const map = new Map(); const bases = [];
  const add = (w, r) => { const k = X.plain(w); if (!k) return; let s = map.get(k); if (!s) map.set(k, s = new Set()); s.add(r); };
  rows.forEach((row, r) => {
    const head = row.base.split(',')[0];
    const names = [head.replace(/\(.*?\)/g, '').trim()];
    const alt = /\((.*?)\)/.exec(head); if (alt) names.push(alt[1].trim());
    bases[r] = names.map(X.plain);
    for (const n of names) add(n, r);
    for (const c of row.compuestos) add(c, r);
  });
  prevIndex = { rows, map, bases };
  return prevIndex;
}
function preverbRows(lem) {
  const P = preverbIndex();
  const key = X.plain(X.headOf(lem)).replace(/\d+$/, '');
  let rows = P.map.get(key);
  if (!rows) return [];
  rows = Array.from(rows);
  if (rows.length > 1) {
    const hint = /\(\s*\w+\s*\+\s*(\w+)\s*\)/.exec(lem.indMorph || '');
    if (hint) { const h = X.plain(hint[1]); const f = rows.filter((r) => P.bases[r].includes(h)); if (f.length) rows = f; }
  }
  return rows;
}

/* ---------- análisis del texto ---------- */
const WORD = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+/gu;
function analyze({ text, noModel }) {
  const c = L();
  const tokens = [];
  // fragmentos omitidos [...] no se analizan
  const masked = String(text || '').replace(/\[[^\]]*\]/g, (m) => ' '.repeat(m.length));
  let sent = 0, last = 0;
  let m;
  WORD.lastIndex = 0;
  while ((m = WORD.exec(masked))) {
    const between = masked.slice(last, m.index);
    const brk = /[.;:?!]/.test(between) && tokens.length;
    if (brk) sent++;
    tokens.push({ i: tokens.length, w: m[0], s: m.index, e: m.index + m[0].length, sent, pb: !tokens.length || brk ? '.' : /,/.test(between) ? ',' : '' });
    last = m.index + m[0].length;
  }
  // análisis por frase, con el etiquetador contextual de Collatinus
  const bySent = new Map();
  for (const t of tokens) { let a = bySent.get(t.sent); if (!a) bySent.set(t.sent, a = []); a.push(t); }
  for (const list of bySent.values()) {
    const words = list.map((t) => t.w);
    list.forEach((t, k) => {
      const an = c.analyse(t.w);
      t.cands = an.map((a) => {
        const lem = byUid.get(a.lid);
        const morphos = a.formes.map((f) => f.morpho);
        return { lid: a.lid, lemma: a.lemme, im: a.indMorph || '', trad: X.shortGloss(a.trad).trad, pos: lem ? lem.pos : '', cats: Array.from(new Set(a.formes.map((f) => X.catOf(lem ? lem.pos : '', f.morpho)))), morphos, proper: /^[A-ZĀĂĒĔĪĬŌŎŪŬ]/.test(a.lemme) || /n\. pr\./.test(a.indMorph || '') };
      });
      let sel = null;
      try {
        const ctx = c.contexte(words, k);
        if (ctx && ctx.lid) {
          const cd = t.cands.find((x) => x.lid === ctx.lid);
          if (cd) sel = { lid: ctx.lid, morpho: c.morphos[ctx.morpho - 1] || '' };
        }
      } catch (e) { /* sin contexto */ }
      if (!sel && t.cands.length) sel = { lid: t.cands[0].lid, morpho: t.cands[0].morphos[0] || '' };
      // plural: preferir el lema que solo tiene plural (Sabini, -orum) si lo hay
      if (sel && /plural/.test(sel.morpho)) {
        const pl = t.cands.find((x) => x.lid !== sel.lid && /^(orum|arum|ium|um)\b/.test(x.im));
        const cur = t.cands.find((x) => x.lid === sel.lid);
        if (pl && cur && pl.cats.some((k) => cur.cats.includes(k))) sel = { lid: pl.lid, morpho: pl.morphos.find((mm) => /plural/.test(mm)) || pl.morphos[0] };
      }
      t.sel = sel;
      if (sel) {
        const cd = t.cands.find((x) => x.lid === sel.lid);
        const lem = byUid.get(sel.lid);
        t.cat = X.catOf(lem ? lem.pos : '', sel.morpho);
        t.lemma = cd ? cd.lemma : '';
        t.proper = cd ? cd.proper : false;
        t.amb = new Set(t.cands.flatMap((x) => x.cats)).size > 1;
        t.sum = lem ? X.plain(X.headOf(lem)) === 'sum' : false;
        t.rows = lem && t.cat === 'v' ? preverbRows(lem) : [];
        t.lplain = lem ? X.plain(X.headOf(lem)).replace(/\d+$/, '') : '';
      }
    });
  }
  // homógrafos: modelo entrenado con textos clásicos anotados (quod, quam, quo, eo, una, modo…)
  if (!noModel) {
    if (!homModel) { try { homModel = JSON.parse(fs.readFileSync(path.join(DATA, 'latin', 'homografos.json'), 'utf8')); } catch (e) { homModel = { forms: {}, rates: {} }; } }
    const changes = [];
    tokens.forEach((t, k) => { if (t.sel && t.cands && t.cands.length > 1) { const c2 = Dis.choose(homModel, tokens, k); if (c2) changes.push([t, c2]); } });
    for (const [t, c2] of changes) {
      // la forma de ese lema que mejor encaja: la misma categoría que el análisis original, si la hay
      const mo = c2.morphos[0] || '';
      t.sel = { lid: c2.lid, morpho: mo };
      const lem = byUid.get(c2.lid);
      t.lemma = c2.lemma; t.proper = c2.proper;
      t.cat = X.catOf(lem ? lem.pos : '', mo);
      t.sum = lem ? X.plain(X.headOf(lem)) === 'sum' : false;
      t.rows = lem && t.cat === 'v' ? preverbRows(lem) : [];
      t.lplain = lem ? X.plain(X.headOf(lem)).replace(/\d+$/, '') : '';
    }
  }
  // «modo» tras un determinante en ablativo (hoc modo, eodem modo, quodam modo…) es el sustantivo
  const MODO = /^(hoc|eo|illo|isto|quo|quodam|nullo|alio|eodem|tali|simili|miro|mirum|omni|quoquo|aliquo|uno|nostro|suo|meo|tuo|vestro|uestro|certo|magno|novo|nouo|eiusmodi|huiusmodi|eius|quovis|quouis)$/i;
  for (const t of tokens) {
    if (!t.sel || !/^modo$/i.test(t.w)) continue;
    const p1 = tokens[t.i - 1], n1 = tokens[t.i + 1];
    const det = (p1 && p1.sent === t.sent && MODO.test(p1.w)) || (n1 && n1.sent === t.sent && /^(quodam|eodem|hoc|illo|aliquo|nullo)$/i.test(n1.w));
    const noun = t.cands.find((c) => /^modus/.test(Dis.lemKey(c.lemma)));
    if (det && noun && t.sel.lid !== noun.lid) { t.sel = { lid: noun.lid, morpho: noun.morphos.find((m) => /ablativo/.test(m)) || noun.morphos[0] }; t.lemma = noun.lemma; t.cat = 'n'; t.rows = []; t.lplain = 'modus'; }
  }
  // «quod» conjunción en giros fijos: propterea quod, eo quod, nisi quod, quod si; tras verbos de sentimiento o juicio
  const QCONJ = new Set(['gaudeo', 'doleo', 'laetor', 'miror', 'queror', 'accuso', 'laudo', 'reprehendo', 'glorior', 'indignor', 'angor', 'gratulor', 'incuso', 'culpo', 'irascor', 'suscenseo', 'ago']);
  for (const t of tokens) {
    if (!t.sel || !/^quod$/i.test(t.w)) continue;
    const p1 = tokens[t.i - 1], n1 = tokens[t.i + 1];
    const sp = (u) => u && u.sent === t.sent;
    let conj = (sp(p1) && /^(propterea|idcirco|ideo|nisi|praeterquam|eo|hoc|quam)$/i.test(p1.w) && !/^(hoc)$/i.test(p1.w)) || (sp(n1) && /^si$/i.test(n1.w));
    if (!conj) for (let d = 1; d <= 3; d++) { const u = tokens[t.i - d]; if (!sp(u)) break; if (u.cat === 'v' && QCONJ.has(u.lplain)) { conj = true; break; } }
    const cq = t.cands.find((c) => c.pos === 'c' || /^quod/.test(Dis.lemKey(c.lemma)) && !/p/.test(c.pos));
    if (conj && cq && t.sel.lid !== cq.lid) { t.sel = { lid: cq.lid, morpho: cq.morphos[0] || '' }; t.lemma = cq.lemma; t.cat = X.catOf(cq.pos, ''); t.rows = []; t.lplain = 'quod'; }
  }
  // «cum»: el etiquetador de Collatinus casi siempre elige la conjunción. Se corrige mirando
  // la palabra siguiente: si puede ser ablativo (y no nominativo), es la preposición.
  const casesOf = (u) => new Set((u.cands || []).flatMap((c) => c.morphos.map((m) => (/^(nominativo|vocativo|acusativo|genitivo|dativo|ablativo)/.exec(m.replace(/^participio[^:]*:\s*/, '')) || [])[1]).filter(Boolean)));
  const subjAhead = (k) => { for (let j = k + 1; j < tokens.length && tokens[j].sent === tokens[k].sent; j++) { if (tokens[j].cands.some((c) => c.morphos.some((m) => /subjuntivo/.test(m)))) return true; } return false; };
  for (const t of tokens) {
    if (!t.sel || !/^(cum|quom)$/i.test(t.w)) continue;
    const prep = t.cands.find((c) => /r/.test(c.pos)), conj = t.cands.find((c) => c.pos === 'c');
    if (!prep || !conj) continue;
    const nx = tokens[t.i + 1];
    let isPrep = false;
    if (nx && nx.sent === t.sent) {
      const cs = casesOf(nx);
      if (cs.has('ablativo') && !cs.has('nominativo')) isPrep = true;
      else if (cs.has('ablativo')) {
        // ambigua (ea, magna…): buscar un ablativo claro en las dos palabras siguientes
        isPrep = !subjAhead(t.i);
        for (const d of [2, 3]) { const u = tokens[t.i + d]; if (!u || u.sent !== t.sent) break; const c2 = casesOf(u); if (c2.size === 1 && c2.has('ablativo')) { isPrep = true; break; } }
      }
    }
    const want = isPrep ? prep : conj;
    if (t.sel.lid !== want.lid) {
      t.sel = { lid: want.lid, morpho: want.morphos[0] || '' };
      t.lemma = want.lemma; t.cat = X.catOf(want.pos, t.sel.morpho);
    }
  }
  // formas verbales compuestas: participio (o gerundivo) + forma de sum
  for (const t of tokens) {
    if (!t.sel || t.group) continue;
    if (!/participio de (perfecto pasivo|futuro activo)|gerundivo|adjetivo verbal/.test(t.sel.morpho) || !/nominativo|acusativo/.test(t.sel.morpho)) continue;
    let best = null;
    for (const d of [1, -1, 2, -2]) {
      const u = tokens[t.i + d];
      if (u && u.sent === t.sent && u.sum && !u.group) { best = u; break; }
    }
    if (best) { const g = [t.i, best.i].sort((a, b) => a - b); t.group = g; best.group = g; best.aux = true; }
  }
  return tokens;
}

// Cambiar el lema elegido para una palabra
function tokenInfo({ lid, morpho }) {
  const lem = byUid.get(lid);
  if (!lem) return null;
  return { cat: X.catOf(lem.pos, morpho), rows: preverbRows(lem), sum: X.plain(X.headOf(lem)) === 'sum', lplain: X.plain(X.headOf(lem)).replace(/\d+$/, '') };
}

/* ---------- vocabulario ---------- */
function vocabEntries({ lids, mode }) {
  L();
  const out = [];
  for (const lid of lids) {
    const lem = byUid.get(lid);
    if (!lem) continue;
    const g = X.shortGloss(L().traduction(lem).text || lem.trad || '');
    out.push({ lid, head: X.enunciado(lem, mode || 'modelo'), trad: g.trad, note: g.note, sort: X.plain(X.headOf(lem)), proper: /^[A-ZĀĂĒĔĪĬŌŎŪŬȲЎ]/.test(X.headOf(lem)) });
  }
  return out;
}
// Para el vocabulario escrito a mano: análisis de una palabra suelta
function lookup({ word }) {
  const c = L();
  return c.analyse(word).map((a) => ({ lid: a.lid, lemma: a.lemme, trad: X.shortGloss(a.trad).trad }));
}

/* ---------- biblioteca (Perseus latín) ---------- */
let bib = null;
function biblio() {
  if (!bib) {
    const b = JSON.parse(fs.readFileSync(path.join(DATA, 'biblioteca.json'), 'utf8'));
    bib = { raw: b.raw, items: b.obras.map((o, i) => ({ i, urn: o[0], path: o[1], author: o[2], title: o[3], genre: o[4], latin: o[5], desc: o[6] })), inc: new Map() };
    // textos incluidos con el programa (obras que no están en Perseus)
    const D = path.join(DATA, 'incluidos');
    for (const f of fs.existsSync(D) ? fs.readdirSync(D).filter((x) => x.endsWith('.json')) : []) {
      const j = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
      bib.inc.set(j.urn, path.join(D, f));
      const existing = bib.items.find((it) => it.urn === j.urn);
      const item = { i: existing ? existing.i : bib.items.length, urn: j.urn, author: j.author, title: j.title, genre: j.genre, latin: j.latin, desc: j.desc, builtin: true };
      if (existing) Object.assign(existing, item); else bib.items.push(item);
    }
  }
  return bib;
}
const fileOf = (urn) => path.join(TEXTS, urn.replace(/[^\w.-]/g, '_') + '.json');
function catalog() {
  const b = biblio();
  return b.items.map((it) => Object.assign({ have: it.builtin || fs.existsSync(fileOf(it.urn)) }, it));
}
let job = null;
async function fetchText(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 180000);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
async function runDownload(list) {
  const b = biblio(); const errors = []; let done = 0;
  const queue = list.slice();
  const worker = async () => {
    while (queue.length && !job.cancel) {
      const it = queue.shift();
      try {
        const xml = await fetchText(b.raw + it.path);
        const conv = convertTei(xml, { lang: 'l', author: it.author, title: it.latin });
        if (!conv.lines.length) throw new Error('sin texto reconocible');
        fs.mkdirSync(TEXTS, { recursive: true });
        fs.writeFileSync(fileOf(it.urn), JSON.stringify({ urn: it.urn, author: it.author, title: it.title, latin: it.latin, levels: conv.levels, lines: conv.lines }));
      } catch (err) { errors.push({ author: it.author, title: it.title, error: String(err && err.message || err) }); }
      done++;
      event('dl-progress', { done, total: list.length, current: it.author + ', ' + it.title });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const canceled = job.cancel; job = null;
  event('dl-done', { done, total: list.length, errors, canceled });
}
function work({ urn }) {
  const inc = biblio().inc.get(urn);
  const j = JSON.parse(fs.readFileSync(inc || fileOf(urn), 'utf8'));
  return j;
}

const api = {
  status() { return { dataRoot }; },
  warm() { L(); preverbIndex(); return true; },
  analyze, tokenInfo, vocabEntries, lookup,
  lists() { const o = {}; for (const n of LIST_NAMES) o[n] = readList(n); return o; },
  saveList({ name, data }) {
    if (!LIST_NAMES.includes(name)) throw new Error('lista desconocida');
    fs.mkdirSync(LISTS, { recursive: true });
    fs.writeFileSync(path.join(LISTS, name + '.json'), JSON.stringify(data, null, 1));
    if (name === 'preverbios') prevIndex = null;
    return true;
  },
  resetList({ name }) { try { fs.unlinkSync(path.join(LISTS, name + '.json')); } catch (e) { /* */ } if (name === 'preverbios') prevIndex = null; return readList(name); },
  catalog,
  download({ ids }) {
    if (job) return { busy: true };
    const b = biblio(); const list = (ids || []).map((i) => b.items[i]).filter((x) => x && !x.builtin);
    if (!list.length) return { started: false };
    job = { cancel: false };
    runDownload(list).catch((e) => { job = null; event('dl-done', { error: String(e && e.message || e) }); });
    return { started: true, total: list.length };
  },
  cancelDownload() { if (job) job.cancel = true; return true; },
  deleteTexts({ ids }) { const b = biblio(); for (const i of ids || []) { const it = b.items[i]; if (it && !it.builtin) try { fs.unlinkSync(fileOf(it.urn)); } catch (e) { /* */ } } return true; },
  work
};

parentPort.on('message', async (m) => {
  if (m.type !== 'call') return;
  try {
    const f = api[m.method];
    if (!f) throw new Error('Método desconocido: ' + m.method);
    const result = await f(m.args || {});
    parentPort.postMessage({ type: 'reply', id: m.id, result });
  } catch (e) {
    parentPort.postMessage({ type: 'reply', id: m.id, error: String(e && e.message || e) });
  }
});
// precargar el léxico
setTimeout(() => { try { api.warm(); event('ready', true); } catch (e) { event('fatal', String(e && e.stack || e)); } }, 10);

};
defs["engine/lat.js"] = function (module, exports, require) {
/*
 * lat.js — Análisis latino para Examinator: lematización en contexto, flexión (enunciados),
 * cantidades vocálicas, glosas breves y categorías gramaticales.
 * Usa la adaptación a JavaScript de Collatinus (© Y. Ouvrard y Ph. Verkerk, GPL v3).
 * Licencia GNU GPL v3.
 */

const fs = require('fs');
const path = require('path');
const { LemCore, atone, deramise } = require('./vendor/latin.js');

let core = null;
let irrByLem = null;
function lat(dataDir) {
  if (core) return core;
  const D = path.join(dataDir, 'latin');
  const rd = (f) => fs.readFileSync(path.join(D, f), 'utf8');
  core = new LemCore();
  core.load(rd('modeles.txt'), rd('lexique.txt'), JSON.parse(rd('extra.json')), rd('regimen.txt'));
  core.loadTags(rd('tags.txt'));
  irrByLem = new Map();
  for (const lst of core.irregs.values()) for (const irr of lst) {
    let m = irrByLem.get(irr.lemme); if (!m) irrByLem.set(irr.lemme, m = new Map());
    for (const mo of irr.morphos) { const a = m.get(mo) || []; a.push(irr); m.set(mo, a); }
  }
  return core;
}

const plain = (s) => atone(deramise(String(s || ''))).toLowerCase().replace(/[^a-z]/g, '');

/* ---------- flexión ---------- */
function formsOf(L, morpho) {
  const out = [];
  const irr = irrByLem.get(L) && irrByLem.get(L).get(morpho);
  if (irr) for (const i of irr) out.push(i.grq);
  if (irr && irr.some((i) => i.excl)) return out;
  if (L.irrExcl.has(morpho)) return out;
  const m = L.modele; if (!m) return out;
  for (const d of m.desinences(morpho)) {
    const rads = L.radicaux.get(d.numRad) || [];
    for (const r of rads) out.push(r.grq + d.grq);
  }
  return Array.from(new Set(out));
}
function form1(L, morpho) {
  const f = formsOf(L, morpho);
  return f.length ? f[0] : '';
}
function isIrreg(L, morpho) { return !!(irrByLem.get(L) && irrByLem.get(L).get(morpho)); }

/* ---------- cantidades ---------- */
const VOW = 'aeiouyāăēĕīĭōŏūŭȳўAEIOUYĀĂĒĔĪĬŌŎŪŬȲЎ';
const isVowelCh = (c) => VOW.includes(c);
const MUTA_LIQ = /^[pbtdcgkf][lr]/;
// Señala, para cada vocal de la palabra, si está en sílaba abierta (true) o trabada (false)
function syllableInfo(word) {
  const s = word.normalize('NFC');
  const chars = Array.from(s);
  const info = [];
  const base = chars.map((c) => atone(c).toLowerCase());
  for (let i = 0; i < chars.length; i++) {
    if (!isVowelCh(chars[i])) continue;
    // u de qu / gu+vocal: no es vocal
    if (base[i] === 'u' && i > 0 && (base[i - 1] === 'q' || (base[i - 1] === 'g' && i + 1 < chars.length && isVowelCh(chars[i + 1]) && i > 1 && base[i - 2] === 'n'))) continue;
    // diptongos ae, au, oe, eu: la segunda vocal no cuenta y el diptongo no se marca
    const nx = base[i + 1] || '';
    const pair = base[i] + nx;
    const isDiph = ['ae', 'au', 'oe'].includes(pair) && !(/[̈]/.test(chars[i + 1] || ''));
    let j = i + 1;
    if (isDiph) j = i + 2;
    // consonantes que siguen
    let cons = '';
    while (j < chars.length && !isVowelCh(chars[j])) { const b = base[j]; if (/[a-z]/.test(b)) cons += b; j++; }
    const end = j >= chars.length;
    let open;
    if (end) open = cons.length === 0;
    else if (cons.length === 0) open = true;
    else if (cons.length === 1) open = !/[xz]/.test(cons);
    else if (cons.length === 2) open = MUTA_LIQ.test(cons) || cons === 'qu' || cons === 'gu' || cons === 'ch' || cons === 'ph' || cons === 'th';
    else open = false;
    if (cons.startsWith('h') && cons.length <= 2 && !end) open = cons.length === 1 || MUTA_LIQ.test(cons.slice(1)) || cons.length === 2 && open;
    info.push({ i, diph: isDiph, open });
    if (isDiph) i++;
  }
  return info;
}
const BREVE = { 'ă': 'a', 'ĕ': 'e', 'ĭ': 'i', 'ŏ': 'o', 'ŭ': 'u', 'ў': 'y', 'Ă': 'A', 'Ĕ': 'E', 'Ĭ': 'I', 'Ŏ': 'O', 'Ŭ': 'U', 'Ў': 'Y' };
// mode: 'modelo' (solo vocales de sílaba abierta, sin diptongos), 'todas', 'largas', 'ninguna'
function qty(word, mode) {
  if (!word) return word;
  word = word.normalize('NFC');
  if (mode === 'todas') return word;
  if (mode === 'ninguna') return atone(word).replace(/[̆̄]/g, '');
  const chars = Array.from(word);
  const keep = new Set();
  if (mode === 'modelo') { for (const x of syllableInfo(word)) if (x.open && !x.diph) keep.add(x.i); }
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    let c = chars[i];
    const next = chars[i + 1];
    if (mode === 'largas') {
      if (BREVE[c]) c = BREVE[c];
      if (c === '̆') continue;
      out += c; continue;
    }
    if (isVowelCh(c) && !keep.has(i)) { c = atone(c); if (next === '̆') i++; }
    out += c;
  }
  return out;
}

/* ---------- glosas ---------- */
function shortGloss(trad) {
  let t = String(trad || '').trim();
  if (!t) return { trad: '', note: '' };
  t = t.replace(/^\+\s*(Ac|Abl|Gen|Dat)\.?\s*:\s*/i, '');
  t = t.replace(/^prep\.?\s*\+\s*\w+\.?\s*:\s*/i, '');
  t = t.replace(/^(I\.|1\.|1\s*-)\s*/, '');
  // «conj.: cuando», «Preposición + abl. = con»
  t = t.replace(/^(conj(?:unción)?|prep(?:osición)?|adv(?:erbio)?)\.?\s*(?:\+\s*\w+\.?)?\s*[:=]\s*/i, '');
  t = t.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ');
  // primera acepción: se corta en la numeración, en los usos (« - ») y en el punto
  t = t.split(/\s(?:I{1,3}V?|V)\.\s|\s\d+\.\s|\s\d+\s-\s|\s-\s|\.\s+(?:adv|conj|prep|adj|interj|subst|pl|n|m|f)\.\s/)[0];
  // los paréntesis pasan a la aclaración (solo el primero)
  let note = '';
  t = t.replace(/\s*\(([^)]*)\)/g, (m, x) => { if (!note) note = x.trim(); return ''; });
  t = t.split(/;|\.\s/)[0].trim();
  let parts = t.split(/\s*,\s*/).filter(Boolean);
  if (parts.length > 3) parts = parts.slice(0, 3);
  while (parts.length > 1 && parts.join(', ').length > 50) parts.pop();
  t = parts.join(', ').replace(/[.,;:\s]+$/, '');
  return { trad: t, note };
}

/* ---------- categorías ---------- */
// Categoría de una forma analizada: 'n', 'a', 'p', 'v', u otra
function catOf(pos, morpho) {
  pos = pos || '';
  if (/participio|gerundio|gerundivo|supino|adjetivo verbal/.test(morpho || '')) return 'v';
  if (pos.includes('v')) return 'v';
  if (pos.includes('p')) return 'p';
  if (pos.includes('a')) return 'a';
  if (pos.includes('n')) return 'n';
  return pos[0] || 'i';
}

/* ---------- enunciado ---------- */
function headOf(L) { return String(L.grq || '').split(',')[0].trim(); }
function commonPrefix(a, b) {
  const A = Array.from(a.normalize('NFC')), B = Array.from(b.normalize('NFC'));
  const pa = A.map((c) => atone(c).toLowerCase()), pb = B.map((c) => atone(c).toLowerCase());
  let k = 0; while (k < pa.length && k < pb.length && pa[k] === pb[k] && pa[k] !== '̆') k++;
  return k;
}
// Devuelve las partes del enunciado: [{ t: forma con cantidades, dash: bool }]
function enunciadoParts(L) {
  const lem = headOf(L);
  const pos = L.pos || '';
  const im = L.indMorph || '';
  const parts = [{ t: lem, dash: false }];
  const lemA = Array.from(lem.normalize('NFC')).filter((c) => c !== '̆' && c !== '̄');
  const isV = (c) => /[aeiouy]/.test(atone(c || '').toLowerCase());
  const rel = (f) => {
    if (!f) return null;
    f = f.split(',')[0];
    let k = commonPrefix(lem, f);
    const fa = Array.from(f.normalize('NFC')).filter((c) => c !== '̆' && c !== '̄');
    let lemRest = lemA.slice(k), fRest = fa.slice(k);
    const prevV = k > 0 && isV(lemA[k - 1]);
    if (fRest.length && isV(fRest[0])) {
      if (prevV && !lemRest.some(isV) && k > 1) k--;
    } else if (prevV && fRest.length && (fRest.length <= 2 || (!lemRest.length && fRest.length <= 3)) && k > 1) k--;
    lemRest = lemA.slice(k); fRest = fa.slice(k);
    if (!lemRest.length && !fRest.length) { // misma grafía (manus, manūs): desde la última vocal
      let j = lemA.length - 1; while (j > 0 && !isV(lemA[j])) j--;
      if (j > 0) return { t: f, dash: true, cut: j };
    }
    if (k > 1 && lemRest.length <= 2 && fRest.length && isV(fRest[0])) return { t: f, dash: true, cut: k };
    return { t: f, dash: false };
  };
  const vowel = pos.includes('v') && L.modele;
  if (pos === 'v' || (pos.includes('v') && !pos.includes('n'))) {
    const first = form1(L, 121);
    if (/r$/.test(plain(first || lem))) { // deponente
      for (const m of [122, 187]) { const r = rel(form1(L, m)); if (r) parts.push(r); }
      const sup = form1(L, 265);
      if (sup) parts.push({ t: sup.replace(/[uŭ]m$/, 'us') + ' sum', dash: false });
    } else {
      for (const m of [122, 187, 139, 265]) { const r = rel(form1(L, m)); if (r) { if (isIrreg(L, m) || /sum$/.test(plain(lem))) r.dash = false; if (m === 139 && r.dash && Array.from(r.t).length - r.cut < 2) r.dash = false; parts.push(r); } }
    }
    if (parts.length === 1 && im) return { parts, raw: im };
    return { parts };
  }
  if (pos.startsWith('a') && pos !== 'ap') {
    const nC = (im.replace(/\(.*?\)/g, '').split(',').length);
    const f = form1(L, 25), n = form1(L, 37), g = form1(L, 16);
    if (nC >= 2) { parts.push(rel(f)); parts.push(rel(n)); }
    else if (/^\s*e\s*$/.test(im)) parts.push(rel(n));
    else if (g) parts.push(rel(g));
    return { parts: parts.filter(Boolean) };
  }
  if (pos === 'n' || (pos.includes('n') && !pos.includes('v'))) {
    let g = form1(L, 4);
    if (!g) g = form1(L, 10);
    if (g) parts.push(rel(g));
    return { parts };
  }
  // pronombres e invariables: enunciado de Collatinus
  return { parts, raw: im };
}
function enunciado(L, mode) {
  const e = enunciadoParts(L);
  const out = [];
  for (const p of e.parts) {
    if (!p) continue;
    const q = qty(p.t, mode);
    if (p.dash) {
      const k = p.cut;
      const qa = Array.from(q.normalize('NFC'));
      // localizar el corte en la forma con cantidades: contar letras base
      let letters = 0, idx = 0;
      while (idx < qa.length && letters < k) { if (qa[idx] !== '̆' && qa[idx] !== '̄') letters++; idx++; }
      while (qa[idx] === '̆' || qa[idx] === '̄') idx++;
      out.push('–' + qa.slice(idx).join(''));
    } else out.push(q);
  }
  let s = out.join(', ');
  if (e.raw) {
    const raw = e.raw.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*cf\..*$/, '').trim();
    if (raw && !/^(adv|conj|interj|inv)\.?/.test(raw) && !/prep/.test(raw)) s += ', ' + raw.replace(/,?\s*(adj\.\s*)?(y\s*)?pron\.?.*$/, '').replace(/,\s*$/, '');
    if (/prep\.?\s*\+\s*acc/.test(raw) && /abl/.test(raw)) s += ' + ac./abl.';
    else if (/prep\.?\s*\+\s*acc/.test(raw)) s += ' + ac.';
    else if (/prep\.?\s*\+\s*abl/.test(raw)) s += ' + abl.';
    else if (/prep\.?\s*\+\s*gen/.test(raw)) s += ' + gen.';
  }
  return s.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
}

module.exports = { lat, formsOf, form1, qty, syllableInfo, shortGloss, catOf, enunciado, headOf, plain, atone, deramise };

};
defs["engine/disamb.js"] = function (module, exports, require) {
/*
 * disamb.js — Desambiguación de homógrafos latinos (quod, quam, cum, eo, una, modo…).
 * Modelo bayesiano por forma, entrenado con treebanks latinos anotados (UD PROIEL y Perseus,
 * textos clásicos), que corrige la elección del etiquetador de Collatinus cuando
 * en esos datos se ha mostrado más fiable.
 * Licencia GNU GPL v3.
 */

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/v/g, 'u').replace(/j/g, 'i').replace(/[^a-z]/g, '');
const lemKey = (lemma) => norm(String(lemma || '').split(',')[0]).replace(/\d+$/, '');
const CASES = /^(nominativo|vocativo|acusativo|genitivo|dativo|ablativo)/;
function casesOf(t) {
  const out = new Set();
  for (const c of t.cands || []) for (const m of c.morphos) { const x = CASES.exec(m.replace(/^participio[^:]*:\s*/, '')); if (x) out.add(x[1]); }
  return out;
}
function moodsOf(t) {
  const out = new Set();
  for (const c of t.cands || []) for (const m of c.morphos) {
    if (/subjuntivo/.test(m)) out.add('subj'); else if (/indicativo/.test(m)) out.add('ind'); else if (/infinitivo/.test(m)) out.add('inf');
    else if (/participio/.test(m)) out.add('part'); else if (/imperativo/.test(m)) out.add('imp');
  }
  return out;
}
function gendOf(t) {
  const out = new Set();
  for (const c of t.cands || []) for (const m of c.morphos) { const x = /(masculino|femenino|neutro)/.exec(m); if (x) out.add(x[1]); }
  return out;
}
const catsOf = (t) => new Set((t.cands || []).flatMap((c) => c.cats || []));

function features(tokens, i) {
  const t = tokens[i];
  const f = [];
  const same = (j) => tokens[j] && tokens[j].sent === t.sent ? tokens[j] : null;
  const p1 = same(i - 1), p2 = same(i - 2), n1 = same(i + 1), n2 = same(i + 2);
  f.push('p1:' + (p1 ? norm(p1.w) : '#'), 'n1:' + (n1 ? norm(n1.w) : '#'), 'p2:' + (p2 ? norm(p2.w) : '#'), 'n2:' + (n2 ? norm(n2.w) : '#'));
  f.push('pb:' + (t.pb || '-'));
  if (n1) f.push('na:' + (n1.pb || '-'));
  if (/^[A-Z]/.test(t.w) && t.pb !== '.') f.push('cap');
  for (const [pre, u] of [['p', p1], ['n', n1], ['q', p2], ['m', n2]]) {
    if (!u) { f.push(pre + 'x'); continue; }
    for (const c of casesOf(u)) f.push(pre + 'c:' + c);
    for (const c of catsOf(u)) f.push(pre + 'k:' + c);
    for (const c of moodsOf(u)) f.push(pre + 'm:' + c);
    if (pre === 'p') for (const g of gendOf(u)) f.push('pg:' + g);
    if (!u.cands || !u.cands.length) f.push(pre + 'unk');
  }
  // ventana anterior: antecedente posible (género), comparativos, tam/eo/propterea
  const CMP = new Set(['magis', 'potius', 'prius', 'citius', 'malo', 'mallem', 'aliter', 'secus', 'plus', 'minus', 'amplius', 'ante', 'post', 'tam', 'tanto', 'quanto', 'eo', 'propterea', 'idcirco', 'ideo', 'praeterquam']);
  for (let d = 1; d <= 4; d++) {
    const u = same(i - d); if (!u) break;
    const nw = norm(u.w);
    if (CMP.has(nw)) f.push('kw:' + nw);
    for (const c of u.cands || []) for (const m of c.morphos) {
      if (/comparativo/.test(m)) f.push('cmpP');
      const g = /(nominativo|acusativo|ablativo|dativo|genitivo)? ?(masculino|femenino|neutro)? ?(singular|plural)/.exec(m);
      if (g && (c.cats || []).some((k) => k === 'n' || k === 'p' || k === 'a')) { if (g[2] && g[3]) f.push('ant:' + g[2][0] + g[3][0]); }
    }
  }
  if (n1) for (const c of n1.cands || []) for (const m of c.morphos) if (/superlativo/.test(m)) { f.push('nsup'); break; }
  // verbos en el resto de la frase
  let subj = false, ind = false;
  for (let j = i + 1; j < tokens.length && tokens[j].sent === t.sent && j < i + 12; j++) { const ms = moodsOf(tokens[j]); if (ms.has('subj')) subj = true; if (ms.has('ind')) ind = true; }
  if (subj) f.push('subjA'); if (ind) f.push('indA');
  return Array.from(new Set(f));
}

// Modelo: { forms: { forma: { labels, w: { rasgo: { lema: peso } } } }, rates: { lema: [n, tasa] } }
function choose(model, tokens, i) {
  const t = tokens[i];
  const avail = new Map();
  for (const c of t.cands) { const k = lemKey(c.lemma); if (!avail.has(k)) avail.set(k, []); avail.get(k).push(c); }
  if (avail.size < 2) return null;
  const cur = t.cands.find((c) => c.lid === t.sel.lid);
  const curKey = cur ? lemKey(cur.lemma) : '';
  let key = null;
  const m = model.forms[norm(t.w)];
  if (m) {
    const fs = features(tokens, i).concat(['bias']);
    let bv = -Infinity;
    for (const lab of m.labels) {
      if (!avail.has(lab)) continue;
      let v = 0; for (const f of fs) v += (m.w[f] && m.w[f][lab]) || 0;
      if (v > bv) { bv = v; key = lab; }
    }
  } else {
    // lemas que en los textos anotados casi nunca son los correctos (Manes por manus, totum por totus…)
    const r0 = model.rates[curKey];
    if (r0 && r0[0] >= 8 && r0[1] < 0.2) {
      let bv = 0.5;
      for (const k of avail.keys()) { const r = model.rates[k]; if (r && r[0] >= 5 && r[1] > bv) { bv = r[1]; key = k; } }
    }
  }
  if (!key || key === curKey) return null;
  // entre los lemas con ese nombre (servus adjetivo y sustantivo…), el de la misma categoría que el análisis original
  const cats = new Set(cur ? cur.cats : []);
  const opts = avail.get(key).slice().sort((a, b) => (b.cats.some((k) => cats.has(k)) ? 1 : 0) - (a.cats.some((k) => cats.has(k)) ? 1 : 0));
  return opts[0];
}
module.exports = { norm, lemKey, features, choose, casesOf };

};
defs["engine/vendor/latin.js"] = function (module, exports, require) {
/*
 * latin.js — Lematizador latino para el navegador.
 * Adaptación a JavaScript del núcleo de COLLATINUS 11
 * (© Yves Ouvrard y Philippe Verkerk, licencia GNU GPL v3).
 * Datos léxicos y modelos de flexión: proyecto Collatinus / Biblissima.
 */
(function (global) {
  'use strict';

  // ---------- Utilidades de grafía (port de Ch::) ----------
  const ATONE = {
    'ā': 'a', 'ă': 'a', 'ē': 'e', 'ĕ': 'e', 'ī': 'i', 'ĭ': 'i',
    'ō': 'o', 'ŏ': 'o', 'ū': 'u', 'ŭ': 'u', 'ȳ': 'y', 'ў': 'y',
    'Ā': 'A', 'Ă': 'A', 'Ē': 'E', 'Ĕ': 'E', 'Ī': 'I', 'Ĭ': 'I',
    'Ō': 'O', 'Ŏ': 'O', 'Ū': 'U', 'Ŭ': 'U', 'Ȳ': 'Y', 'Ў': 'Y',
    'ı': 'i', 'ụ': 'u', '̆': ''
  };
  const reAtone = /[āăēĕīĭōŏūŭȳўĀĂĒĔĪĬŌŎŪŬȲЎıụ̆]/g;
  function atone(a) { return a.replace(reAtone, c => ATONE[c]); }

  function deramise(r) {
    return r.replace(/J/g, 'I').replace(/j/g, 'i').replace(/v/g, 'u')
      .replace(/æ/g, 'ae').replace(/Æ/g, 'Ae').replace(/œ/g, 'oe').replace(/Œ/g, 'Oe')
      .replace(/ụ/g, 'u').replace(/V/g, 'U');
  }

  function isUpper(ch) { return ch !== ch.toLowerCase() && ch === ch.toUpperCase(); }
  function isLower(ch) { return ch !== ch.toUpperCase() && ch === ch.toLowerCase(); }
  function count(s, sub) {
    if (!sub) return 0;
    let n = 0, i = 0;
    while ((i = s.indexOf(sub, i)) !== -1) { n++; i += sub.length; }
    return n;
  }

  function communes(g) {
    const maj = g.length > 0 && isUpper(g[0]);
    g = g.toLowerCase();
    if (/[aeiouy]/.test(g)) {
      g = g.replace(/a/g, 'ā̆');
      g = g.replace(/([^āăō])e/g, '$1ē̆');
      g = g.replace(/^e/, 'ē̆');
      g = g.replace(/i/g, 'ī̆');
      g = g.replace(/o/g, 'ō̆');
      g = g.replace(/([^āēq])u/g, '$1ū̆');
      g = g.replace(/^u/, 'ū̆');
      g = g.replace(/^y/, 'ȳ̆');
      g = g.replace(/([^ā])y/g, '$1ȳ̆');
    }
    if (maj) g = g[0].toUpperCase() + g.slice(1);
    return g;
  }

  const CONS = 'bcdfgjklmnpqrstvxz';
  function allonge(f) {
    if (!f) return f;
    const t = f.length;
    if (CONS.includes(f[t - 1]) && !'āe āu ēu ōe'.includes(f.substr(t - 3, 2).toLowerCase())) {
      const pairs = [['[aă]', 'ā'], ['[eĕ]', 'ē'], ['[iĭ]', 'ī'], ['[oŏ]', 'ō'],
        ['[uŭ]', 'ū'], ['[yȳ]', 'ў'], ['[AĂ]', 'Ā'], ['[EĔ]', 'Ē'],
        ['[IĬ]', 'Ī'], ['[OŎ]', 'Ō'], ['[UŬ]', 'Ū'], ['[YȲ]', 'Ў']];
      for (const [cls, rep] of pairs) f = f.replace(new RegExp(cls + '([' + CONS + '])$'), rep + '$1');
    }
    return f;
  }

  function listeI(l) {
    const res = [];
    for (const v of l.split(',')) {
      if (v.includes('-')) {
        const [a, b] = v.split('-').map(x => parseInt(x, 10) || 0);
        for (let i = a; i <= b; i++) res.push(i);
      } else res.push(parseInt(v, 10) || 0);
    }
    return res;
  }

  function multiAdd(map, key, val) {
    const a = map.get(key);
    if (a) a.push(val); else map.set(key, [val]);
  }

  // ---------- Desinencia ----------
  class Desinence {
    constructor(d, morph, nr, modele) {
      let der = -1;
      if (d.length) { const c = d[d.length - 1]; if (c >= '0' && c <= '9') der = +c; }
      if (der > 0) { this.rarete = der; d = d.slice(0, -1); } else this.rarete = 10;
      if (d === '-') d = '';
      this.grq = d;
      this.gr = atone(d);
      this.morpho = morph;
      this.numRad = nr;
      this.modele = modele;
    }
  }

  // ---------- Modelo de flexión ----------
  const CLES = ['modele', 'pere', 'des', 'des+', 'R', 'abs', 'suf', 'sufd', 'abs+', 'pos'];
  class Modele {
    constructor(ll, core) {
      this.core = core;
      this.pere = null;
      this.pos = '';
      this.des = new Map();      // morpho -> [Desinence]
      this.gen = new Map();      // numRad -> chaîne de génération
      this.absents = [];
      this.suf = '';
      const msuff = new Map();   // suffixe -> [morphos]
      const re = /[:;]([\p{L}\p{N}\p{M}_]*)\+?(\$\w+)/u;
      for (let l of ll) {
        let m;
        while ((m = re.exec(l))) {
          const v = m[2];
          let val = core.variables.get(v) || '';
          const pre = m[1];
          if (pre) val = val.split(';').join(';' + pre);
          l = l.split(v).join(val);
        }
        const ec = l.trim().replace(/\s+/g, ' ').split(':');
        const p = CLES.indexOf(ec[0]);
        switch (p) {
          case 0: this.gr = ec[1]; break;
          case 1: this.pere = core.modeles.get(ec[1]) || null; break;
          case 2: case 3: {
            const li = listeI(ec[1]);
            const r = parseInt(ec[2], 10) || 0;
            const ld = (ec[3] || '').split(';');
            for (let i = 0; i < li.length; i++) {
              const ldd = (i < ld.length ? ld[i] : ld[ld.length - 1]).split(',');
              for (const g of ldd) this.addDes(new Desinence(g, li[i], r, this));
            }
            if (p === 3 && this.pere) {
              for (const i of li) for (const dp of this.pere.desinences(i)) this.addDes(this.clone(dp));
            }
            break;
          }
          case 4: this.gen.set(parseInt(ec[1], 10) || 0, ec[2]); break;
          case 8: this.absents.push(...listeI(ec[1])); break;
          case 5: this.absents = listeI(ec[1]); break;
          case 6: for (const mm of listeI(ec[1])) multiAdd(msuff, ec[2], mm); break;
          case 7:
            if (this.pere) {
              this.suf = ec[1];
              for (const d of this.pere.allDesinences()) {
                if (this.absents.includes(d.morpho)) continue;
                this.addDes(new Desinence(allonge(d.grq) + this.suf, d.morpho, d.numRad, this));
              }
            }
            break;
          case 9: this.pos = (ec[1] || '')[0] || ''; break;
          default: break;
        }
      }
      if (this.pere) {
        if (!this.pos) this.pos = this.pere.pos;
        for (const m of this.pere.morphos()) {
          if (this.des.has(m)) continue;
          for (const d of this.pere.desinences(m)) {
            if (this.absents.includes(d.morpho)) continue;
            this.addDes(this.clone(d));
          }
        }
        for (const d of this.allDesinences()) {
          if (!this.gen.has(d.numRad)) this.gen.set(d.numRad, this.pere.genRadical(d.numRad));
        }
        this.absents = this.pere.absents.slice();
      }
      const ldsuf = [];
      for (const [suff, morphs] of msuff) {
        for (const d of this.allDesinences()) {
          if (morphs.includes(d.morpho)) {
            let gq = d.grq; if (gq === '-') gq = '';
            ldsuf.push(new Desinence(gq + suff, d.morpho, d.numRad, this));
          }
        }
      }
      for (const d of ldsuf) this.addDes(d);
    }
    addDes(d) { multiAdd(this.des, d.morpho, d); this.core.ajDesinence(d); }
    clone(d) { return new Desinence(d.grq + this.suf, d.morpho, d.numRad, this); }
    desinences(m) { return this.des.get(m) || []; }
    allDesinences() { const r = []; for (const a of this.des.values()) r.push(...a); return r; }
    morphos() { return Array.from(this.des.keys()); }
    genRadical(r) { if (!this.gen.has(r)) this.gen.set(r, ''); return this.gen.get(r); }
    clesR() { return Array.from(this.gen.keys()).sort((a, b) => a - b); }
  }

  // ---------- Radical y lema ----------
  class Radical {
    constructor(g, n, lemme) {
      this.lemme = lemme;
      this.grq = communes(g);
      this.gr = atone(g);
      this.num = n;
    }
  }

  class Lemme {
    constructor(linea, origin, core) {
      const ec = linea.split('|');
      const lg = ec[0].split('=');
      this.cle = atone(deramise(lg[0]));
      let grd = lg[0];
      const last = grd[grd.length - 1];
      if (last >= '1' && last <= '9') grd = grd.slice(0, -1);
      this.grq = lg.length === 1 ? grd : lg[1];
      this.gr = atone(this.grq.split(',')[0]);
      this.modeleNom = ec[1];
      this.modele = core.modeles.get(ec[1]);
      this.origin = origin;
      this.radicaux = new Map();
      this.irrExcl = new Set();
      for (let i = 2; i < 4; i++) {
        if (ec[i]) for (const rad of ec[i].split(',')) multiAdd(this.radicaux, i - 1, new Radical(rad, i - 1, this));
      }
      this.indMorph = ec[4] || '';
      const c = /cf\.\s([\p{L}\p{N}_]+)$/u.exec(this.indMorph);
      this.renvoi = c ? c[1] : '';
      this.nbOcc = parseInt(ec[5], 10) || 1;
      this.lang = ec[6] || '';
      this.trad = ec[7] || '';
      this.pos = ec[8] || (this.modele ? this.modele.pos : '') || '';
      this.uid = ++Lemme.n;
    }
  }

  Lemme.n = 0;

  // ---------- Núcleo ----------
  const SUFFIXES = [['ne', 'nĕ'], ['que', 'quĕ'], ['st', 'st'], ['ue', 'vĕ'], ['ve', 'vĕ']];

  class LemCore {
    constructor() {
      this.variables = new Map();
      this.modeles = new Map();
      this.desinences = new Map();
      this.radicaux = new Map();
      this.lemmes = new Map();
      this.irregs = new Map();
      this.contractions = [];
      this.assims = [];
      this.assimsq = [];
      this.morphos = [];
      this.extLoaded = false;
    }

    ajDesinence(d) { multiAdd(this.desinences, deramise(d.gr), d); }

    load(modelesTxt, lexiqueTxt, extra, regimenTxt) {
      this.regimen = new Map();
      for (const l of (regimenTxt || '').split('\n')) { const i = l.indexOf('\t'); if (i > 0) this.regimen.set(l.slice(0, i), l.slice(i + 1)); }
      this.morphos = extra.morphos;
      this.morphosEn = extra.morphos_en || [];
      this.casEn = extra.cas_en || [];
      this.modesEn = extra.modes_en || [];
      this.tempsEn = extra.temps_en || [];
      this.nombresEn = extra.nombres_en || [];
      this.abrev = new Set(extra.abrev || []);
      this.contractions = extra.contractions.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      const aq = extra.assims.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      this.assimsq = aq;
      this.assims = aq.map(([a, b]) => [atone(a), atone(b)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      // modelos
      const lignes = modelesTxt.split('\n').filter(l => l && !l.startsWith('!'));
      let sl = [];
      const max = lignes.length - 1;
      for (let i = 0; i <= max; i++) {
        const l = lignes[i].replace(/\r$/, '');
        if (l.startsWith('$')) {
          const k = l.indexOf('=');
          this.variables.set(l.slice(0, k), l.slice(k + 1));
          continue;
        }
        const head = l.split(':')[0];
        if ((head === 'modele' || i === max) && sl.length) {
          if (i === max && head !== 'modele') { sl.push(l); }
          const m = new Modele(sl, this);
          this.modeles.set(m.gr, m);
          sl = [];
          if (i === max && head !== 'modele') continue;
        }
        sl.push(l);
      }
      // léxico
      let origin = 0;
      for (const l of lexiqueTxt.split('\n')) {
        if (!l) continue;
        if (l === '#EXT') { origin = 1; this.extLoaded = true; continue; }
        const lem = new Lemme(l, origin, this);
        if (!lem.modele) continue;
        if (!this.lemmes.has(lem.cle)) this.lemmes.set(lem.cle, lem);
        this.ajRadicaux(lem);
      }
      // irregulares
      for (const lin of extra.irregs) {
        const ecl = lin.split(':');
        let grq = ecl[0], excl = false;
        if (grq.endsWith('*')) { grq = grq.slice(0, -1); excl = true; }
        const lem = this.lemmes.get(ecl[1]);
        if (!lem) continue;
        const irr = { grq, gr: atone(grq), lemme: lem, morphos: listeI(ecl[2]), excl };
        multiAdd(this.irregs, deramise(irr.gr), irr);
        if (excl) irr.morphos.forEach(m => lem.irrExcl.add(m));
      }
    }

    ajRadicaux(l) {
      const m = l.modele;
      for (const [, lr] of l.radicaux) for (const r of lr) multiAdd(this.radicaux, deramise(r.gr), r);
      for (const i of m.clesR()) {
        if (l.radicaux.has(i)) continue;
        for (let g of l.grq.split(',')) {
          const gen = m.genRadical(i);
          if (gen === '-') continue;
          let r;
          if (gen === 'K') r = new Radical(g, i, l);
          else {
            const parts = gen.split(',');
            const oter = parseInt(parts[0], 10) || 0;
            const ajouter = parts[1] === undefined ? '' : parts[1];
            if (g.endsWith('̆')) g = g.slice(0, -1);
            g = oter > 0 ? g.slice(0, Math.max(0, g.length - oter)) : g;
            if (ajouter !== '0') g += ajouter;
            r = new Radical(g, i, l);
          }
          multiAdd(l.radicaux, i, r);
          multiAdd(this.radicaux, deramise(r.gr), r);
        }
      }
    }

    // Núcleo: radical + desinencia
    lemmatise(f) {
      const result = new Map(); // Lemme -> [{grq, morpho, sufq}]
      if (!f) return result;
      const push = (l, sl) => { const a = result.get(l); if (a) a.unshift(sl); else result.set(l, [sl]); };
      const fl = f.toLowerCase();
      const cntV = count(fl, 'v');
      const Vmaj = f[0] === 'V';
      let cntAe = count(fl, 'æ');
      const cntOe = count(fl, 'œ');
      if (fl.endsWith('æ')) cntAe -= 1;
      f = deramise(f);
      for (const irr of this.irregs.get(f) || []) for (const m of irr.morphos) push(irr.lemme, { grq: irr.grq, morpho: m, sufq: '' });
      for (let i = 0; i <= f.length; i++) {
        const r = f.slice(0, i), d = f.slice(i);
        const ldes = this.desinences.get(d);
        if (!ldes) continue;
        let lrad = this.radicaux.get(r) || [];
        if (d.startsWith('i') && !d.startsWith('ii') && !r.endsWith('i')) lrad = lrad.concat(this.radicaux.get(r + 'i') || []);
        if (!lrad.length) continue;
        for (const rad of lrad) {
          const l = rad.lemme;
          for (const des of ldes) {
            if (des.modele === l.modele && des.numRad === rad.num && !l.irrExcl.has(des.morpho)) {
              const rq = rad.grq.toLowerCase();
              let c = cntV === 0 || cntV === count(rq, 'v') + count(des.grq, 'v');
              if (!c) c = Vmaj && rad.gr[0] === 'U' && cntV - 1 === count(rq, 'v');
              c = c && (cntOe === 0 || cntOe === count(rq, 'ōe'));
              c = c && (cntAe === 0 || cntAe === count(rq, 'āe') + count(rq, 'prăe'));
              if (c) {
                let fq = rad.grq + des.grq;
                if (!r.endsWith('i') && rad.gr.endsWith('i')) fq = rad.grq.slice(0, -1) + 'ī' + des.grq.slice(1);
                push(l, { grq: fq, morpho: des.morpho, sufq: '' });
              }
            }
          }
        }
      }
      if (this.extLoaded && result.size) {
        const res = new Map();
        for (const [l, v] of result) if (l.origin === 0) res.set(l, v);
        if (res.size) return this.romains(f, res);
        return this.romains(f, result);
      }
      return this.romains(f, result);
    }

    romains(f, result) {
      if (f && !/[^IUXLCDM]/.test(f) && !f.includes('IL') && !f.includes('IUI') && !this.lemmes.has(f)) {
        const fv = f.replace(/U/g, 'V');
        const conv = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        let res = 0, s = conv[fv[0]];
        for (let i = 0; i < fv.length - 1; i++) { const c = s; s = conv[fv[i + 1]]; res += c < s ? -c : c; }
        res += s;
        const rom = { cle: f, grq: fv, gr: fv, indMorph: 'num. romano', nbOcc: 1, origin: 0, lang: 'es', trad: String(res), renvoi: '', roman: true };
        result.set(rom, [{ grq: fv, morpho: 416, sufq: '' }]);
      }
      return result;
    }

    assim(a) { for (const [d, v] of this.assims) if (a.startsWith(d)) return a.replace(d, v); return a; }
    assimq(a) { for (const [d, v] of this.assimsq) if (a.startsWith(d)) return a.replace(d, v); return a; }
    desassim(a) { for (const [k, d] of this.assims) if (a.startsWith(d)) return a.replace(d, k); return a; }
    desassimq(a) { for (const [k, d] of this.assimsq) if (a.startsWith(d)) return a.replace(d, k); return a; }

    lemmatiseM(f, debPhr = true, etape = 0) {
      let mm = new Map();
      if (!f) return mm;
      if (etape > 3 || etape < 0) {
        mm = this.lemmatise(f);
        if (debPhr && isUpper(f[0])) {
          const nmm = this.lemmatiseM(f.toLowerCase());
          for (const [k, v] of nmm) mm.set(k, v);
        }
        return mm;
      }
      mm = this.lemmatiseM(f, debPhr, etape + 1);
      let fd;
      switch (etape) {
        case 3: {
          fd = f;
          for (const [cle, val] of this.contractions) {
            if (fd.endsWith(cle)) {
              fd = fd.slice(0, fd.length - cle.length);
              fd += (fd.includes('v') || fd.includes('V')) ? val : deramise(val);
              const nmm = this.lemmatiseM(fd, debPhr, 4);
              for (const [nl, lst] of nmm) {
                const diff = val.length - cle.length;
                const nl2 = lst.map(s => {
                  let position = f.length - cle.length + 1;
                  if (fd.length !== s.grq.length) {
                    const debut = s.grq.slice(0, position + 2);
                    position += count(debut, '̆');
                  }
                  return { grq: s.grq.slice(0, position) + s.grq.slice(position + diff), morpho: s.morpho, sufq: s.sufq };
                });
                mm.set(nl, nl2);
              }
            }
          }
          break;
        }
        case 2: {
          fd = this.assim(f);
          if (fd !== f) {
            const nmm = this.lemmatiseM(fd, debPhr, 3);
            for (const [nl, lst] of nmm) mm.set(nl, lst.map(s => ({ ...s, grq: this.desassimq(s.grq) })));
            return mm;
          }
          fd = this.desassim(f);
          if (fd !== f) {
            const nmm = this.lemmatiseM(fd, debPhr, 3);
            for (const [nl, lst] of nmm) mm.set(nl, lst.map(s => ({ ...s, grq: this.assimq(s.grq) })));
            return mm;
          }
          break;
        }
        case 1: {
          if (mm.size === 0) {
            for (const [suf, sufq] of SUFFIXES) {
              if (mm.size === 0 && f.endsWith(suf)) {
                let sf = f.slice(0, f.length - suf.length);
                mm = this.lemmatiseM(sf, debPhr, 1);
                let sst = false;
                if (mm.size === 0 && suf === 'st') {
                  sf += 's';
                  mm = this.lemmatiseM(sf, debPhr, 1);
                  sst = true;
                }
                for (const [l, ls] of mm) mm.set(l, ls.map(s => ({ ...s, sufq: sst ? 't' : s.sufq + sufq })));
              }
            }
          }
          break;
        }
        case 0: {
          if (mm.size === 0 && isLower(f[0])) {
            return this.lemmatiseM(f[0].toUpperCase() + f.slice(1), false, 1);
          }
          break;
        }
        default: break;
      }
      return mm;
    }

    // ---------- API de alto nivel ----------
    static clean(w) {
      // quita acentos agudos, macrones, breves y diéresis; conserva æ œ
      let s = w.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
      s = s.replace(/[’'`´]/g, '');
      return s;
    }

    lemmeByCle(k) { return this.lemmes.get(k) || this.lemmes.get(atone(deramise(k))); }

    traduction(l) {
      if (l.renvoi) {
        const lr = this.lemmeByCle(l.renvoi);
        if (lr && lr.trad) return { lang: lr.lang, text: lr.trad, via: lr.grq };
      }
      // glosas que solo remiten a otro lema («part. de accuso», «= intercursus», «véase X»)
      const m = /^(?:part(?:\.|icipio)(?: (?:pres|pas|perf|fut)\.?)?(?: de)?|=|véase|cf\.)\s+([\p{L}]+\d?)\.?$/u.exec((l.trad || '').trim());
      if (m) {
        const lr = this.lemmeByCle(m[1]);
        if (lr && lr !== l && lr.trad) return { lang: l.lang, text: l.trad + ': ' + lr.trad, via: null };
      }
      return { lang: l.lang, text: l.trad, via: null };
    }

    lemmatiseTout(word) {
      const f = LemCore.clean(word);
      if (!f || !/[A-Za-zæœÆŒ]/.test(f)) return null;
      const mm = this.lemmatiseM(f, true);
      // Ediciones que escriben V por U (Vt, Vrbem, VRBS): probar también la grafía con u.
      const alt = f.replace(/V/g, 'U').replace(/v/g, 'u');
      if (alt !== f && (/^V/.test(f) || f === f.toUpperCase() || mm.size === 0)) {
        for (const [k, v] of this.lemmatiseM(alt, true)) if (!mm.has(k)) mm.set(k, v);
      }
      return mm;
    }

    // ---------- Etiquetador contextual (port de Tagueur/Mot de Collatinus) ----------
    loadTags(txt) {
      this.tagOcc = new Map(); this.tagTot = new Map(); this.trigram = new Map();
      let part = 0;
      for (const l of txt.split('\n')) {
        if (!l) continue;
        if (l.startsWith('! --- ')) { part = 1; continue; }
        const i = l.lastIndexOf(',');
        if (i < 0) continue;
        const k = l.slice(0, i), n = parseInt(l.slice(i + 1), 10) || 0;
        if (part === 0) { this.tagOcc.set(k, (this.tagOcc.get(k) || 0) + n); this.tagTot.set(k[0], (this.tagTot.get(k[0]) || 0) + n); }
        else this.trigram.set(k, n);
      }
      this.tagsLoaded = true;
    }

    tagOf(l, m) {
      let lp = l.pos || '';
      if (lp && !/[a-z]/i.test(lp[0])) lp = '';
      const morph = m === 416 ? 'inv.' : (this.morphosEn[m - 1] || '');
      let out = '';
      for (const p of lp) {
        if (p === 'n' && m === 413) { out += 'n71,'; continue; }
        if (p === 'v' && morph.includes(' -u')) { out += 'v3 ,'; continue; }
        let done = false;
        if (p === 'v') {
          for (let i = 0; i < 4; i++) if (morph.includes(this.modesEn[i])) {
            out += 'v' + (i + 1) + (morph.includes(this.tempsEn[0]) ? '1' : ' ') + ','; done = true; break;
          }
        }
        if (!done) {
          for (let i = 0; i < 6; i++) if (morph.includes(this.casEn[i])) {
            out += (p === 'v' ? 'w' : p) + (i + 1) + (morph.includes(this.nombresEn[1]) ? '2' : '1') + ','; done = true; break;
          }
        }
        if (!done) out += p + '  ,';
      }
      return out;
    }

    fraction(listTags) {
      let frFin = 0;
      while (listTags.length > 2) {
        const t = listTags.slice(0, 3);
        listTags = listTags.slice(4);
        let fr = 0;
        if (this.tagOcc.has(t)) {
          const occ = this.tagOcc.get(t), tot = this.tagTot.get(t[0]) || 1;
          if (t[0] === 'a' || t[0] === 'p' || t[0] === 'w') fr = Math.floor(occ * 341 / tot);
          else if (t[0] === 'v' && t[2] === '1') fr = Math.floor(occ * 512 / tot);
          else if (t[0] === 'v' && t[2] === ' ') fr = Math.floor(occ * 256 / tot);
          else if (t[0] === 'n') fr = Math.floor(occ * 1024 / tot);
          else fr = 1024;
          if (fr === 0) fr = 1;
        }
        if (frFin < fr) frFin = fr;
      }
      return frFin === 0 ? 1024 : frFin;
    }

    mot(forme) {
      const r = { forme, entries: [], probas: new Map(), tagEncl: '' };
      if (!forme) { r.probas.set('snt', 1); return r; }
      const mm = this.lemmatiseTout(forme) || new Map();
      let encl = '';
      for (const [l, lst] of mm) {
        const nb = l.nbOcc || 1;
        for (const s of lst) {
          let lt = this.tagOf(l, s.morpho);
          r.entries.push({ l, s, lt, fr: nb * this.fraction(lt) });
          if (s.sufq) encl = s.sufq;
          while (lt.length > 2) {
            const t = lt.slice(0, 3); lt = lt.slice(4);
            r.probas.set(t, (r.probas.get(t) || 0) + nb * this.fraction(t));
          }
        }
      }
      if (this.abrev.has(forme)) {
        r.probas = new Map();
        for (let i = 1; i < 7; i++) { const t = 'n' + i + '1'; r.probas.set(t, this.tagOcc.get(t) || 0); }
      }
      let total = 0; for (const v of r.probas.values()) total += v;
      if (!total) total = 1;
      for (const [t, v] of r.probas) { let pr = Math.floor(v * 1024 / total); if (pr === 0) pr = 1; r.probas.set(t, pr); }
      if (encl === 'quĕ' || encl === 'vĕ') r.tagEncl = 'ce ';
      else if (encl === 'nĕ') r.tagEncl = 'de ';
      else if (encl === 'st') r.tagEncl = 'v11';
      const fl = forme.toLowerCase();
      if (/^(me|te|se|nobis|vobis|uobis|quibus|qua|quo|qui)cum$/.test(fl)) {
        r.tagEncl = 're ';
        if (!r.probas.size) r.probas.set('p61', 1024);
        else if (r.probas.size === 1 && !r.probas.has('p61')) { r.probas = new Map([['p61', 1024]]); }
      }
      return r;
    }

    // Devuelve, para la palabra de índice `index` en la frase `words`, el análisis más probable en contexto.
    contexte(words, index) {
      if (!this.tagsLoaded || index < 0 || index >= words.length) return null;
      // ventana prudente para frases muy largas
      let a = 0, b = words.length;
      if (b > 60) { a = Math.max(0, index - 30); b = Math.min(words.length, index + 30); }
      const ws = words.slice(a, b); index -= a;
      const mots = ws.map((w) => this.mot(w));
      mots.push(this.mot(''));
      let sequences = ['snt'], probas = [1.0];
      for (let i = 0; i < mots.length; i++) {
        const mot = mots[i];
        const lTags = [...mot.probas.keys()].sort();
        const sTag = lTags.length;
        if (!sTag) continue;
        const nvlSeq = [], nvlP = [];
        for (let j = 0; j < sequences.length; j++) {
          const bigr = sequences[j].slice(-7);
          const pr = []; let tot = 0;
          for (const t of lTags) { const p = mot.probas.get(t) * (4 * (this.trigram.get(bigr + ' ' + t) || 0) + 1); pr.push(p); tot += p; }
          if (!tot) tot = 1;
          for (let k = 0; k < sTag; k++) { nvlSeq.push(sequences[j] + ' ' + lTags[k]); nvlP.push(probas[j] * pr[k] / tot); }
        }
        if (mot.tagEncl) for (let j = 0; j < nvlSeq.length; j++) nvlSeq[j] += ' ' + mot.tagEncl;
        sequences = []; probas = [];
        for (let j = 0; j < nvlSeq.length; j++) if (nvlP[j] > 0) {
          const bigr = nvlSeq[j].slice(-7);
          let seq = '', val = -1, seq2 = '', val2 = -1;
          for (let k = j; k < nvlSeq.length; k += sTag) if (bigr === nvlSeq[k].slice(-7)) {
            if (val2 < nvlP[k]) {
              if (val < nvlP[k]) { val2 = val; seq2 = seq; val = nvlP[k]; seq = nvlSeq[k]; }
              else { val2 = nvlP[k]; seq2 = nvlSeq[k]; }
            }
            nvlP[k] = -1;
          }
          sequences.push(seq); probas.push(val);
          if (val2 > 0) { sequences.push(seq2); probas.push(val2); }
        }
        if (!sequences.length) return null;
      }
      let best = '', bv = -1;
      for (let i = 0; i < sequences.length; i++) if (probas[i] > bv) { bv = probas[i]; best = sequences[i]; }
      let seq = best.slice(4), tag = null;
      for (let i = 0; i < mots.length - 1; i++) {
        const m = mots[i];
        if (!m.probas.size) continue;
        const t = seq.slice(0, 3);
        if (i === index) { tag = t; break; }
        seq = m.tagEncl ? seq.slice(5 + m.tagEncl.length) : seq.slice(4);
      }
      if (!tag) return null;
      // Mot::choisir: entre los análisis compatibles con la etiqueta, el más frecuente
      let choix = null, valeur = -1;
      for (const e of mots[index].entries) if (e.lt.includes(tag) && valeur < e.fr) { valeur = e.fr; choix = e; }
      if (!choix) return { tag };
      return { tag, lid: choix.l.uid, morpho: choix.s.morpho, grq: choix.s.grq, sufq: choix.s.sufq || '', forme: ws[index] };
    }

    analyse(word) {
      const mm = this.lemmatiseTout(word);
      if (!mm) return [];
      const out = [];
      for (const [l, lst] of mm) {
        const tr = this.traduction(l);
        const seen = new Set();
        const formes = [];
        for (const s of lst) {
          const key = s.grq + '|' + s.morpho + '|' + s.sufq;
          if (seen.has(key)) continue;
          seen.add(key);
          formes.push({ forme: s.grq + (s.sufq ? '·' + s.sufq : ''), morpho: s.morpho === 416 ? '' : (this.morphos[s.morpho - 1] || ''), enclitique: s.sufq || '', m: s.morpho, grq: s.grq, t: this.tagOf(l, s.morpho) });
        }
        out.push({
          lemme: l.grq.replace(/,/g, ', ').replace(/ {2}/g, ' '),
          cle: l.cle, gr: l.gr, lid: l.uid,
          indMorph: l.indMorph,
          trad: tr.text, lang: tr.lang, via: tr.via,
          freq: l.nbOcc, ext: l.origin === 1, roman: !!l.roman,
          regime: (!l.origin && this.regimen && this.regimen.get(l.cle)) || '',
          formes
        });
      }
      out.sort((a, b) => b.freq - a.freq);
      return out;
    }
  }

  global.LatinCore = LemCore;
  global.LatinUtil = { atone, deramise };
  if (typeof module !== 'undefined') module.exports = { LemCore, atone, deramise };
})(typeof window !== 'undefined' ? window : globalThis);

};
defs["core/tei.js"] = function (module, exports, require) {
/*
 * tei.js — Conversión de los textos TEI/EpiDoc de Perseus y First1KGreek
 * al formato de líneas con cita que usa Musaios.
 * Licencia GNU GPL v3.
 */


const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…' };
function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] !== undefined ? ENT[e] : m;
  });
}

// Analizador XML mínimo (suficiente para TEI bien formado)
function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>|<(\/?)([^\s>/]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[7] !== undefined) { top.children.push(decode(m[7])); continue; }
    if (m[1] !== undefined) { top.children.push(m[1]); continue; }
    if (!m[4]) continue; // comentario, instrucción, doctype
    const name = m[4].replace(/^.*:/, '');
    if (m[3] === '/') {
      // cerrar hasta el elemento del mismo nombre
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      continue;
    }
    const attrs = {};
    if (m[5]) for (const a of m[5].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].replace(/^xml:/, 'xml_')] = decode(a[2] !== undefined ? a[2] : a[3]);
    const el = { name, attrs, children: [] };
    top.children.push(el);
    if (m[6] !== '/') stack.push(el);
  }
  return root;
}

function find(node, pred) {
  if (typeof node === 'string') return null;
  if (pred(node)) return node;
  for (const c of node.children) { const r = find(c, pred); if (r) return r; }
  return null;
}
function findAll(node, pred, out) {
  out = out || [];
  if (typeof node === 'string') return out;
  if (pred(node)) out.push(node);
  for (const c of node.children) findAll(c, pred, out);
  return out;
}
function textOf(node) { return typeof node === 'string' ? node : node.children.map(textOf).join(''); }

const SKIP = new Set(['note', 'bibl', 'teiHeader', 'figure', 'figDesc', 'interp', 'interpGrp', 'fw', 'listBibl', 'app', 'rdg', 'witDetail', 'castList', 'trailer', 'argument']);
const CHOICE_PREF = ['corr', 'reg', 'expan', 'lem'];

/*
 * Convierte un TEI en { title, author, lang, levels, lines: [{ c: cita, t: texto, k: 'l'|'p'|'h', s: hablante }] }
 */
function convertTei(xml, meta) {
  meta = meta || {};
  const root = parseXml(xml);
  const tei = find(root, (n) => n.name === 'TEI' || n.name === 'TEI.2') || root;
  // niveles de cita (refsDecl CTS, del más profundo al más alto)
  let levels = [];
  const rd = findAll(tei, (n) => n.name === 'refsDecl');
  for (const r of rd) {
    const pats = findAll(r, (n) => n.name === 'cRefPattern').map((p) => p.attrs.n).filter(Boolean);
    if (pats.length) { levels = pats.slice(); break; }
  }
  const levelSet = new Set(levels.map((x) => x.toLowerCase()));
  const body = find(tei, (n) => n.name === 'body') || tei;
  const edition = find(body, (n) => n.name === 'div' && n.attrs.type === 'edition') || body;
  const lang = meta.lang || ((edition.attrs.xml_lang || '').startsWith('la') ? 'l' : 'g');

  const lines = [];
  let cur = null;          // línea en curso
  let pendingSpk = '';
  let sub = null;          // sección por hito (Stephanus, etc.)
  let secN = null;         // sección numérica (capítulo.sección)
  let lastL = 0;
  let joinNext = false;
  const citOf = (path) => path.filter((x) => x !== '' && x !== null && x !== undefined).join('.');

  function flush() {
    if (cur) {
      cur.t = cur.t.replace(/\s+/g, ' ').trim();
      if (cur.t) lines.push(cur);
    }
    cur = null;
  }
  function open(kind, cit) { flush(); cur = { c: cit, t: '', k: kind }; if (pendingSpk) { cur.s = pendingSpk; pendingSpk = ''; } }
  function text(s, path) {
    if (!cur) open('p', secN ? citOf(path.concat([secN])) : sub ? citOf(path.slice(0, -1).concat([sub])) || sub : citOf(path));
    if (joinNext) { s = s.replace(/^\s+/, ''); joinNext = false; }
    cur.t += s;
  }
  function walk(node, path, inVerse) {
    if (typeof node === 'string') { if (/\S/.test(node) || cur) text(node, path); return; }
    const n = node.name;
    if (SKIP.has(n)) return;
    switch (n) {
      case 'div': case 'div1': case 'div2': case 'div3': {
        const isPart = node.attrs.type === 'textpart' || /^div\d$/.test(n) || node.attrs.n !== undefined;
        if (!isPart || node === edition) { for (const c of node.children) walk(c, path, inVerse); return; }
        flush(); sub = null; secN = null;
        const st = (node.attrs.subtype || '').toLowerCase();
        const counts = !st || !levelSet.size || levelSet.has(st);
        const np = counts ? path.concat([node.attrs.n !== undefined ? node.attrs.n : '']) : path;
        for (const c of node.children) walk(c, np, inVerse);
        flush(); sub = null; secN = null;
        return;
      }
      case 'l': {
        let num = node.attrs.n;
        if (num === undefined || num === '') num = String(lastL + 1);
        if (/^\d+$/.test(num)) lastL = parseInt(num, 10);
        open('l', citOf(path.concat([num])));
        for (const c of node.children) walk(c, path, true);
        flush();
        return;
      }
      case 'p': case 'ab': case 'lg': {
        if (n !== 'lg') flush();
        for (const c of node.children) walk(c, path, inVerse);
        if (n !== 'lg') flush();
        return;
      }
      case 'head': {
        open('h', citOf(path.concat(['t'])));
        for (const c of node.children) walk(c, path, inVerse);
        flush();
        return;
      }
      case 'speaker': pendingSpk = textOf(node).replace(/\s+/g, ' ').trim(); return;
      case 'sp': for (const c of node.children) walk(c, path, inVerse); return;
      case 'milestone': {
        const u = (node.attrs.unit || '').toLowerCase();
        if (u === 'section' && node.attrs.n && !inVerse && /^\d+$/.test(node.attrs.n) && levelSet.has('section')) { flush(); secN = node.attrs.n; return; }
        if (u === 'section' && node.attrs.n && !inVerse) {
          const last = path[path.length - 1] || '';
          const mn = node.attrs.n;
          flush();
          sub = mn.startsWith(last) ? mn : (last ? last + mn : mn);
        }
        return;
      }
      case 'lb': {
        if (cur && /\p{L}-\s*$/u.test(cur.t)) { cur.t = cur.t.replace(/-\s*$/, ''); joinNext = true; }
        else if (cur) cur.t += ' ';
        return;
      }
      case 'pb': case 'cb': return;
      case 'gap': text(' … ', path); return;
      case 'choice': {
        const kids = node.children.filter((c) => typeof c !== 'string');
        const pick = CHOICE_PREF.map((p) => kids.find((k) => k.name === p)).find(Boolean) || kids[0];
        if (pick) walk(pick, path, inVerse);
        return;
      }
      case 'seg': {
        if ((node.attrs.type || '') === 'section' && node.attrs.n && !inVerse && levelSet.has('section')) { flush(); secN = node.attrs.n; for (const c of node.children) walk(c, path, inVerse); flush(); return; }
        for (const c of node.children) walk(c, path, inVerse); return;
      }
      case 'abbr': {
        const ex = node.children.find((c) => typeof c !== 'string' && c.name === 'expan');
        if (ex) { walk(ex, path, inVerse); return; }
        for (const c of node.children) walk(c, path, inVerse); return;
      }
      case 'sic': case 'orig': {
        for (const c of node.children) walk(c, path, inVerse); return;
      }
      case 'del': text('⟦', path); for (const c of node.children) walk(c, path, inVerse); text('⟧', path); return;
      case 'add': case 'supplied': text('⟨', path); for (const c of node.children) walk(c, path, inVerse); text('⟩', path); return;
      default:
        for (const c of node.children) walk(c, path, inVerse);
    }
  }
  walk(edition, [], false);
  flush();
  // normalizar apóstrofos y letras
  for (const l of lines) {
    l.t = l.t.replace(/[ʼ᾽'´](?=\s|$|[,.;·:])/g, '’').replace(/[ʼ᾽]/g, '’').normalize('NFC');
    if (l.s) l.s = l.s.normalize('NFC');
  }
  // niveles: de mayor a menor
  levels = levels.slice().reverse();
  if (!levels.length) {
    const depth = lines.reduce((d, l) => Math.max(d, l.c.split('.').length), 0);
    levels = Array.from({ length: depth }, (_, i) => (i === depth - 1 ? 'línea' : 'parte'));
  }
  return { title: meta.title || '', author: meta.author || '', lang, levels, lines };
}

module.exports = { parseXml, convertTei };

};

function resolve(from, name) {
  if (!name.startsWith('.')) return name;
  const parts = from.split('/'); parts.pop();
  for (const s of name.split('/')) { if (s === '.' || !s) continue; if (s === '..') parts.pop(); else parts.push(s); }
  let p = parts.join('/'); if (!p.endsWith('.js')) p += '.js'; return p;
}
function req(from) { return function (name) {
  if (window.EXMODULES[name]) return window.EXMODULES[name];
  const id = resolve(from, name);
  if (cache[id]) return cache[id].exports;
  const module = { exports: {} }; cache[id] = module;
  defs[id](module, module.exports, req(id));
  return module.exports;
}; }
window.EXREADY.then(() => req('main.js')('./engine/engine.js'));
})();

