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
  load('js/datos.js'); load('js/bancos-datos.js'); load('js/lexico-bancos-datos.js'); load('js/bancos-loader.js'); load('js/incluidos.js');
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
  const academic = await call('lists');
  assert.equal(academic.preverbios.length, 120);
  assert.equal(academic.prefijos.length, 287); // 286 fuente + Ultrapuertos histórico
  assert.equal(academic.evolucion.length, 20);
  assert.equal(academic.latinismos.length, 87);
  // Las listas guardadas por el profesor prevalecen sobre las de fábrica.
  const userFile = '/datos/listas/latinismos.json';
  const customLatin = [{ termino: 'locución personal', expl: 'docente' }];
  ctx.EXDATA[userFile] = JSON.stringify(customLatin);
  assert.equal((await call('lists')).latinismos[0].termino, 'locución personal');
  delete ctx.EXDATA[userFile];
  assert.equal((await call('lists')).latinismos[0].termino, 'a posteriori');
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
  const verbTokens = await call('analyze', { text: 'Capio et ago.' });
  assert.ok(verbTokens.some((t) => t.sel && t.cat === 'v' && Array.isArray(t.rows) && t.rows.length),
    'Los verbos del texto siguen vinculados al banco de modificación preverbial');
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

  // La grafía ligada procede sólo del lematizador automático y se refleja
  // igual en la vista previa, el PDF (HTML) y el documento de Word.
  const poetaLookup = (await call('lookup', { word: 'poeta' }))[0];
  const proeliumLookup = (await call('lookup', { word: 'proelium' }))[0];
  assert.ok(poetaLookup && proeliumLookup);
  const [poetEntry, battleEntry] = await ctx.M.vocabEntries({
    lids: [poetaLookup.lid, proeliumLookup.lid], mode: 'modelo'
  });
  assert.equal(poetEntry.head, 'poeta, –æ');
  assert.match(battleEntry.head, /^prœlĭum/);
  const ligatedExam = {
    texto: 'Poeta proelium narrat.', vocabItems: [
      { head: poetEntry.head, trad: 'poeta', on: true },
      { head: battleEntry.head, trad: 'combate', on: true }
    ], literatura: {}, qty: 'modelo', tamano: 10.5, hueco: 2.6
  };
  const alphabetical = Array.from(ctx.M.Exam.vocabList({
    vocabItems: [
      { head: 'prœlium', on: true },
      { head: 'poeta', on: true },
      { head: 'aer', on: true },
      { head: 'æquus', on: true },
      { head: 'aetas', on: true }
    ]
  }), (x) => x.head);
  assert.deepEqual(alphabetical, ['æquus', 'aer', 'aetas', 'poeta', 'prœlium'],
    'Las ligaduras no deben romper el orden alfabético del vocabulario');
  const ligatedHTML = ctx.M.Exam.html(ligatedExam);
  assert.ok(ligatedHTML.includes('poeta, –æ'));
  assert.ok(ligatedHTML.includes('prœlĭum'));
  assert.ok(ligatedHTML.includes('Poeta proelium narrat.'), 'No cambiar el texto latino');
  const ligatedDocx = await ctx.JSZip.loadAsync(await ctx.M.Exam.docx(ligatedExam), { base64: true });
  const ligatedXml = await ligatedDocx.file('word/document.xml').async('string');
  assert.ok(ligatedXml.includes('prœlĭum'));
  assert.ok(ligatedXml.includes('poeta, –æ'));
  assert.ok(ligatedXml.includes('Poeta proelium narrat.'));

  // Una preferencia o corrección docente mantiene EXACTAMENTE lo escrito.
  ctx.M.store.set('vocabulario', V.parse('poeta, -ae\tpoeta del profesor'));
  ctx.M.S.tokens = [{ sel: { lid: poetaLookup.lid }, lplain: 'poeta', lemma: poetaLookup.lemma }];
  const personal = await ctx.M.vocabEntries({ lids: [poetaLookup.lid], mode: 'modelo' });
  assert.equal(personal[0].head, 'poeta, -ae');
  assert.equal(personal[0].trad, 'poeta del profesor');
  ctx.M.store.set('vocabulario', custom);
  ctx.M.S.tokens = tokens;

  assert.throws(() => V.parse('sin traducción'));
  assert.throws(() => V.parse('amo\tamar\namo\tquerer'));
  const S = { texto: 'Gallia est omnis divisa in partes tres.', tokens, fuente: 'Palatino', tamano: 10.5, espacioPreguntas: 0, hueco: 0,
    literatura: { texto: 'At regina gravi\nvolnus alit', traduccion: '', autor: 'Virgilio', obra: 'Aeneis', cita: 'IV 1–2' } };
  // La selección tipográfica no cambia el contenido académico ni los bancos.
  const defaultStack = ctx.M.Exam.fontStack();
  assert.ok(defaultStack.startsWith("'Palatino', "));
  assert.ok(defaultStack.includes("'PalemonasMUFI'"));
  assert.ok(defaultStack.includes("'Palemonas MUFI'"));
  assert.ok(defaultStack.endsWith("'Gentium Book Plus', serif"));
  assert.ok(!defaultStack.includes("'Palatino Linotype'"), 'No elegir Linotype por defecto');
  assert.ok(ctx.M.Exam.fontStack('PalemonasMUFI').startsWith("'PalemonasMUFI', "));
  assert.ok(ctx.M.Exam.fontStack('Palatino Linotype').startsWith("'Palatino Linotype', "),
    'Respetar las preferencias de exámenes anteriores');
  assert.match(fs.readFileSync(path.join(root, 'js/start.js'), 'utf8'), /PalemonasMUFI/);
  const css = ctx.M.Exam.pageCss(S);
  assert.match(css, /font-size: 10.5pt/); assert.match(css, /margin: 0 0 0cm/); assert.match(css, /margin-bottom: 0cm/);
  const html = ctx.M.Exam.html(S); assert.match(html, /At regina gravi\nvolnus alit/); assert.match(html, /litTranslation"><\/div>/);
  const sameOutput = ctx.M.Exam.html({ ...S, evolNormas: ['N07'],
    latinFilter: { desde: 20, hasta: 50, paridad: 'impares', activo: true } });
  assert.equal(sameOutput, html, 'Los filtros del sorteo nunca modifican el documento exportado');
  assert.ok(ctx.M.Exam.questionList({ documento: 'repaso' }).every((q) => !/\(\d+p/.test(q)));
  const zip = await ctx.JSZip.loadAsync(await ctx.M.Exam.docx(S), { base64: true });
  const styles = await zip.file('word/styles.xml').async('string');
  const doc = await zip.file('word/document.xml').async('string');
  assert.match(styles, /w:sz w:val="21"/); assert.match(styles, /w:ascii="Palatino"/);
  assert.match(doc, /w:after="0"/); assert.match(doc, /At regina gravi/); assert.match(doc, /Traducción/);
  // Espaciado de pregunta 4: compatibilidad de los valores anteriores y
  // conversión precisa a twips en Word (1 cm ~= 567 twips).
  assert.equal(ctx.M.Exam.q4Space({}), 2.6);
  assert.equal(ctx.M.Exam.q4Space({ hueco: 1.8 }), 1.8);
  assert.equal(ctx.M.Exam.q4Space({ hueco: -3 }), 2.6);
  assert.equal(ctx.M.Exam.q4Space({ hueco: 50 }), 2.6);
  assert.equal(ctx.M.Exam.q4Space({ hueco: 'incorrecto' }), 2.6);
  for (const cm of [0, 0.05, 1.25, 2.6, 3.5, 10]) {
    const spaced = { ...S, hueco: cm };
    const cssSpaced = ctx.M.Exam.pageCss(spaced);
    assert.ok(cssSpaced.includes('margin-bottom: ' + cm + 'cm;'), 'Vista previa y PDF: ' + cm + ' cm');
    const word = await ctx.JSZip.loadAsync(await ctx.M.Exam.docx(spaced), { base64: true });
    const xml = await word.file('word/document.xml').async('string');
    const after = [...xml.matchAll(/<w:spacing w:before="0" w:after="(\d+)"\/><w:ind w:left="1134"/g)].map((x) => Number(x[1]));
    assert.deepEqual(after, [Math.round(cm * 567), Math.round(cm * 567), Math.round(cm * 567), 0], 'Espacio exacto en Word: ' + cm + ' cm');
  }
  assert.match(fs.readFileSync(path.join(root, 'js/start.js'), 'utf8'), /class="sh" type="number" min="0" max="10" step="0\.05"/);

  console.log('OK: syntax, offline texts, catalog, literature, vocabulary preference/fallback, preview, review mode and DOCX.');
})().catch((e) => { console.error(e); throw e; });
