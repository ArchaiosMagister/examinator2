/* util.js — utilidades de la interfaz */
'use strict';
const M = window.M = {};
M.$ = (s, r) => (r || document).querySelector(s);
M.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
M.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
M.el = function (tag, attrs, html) {
  const e = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
  }
  if (html !== undefined) e.innerHTML = html;
  return e;
};
M.debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
M.fmt = (n) => Number(n || 0).toLocaleString('es-ES');

M.call = async function (method, args) {
  try { return await window.api.call(method, args); }
  catch (e) {
    const msg = String(e && e.message || e).replace(/^Error invoking remote method 'call': (Error: )?/, '');
    throw new Error(msg);
  }
};

M.toast = function (msg, ms) {
  const t = M.el('div', { class: 'toast' }); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms || 2600);
};

M.modal = function (title, bodyHtml, buttons, opts) {
  opts = opts || {};
  const bg = M.el('div', { class: 'modal-bg' });
  const m = M.el('div', { class: 'modal' });
  if (opts.width) m.style.width = opts.width;
  m.innerHTML = `<div class="mh"><h2></h2><button class="xbtn" title="Cerrar">×</button></div><div class="mb"></div><div class="mf"></div>`;
  M.$('h2', m).textContent = title;
  const body = M.$('.mb', m);
  if (typeof bodyHtml === 'string') body.innerHTML = bodyHtml; else if (bodyHtml) body.appendChild(bodyHtml);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  M.$('.xbtn', m).onclick = close;
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  const foot = M.$('.mf', m);
  for (const b of (buttons || [])) {
    const btn = M.el('button', { class: 'hbtn' + (b.primary ? ' primary' : '') }); btn.textContent = b.label;
    btn.onclick = async () => { const r = b.onclick ? await b.onclick(body, close) : undefined; if (r !== false) close(); };
    foot.appendChild(btn);
  }
  if (!buttons || !buttons.length) foot.remove();
  bg.appendChild(m); document.body.appendChild(bg);
  const first = M.$('input,select,textarea', body); if (first && !opts.noFocus) setTimeout(() => first.focus(), 30);
  return { body, close, el: m };
};

M.store = {
  get(k, d) { try { const v = localStorage.getItem('examinator.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('examinator.' + k, JSON.stringify(v)); } catch (e) { /* */ } }
};

M.shortList = (names, n) => { n = n || 3; return names.length > n ? names.slice(0, n).join(', ') + ` y ${names.length - n} más` : names.join(', '); };

M.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
M.pick = (a) => a[Math.floor(Math.random() * a.length)];
M.fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
M.roman = (n) => { n = +n; if (!(n > 0 && n < 4000)) return String(n); const r = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let o = ''; for (const [v, s] of r) while (n >= v) { o += s; n -= v; } return o; };
