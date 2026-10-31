/* shim.js — Examinator en el navegador: sistema de archivos en memoria (con IndexedDB y
   localStorage), puente con el motor y sustitutos de las funciones de escritorio. */
'use strict';
(function () {
  const DATA = window.EXDATA || {};
  const mem = new Map();           // archivos escritos por el programa
  const LS = 'examinator.fs:';
  const isText = (p) => p.startsWith('/datos/textos/');
  // --- persistencia ---
  let db = null;
  function idb() {
    return new Promise((res) => {
      try {
        const r = indexedDB.open('examinator', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('fs');
        r.onsuccess = () => res(r.result); r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  }
  function persist(p, v) {
    if (isText(p)) {
      if (!db) return;
      try { const tx = db.transaction('fs', 'readwrite'); const st = tx.objectStore('fs'); if (v == null) st.delete(p); else st.put(v, p); } catch (e) { /* */ }
    } else {
      try { if (v == null) localStorage.removeItem(LS + p); else localStorage.setItem(LS + p, v); } catch (e) { /* */ }
    }
  }
  async function preload() {
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LS)) mem.set(k.slice(LS.length), localStorage.getItem(k)); } } catch (e) { /* */ }
    db = await idb();
    if (!db) return;
    await new Promise((res) => {
      try {
        const tx = db.transaction('fs', 'readonly'); const st = tx.objectStore('fs');
        const rq = st.openCursor();
        rq.onsuccess = () => { const c = rq.result; if (c) { mem.set(c.key, c.value); c.continue(); } else res(); };
        rq.onerror = () => res();
      } catch (e) { res(); }
    });
  }
  // --- módulos que el motor espera ---
  const norm = (p) => { const out = []; for (const s of String(p).split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); } return '/' + out.join('/'); };
  const path = { join: (...a) => norm(a.join('/')), dirname: (p) => norm(p + '/..'), resolve: (...a) => norm(a.join('/')), basename: (p) => String(p).split('/').pop() };
  const enoent = (p) => { const e = new Error('ENOENT: ' + p); e.code = 'ENOENT'; return e; };
  const fs = {
    existsSync: (p) => { p = norm(p); if (mem.has(p) || p in DATA) return true; const d = p + '/'; for (const k of mem.keys()) if (k.startsWith(d)) return true; for (const k in DATA) if (k.startsWith(d)) return true; return false; },
    readFileSync: (p) => { p = norm(p); if (mem.has(p)) return mem.get(p); if (p in DATA) return DATA[p]; throw enoent(p); },
    writeFileSync: (p, v) => { p = norm(p); v = String(v); mem.set(p, v); persist(p, v); },
    unlinkSync: (p) => { p = norm(p); if (!mem.has(p)) throw enoent(p); mem.delete(p); persist(p, null); },
    mkdirSync: () => {},
    readdirSync: (p) => { const d = norm(p) + '/'; const s = new Set(); for (const k of Array.from(mem.keys()).concat(Object.keys(DATA))) if (k.startsWith(d)) s.add(k.slice(d.length).split('/')[0]); return Array.from(s); }
  };
  let handler = null;
  const pending = new Map(); const listeners = new Map(); let seq = 0;
  const parentPort = {
    on: (ev, f) => { if (ev === 'message') handler = f; },
    postMessage: (m) => {
      if (m.type === 'reply') { const p = pending.get(m.id); if (p) { pending.delete(m.id); if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result); } }
      else if (m.type === 'event') { const s = listeners.get(m.name); if (s) for (const f of s) { try { f(m.data); } catch (e) { console.error(e); } } }
    }
  };
  window.EXMODULES = { fs, path, worker_threads: { parentPort, workerData: { appDir: '/app', dataRoot: '/datos' } } };
  const ready = preload();
  window.EXREADY = ready;

  // --- descargas ---
  function download(name, data, encoding, type) {
    let blob;
    if (encoding === 'base64') { const bin = atob(data); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); blob = new Blob([u], { type: type || 'application/octet-stream' }); }
    else blob = new Blob([data], { type: type || 'text/plain;charset=utf-8' });
    const go = (href) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { if (href.startsWith('blob:')) URL.revokeObjectURL(href); a.remove(); }, 2000); };
    // abierta como archivo local, el navegador no respeta el nombre de un blob: se usa una URL data:
    if (location.protocol === 'file:') { const r = new FileReader(); r.onload = () => go(r.result); r.readAsDataURL(blob); }
    else go(URL.createObjectURL(blob));
  }
  const cfgGet = () => { try { return JSON.parse(localStorage.getItem('examinator.config') || '{}'); } catch (e) { return {}; } };
  window.api = {
    web: true,
    call: async (method, args) => {
      await ready;
      await new Promise((r) => setTimeout(r, 20)); // deja pintar la interfaz antes de calcular
      return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); handler({ type: 'call', id, method, args }); });
    },
    on: (name, f) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(f); },
    getConfig: async () => cfgGet(),
    setConfig: async (patch) => { const c = Object.assign(cfgGet(), patch); try { localStorage.setItem('examinator.config', JSON.stringify(c)); } catch (e) { /* */ } return c; },
    saveFile: async ({ defaultName, data, encoding }) => { download(defaultName, data, encoding, /\.docx$/.test(defaultName) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : null); return null; },
    openFile: () => new Promise((resolve) => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.examen,.json';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return resolve(null); const r = new FileReader(); r.onload = () => resolve({ path: f.name, text: r.result }); r.readAsText(f); };
      inp.click();
    }),
    makePdf: async ({ html }) => {
      // se abre el diálogo de impresión del navegador: «Guardar como PDF»
      const fr = document.createElement('iframe');
      fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(fr);
      fr.srcdoc = html.replace('<head>', '<head><base href="' + location.href.replace(/[^/]*$/, '') + '">');
      await new Promise((r) => { fr.onload = r; });
      try { await fr.contentDocument.fonts.ready; } catch (e) { /* */ }
      fr.contentWindow.focus(); fr.contentWindow.print();
      setTimeout(() => fr.remove(), 60000);
      return null;
    },
    showFile: async () => {}, openPath: async () => {},
    info: async () => ({ version: '1.0.0', userData: 'navegador', dataRoot: 'navegador' })
  };
})();
