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
    const oldCache = 'examinator2-v2-bancos-20261117';
    const cacheData = new Map([[oldCache, new Map([['versión anterior', true]])]]);
    const stagedRequests = [];
    const hits = new Map();
    let activeFetches = 0, peakFetches = 0;
    const workerCtx = {
      URL, Date, console, setTimeout: (fn) => fn(),
      Request: class {
        constructor(url, options) { this.url = url; this.cache = options.cache; }
      },
      Response: { error() { return 'not-found'; } },
      caches: {
        open: async (name) => {
          if (!cacheData.has(name)) cacheData.set(name, new Map());
          return {
            async put(url, response) { cacheData.get(name).set(url, response); }
          };
        },
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
      fetch: async (request) => {
        activeFetches++;
        peakFetches = Math.max(peakFetches, activeFetches);
        stagedRequests.push(request);
        hits.set(request.url, (hits.get(request.url) || 0) + 1);
        try {
          if (fail && request.url.endsWith('/js/motor.js')) return { ok: false, status: 404 };
          // Un fallo transitorio de Pages se debe reintentar.
          if (!fail && request.url.endsWith('/styles.css') && hits.get(request.url) === 1) {
            return { ok: false, status: 503 };
          }
          return { ok: true, status: 200 };
        } finally {
          activeFetches--;
        }
      }
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
    return { cacheData, answer, stagedRequests, hits, peakFetches, oldCache };
  }
  const success = await simulateRefresh(false);
  assert.equal(success.answer.ok, true);
  assert.ok(success.stagedRequests.length >= 25);
  assert.ok(success.stagedRequests.every((x) => x.cache === 'reload'));
  assert.equal(success.peakFetches, 1, 'Evitar las peticiones simultáneas que saturan Pages');
  assert.equal(success.hits.get('https://example.org/examinator2/styles.css'), 2, 'Reintentar HTTP 503');
  assert.ok(!success.cacheData.has(success.oldCache));
  assert.ok([...success.cacheData.keys()].some((k) => k.includes('manual-')));
  const failure = await simulateRefresh(true);
  assert.equal(failure.answer.ok, false);
  assert.ok(failure.answer.error.includes('js/motor.js'));
  assert.ok(failure.answer.error.includes('HTTP 404'), 'Identificar el recurso que falla');
  assert.equal(failure.hits.get('https://example.org/examinator2/js/motor.js'), 3);
  assert.deepEqual([...failure.cacheData.keys()], [failure.oldCache], 'La caché anterior permanece intacta');

  assert.ok(!read('js/pwa.js').includes('localStorage.clear('));
  assert.ok(!read('sw.js').includes('indexedDB.deleteDatabase'));
  console.log('OK: actualización íntegra, recuperación si falla, guardado antes de recarga y PWA offline.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
