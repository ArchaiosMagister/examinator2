/* iPad: selección conservada al tocar el botón del lector. Sin dependencias DOM. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/library.js'), 'utf8');

function elem(initialClasses = []) {
  const states = new Set(initialClasses);
  return {
    dataset: {}, listeners: {}, textContent: '', innerHTML: '', disabled: false,
    classList: {
      contains: (s) => states.has(s),
      add: (s) => states.add(s),
      remove: (s) => states.delete(s)
    },
    addEventListener(type, f) { (this.listeners[type] ||= []).push(f); },
    appendChild(x) { (this.children ||= []).push(x); },
    scrollTop: 0
  };
}

const panel = elem(['hidden']);
const reader = elem(), hint = elem(), useButton = elem(), title = elem(),
  genre = elem(), search = elem(), only = elem(), jump = elem(), progress = elem(), list = elem();
useButton.dataset.act = 'use';
const nodes = new Map([
  ['#lib', panel], ['.rtext', reader], ['#lib .rtext', reader], ['.rsel', hint], ['[data-act=use]', useButton],
  ['.rt', title], ['.lg', genre], ['.lf', search], ['.lonly', only],
  ['.rgo', jump], ['.lprog', progress], ['.llist', list]
]);
const docs = {};
let currentSelection = { isCollapsed: true, rangeCount: 0 };
let work = null;
const used = [], toasts = [], calls = [];
const bookList = [
  { i: 0, urn: 'phi0620.test', author: 'Julio César', title: 'Bellum', latin: 'Bellum',
    genre: 'historia', have: true, builtin: true },
  { i: 1, urn: 'phi0690.phi003.perseus-lat2', author: 'Virgilio', title: 'Aeneis',
    latin: 'Aeneis', genre: 'epopeya', have: true, builtin: true }
];
const works = {
  'phi0620.test': { levels: ['libro', 'capítulo'], lines: [
    { c: '1.1', t: 'Gallia est omnis', k: 'l' },
    { c: '1.2', t: 'divisa in partes', k: 'l' },
    { c: '1.3', t: 'tres in Europa', k: 'l' }
  ] },
  'phi0690.phi003.perseus-lat2': { levels: ['libro', 'verso'], lines: [
    { c: '4.1', t: 'At regina gravi', k: 'l' },
    { c: '4.2', t: 'iamdudum saucia', k: 'l' }
  ] }
};
const ctx = {
  console, setTimeout, clearTimeout, Intl,
  document: {
    addEventListener(type, cb) { (docs[type] ||= []).push(cb); },
    createDocumentFragment() { return { children: [], appendChild(x) { this.children.push(x); } }; },
    createRange() {
      return {
        selectNodeContents(rx) { this.rx = rx; this.start = 0; this.end = rx.textContent.length; },
        setStart(node, offset) { this.start = offset; },
        setEnd(node, offset) { this.end = offset; },
        toString() { return this.rx.textContent.slice(this.start, this.end); }
      };
    }
  },
  M: {
    $: (selector, base) => {
      if (selector === '.rx' && base?.rx) return base.rx;
      if (selector === '.spk') return null;
      return nodes.get(selector) || null;
    },
    $$: (selector, base) => selector === '.rl' && base === reader ? reader.children || [] : [],
    el(tag, attrs = {}) {
      if (attrs['data-k'] !== undefined) {
        const d = elem();
        d.dataset.k = String(attrs['data-k']);
        d.dataset.c = attrs['data-c'];
        const line = work.lines[Number(attrs['data-k'])];
        d.rx = { textContent: line.t, contains(node) { return node === this; } };
        return d;
      }
      return elem();
    },
    esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    }[c])),
    fold: (s) => String(s).toLowerCase(),
    debounce: (fn) => fn,
    Propose: { citeRef: (a, b) => a === b ? a : a + '–' + b },
    call: async (method, args) => {
      calls.push({ method, args });
      if (method === 'catalog') return bookList;
      if (method === 'work') { work = works[args.urn]; return work; }
      throw new Error('No se esperaba llamada a ' + method);
    },
    toast: (s) => toasts.push(s),
    setTextFromLibrary: (d) => used.push(d),
    S: { literatura: null },
    renderEditor() { calls.push({ method: 'renderEditor' }); },
    preview() { calls.push({ method: 'preview' }); },
    persist() { calls.push({ method: 'persist' }); },
    modal() { throw new Error('Modal inesperado'); }
  }
};
ctx.window = ctx;
ctx.window.getSelection = () => currentSelection;
ctx.window.api = { on() {} };
reader.contains = (node) => node === reader || (reader.children || []).some((d) => d === node || d.rx === node);
reader.appendChild = (fragment) => { reader.children = fragment.children; };
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'js/library.js' });

async function clickRow(index) {
  const row = {
    dataset: { i: String(index) },
    closest(selector) { return selector === '.lrow' ? this : null; },
    matches() { return false; }
  };
  await panel.listeners.click[0]({ target: row });
  await new Promise((resolve) => setImmediate(resolve));
}
function dispatchSelectionChange() {
  for (const callback of docs.selectionchange || []) callback();
}
function select(start, end, startOffset, endOffset) {
  const first = reader.children[start].rx, last = reader.children[end].rx;
  const range = {
    commonAncestorContainer: reader,
    startContainer: first,
    startOffset,
    endContainer: last,
    endOffset,
    intersectsNode: (d) => Number(d.dataset.k) >= start && Number(d.dataset.k) <= end
  };
  currentSelection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => range };
}
function collapse() { currentSelection = { isCollapsed: true, rangeCount: 0 }; }
async function clickUse() {
  const b = { closest: (selector) => selector === '[data-act]' ? useButton : null };
  await panel.listeners.click[0]({ target: b });
}

(async () => {
  await ctx.M.openLibrary();
  assert.ok(panel.dataset.built, 'Biblioteca construida');
  assert.equal(useButton.disabled, false, 'El botón debe ser tocable antes de selectionchange');
  assert.ok(useButton.classList.contains('no-selection'));
  await clickRow(0);
  assert.equal(reader.children.length, 3);
  assert.equal(useButton.disabled, false);
  assert.ok(useButton.classList.contains('no-selection'));

  // Selección nativa de iPad: al tocar el botón el Range se contrae.
  select(0, 1, 1, 14);
  dispatchSelectionChange();
  assert.equal(useButton.disabled, false);
  assert.ok(!useButton.classList.contains('no-selection'));
  assert.match(hint.textContent, /Selección: 1\.1–1\.2/);
  for (const eventName of ['pointerdown', 'touchstart']) {
    assert.ok(useButton.listeners[eventName].length, eventName + ' captura antes de enfocar el botón');
    useButton.listeners[eventName][0]();
  }
  collapse();
  dispatchSelectionChange();
  assert.equal(useButton.disabled, false, 'El botón no debe deshabilitarse al perder el foco');
  await clickUse();
  assert.equal(used.length, 1, 'Fragmento añadido al examen');
  assert.equal(used[0].text, 'allia est omnis\ndivisa in part');
  assert.equal(used[0].cita, '1.1–1.2');
  assert.equal(used[0].urn, 'phi0620.test');
  assert.equal(panel.classList.contains('hidden'), true);

  // Una obra nueva no hereda una selección de otra.
  await ctx.M.openLibrary();
  await clickRow(0);
  select(0, 0, 0, 6);
  dispatchSelectionChange();
  assert.equal(useButton.disabled, false);
  await clickRow(1);
  assert.equal(useButton.disabled, false, 'Botón sigue respondiendo en iPad');
  assert.ok(useButton.classList.contains('no-selection'), 'Selección obsoleta invalidada al cambiar de obra');
  collapse();
  await clickUse();
  assert.equal(used.length, 1, 'Nunca insertar fragmentos de una obra anterior');
  assert.ok(toasts.some((x) => x.includes('Selecciona un fragmento')));

  // En iOS no siempre hay evento selectionchange hasta después de touchend.
  select(0, 1, 0, 8);
  assert.ok(useButton.classList.contains('no-selection'));
  reader.listeners.touchend[0]();
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.ok(!useButton.classList.contains('no-selection'), 'touchend captura la selección diferida');

  // Safari también puede no emitir selectionchange antes del toque en «Usar».
  // El botón NO debe estar disabled y el propio touchstart salva el fragmento.
  await ctx.M.openLibrary();
  await clickRow(0);
  select(0, 0, 0, 6);
  assert.ok(useButton.classList.contains('no-selection'));
  useButton.listeners.touchstart[0]();
  assert.ok(!useButton.classList.contains('no-selection'));
  collapse(); dispatchSelectionChange();
  await clickUse();
  assert.equal(used.length, 2, 'Añadir en iPad aunque no llegue selectionchange');
  assert.equal(used[1].text, 'Gallia');

  // La misma corrección debe funcionar en el selector de texto literario.
  await ctx.M.openLibrary('literatura');
  await clickRow(1);
  select(0, 1, 0, 15);
  dispatchSelectionChange();
  collapse(); dispatchSelectionChange();
  await clickUse();
  assert.equal(ctx.M.S.literatura.texto, 'At regina gravi\niamdudum saucia');
  assert.equal(ctx.M.S.literatura.urn, 'phi0690.phi003.perseus-lat2');
  assert.ok(calls.some((x) => x.method === 'renderEditor'));
  assert.ok(calls.some((x) => x.method === 'preview'));

  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(css, /\.rtext \{[^}]*-webkit-user-select: text;/);
  assert.match(css, /\.rtext \.rx \{[^}]*user-select: text;/);
  assert.match(css, /\[data-act=use\]\.no-selection \{[^}]*opacity:/);
  console.log('OK: selección en iPad, pérdida de foco, touchend, cambio de obra y texto literario.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
