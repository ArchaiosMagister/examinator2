/* node tests/pwa-banks.cjs — pruebas de bancos locales, PWA y sorteo fonético */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some((x) => x.sizes === '512x512')); 
assert.ok(manifest.icons.some((x) => x.sizes === '192x192' && x.src === 'icon-192.png'));
assert.ok(fs.existsSync(path.join(root, 'icon-192.png')));
const iconSvg = read('icono.svg');
assert.match(iconSvg, /viewBox="0 0 512 512"/);
assert.match(iconSvg, /fill="#075366"/); // paleta original de Examinator
for (const [name, size] of [['icon-192.png', 192], ['icon.png', 512]]) {
  const buf = fs.readFileSync(path.join(root, name));
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name + ': cabecera PNG');
  assert.equal(buf.readUInt32BE(16), size, name + ': ancho');
  assert.equal(buf.readUInt32BE(20), size, name + ': alto');
  assert.equal(buf[24], 2, name + ': paleta PNG');
  assert.equal(buf[25], 3, name + ': PNG indexado');
  let position = 8;
  const idat = [];
  while (position < buf.length) {
    const length = buf.readUInt32BE(position);
    const type = buf.subarray(position + 4, position + 8).toString('ascii');
    if (type === 'IDAT') idat.push(buf.subarray(position + 8, position + 8 + length));
    position += length + 12;
  }
  assert.ok(idat.length, name + ': datos IDAT');
  assert.equal(zlib.inflateSync(Buffer.concat(idat)).length, size * (Math.ceil(size / 4) + 1), name + ': zlib PNG íntegro');
}
assert.match(html, /rel="apple-touch-icon" href="icon.png"/);
const sw = read('sw.js');
for (const file of ['index.html', 'js/datos.js', 'js/incluidos.js', 'js/bancos-datos.js',
  'js/lexico-bancos-datos.js', 'js/bancos-loader.js', 'js/lexico-filtros.js', 'js/motor.js', 'js/shim.js', 'js/pwa.js', 'lib/jszip.min.js']) {
  assert.ok(sw.includes(file), 'Falta en caché: ' + file);
  assert.ok(fs.existsSync(path.join(root, file)), 'Archivo ausente: ' + file);
}
assert.match(html, /rel="manifest"/);
assert.ok(html.indexOf('js/datos.js') < html.indexOf('js/bancos-datos.js'));
assert.ok(html.indexOf('js/lexico-bancos-datos.js') < html.indexOf('js/bancos-loader.js'));
assert.ok(html.indexOf('js/bancos-loader.js') < html.indexOf('js/shim.js'));
assert.ok(html.indexOf('js/lexico-filtros.js') < html.indexOf('js/propose.js'));
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('js/datos.js'), ctx);
const prevDefault = ctx.EXDATA['/app/data/listas/preverbios.json'];
const prefDefault = ctx.EXDATA['/app/data/listas/prefijos.json'];
vm.runInContext(read('js/bancos-datos.js'), ctx);
vm.runInContext(read('js/lexico-bancos-datos.js'), ctx);
const source = ctx.EXACADEMIC_SOURCE;
const additional = ctx.EXACADEMIC_LEXICO_SOURCE;
assert.equal(additional.preverbios.items.length, 120);
assert.equal(additional.prefijos.items.length, 286);
assert.equal(source.fonetica.items.length, 655);
assert.equal(source.fonetica.normas.length, 20);
assert.equal(source.latinismos.items.length, 87);
assert.equal(new Set(source.fonetica.items.map((x) => x.id)).size, 655);
assert.ok(source.fonetica.items.every((x) => x.estado === 'APTO_PROPUESTO'));
vm.runInContext(read('js/bancos-loader.js'), ctx);
const dirs = ctx.EXDATA;
assert.notEqual(dirs['/app/data/listas/preverbios.json'], prevDefault);
assert.notEqual(dirs['/app/data/listas/prefijos.json'], prefDefault);
const preverbs = JSON.parse(dirs['/app/data/listas/preverbios.json']);
const prefixes = JSON.parse(dirs['/app/data/listas/prefijos.json']);
assert.equal(preverbs.length, 120);
assert.equal(prefixes.length, 286);
assert.equal(preverbs[0].base, additional.preverbios.items[0].enunciado);
assert.equal(preverbs[0].sourceId, additional.preverbios.items[0].id);
assert.deepEqual(Array.from(preverbs[0].compuestos), Array.from(additional.preverbios.items[0].derivatives));
assert.equal(prefixes[0], additional.prefijos.items[0].prompt);
const ev = JSON.parse(dirs['/app/data/listas/evolucion.json']);
const lat = JSON.parse(dirs['/app/data/listas/latinismos.json']);
assert.equal(ev.length, 20);
assert.ok(ev.every((g) => g.nombre && g.palabras.length));
assert.equal(lat.length, 87);
assert.equal(lat[0].termino, 'a posteriori');
assert.ok(lat.every((x) => x.expl && Number.isInteger(x.number)));
assert.equal(lat[0].number, 1);
assert.equal(lat[86].number, 87);
assert.ok(ev.every((g) => /^N(?:0[1-9]|1[0-9]|20)$/.test(g.id)));
const M = {
  lists: { evolucion: ev, latinismos: lat, preverbios: preverbs, prefijos: prefixes },
  fold: (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  shuffle: (a) => a.slice().reverse(),
  pick: (a) => a[0]
};
ctx.M = M;
vm.runInContext(read('js/lexico-filtros.js'), ctx);
vm.runInContext(read('js/propose.js'), ctx);
const S = { evol: [] };
M.Propose.evol(S);
assert.equal(S.evol.length, 4);
assert.equal(new Set(S.evol.map((x) => x.g)).size, 4);
assert.equal(new Set(S.evol.map((x) => M.fold(x.w))).size, 4);
for (let i = 0; i < 4; i++) {
  M.Propose.evolOne(S, i);
  assert.equal(new Set(S.evol.map((x) => x.g)).size, 4);
  assert.equal(new Set(S.evol.map((x) => M.fold(x.w))).size, 4);
}
assert.ok(!sw.includes('raw.githubusercontent.com'));
assert.ok(!read('js/bancos-loader.js').includes('fetch('));
console.log('OK: PWA, precarga, 655 fichas fonéticas, 87 latinismos y sorteo sin repeticiones.');
