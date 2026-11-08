/* Run with Node.js: node tests/regression.cjs */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
module.exports = (async () => {
  const ctx = { console, setTimeout, clearTimeout, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, Buffer };
  ctx.window = ctx;
  vm.createContext(ctx);
  const load = (p) => vm.runInContext(fs.readFileSync(path.join(root, p), 'utf8'), ctx, { filename: p });
  for (const p of fs.readdirSync(path.join(root, 'js'))) new vm.Script(fs.readFileSync(path.join(root, 'js', p), 'utf8'), { filename: p });
  load('js/datos.js'); load('js/incluidos.js');
  let handler;
  const replies = new Map(); let id = 0;
  const fakeFs = {
    readFileSync: (p) => { if (!(p in ctx.EXDATA)) throw Error('Missing: ' + p); return ctx.EXDATA[p]; },
    existsSync: (p) => p in ctx.EXDATA || Object.keys(ctx.EXDATA).some((k) => k.startsWith(p + '/')),
    readdirSync: (p) => Object.keys(ctx.EXDATA).filter((k) => k.startsWith(p + '/')).map((k) => k.slice(p.length + 1)),
  };
  ctx.EXMODULES = { fs: fakeFs, path: path.posix, worker_threads: {
    workerData: { appDir: '/app', dataRoot: '/datos' },
    parentPort: { on: (_, f) => { handler = f; }, postMessage: (m) => { if (m.type === 'reply') replies.get(m.id)(m); } }
  } };
  ctx.EXREADY = Promise.resolve();
  load('js/motor.js'); await ctx.EXREADY; await Promise.resolve();
  const call = (method, args) => new Promise((resolve, reject) => {
    const n = ++id; replies.set(n, (m) => m.error ? reject(Error(m.error)) : resolve(m.result));
    handler({ type: 'call', id: n, method, args });
  });
  const catalog = await call('catalog');
  assert.equal(new Set(catalog.map((w) => w.urn)).size, catalog.length, 'No duplicate catalog entries');
  const caesar = catalog.filter((w) => w.author === 'Julio César');
  assert.equal(caesar.length, 2);
  assert.equal(caesar.map((w) => w.latin).sort().join('|'), 'De bello Gallico|De bello civili');
  for (const w of catalog.filter((w) => w.builtin)) {
    assert.ok(w.have);
    const work = await call('work', { urn: w.urn });
    assert.ok(work.lines.length > 100, w.latin + ' has a complete text');
  }
  const aeneid = await call('work', { urn: 'phi0690.phi003.perseus-lat2' });
  const book4 = aeneid.lines.filter((l) => l.c.startsWith('4.') && l.k === 'l');
  assert.equal(book4.length, 705); assert.equal(book4[0].c, '4.1'); assert.equal(book4.at(-1).c, '4.705');
  const heroides = await call('work', { urn: 'phi0959.phi002.perseus-lat2' });
  const first = heroides.lines.filter((l) => l.c.startsWith('1.') && l.k === 'l');
  assert.equal(first.length, 116); assert.match(first[0].t, /Haec tua Penelope/);
  const tokens = await call('analyze', { text: 'Gallia est omnis divisa in partes tres.' });
  assert.ok(tokens.every((t) => t.sel));
  const storage = new Map();
  ctx.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  load('js/util.js'); load('js/vocabulario.js'); load('js/render.js'); load('lib/jszip.min.js');
  ctx.M.call = call; ctx.M.S = { tokens }; ctx.M.Propose = { prefDisplay: (s) => s };
  const V = ctx.M.Vocabulary;
  const custom = V.parse('Gallia, -ae\tGalia preferente\tGalliam|Galliae');
  ctx.M.store.set('vocabulario', custom);
  const gallia = tokens.find((t) => t.lplain === 'gallia');
  const sum = tokens.find((t) => t.lplain === 'sum');
  const entries = await ctx.M.vocabEntries({ lids: [gallia.sel.lid, sum.sel.lid], mode: 'ninguna' });
  assert.equal(entries[0].trad, 'Galia preferente'); assert.ok(entries[0].preferred);
  assert.ok(entries[1].trad); assert.ok(!entries[1].preferred, 'Unlisted word uses existing dictionary');
  assert.equal(V.find(['Galliam'], true).trad, 'Galia preferente');
  assert.throws(() => V.parse('sin traducción'));
  assert.throws(() => V.parse('amo\tamar\namo\tquerer'));
  const S = { texto: 'Gallia est omnis divisa in partes tres.', tokens, fuente: 'Palatino', tamano: 10.5, espacioPreguntas: 0, hueco: 0,
    literatura: { texto: 'At regina gravi\nvolnus alit', traduccion: '', autor: 'Virgilio', obra: 'Aeneis', cita: 'IV 1–2' } };
  const css = ctx.M.Exam.pageCss(S);
  assert.match(css, /font-size: 10.5pt/); assert.match(css, /margin: 0 0 0cm/); assert.match(css, /margin-bottom: 0cm/);
  const html = ctx.M.Exam.html(S); assert.match(html, /At regina gravi\nvolnus alit/); assert.match(html, /litTranslation"><\/div>/);
  assert.ok(ctx.M.Exam.questionList({ documento: 'repaso' }).every((q) => !/\(\d+p/.test(q)));
  const zip = await ctx.JSZip.loadAsync(await ctx.M.Exam.docx(S), { base64: true });
  const styles = await zip.file('word/styles.xml').async('string');
  const doc = await zip.file('word/document.xml').async('string');
  assert.match(styles, /w:sz w:val="21"/); assert.match(styles, /w:ascii="Palatino"/);
  assert.match(doc, /w:after="0"/); assert.match(doc, /At regina gravi/); assert.match(doc, /Traducción/);
  console.log('OK: syntax, offline texts, catalog, literature, vocabulary preference/fallback, preview, review mode and DOCX.');
})().catch((e) => { console.error(e); throw e; });
