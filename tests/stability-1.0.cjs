/* Regresiones 1.0: las respuestas tardías no alteran otro examen
 * y un selector cancelado no bloquea "Abrir" ni una configuración dañada.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function testStaleAnalysis() {
  const busy = { classList: { add() {}, remove() {} } };
  const analyses = [], lookups = [];
  let edits = 0;
  const M = {
    Propose: { evol() {}, pref() {}, latin() {}, underline() { edits++; }, preverbs() { edits++; } },
    $: (selector) => selector === '#busy' ? busy : null,
    $$: () => [],
    el: () => ({}),
    esc: (x) => x,
    store: { get: (_, d) => d, set() {} },
    debounce: () => () => {},
    Exam: { prepareLiterature: async () => false },
    Vocabulary: { find: () => null },
    toast: () => { throw Error('Una respuesta antigua no debe mostrar errores.'); },
    call: (method) => {
      assert.equal(method, 'analyze');
      const d = deferred(); analyses.push(d); return d.promise;
    },
    vocabEntries: () => {
      const d = deferred(); lookups.push(d); return d.promise;
    }
  };
  const ctx = { M, window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
    document: {}, setTimeout, clearTimeout, console };
  vm.createContext(ctx);
  vm.runInContext(read('js/exam.js'), ctx, { filename: 'exam.js' });
  M.renderEditor = () => {};
  M.preview = () => {};

  // Escenario 1: la respuesta del análisis llega tras abrir otro examen.
  const first = { texto: 'Gallia est omnis.', textAnalyzed: '', tokens: [], vocabItems: [] };
  const second = { texto: '', textAnalyzed: '', tokens: [], vocabItems: [] };
  M.loadExam(first);
  assert.equal(analyses.length, 1);
  M.loadExam(second);
  analyses[0].resolve([{ w: 'Gallia', sel: { lid: 1 } }]);
  await tick(); await tick();
  assert.equal(first.tokens.length, 0, 'El análisis antiguo se descarta');
  assert.equal(second.tokens.length, 0, 'El examen nuevo queda intacto');
  assert.equal(lookups.length, 0, 'No iniciar trabajo de vocabulario obsoleto');

  // Escenario 2: el cambio sucede mientras se resuelve el vocabulario.
  const third = { texto: 'Puella bona.', textAnalyzed: '', tokens: [], vocabItems: [] };
  const fourth = { texto: '', textAnalyzed: '', tokens: [], vocabItems: [] };
  M.loadExam(third);
  analyses[1].resolve([{ w: 'Puella', sel: { lid: 9 } }]);
  await tick(); await tick();
  assert.equal(lookups.length, 1);
  M.loadExam(fourth);
  lookups[0].resolve([{ lid: 9, head: 'puella', trad: 'muchacha' }]);
  await tick(); await tick();
  assert.equal(fourth.vocabItems.length, 0, 'No introducir vocabulario en otro examen');
  assert.equal(third.vocabItems.length, 0, 'La operación obsoleta no se aplica');
  assert.equal(edits, 0, 'No activar subrayados ni prefijos obsoletos');
}

async function testFileCancelAndConfig() {
  let input;
  const settings = new Map([['examinator.config', 'null']]);
  const store = {
    getItem: (key) => settings.get(key) || null,
    setItem: (key, value) => settings.set(key, value),
    removeItem: (key) => settings.delete(key),
    get length() { return settings.size; },
    key: (n) => [...settings.keys()][n]
  };
  const ctx = {
    window: { EXDATA: {} },
    localStorage: store,
    indexedDB: { open() { throw Error('IndexedDB deshabilitada en esta prueba'); } },
    document: {
      createElement: () => {
        const listeners = {};
        input = { type: '', accept: '', files: [], click() {}, addEventListener(type, callback) { listeners[type] = callback; },
          fire(type) { listeners[type](); }, onchange: null };
        return input;
      }
    },
    location: { protocol: 'https:' }, setTimeout, clearTimeout, console,
    Blob, Uint8Array, URL, atob,
    FileReader: class { readAsText(file) { this.result = file.text; this.onload(); } }
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(read('js/shim.js'), ctx, { filename: 'shim.js' });
  const choosing = ctx.window.api.openFile();
  input.fire('cancel');
  assert.equal(await choosing, null, 'Cancelar la elección resuelve sin quedarse pendiente');
  const selected = ctx.window.api.openFile();
  input.files = [{ name: 'Caesar.examen', text: '{"v":1}' }];
  input.onchange();
  const imported = await selected;
  assert.equal(imported.path, 'Caesar.examen');
  assert.equal(imported.text, '{"v":1}');
  const cfg = await ctx.window.api.setConfig({ tamano: 10.5 });
  assert.equal(cfg.tamano, 10.5, 'La configuración null no bloquea la app');
  assert.equal(JSON.parse(settings.get('examinator.config')).tamano, 10.5);
}

(async () => {
  await testStaleAnalysis();
  console.log('OK: análisis/vocabulario obsoletos aislados al cambiar de examen.');
  await testFileCancelAndConfig();
  console.log('OK: importación cancelada y configuración dañada.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
