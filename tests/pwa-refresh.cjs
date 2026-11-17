/* node tests/pwa-refresh.cjs: actualización segura y sin pérdida del examen */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

(async () => {
  const html = read('index.html');
  assert.match(html, /id="btnUpdate"/);
  assert.ok(html.indexOf('id="btnUpdate"') < html.indexOf('id="btnPdf"'));

  // Probar el clic real contra el gestor de instalación, con una simulación
  // de mensajes MessageChannel y sin acceso al navegador/red.
  const clicks = {};
  const order = [];
  const notices = [];
  const installButton = {
    classList: { add() {}, remove() {} },
    addEventListener(name, fn) { clicks['install:' + name] = fn; }
  };
  const updateButton = {
    textContent: 'Actualizar', disabled: false,
    addEventListener(name, fn) { clicks['update:' + name] = fn; }
  };
  let checks = 0, posts = 0, succeed = true;
  const worker = {
    state: 'activated',
    postMessage(message, ports) {
      assert.equal(message.type, 'REFRESH_OFFLINE');
      posts++;
      ports[0].postMessage(succeed ? { ok: true, count: 31 } : { ok: false, error: 'Descarga incompleta' });
    }
  };
  const registration = {
    active: worker, installing: null, waiting: null,
    async update() { checks++; }
  };
  class FakeMessageChannel {
    constructor() {
      this.port1 = { onmessage: null, close() {} };
      this.port2 = {
        postMessage: (data) => this.port1.onmessage?.({ data }),
        close() {}
      };
    }
  }
  const ctx = {
    console, setTimeout, clearTimeout,
    MessageChannel: FakeMessageChannel,
    navigator: {
      onLine: true, standalone: false, userAgent: 'Firefox test',
      serviceWorker: {
        controller: worker,
        getRegistration: async () => registration,
        register: async () => registration,
        addEventListener() {}
      }
    },
    document: {
      getElementById(id) { return id === 'btnInstall' ? installButton : id === 'btnUpdate' ? updateButton : null; }
    },
    location: {
      protocol: 'https:',
      reload() { order.push('reload'); }
    },
    matchMedia() { return { matches: false }; },
    addEventListener() {},
    M: { S: { texto: 'Gallia est omnis divisa.', hueco: 1.25 }, toast(msg) { notices.push(msg); } },
    localStorage: {
      setItem(key, value) {
        assert.equal(key, 'examinator.current');
        assert.equal(JSON.parse(value).texto, 'Gallia est omnis divisa.');
        assert.equal(JSON.parse(value).hueco, 1.25);
        order.push('save');
      }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/pwa.js'), ctx, { filename: 'js/pwa.js' });
  assert.equal(typeof clicks['update:click'], 'function');
  await clicks['update:click']();
  assert.equal(checks, 1);
  assert.equal(posts, 1);
  assert.deepEqual(order, ['save', 'reload']);
  assert.equal(updateButton.disabled, false);
  assert.equal(updateButton.textContent, 'Actualizar');

  // Sin conexión: no tocar los datos ni recargar.
  ctx.navigator.onLine = false;
  await clicks['update:click']();
  assert.equal(checks, 1);
  assert.equal(posts, 1);
  assert.deepEqual(order, ['save', 'reload']);
  assert.ok(notices.some((n) => n.includes('Conéctate a internet')));

  // Si falla el worker, no recargar el examen ni afirmar éxito.
  ctx.navigator.onLine = true;
  succeed = false;
  await clicks['update:click']();
  assert.equal(checks, 2);
  assert.equal(posts, 2);
  assert.deepEqual(order, ['save', 'reload']);
  assert.ok(notices.some((n) => n.includes('No se pudo actualizar')));

  // Comprobar en el propio service worker que sólo se borran cachés antiguas
  // después de completar íntegramente la descarga y no se toca IndexedDB.
  async function simulateRefresh(fail) {
    const callbacks = {};
    const cacheData = new Map([['examinator2-v2-bancos-20261117', ['versión anterior']]]);
    let stagedRequests = [];
    const workerCtx = {
      URL, Date, console,
      Request: class {
        constructor(url, options) { this.url = url; this.cache = options.cache; }
      },
      Response: { error() { return 'not-found'; } },
      caches: {
        open: async (name) => ({
          async addAll(requests) {
            stagedRequests = requests;
            if (fail) throw new Error('No se pudo descargar js/motor.js');
            cacheData.set(name, requests.map((req) => req.url));
          },
          async put() {}
        }),
        keys: async () => [...cacheData.keys()],
        delete: async (name) => cacheData.delete(name),
        match: async () => null
      },
      self: {
        registration: { scope: 'https://example.org/examinator2/' },
        location: { origin: 'https://example.org' },
        addEventListener(name, listener) { callbacks[name] = listener; },
        skipWaiting: async () => {},
        clients: { claim: async () => {} }
      },
      fetch: async () => { throw new Error('Sin conexión'); }
    };
    vm.createContext(workerCtx);
    vm.runInContext(read('sw.js'), workerCtx, { filename: 'sw.js' });
    let answer, task;
    callbacks.message({
      data: { type: 'REFRESH_OFFLINE' },
      ports: [{ postMessage(data) { answer = data; } }],
      waitUntil(promise) { task = promise; }
    });
    await task;
    return { cacheData, answer, stagedRequests };
  }
  const success = await simulateRefresh(false);
  assert.equal(success.answer.ok, true);
  assert.ok(success.stagedRequests.length >= 25);
  assert.ok(success.stagedRequests.every((x) => x.cache === 'reload'));
  assert.ok(!success.cacheData.has('examinator2-v2-bancos-20261117'));
  assert.ok([...success.cacheData.keys()].some((k) => k.includes('manual-')));
  const failure = await simulateRefresh(true);
  assert.equal(failure.answer.ok, false);
  assert.ok(failure.answer.error.includes('js/motor.js'));
  assert.deepEqual([...failure.cacheData.keys()], ['examinator2-v2-bancos-20261117']);

  assert.ok(!read('js/pwa.js').includes('localStorage.clear('));
  assert.ok(!read('sw.js').includes('indexedDB.deleteDatabase'));
  console.log('OK: actualización íntegra, recuperación si falla, guardado antes de recarga y PWA offline.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
