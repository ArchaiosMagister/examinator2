/* exam.js — editor del examen y vista previa */
'use strict';
(function () {
  const { $, $$, el, esc } = M;
  const P = M.Propose;
  const CATN = { n: 'sustantivo', a: 'adjetivo', p: 'pronombre', v: 'verbo' };
  const QTY = [['modelo', 'vocales en sílaba abierta'], ['todas', 'todas las vocales'], ['largas', 'solo las largas'], ['ninguna', 'sin cantidades']];

  M.newExam = function () {
    const S = {
      v: 1, tipo: 'Examen', asig: M.store.get('asig', 'Latín II'),
      titulo: '', refAutor: '', refObra: '', refCita: '', source: 'lib', urn: '',
      texto: '', textAnalyzed: '', tokens: [],
      qty: M.store.get('qty', 'modelo'), vocMode: 'elegir', vocabItems: [],
      subr: [], prev: [{ txt: '', n: 3 }, { txt: '', n: 2 }], evol: [], pref: [], latin: [],
      documento: 'examen', literatura: { texto: '', traduccion: '', autor: '', obra: '', cita: '', urn: '' },
      tamano: M.store.get('tamano', 10.5), espacioPreguntas: M.store.get('espacioPreguntas', 0.3),
      fuente: M.store.get('fuente', 'Palatino Linotype'), interlineado: M.store.get('interlineado', 3), hueco: M.store.get('hueco', 2.6)
    };
    P.evol(S); P.pref(S); P.latin(S);
    return S;
  };
  M.persist = M.debounce(() => { M.store.set('current', M.S); }, 400);
  const changed = () => { M.persist(); M.preview(); };

  /* ---------- vista previa ---------- */
  M.preview = M.debounce(() => {
    const sh = $('#sheet'); if (!sh) return;
    let st = $('#pageCss'); if (!st) { st = el('style', { id: 'pageCss' }); document.head.appendChild(st); }
    st.textContent = M.Exam.pageCss(M.S);
    sh.innerHTML = M.Exam.html(M.S);
    fitSheet();
  }, 80);
  function fitSheet() {
    const pv = $('#preview'), sh = $('#sheet'); if (!pv || !sh) return;
    const avail = pv.clientWidth - 48;
    const w = sh.offsetWidth;
    const z = Math.min(1.25, Math.max(0.45, avail / w));
    sh.style.zoom = z;
  }
  window.addEventListener('resize', M.debounce(fitSheet, 100));

  /* ---------- análisis del texto ---------- */
  let anaSeq = 0;
  M.analyzeNow = async function (force) {
    const S = M.S;
    const text = S.texto || '';
    if (!force && text === S.textAnalyzed) return;
    const my = ++anaSeq;
    $('#busy').classList.remove('hidden');
    try {
      const toks = text.trim() ? await M.call('analyze', { text }) : [];
      if (my !== anaSeq) return;
      S.tokens = toks; S.textAnalyzed = text;
      await rebuildVocab(true);
      P.underline(S);
      P.preverbs(S);
    } catch (e) { M.toast('No se pudo analizar el texto: ' + e.message, 6000); }
    finally { if (my === anaSeq) $('#busy').classList.add('hidden'); }
    renderWords(); renderVocab(); renderSubr(); renderQ4(); changed();
  };
  const analyzeSoon = M.debounce(() => M.analyzeNow(), 700);

  /* ---------- vocabulario ---------- */
  function textLids() {
    const seen = new Set(); const out = [];
    for (const t of M.S.tokens || []) if (t.sel && !seen.has(t.sel.lid)) { seen.add(t.sel.lid); out.push(t.sel.lid); }
    return out;
  }
  async function rebuildVocab(fromText) {
    const S = M.S;
    const lids = textLids();
    const old = new Map((S.vocabItems || []).filter((v) => v.lid).map((v) => [v.lid, v]));
    const need = lids.filter((l) => !old.has(l));
    const fresh = need.length ? await M.vocabEntries({ lids: need, mode: S.qty }) : [];
    const fm = new Map(fresh.map((e) => [e.lid, e]));
    const items = [];
    for (const lid of lids) {
      if (old.has(lid)) { items.push(old.get(lid)); continue; }
      const e = fm.get(lid); if (!e) continue;
      items.push({ lid, head: e.head, trad: e.trad, note: e.note, proper: e.proper, preferred: !!e.preferred, on: S.vocMode === 'todo' || !!e.proper });
    }
    for (const v of S.vocabItems || []) if (v.manual) items.push(v);
    const unknown = new Set();
    for (const t of S.tokens || []) if (!t.sel) {
      const e = M.Vocabulary.find([t.w], true) || M.Vocabulary.find([t.w]);
      if (e && !unknown.has(e.head)) {
        unknown.add(e.head);
        const previous = (S.vocabItems || []).find((v) => v.customWord === e.head);
        items.push(previous || { customWord: e.head, head: e.head, trad: e.trad, note: e.note, preferred: true, on: S.vocMode === 'todo' });
      }
    }
    S.vocabItems = items;
  }
  M.refreshVocab = async function () {
    const S = M.S;
    const fresh = await M.vocabEntries({ lids: textLids(), mode: S.qty });
    const fm = new Map(fresh.map((e) => [e.lid, e]));
    for (const v of S.vocabItems || []) if (fm.has(v.lid)) {
      const e = fm.get(v.lid);
      if (!v.eHead) v.head = e.head;
      if (!v.eTrad) v.trad = e.trad;
      if (!v.eNote) v.note = e.note;
      v.preferred = !!e.preferred;
    }
    S.vocabItems = S.vocabItems.filter((v) => !v.customWord);
    await rebuildVocab(false);
    renderVocab(); renderWords(); changed();
  };
  async function requantify() {
    const S = M.S;
    const lids = S.vocabItems.filter((v) => v.lid && !v.eHead).map((v) => v.lid);
    if (!lids.length) return;
    const fresh = await M.vocabEntries({ lids, mode: S.qty });
    const fm = new Map(fresh.map((e) => [e.lid, e]));
    for (const v of S.vocabItems) if (v.lid && !v.eHead && fm.has(v.lid)) v.head = fm.get(v.lid).head;
  }

  /* ---------- cambiar el lema de una palabra ---------- */
  async function setLemma(t, lid) {
    const cd = t.cands.find((c) => c.lid === lid); if (!cd) return;
    const morpho = cd.morphos[0] || '';
    const info = await M.call('tokenInfo', { lid, morpho });
    t.sel = { lid, morpho }; t.lemma = cd.lemma; t.proper = cd.proper;
    if (info) Object.assign(t, info);
    // participio + sum
    await rebuildVocab(false);
    renderWords(); renderVocab(); renderSubr(); changed();
  }

  /* ---------- editor ---------- */
  M.renderEditor = function () {
    const S = M.S;
    const ed = $('#editor');
    ed.innerHTML = `
      <div class="card">
        <h3>Cabecera</h3>
        <label>Documento<select class="documentMode"><option value="examen">Examen</option><option value="repaso">Texto de repaso</option></select></label>
        <div class="grid2">
          <label>Primera casilla<input type="text" data-k="tipo"></label>
          <label>Materia<input type="text" data-k="asig"></label>
        </div>
      </div>
      <div class="card">
        <h3>Texto</h3>
        <div class="row" style="margin-bottom:8px">
          <span class="seg srcSeg"><button data-s="lib">De la biblioteca (Perseus)</button><button data-s="own">Texto propio</button></span>
          <button class="tbtn libBtn" data-act="lib">Elegir un fragmento…</button>
        </div>
        <label class="full">Título del texto<input type="text" data-k="titulo" placeholder="p. ej. Hechos del rey Tarquinio Prisco, asesinado por los hijos de su predecesor"></label>
        <div class="grid3">
          <label>Autor<input type="text" data-k="refAutor" placeholder="Eutropio"></label>
          <label title="Sale en cursiva">Obra<input type="text" data-k="refObra" placeholder="Breviarium"></label>
          <label>Pasaje<input type="text" data-k="refCita" placeholder="I 6"></label>
        </div>
        <label class="full">Texto latino <span class="muted srcHint"></span><textarea data-k="texto" rows="6" spellcheck="false" placeholder="Pega o escribe aquí el texto, o elige un fragmento de la biblioteca. Solo el texto latino: el vocabulario se saca de este campo."></textarea></label>
      </div>
      <div class="card">
        <h3>Palabras del texto <span class="muted small">— pulsa una palabra para cambiar su lema, subrayarla o ponerla en el vocabulario</span></h3>
        <div class="words"></div>
        <div class="legend small"><span class="lg n">sustantivo</span><span class="lg a">adjetivo</span><span class="lg p">pronombre</span><span class="lg v">verbo</span><span class="lg inv">en el vocabulario</span></div>
      </div>
      <div class="card">
        <h3>Análisis morfológico <span class="muted small">— palabras subrayadas</span></h3>
        <div class="subr"></div>
        <div class="row" style="margin-top:6px"><button class="tbtn" data-act="subrAll">Proponer otras cuatro</button></div>
      </div>
      <div class="card">
        <h3>Vocabulario</h3>
        <div class="row vopts">
          <span class="seg vmode"><button data-m="elegir">Elegir las palabras</button><button data-m="todo">Todo el texto</button></span>
          <label class="inl">Cantidades <select class="qty">${QTY.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
        </div>
        <div class="vhint small muted"></div>
        <div class="vlist"></div>
        <div class="row" style="margin-top:6px"><button class="tbtn" data-act="vadd">Añadir una entrada a mano</button> <button class="tbtn" data-act="vall">Marcar todas</button> <button class="tbtn" data-act="vnone">Desmarcar todas</button></div>
      </div>
      <div class="card">
        <h3>Pregunta 4 <span class="muted small">— «Elige dos de estas cuatro preguntas»</span></h3>
        <div class="q4"></div>
        <div class="row" style="margin-top:8px"><button class="tbtn" data-act="q4all">Generar de nuevo las cuatro</button></div>
      </div>
      <div class="card">
        <h3>Texto de literatura</h3>
        <button class="tbtn" data-act="literatura">Elegir Miles Gloriosus, Eneida IV o Heroida I…</button>
        <p class="small muted">Selecciona el fragmento latino. Después puedes pegar su traducción.</p>
        <div class="grid3">${[['autor', 'Autor'], ['obra', 'Obra'], ['cita', 'Pasaje']].map(([k, label]) => `<label>${label}<input data-lit="${k}"></label>`).join('')}</div>
        <label class="full">Texto latino<textarea data-lit="texto" rows="5" spellcheck="false"></textarea></label>
        <label class="full">Traducción<textarea data-lit="traduccion" rows="5" placeholder="Pega aquí la traducción cuando quieras incorporarla."></textarea></label>
      </div>`;
    S.literatura = S.literatura || { texto: '', traduccion: '' };
    for (const inp of $$('[data-lit]', ed)) {
      inp.value = S.literatura[inp.dataset.lit] || '';
      inp.oninput = () => { S.literatura[inp.dataset.lit] = inp.value; changed(); };
    }
    $('.documentMode', ed).value = S.documento || 'examen';
    $('.documentMode', ed).onchange = (e) => {
      const previous = S.documento === 'repaso' ? 'Repaso' : 'Examen';
      S.documento = e.target.value;
      if (!S.tipo || S.tipo === previous) S.tipo = S.documento === 'repaso' ? 'Repaso' : 'Examen';
      $('[data-k="tipo"]', ed).value = S.tipo;
      changed();
    };
    for (const inp of $$('[data-k]', ed)) {
      inp.value = S[inp.dataset.k] || '';
      inp.addEventListener('input', () => {
        S[inp.dataset.k] = inp.value;
        if (inp.dataset.k === 'texto') { analyzeSoon(); }
        if (inp.dataset.k === 'asig') M.store.set('asig', inp.value);
        changed();
      });
    }
    renderSource();
    $('.qty', ed).value = S.qty;
    $('.qty', ed).onchange = async (e) => { S.qty = e.target.value; M.store.set('qty', S.qty); await requantify(); renderVocab(); changed(); };
    ed.onclick = onClick;
    renderWords(); renderVocab(); renderSubr(); renderQ4();
  };
  function renderSource() {
    const S = M.S, ed = $('#editor');
    $$('.srcSeg button', ed).forEach((b) => b.classList.toggle('on', b.dataset.s === S.source));
    $('.libBtn', ed).classList.toggle('hidden', S.source !== 'lib');
    $('.srcHint', ed).textContent = S.source === 'lib' ? '— puedes recortarlo y marcar lo omitido con [...]' : '';
  }
  M.setTextFromLibrary = function (d) {
    const S = M.S;
    Object.assign(S, { source: 'lib', urn: d.urn, texto: d.text, refAutor: d.author, refObra: d.obra, refCita: d.cita });
    M.renderEditor();
    M.analyzeNow(true);
    changed();
  };

  async function onClick(e) {
    const S = M.S;
    const b = e.target.closest('button'); if (!b) return;
    if (b.closest('.srcSeg')) { S.source = b.dataset.s; renderSource(); changed(); if (S.source === 'lib' && !S.texto) M.openLibrary(); return; }
    if (b.closest('.vmode')) {
      S.vocMode = b.dataset.m;
      for (const v of S.vocabItems) if (!v.manual) v.on = S.vocMode === 'todo' || !!v.proper;
      renderVocab(); renderWords(); changed(); return;
    }
    const act = b.dataset.act;
    if (act === 'literatura') M.openLibrary('literatura');
    if (act === 'lib') M.openLibrary();
    if (act === 'subrAll') { P.underline(S); renderSubr(); renderWords(); changed(); }
    if (act === 'subrOne') {
      const cat = b.dataset.c;
      const k = S.subr.findIndex((s) => s.cat === cat);
      const r = P.underlineOne(S, cat);
      if (k >= 0) S.subr[k] = r; else S.subr.push(r);
      if (!r.toks.length) M.toast('No hay ningún ' + CATN[cat] + ' en el texto.');
      renderSubr(); renderWords(); changed();
    }
    if (act === 'vadd') { S.vocabItems.push({ manual: true, head: '', trad: '', note: '', on: true }); renderVocab(); changed(); const ins = $$('.vlist .vh', $('#editor')); if (ins.length) ins[ins.length - 1].focus(); }
    if (act === 'vall' || act === 'vnone') { for (const v of S.vocabItems) v.on = act === 'vall'; renderVocab(); renderWords(); changed(); }
    if (act === 'vdel') { const k = +b.dataset.k; S.vocabItems.splice(k, 1); renderVocab(); changed(); }
    if (act === 'vreset') {
      const v = S.vocabItems[+b.dataset.k]; if (!v) return;
      if (v.customWord) { const entry = M.Vocabulary.find([v.customWord]); if (entry) Object.assign(v, { head: entry.head, trad: entry.trad, note: entry.note }); renderVocab(); changed(); return; }
      if (!v.lid) return;
      const [e2] = await M.vocabEntries({ lids: [v.lid], mode: S.qty });
      if (e2) Object.assign(v, { head: e2.head, trad: e2.trad, note: e2.note, eHead: false, eTrad: false, eNote: false });
      renderVocab(); changed();
    }
    if (act === 'q4all') { P.preverbs(S); P.evol(S); P.pref(S); P.latin(S); renderQ4(); changed(); }
    if (act === 'prevOne') { if (!P.preverbOne(S, +b.dataset.k)) M.toast('No hay otro verbo de la lista en el texto que sirva.'); renderQ4(); changed(); }
    if (act === 'evolOne') { P.evolOne(S, +b.dataset.k); renderQ4(); changed(); }
    if (act === 'prefOne') { P.prefOne(S, +b.dataset.k); renderQ4(); changed(); }
    if (act === 'latOne') { P.latinOne(S, +b.dataset.k); renderQ4(); changed(); }
  }

  /* ---------- palabras del texto ---------- */
  function underlineCat(i) { for (const s of M.S.subr || []) if (s.toks.includes(i)) return s.cat; return null; }
  function renderWords() {
    const S = M.S, box = $('#editor .words'); if (!box) return;
    if (!S.tokens || !S.tokens.length) { box.innerHTML = `<div class="muted small">${S.texto && S.texto.trim() ? 'Analizando…' : 'Aquí aparecerán las palabras del texto.'}</div>`; return; }
    const onLids = new Set(S.vocabItems.filter((v) => v.on && v.lid).map((v) => v.lid));
    let h = '', pos = 0; const text = S.texto;
    for (const t of S.tokens) {
      if (t.s < pos) continue;
      h += esc(text.slice(pos, t.s));
      const uc = underlineCat(t.i);
      const cls = ['wd'];
      if (uc) cls.push('u', 'u' + uc);
      if (S.vocMode === 'elegir' && t.sel && onLids.has(t.sel.lid)) cls.push('inv');
      if (!t.sel) cls.push('unk');
      h += `<span class="${cls.join(' ')}" data-i="${t.i}" title="${esc(t.lemma || 'forma desconocida')}">${esc(t.w)}</span>`;
      pos = t.e;
    }
    h += esc(text.slice(pos));
    box.innerHTML = h;
    box.onclick = (e) => { const w = e.target.closest('.wd'); if (w) wordMenu(S.tokens[+w.dataset.i], w); };
  }
  function closePop() { const p = $('.pop'); if (p) p.remove(); document.removeEventListener('mousedown', outside, true); }
  function outside(e) { if (!e.target.closest('.pop')) closePop(); }
  function wordMenu(t, anchor) {
    closePop();
    const S = M.S;
    const pop = el('div', { class: 'pop' });
    const uc = underlineCat(t.i);
    const item = t.sel ? S.vocabItems.find((v) => v.lid === t.sel.lid) : null;
    pop.innerHTML = `<div class="pw">${esc(t.w)}</div>
      ${t.cands.length ? `<div class="pl">${t.cands.map((c) => `<label class="pc"><input type="radio" name="lem" value="${c.lid}" ${t.sel && t.sel.lid === c.lid ? 'checked' : ''}> <b>${esc(c.lemma)}</b> <span class="muted">${esc(c.trad || '')}</span><br><span class="small muted">${esc(c.morphos.slice(0, 3).join(' · '))}${c.morphos.length > 3 ? ' …' : ''}</span></label>`).join('')}</div>` : '<div class="muted small">El lematizador no reconoce esta forma. Puedes añadirla al vocabulario a mano.</div>'}
      <div class="ps"><span class="small muted">Subrayar como</span> ${['n', 'a', 'p', 'v'].map((c) => `<button class="tbtn sm ${uc === c ? 'on' : ''}" data-u="${c}">${CATN[c]}</button>`).join(' ')} ${uc ? '<button class="tbtn sm" data-u="">quitar</button>' : ''}</div>
      ${item ? `<label class="pv"><input type="checkbox" class="inv" ${item.on ? 'checked' : ''}> En el vocabulario</label>` : ''}`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
    const top = r.bottom + 6; pop.style.top = (top + pop.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - pop.offsetHeight - 6) : top) + 'px';
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    pop.addEventListener('change', async (e) => {
      if (e.target.name === 'lem') { closePop(); await setLemma(t, +e.target.value); }
      if (e.target.classList.contains('inv') && item) { item.on = e.target.checked; renderVocab(); renderWords(); changed(); }
    });
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-u]'); if (!b) return;
      const cat = b.dataset.u;
      const toks = t.group ? t.group.slice() : [t.i];
      S.subr = (S.subr || []).filter((s) => !s.toks.some((i) => toks.includes(i)));
      if (cat) { S.subr = S.subr.filter((s) => s.cat !== cat); S.subr.push({ cat, toks }); }
      S.subr.sort((a, b2) => 'napv'.indexOf(a.cat) - 'napv'.indexOf(b2.cat));
      closePop(); renderSubr(); renderWords(); changed();
    });
  }

  /* ---------- análisis morfológico ---------- */
  function renderSubr() {
    const S = M.S, box = $('#editor .subr'); if (!box) return;
    if (!S.tokens || !S.tokens.length) { box.innerHTML = '<div class="muted small">Se proponen al analizar el texto.</div>'; return; }
    box.innerHTML = ['n', 'a', 'p', 'v'].map((c) => {
      const s = (S.subr || []).find((x) => x.cat === c);
      const words = s && s.toks.length ? s.toks.map((i) => S.tokens[i] && S.tokens[i].w).join(' ') : '';
      const t = s && s.toks.length ? S.tokens[s.toks[0]] : null;
      return `<div class="srow"><span class="lg ${c}">${CATN[c]}</span><span class="sw">${words ? `<u>${esc(words)}</u> <span class="muted small">${esc(t && t.sel ? t.sel.morpho : '')}</span>` : '<span class="muted small">ninguno</span>'}</span><button class="tbtn sm" data-act="subrOne" data-c="${c}">Otro</button></div>`;
    }).join('') + ((S.subr || []).filter((s) => !'napv'.includes(s.cat)).length ? '' : '');
  }

  /* ---------- pregunta 4 ---------- */
  function renderQ4() {
    const S = M.S, box = $('#editor .q4'); if (!box) return;
    const nPrev = P.prevCandidates(S).length;
    box.innerHTML = `
      <div class="q4b"><div class="q4t">a. Modificación preverbial <span class="muted small">(${nPrev ? nPrev + (nPrev === 1 ? ' verbo de la lista en el texto' : ' verbos de la lista en el texto') : 'ningún verbo de la lista en el texto todavía'})</span></div>
        ${[0, 1].map((k) => `<div class="qrow"><input type="text" class="it" data-q="prev" data-k="${k}" value="${esc((S.prev[k] || {}).txt || '')}"><select data-q="prevn" data-k="${k}"><option value="3">3 derivados</option><option value="2">2 derivados</option></select><button class="tbtn sm" data-act="prevOne" data-k="${k}">Otro</button></div>`).join('')}
      </div>
      <div class="q4b"><div class="q4t">b. Evolución fonética <span class="muted small">(cuatro fenómenos distintos)</span></div>
        ${[0, 1, 2, 3].map((k) => `<div class="qrow"><input type="text" class="it" data-q="evol" data-k="${k}" value="${esc((S.evol[k] || {}).w || '')}"><span class="fen small muted">${esc((S.evol[k] || {}).g || '')}</span><button class="tbtn sm" data-act="evolOne" data-k="${k}">Otra</button></div>`).join('')}
      </div>
      <div class="q4b"><div class="q4t">c. Prefijos</div>
        ${[0, 1, 2, 3].map((k) => `<div class="qrow"><input type="text" class="it" data-q="pref" data-k="${k}" value="${esc(S.pref[k] || '')}"><button class="tbtn sm" data-act="prefOne" data-k="${k}">Otra</button></div>`).join('')}
      </div>
      <div class="q4b"><div class="q4t">d. Latinismos</div>
        ${[0, 1, 2, 3].map((k) => `<div class="qrow"><input type="text" class="it" data-q="latin" data-k="${k}" value="${esc(S.latin[k] || '')}"><button class="tbtn sm" data-act="latOne" data-k="${k}">Otro</button></div>`).join('')}
      </div>`;
    $$('select[data-q=prevn]', box).forEach((s) => { s.value = String((S.prev[+s.dataset.k] || {}).n || (s.dataset.k === '0' ? 3 : 2)); });
    box.oninput = (e) => {
      const q = e.target.dataset.q, k = +e.target.dataset.k; if (!q) return;
      if (q === 'prev') { S.prev[k] = Object.assign({}, S.prev[k], { txt: e.target.value, rows: [], lplain: '' }); }
      if (q === 'evol') { S.evol[k] = Object.assign({}, S.evol[k], { w: e.target.value }); }
      if (q === 'pref') S.pref[k] = e.target.value;
      if (q === 'latin') S.latin[k] = e.target.value;
      changed();
    };
    box.onchange = (e) => {
      if (e.target.dataset.q !== 'prevn') return;
      const k = +e.target.dataset.k, n = +e.target.value;
      S.prev[k].n = n; S.prev[1 - k].n = n === 3 ? 2 : 3;
      $$('select[data-q=prevn]', box).forEach((s) => { s.value = String(S.prev[+s.dataset.k].n); });
      changed();
    };
  }

  /* ---------- vocabulario ---------- */
  function renderVocab() {
    const S = M.S, ed = $('#editor'); if (!ed) return;
    $$('.vmode button', ed).forEach((b) => b.classList.toggle('on', b.dataset.m === S.vocMode));
    const box = $('.vlist', ed);
    const on = S.vocabItems.filter((v) => v.on).length;
    $('.vhint', ed).textContent = !S.vocabItems.length ? 'El vocabulario se prepara al analizar el texto.'
      : S.vocMode === 'todo' ? `${on} de ${S.vocabItems.length} entradas en el examen, en orden alfabético. Desmarca las que no quieras.`
        : `${on} ${on === 1 ? 'entrada elegida' : 'entradas elegidas'}. Los nombres propios vienen marcados; marca aquí las demás que quieras, o púlsalas en el texto.`;
    const coll = new Intl.Collator('es', { sensitivity: 'base' });
    const order = S.vocabItems.map((v, k) => [v, k]).sort((a, b) => coll.compare(M.fold(a[0].head), M.fold(b[0].head)));
    box.innerHTML = order.map(([v, k]) => `<div class="vrow ${v.on ? '' : 'off'}" data-k="${k}">
      <input type="checkbox" class="von" ${v.on ? 'checked' : ''} title="En el examen">
      <input type="text" class="vh" value="${esc(v.head)}" placeholder="enunciado">
      <input type="text" class="vt" value="${esc(v.trad)}" placeholder="traducción">
      <input type="text" class="vn" value="${esc(v.note)}" placeholder="aclaración (opcional)">
      ${v.manual ? `<button class="xbtn" data-act="vdel" data-k="${k}" title="Quitar">×</button>` : `<button class="xbtn" data-act="vreset" data-k="${k}" title="Volver a la entrada del diccionario">↺</button>`}
    </div>`).join('');
    box.oninput = (e) => {
      const row = e.target.closest('.vrow'); if (!row) return;
      const v = S.vocabItems[+row.dataset.k];
      if (e.target.classList.contains('vh')) { v.head = e.target.value; v.eHead = true; }
      if (e.target.classList.contains('vt')) { v.trad = e.target.value; v.eTrad = true; }
      if (e.target.classList.contains('vn')) { v.note = e.target.value; v.eNote = true; }
      changed();
    };
    box.onchange = (e) => {
      if (!e.target.classList.contains('von')) return;
      const row = e.target.closest('.vrow'); const v = S.vocabItems[+row.dataset.k];
      v.on = e.target.checked; row.classList.toggle('off', !v.on);
      renderWords(); changed();
      const on2 = S.vocabItems.filter((x) => x.on).length;
      $('.vhint', ed).textContent = S.vocMode === 'todo' ? `${on2} de ${S.vocabItems.length} entradas en el examen, en orden alfabético. Desmarca las que no quieras.` : `${on2} ${on2 === 1 ? 'entrada elegida' : 'entradas elegidas'}. Los nombres propios vienen marcados; marca aquí las demás que quieras, o púlsalas en el texto.`;
    };
  }

  M.loadExam = function (S) {
    M.S = S;
    M.renderEditor(); M.preview();
    if (S.texto && S.texto !== S.textAnalyzed) M.analyzeNow();
  };
})();

