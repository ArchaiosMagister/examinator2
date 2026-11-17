/* Node 22: filtros docentes de léxico, retrocompatibilidad y listas personalizadas. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
const load = (p) => vm.runInContext(read(p), ctx, { filename: p });
load('js/datos.js');
const previous = Object.fromEntries(['preverbios', 'prefijos', 'evolucion', 'latinismos']
  .map((name) => [name, ctx.EXDATA['/app/data/listas/' + name + '.json']]));
load('js/bancos-datos.js');
load('js/lexico-bancos-datos.js');
load('js/bancos-loader.js');
const source = ctx.EXACADEMIC_SOURCE;
const additional = ctx.EXACADEMIC_LEXICO_SOURCE;
const lists = Object.fromEntries(['preverbios', 'prefijos', 'evolucion', 'latinismos']
  .map((name) => [name, JSON.parse(ctx.EXDATA['/app/data/listas/' + name + '.json'])]));

const oldPreverbs = JSON.parse(previous.preverbios);
const oldPrefixes = JSON.parse(previous.prefijos);
const simple = (s) => String(s || '').split(',')[0].trim().toLowerCase();
const knownPreverbs = new Set(lists.preverbios.map((r) => simple(r.base)));
const knownPrefixes = new Set(lists.prefijos.map((w) => w.toLocaleLowerCase('es')));
const missingPreverbs = oldPreverbs.filter((row) => !knownPreverbs.has(simple(row.base)));
const missingPrefixes = oldPrefixes.filter((w) => !knownPrefixes.has(w.toLocaleLowerCase('es')));
const newByBase = new Map(lists.preverbios.map((row) => [row.base, row]));
const lostBaseRows = oldPreverbs.filter((row) => !newByBase.has(row.base));
console.log('Verbos no coincidentes por enunciado completo: ' + lostBaseRows.length + ' [' + lostBaseRows.map((r) => r.base).join(' | ') + '].');
const lostDerivatives = oldPreverbs.flatMap((row) => {
  const target = newByBase.get(row.base);
  const targetSet = new Set((target?.compuestos || []).map((x) => x.toLocaleLowerCase('es')));
  return row.compuestos.filter((x) => !targetSet.has(x.toLocaleLowerCase('es')))
    .map((x) => simple(row.base) + ': ' + x);
});
console.log('Auditoría de derivados antiguos omitidos por la fuente: ' +
  lostDerivatives.length + ' [' + lostDerivatives.slice(0, 20).join(' | ') + '].');

console.log('Auditoría de originales: ' + oldPreverbs.length + ' preverbios previos, '
  + oldPrefixes.length + ' prefijos previos; ausentes de la copia docente: '
  + missingPreverbs.length + ' preverbios [' + missingPreverbs.map((x) => x.base).slice(0,10).join(' | ') + '], '
  + missingPrefixes.length + ' prefijos [' + missingPrefixes.slice(0,12).join(' | ') + '].');
assert.equal(additional.preverbios.items.length, 120);
assert.equal(additional.prefijos.items.length, 286);
assert.equal(lists.preverbios.length, 120);
assert.equal(lists.prefijos.length, 287); // 286 fuente + Ultrapuertos histórico
assert.equal(lists.evolucion.length, 20);
assert.equal(lists.latinismos.length, 87);
assert.equal(new Set(lists.preverbios.map((x) => x.sourceId)).size, 120);
assert.equal(new Set(lists.latinismos.map((x) => x.number)).size, 87);
assert.deepEqual(lists.latinismos.map((x) => x.number), Array.from({ length: 87 }, (_, i) => i + 1));
assert.ok(lists.preverbios.every((row) => row.base && row.compuestos.length));
assert.ok(lists.prefijos.every((x) => typeof x === 'string' && x.length));
assert.ok(Object.values(previous).every((x) => typeof x === 'string'), 'Se conservan los datos previos');
assert.equal(missingPreverbs.length, 0, 'No se pierde ningún verbo antiguo');
assert.equal(lostDerivatives.length, 0, 'No se pierde ningún derivado preverbial antiguo');
assert.equal(missingPrefixes.length, 0, 'No se pierde ningún prefijo antiguo');
assert.deepEqual(Array.from(ctx.EXACADEMIC_BANKS.legado.prefijos), ['Ultrapuertos']);
assert.ok(lists.prefijos.includes('Ultrapuertos'));
assert.ok(!read('js/bancos-loader.js').includes('fetch('));
assert.ok(!read('js/lexico-bancos-datos.js').includes('fetch('));

const M = {
  lists,
  fold: (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  shuffle: (a) => a.slice().reverse(),
  pick: (a) => a[0],
  $: () => {}, $$: () => [], esc: (v) => String(v)
};
ctx.M = M;
load('js/lexico-filtros.js');
load('js/propose.js');
load('js/lists.js');
const F = M.LexicalFilters, P = M.Propose, LF = M.ListFormat;
assert.equal(F.normas.length, 20);

// Compatibilidad: los exámenes antiguos no tenían campos de filtros.
// Se mantiene su sorteo histórico, con cuatro fenómenos distintos.
const historical = {};
assert.strictEqual(F.evolPool(historical), M.lists.evolucion);
assert.equal(F.latinPool(historical).length, 87);
assert.equal(P.evol(historical), true);
assert.equal(P.latin(historical), true);
assert.equal(historical.evol.length, 4);
assert.equal(historical.latin.length, 4);
assert.equal(new Set(historical.evol.map((x) => M.fold(x.w))).size, 4);
assert.equal(new Set(historical.evol.map((x) => x.g)).size, 4);

// Filtro de normas: se comprueban TODAS las normas de la ficha,
// no sólo aquella bajo la que aparece en la lista de Examinator2.
const select = F.normas.filter((x) => x.id !== 'N02').map((x) => x.id);
const selected = new Set(select);
const filtered = { evolNormas: select, evol: [], latinFilter: null };
assert.equal(P.evol(filtered), true);
assert.equal(filtered.evol.length, 4);
const byName = new Map(F.normas.map((n) => [n.nombre, n.id]));
for (const item of filtered.evol) {
  const norm = byName.get(item.g);
  assert.ok(norm && selected.has(norm));
  const sourceWord = source.fonetica.items.filter((row) => F.key(row.latin) === F.key(item.w));
  assert.ok(sourceWord.some((row) => row.normas.includes(norm) && row.normas.every((n) => selected.has(n))),
    'Etimo con norma no impartida: ' + item.w);
}
for (let i = 0; i < 4; i++) {
  assert.equal(P.evolOne(filtered, i), true);
  assert.equal(new Set(filtered.evol.map((x) => F.key(x.w))).size, 4);
  assert.equal(new Set(filtered.evol.map((x) => x.g)).size, 4);
}
const insufficient = { evolNormas: ['N01', 'N07', 'N17'], evol: [] };
assert.equal(P.evol(insufficient), false, 'Tres normas no pueden producir cuatro fenómenos distintos');

// Las listas personales sin homologación conservan su uso SIN filtros,
// pero no se etiquetan fraudulentamente al restringir normas.
M.lists.evolucion[0].palabras.push('palabrapersonalinventada');
assert.ok(F.evolPool({}).some((g) => g.palabras.includes('palabrapersonalinventada')));
assert.ok(!F.evolPool(filtered).some((g) => g.palabras.includes('palabrapersonalinventada')));
M.lists.evolucion[0].palabras.pop();

// Numeración histórica y selección combinada intervalo/paridad.
const numberFor = (display) => lists.latinismos.find((x) => P.latDisplay(x) === display)?.number;
const latinFiltered = { latinFilter: { desde: 20, hasta: 50, paridad: 'impares', activo: true }, latin: [] };
assert.equal(F.latinPool(latinFiltered).length, 15);
assert.equal(P.latin(latinFiltered), true);
assert.equal(latinFiltered.latin.length, 4);
assert.ok(latinFiltered.latin.every((word) => {
  const n = numberFor(word);
  return n >= 20 && n <= 50 && n % 2 === 1;
}));
for (let i = 0; i < 4; i++) {
  assert.equal(P.latinOne(latinFiltered, i), true);
  assert.equal(new Set(latinFiltered.latin).size, 4);
}
const tooNarrow = { latinFilter: { desde: 1, hasta: 2, paridad: 'pares', activo: true }, latin: [] };
assert.equal(F.latinPool(tooNarrow).length, 1);
assert.equal(P.latin(tooNarrow), false);

// Una lista personal anterior a la introducción de números conserva
// la numeración del repertorio canónico por coincidencia literal.
assert.equal(F.latinNumber({ termino: 'a posteriori' }), 1);
assert.equal(F.latinNumber({ termino: 'a priori' }), 2);
M.lists.latinismos.push({ termino: 'facultas docendi', expl: 'ejemplo propio' });
assert.equal(F.customLatinCount(), 1);
assert.ok(F.latinPool({}).some((x) => x.termino === 'facultas docendi'));
assert.ok(!F.latinPool(latinFiltered).some((x) => x.termino === 'facultas docendi'));
M.lists.latinismos.pop();

// El editor sigue siendo texto libre y la numeración se puede editar.
// Un round trip no pierde los IDs de normas ni de preverbios.
const latinText = LF.toText('latinismos', lists.latinismos);
assert.match(latinText, /^1\. a posteriori/m);
const latinRoundtrip = LF.fromText('latinismos', latinText + '\nfacultas docendi', lists.latinismos);
assert.equal(latinRoundtrip[0].number, 1);
assert.equal(latinRoundtrip[1].number, 2);
assert.equal(latinRoundtrip.at(-1).number, undefined);
assert.equal(latinRoundtrip[0].expl, source.latinismos.items[0].answer);
const oldPlain = LF.fromText('latinismos', 'a posteriori\na priori', [
  { termino: 'a posteriori', expl: 'personal' }, { termino: 'a priori', expl: 'personal' }
]);
assert.equal(oldPlain[0].number, 1);
assert.equal(oldPlain[0].expl, 'personal');
const customNumber = LF.fromText('latinismos', '88. facultas docendi', []);
assert.equal(customNumber[0].number, 88);
const evolRoundtrip = LF.fromText('evolucion', LF.toText('evolucion', lists.evolucion), lists.evolucion);
assert.equal(evolRoundtrip[0].id, lists.evolucion[0].id);
const verbRoundtrip = LF.fromText('preverbios', LF.toText('preverbios', lists.preverbios), lists.preverbios);
assert.equal(verbRoundtrip[0].sourceId, lists.preverbios[0].sourceId);
assert.equal(verbRoundtrip[0].compuestos.length, lists.preverbios[0].compuestos.length);

const html = read('index.html'), sw = read('sw.js');
for (const path of ['js/lexico-bancos-datos.js', 'js/lexico-filtros.js']) {
  assert.ok(html.includes('<script src="' + path + '"></script>'));
  assert.ok(sw.includes('./' + path), 'Nuevo recurso no precargado: ' + path);
}
assert.ok(html.indexOf('js/lexico-bancos-datos.js') < html.indexOf('js/bancos-loader.js'));
assert.ok(html.indexOf('js/lexico-filtros.js') < html.indexOf('js/propose.js'));
assert.ok(!sw.includes('raw.githubusercontent.com'));
assert.match(read('js/exam.js'), /data-act="evolFilter"/);
assert.match(read('js/exam.js'), /data-act="latinFilter"/);
console.log('OK: 120 preverbios, 286 prefijos, 655 étimos, 87 latinismos, normas, intervalos, paridad y compatibilidad.');
