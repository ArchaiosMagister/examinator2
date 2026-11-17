/* library.js — biblioteca de Perseus latín: descarga, lectura y elección del fragmento */
'use strict';
(function () {
  const { $, $$, el, esc } = M;
  const P = M.Propose;
  let cat = null, st = { f: '', g: '', only: false, sel: new Set() }, cur = null, busy = false;
  let target = 'texto';
  // Safari iPad puede contraer la selección al tocar un botón.
  // Guardamos una copia INDEPENDIENTE del Range antes de que pierda el foco.
  let savedSelection = null;
  const literature = new Map([
    ['phi0119.phi012.perseus-lat2', ''],
    ['phi0690.phi003.perseus-lat2', '4.'],
    ['phi0959.phi002.perseus-lat2', '1.']
  ]);

  M.openLibrary = async function (destination) {
    target = destination === 'literatura' ? destination : 'texto';
    cur = null;
    savedSelection = null;
    const box = $('#lib');
    box.classList.remove('hidden');
    box.dataset.mobilePane = 'catalog';
    await loadCatalog();
    if (!box.dataset.built) build(box);
    $('.rtext', box).innerHTML = '';
    $('.rt', box).textContent = target === 'literatura' ? 'Elige una obra: Miles Gloriosus, Eneida IV o Heroida I.' : 'Elige una obra para leerla.';
    clearSelection();
    drawList();
  };
  function close() { savedSelection = null; $('#lib').classList.add('hidden'); }
  async function loadCatalog() { cat = await M.call('catalog'); }

  function build(box) {
    box.dataset.built = '1';
    box.innerHTML = `
      <div class="lhead">
        <b>Biblioteca</b> <span class="muted small">Eutropio, Julio César y las obras de literatura vienen incluidos. Los demás textos de Perseus se pueden descargar para leer sin conexión. Fuentes y licencias: FUENTES.md.</span>
        <span class="spacer"></span><span class="library-switch" aria-label="Vistas de biblioteca"><button type="button" class="hbtn on" data-act="books">Obras</button><button type="button" class="hbtn" data-act="read">Leer</button></span><button class="hbtn" data-act="close">Volver al examen</button>
      </div>
      <div class="lbody">
        <div class="lcat">
          <div class="lfil">
            <input type="text" class="lf" placeholder="Autor u obra…">
            <select class="lg"><option value="">Todos los géneros</option></select>
            <label class="radio small"><input type="checkbox" class="lonly"> solo descargadas</label>
          </div>
          <div class="lacts"><button class="tbtn sm" data-act="dl">Descargar las marcadas</button> <button class="tbtn sm" data-act="del">Eliminar las marcadas</button> <span class="lprog small muted"></span></div>
          <div class="llist"></div>
        </div>
        <div class="lread">
          <div class="rhead"><div class="rt muted">Elige una obra descargada para leerla.</div>
            <div class="row small"><input type="text" class="rgo" placeholder="Ir a… (p. ej. 1.6)" style="width:150px"> <span class="spacer"></span>
            <span class="rsel muted">Selecciona el fragmento (en iPad, mantén pulsado y ajusta los marcadores).</span>
            <button class="hbtn primary" data-act="use">Usar la selección</button></div></div>
          <div class="rtext"></div>
        </div>
      </div>`;
    const genres = Array.from(new Set((cat || []).map((x) => x.genre)));
    $('.lf', box).addEventListener('input', M.debounce((e) => { st.f = e.target.value; drawList(); }, 150));
    $('.lg', box).onchange = (e) => { st.g = e.target.value; drawList(); };
    $('.lonly', box).onchange = (e) => { st.only = e.target.checked; drawList(); };
    $('.rgo', box).addEventListener('keydown', (e) => { if (e.key === 'Enter') goTo(e.target.value.trim()); });
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        const a = b.dataset.act;
        if (a === 'close') close();
        if (a === 'books') { setMobilePane('catalog'); return; }
        if (a === 'read') {
          if (!cur) M.toast('Primero elige una obra para leerla.');
          else setMobilePane('reader');
          return;
        }
        if (a === 'dl') {
          const ids = Array.from(st.sel).filter((i) => !cat[i].have);
          if (!ids.length) { M.toast('Marca primero las obras que quieres descargar.'); return; }
          const r = await M.call('download', { ids });
          if (r.busy) M.toast('Ya hay una descarga en curso.'); else if (r.started) { busy = true; $('.lprog', box).textContent = `Descargando 0 de ${r.total}…`; }
        }
        if (a === 'del') {
          const ids = Array.from(st.sel).filter((i) => cat[i].have);
          if (!ids.length) { M.toast('Marca las obras descargadas que quieres eliminar.'); return; }
          await M.call('deleteTexts', { ids }); st.sel.clear(); await loadCatalog(); drawList();
        }
        if (a === 'use') useSelection();
        return;
      }
      const row = e.target.closest('.lrow');
      if (row && !e.target.matches('input')) { const it = cat[+row.dataset.i]; if (it.have) openWork(it); else M.toast('Primero descarga la obra (márcala y pulsa «Descargar las marcadas»).'); }
    });
    box.addEventListener('change', (e) => {
      if (e.target.matches('.lrow input[type=checkbox]')) { const i = +e.target.closest('.lrow').dataset.i; if (e.target.checked) st.sel.add(i); else st.sel.delete(i); }
    });
    // 'selectionchange' se emite también CUANDO Safari borra la selección
    // al pulsar «Usar». No se descarta la última selección válida por ese motivo.
    document.addEventListener('selectionchange', rememberSelection);
    const reader = $('.rtext', box), btnUse = $('[data-act=use]', box);
    // Capturar ANTES de que el botón provoque pérdida de foco; touchstart
    // sirve de alternativa a pointerdown en versiones antiguas de iPadOS.
    btnUse.addEventListener('pointerdown', rememberSelection);
    btnUse.addEventListener('touchstart', rememberSelection, { passive: true });
    // En WebKit los marcadores táctiles pueden actualizar el Range después
    // de touchend; en escritorio la selección queda lista tras mouseup.
    reader.addEventListener('mouseup', rememberSelection);
    reader.addEventListener('touchend', () => {
      setTimeout(rememberSelection, 0);
      setTimeout(rememberSelection, 100);
    }, { passive: true });
    // Una selección nueva sustituye a la anterior. La copia sigue siendo
    // válida durante el toque del botón, pero no entre obras distintas.
    reader.addEventListener('pointerdown', () => {
      savedSelection = null;
      refreshSelectionHint();
    });
    window.api.on('dl-progress', (d) => { $('.lprog', box).textContent = `Descargando ${d.done} de ${d.total}: ${d.current}`; });
    window.api.on('dl-done', async (d) => {
      busy = false;
      $('.lprog', box).textContent = d.error ? 'Error: ' + d.error : `Descarga terminada${d.errors && d.errors.length ? `: ${d.errors.length} con error` : ''}.`;
      if (d.errors && d.errors.length) M.modal('Obras que no se pudieron descargar', '<ul>' + d.errors.map((x) => `<li>${esc(x.author)}, ${esc(x.title)}: ${esc(x.error)}</li>`).join('') + '</ul><p class="small muted">Comprueba la conexión a internet y vuelve a intentarlo.</p>', [{ label: 'Cerrar', primary: true }]);
      st.sel.clear(); await loadCatalog(); drawList();
    });
    // géneros
    const g = $('.lg', box);
    for (const x of genres.sort()) { const o = el('option', { value: x }); o.textContent = x; g.appendChild(o); }
  }

  function setMobilePane(pane) {
    const box = $('#lib');
    if (!box) return;
    box.dataset.mobilePane = pane;
    for (const btn of $('.library-switch [data-act]', box)) {
      const selected = (pane === 'catalog' && btn.dataset.act === 'books') ||
        (pane === 'reader' && btn.dataset.act === 'read');
      btn.classList.toggle('on', selected);
      btn.setAttribute('aria-pressed', String(selected));
    }
  }

  function drawList() {
    const box = $('#lib .llist'); if (!box || !cat) return;
    const f = M.fold(st.f);
    const coll = new Intl.Collator('es', { sensitivity: 'base' });
    const items = cat.filter((it) => target === 'literatura' ? literature.has(it.urn) : ((!st.only || it.have) && (!st.g || it.genre === st.g) && (!f || M.fold(it.author + ' ' + it.title + ' ' + it.latin).includes(f))))
      .sort((a, b) => coll.compare(a.author, b.author) || coll.compare(a.title, b.title));
    box.innerHTML = items.map((it) => `<div class="lrow ${it.have ? 'have' : ''} ${cur && cur.urn === it.urn ? 'cur' : ''}" data-i="${it.i}">
      <input type="checkbox" ${st.sel.has(it.i) ? 'checked' : ''}>
      <div class="li"><div><b>${esc(it.author)}</b> · ${esc(it.title)}</div><div class="small muted"><i>${esc(it.latin)}</i> · ${esc(it.genre)}</div></div>
      ${it.builtin ? '<span class="badge have">incluida</span>' : it.have ? '<span class="badge have">descargada</span>' : ''}</div>`).join('') || '<div class="muted small" style="padding:12px">No hay obras con ese filtro.</div>';
  }

  async function openWork(it) {
    const box = $('#lib');
    cur = null;
    clearSelection();
    $('.rtext', box).innerHTML = '<div class="muted" style="padding:20px">Cargando…</div>';
    const w = await M.call('work', { urn: it.urn });
    if (target === 'literatura') w.lines = w.lines.filter((line) => line.k !== 'h' && (!literature.get(it.urn) || line.c.startsWith(literature.get(it.urn))));
    cur = { urn: it.urn, author: it.author, title: it.title, latin: it.latin, levels: w.levels, lines: w.lines };
    $('.rt', box).innerHTML = `<b>${esc(it.author)}</b>, <i>${esc(it.latin)}</i> <span class="muted small">· ${esc(it.title)} · ${esc((w.levels || []).join(' / '))}</span>`;
    const frag = document.createDocumentFragment();
    let prev = '';
    w.lines.forEach((L, k) => {
      const d = el('div', { class: 'rl' + (L.k === 'h' ? ' rh' : ''), 'data-k': k, 'data-c': L.c });
      const show = L.c !== prev; prev = L.c;
      d.innerHTML = `<span class="rc">${show ? esc(L.c) : ''}</span><span class="rx">${L.s ? `<span class="spk">${esc(L.s)}</span> ` : ''}${esc(L.t)}</span>`;
      frag.appendChild(d);
    });
    const rt = $('.rtext', box); rt.innerHTML = ''; rt.appendChild(frag); rt.scrollTop = 0;
    setMobilePane('reader');
    drawList();
  }
  function goTo(q) {
    if (!cur || !q) return;
    const k = cur.lines.findIndex((L) => L.c === q || L.c.startsWith(q + '.'));
    if (k < 0) { M.toast('No encuentro ese pasaje.'); return; }
    const r = $(`#lib .rl[data-k="${k}"]`); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1200); }
  }

  // La selección se guarda como texto y cita, nunca como un Range vivo:
  // en Safari el objeto Range puede mutar cuando la selección desaparece.
  const hint = 'Selecciona el fragmento (en iPhone o iPad, mantén pulsado y ajusta los marcadores).';
  function clearSelection() {
    savedSelection = null;
    refreshSelectionHint();
  }
  function refreshSelectionHint() {
    const box = $('#lib');
    if (!box || !box.dataset.built) return;
    const btn = $('[data-act=use]', box), info = $('.rsel', box);
    if (!btn || !info) return;
    const active = savedSelection && cur && savedSelection.urn === cur.urn ? savedSelection : null;
    // No deshabilitar el botón: algunos iPad tardan en emitir selectionchange.
    // Si sigue deshabilitado no recibiríamos ni touchstart para salvar el Range.
    btn.disabled = false;
    if (active) btn.classList.remove('no-selection'); else btn.classList.add('no-selection');
    info.textContent = active
      ? `Selección: ${active.cita} (${active.text.split(/\s+/).filter(Boolean).length} palabras)`
      : hint;
  }
  function rememberSelection() {
    const box = $('#lib');
    if (!box || box.classList.contains('hidden')) return;
    const range = selRange();
    if (range && cur) savedSelection = { ...range, urn: cur.urn };
    refreshSelectionHint();
  }

  // Texto y cita de la selección hecha dentro del lector (ratón o táctil).
  function selRange() {
    if (!cur) return null;
    const s = window.getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return null;
    const rt = $('#lib .rtext'); const rg = s.getRangeAt(0);
    if (!rt.contains(rg.commonAncestorContainer)) return null;
    const lines = $$('.rl', rt).filter((d) => {
      try {
        return typeof rg.intersectsNode === 'function' ? rg.intersectsNode(d) : s.containsNode(d, true);
      } catch (_) { return false; }
    });
    if (!lines.length) return null;
    // texto: solo el de las columnas de texto (sin los números)
    const parts = [];
    for (const d of lines) {
      const rx = $('.rx', d);
      const r2 = document.createRange(); r2.selectNodeContents(rx);
      if (d === lines[0] && rx.contains(rg.startContainer)) r2.setStart(rg.startContainer, rg.startOffset);
      if (d === lines[lines.length - 1] && rx.contains(rg.endContainer)) r2.setEnd(rg.endContainer, rg.endOffset);
      const spk = $('.spk', rx);
      let t = r2.toString();
      if (spk && t.startsWith(spk.textContent)) t = t.slice(spk.textContent.length);
      parts.push(t.trim());
    }
    const text = parts.filter(Boolean).join(cur.lines[+lines[0].dataset.k].k === 'l' ? '\n' : ' ').replace(/[ \t]+/g, ' ').trim();
    if (!text) return null;
    const a = lines[0].dataset.c, b = lines[lines.length - 1].dataset.c;
    return { text, a, b, cita: P.citeRef(a, b, cur.levels) };
  }
  function useSelection() {
    // Primero la selección actual; si iPadOS ya la contrajo, usar la copia
    // capturada al seleccionar o al tocar el botón, solo de la obra activa.
    const live = selRange();
    const r = live || (savedSelection && cur && savedSelection.urn === cur.urn ? savedSelection : null);
    if (!r) { M.toast('Selecciona un fragmento del texto antes de añadirlo.'); return; }
    if (target === 'literatura') {
      M.S.literatura = { texto: r.text, traduccion: '', autor: cur.author, obra: cur.latin, cita: r.cita, urn: cur.urn };
      M.renderEditor(); M.persist(); M.preview(); close();
      M.toast('Texto de literatura incorporado. La traducción queda en blanco.');
      return;
    }
    M.setTextFromLibrary({ urn: cur.urn, text: r.text, author: cur.author, obra: cur.latin, cita: r.cita });
    if (typeof M.showMobileView === 'function') M.showMobileView('editor');
    close();
    M.toast('Fragmento copiado al examen. Escribe el título del texto.');
  }
  M.libraryBusy = () => busy;
})();

