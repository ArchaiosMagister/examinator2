/* exam.js — editor del examen y vista previa */
'use strict';
(function () {
  const { $, $$, el, esc } = M;
  const P = M.Propose;
  const CATN = { n: 'sustantivo', a: 'adjetivo', p: 'pronombre', v: 'verbo' };
  const QTY = [['modelo', 'vocales en sílaba abierta'], ['todas', 'todas las vocales'], ['largas', 'solo las largas'], ['ninguna', 'sin cantidades']];
  const DOCS = { parcial: 'Examen parcial de Latín II', final: 'Examen final de Latín II', repaso: 'Texto de repaso' };

  M.newExam = function () {
    const S = {
      v: 1, tipo: DOCS.parcial, asig: M.store.get('asig', 'Latín II'), trimestre: M.store.get('trimestre', '1'),
      titulo: '', refAutor: '', refObra: '', refCita: '', source: 'lib', urn: '',
      texto: '', textAnalyzed: '', tokens: [],
      qty: M.store.get('qty', 'modelo'), vocMode: 'elegir', vocabItems: [],
      subr: [], prev: [{ txt: '', n: 3 }, { txt: '', n: 2 }], evol: [], pref: [], latin: [],
      documento: 'parcial', literatura: { texto: '', traduccion: '', autor: '', obra: '', cita: '', urn: '' },
      tamano: M.store.get('tamano', 10.5), espacioPreguntas: M.store.get('espacioPreguntas', 0.3),
      fuente: M.store.get('fuente', 'Palatino Linotype'), interlineado: M.store.get('interlineado', 3),
       interlineadoPuntos: M.store.get('interlineadoPuntos', null),
       espacioVocabularioPuntos: M.store.get('espacioVocabularioPuntos', null),
       hueco: M.store.get('hueco', 2.6)
    };
    P.evol(S); P.pref(S); P.latin(S);
    return S;
  };
  // Guardado diferido durante la edición, pero síncrono al ocultar o cerrar.
  let saveTimer = null;
  M.persistNow = () => {
    if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
    if (!M.S) return true;
    const saved = M.store.set('current', M.S);
    if (saved === false) M.toast('No se pudo guardar automáticamente. Descarga el archivo .examen para conservar los cambios.', 8000);
    return saved !== false;
  };
  M.persist = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(M.persistNow, 400);
  };
  window.addEventListener('pagehide', M.persistNow);
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') M.persistNow();
    });
  }
  const changed = () => { M.persist(); M.preview(); };

  /* ---------- vista previa ---------- */
  M.preview = M.debounce(() => {
    const sh = $('#sheet'); if (!sh) return;
    let st = $('#pageCss'); if (!st) { st = el('style', { id: 'pageCss' }); document.head.appendChild(st); }
    st.textContent = M.Exam.pageCss(M.S);
    sh.innerHTML = M.Exam.html(M.S);
    M.syncLatinSpacingControls?.();
    M.LatinReader?.reset(); // Cerrar tarjetas asociadas a palabras de la hoja anterior.
    fitSheet();
    const exam = M.S;
    M.Exam.prepareLiterature(exam).then((changed) => {
      if (changed && M.S === exam) M.preview();
    }).catch(() => { /* Si Collatinus no responde, conservar texto sin alterar. */ });
  }, 80);
  function fitSheet() {
    const pv = $('#preview'), sh = $('#sheet');
    if (!pv || !sh || !pv.clientWidth) return;
    const sizer = $('#sheetSizer');
    if (!sizer) return;
    const mobile = window.matchMedia &&
      window.matchMedia('(max-width: 1100px)').matches;
    const avail = Math.max(1, pv.clientWidth - (mobile ? 20 : 48));
    // WebKit táctil no devuelve coordenadas reales con CSS zoom sobre la hoja.
    // transform + envoltorio mantiene la hoja visible y sus rangos táctiles
    // alineados, sin cambiar el HTML exportable ni sus márgenes A4.
    sh.style.zoom = '1';
    sh.style.transform = 'none';
    const w = sh.offsetWidth, h = sh.offsetHeight;
    if (!w || !h) return;
    const z = Math.min(1.25, Math.max(0.2, avail / w));
    sh.style.transformOrigin = 'top left';
    sh.style.transform = 'scale(' + z + ')';
    sizer.style.width = (w * z) + 'px';
    sizer.style.height = (h * z) + 'px';
  }
  M.fitSheet = fitSheet;
  window.addEventListener('resize', M.debounce(fitSheet, 100));

  /* ---------- análisis del texto ---------- */
  // Sólo se asocian tokens inequívocamente identificables tras una edición.
  // El prefijo y sufijo idénticos protegen las palabras repetidas; los
  // emparejamientos interiores se admiten únicamente si la forma es única.
  function stableTokenMap(oldTokens, newTokens) {
    const result = new Map();
    const key = (t) => String(t && t.w || '').normalize('NFC').toLowerCase();
    let left = 0;
    while (left < oldTokens.length && left < newTokens.length &&
           key(oldTokens[left]) === key(newTokens[left])) {
      result.set(left, left); left++;
    }
    let oldRight = oldTokens.length - 1, newRight = newTokens.length - 1;
    while (oldRight >= left && newRight >= left &&
           key(oldTokens[oldRight]) === key(newTokens[newRight])) {
      result.set(oldRight, newRight); oldRight--; newRight--;
    }
    const oldCounts = new Map(), newCounts = new Map(), newPositions = new Map();
    for (let i = left; i <= oldRight; i++) oldCounts.set(key(oldTokens[i]), (oldCounts.get(key(oldTokens[i])) || 0) + 1);
    for (let i = left; i <= newRight; i++) {
      const word = key(newTokens[i]);
      newCounts.set(word, (newCounts.get(word) || 0) + 1);
      newPositions.set(word, i);
    }
    let lastMapped = left - 1;
    for (let i = left; i <= oldRight; i++) {
      const word = key(oldTokens[i]), j = newPositions.get(word);
      if (oldCounts.get(word) === 1 && newCounts.get(word) === 1 &&
          j !== undefined && j > lastMapped) {
        result.set(i, j); lastMapped = j;
      }
    }
    return result;
  }

  async function restoreTokenLemmas(oldTokens, newTokens, indices, current) {
    for (const [oldIndex, newIndex] of indices) {
      const old = oldTokens[oldIndex], next = newTokens[newIndex];
      if (!old || !next || !old.sel || !Array.isArray(next.cands)) continue;
      const candidate = next.cands.find((c) => c.lid === old.sel.lid);
      if (!candidate || (next.sel && next.sel.lid === old.sel.lid)) continue;
      const morpho = candidate.morphos.includes(old.sel.morpho) ?
        old.sel.morpho : candidate.morphos[0] || '';
      try {
        const info = await M.call('tokenInfo', { lid: candidate.lid, morpho, word: next.w });
        if (!current()) return false;
        if (info) Object.assign(next, info);
        next.sel = { lid: candidate.lid, morpho };
        next.lemma = candidate.lemma;
        next.proper = candidate.proper;
      } catch (_) {
        // Si falla la reconsulta puntual, conservar el análisis nuevo y válido.
      }
    }
    return true;
  }

  function restoreQuestionChoices(S, previousTokens, previousSubr, previousPrev, indices) {
    if (!P.underlineOne || !P.prevCandidates || !P.preverbOne) {
      P.underline(S); P.preverbs(S); return;
    }
    const used = new Set(), saved = [];
    for (const cat of 'napv') {
      const old = previousSubr.find((s) => s.cat === cat);
      if (!old || !Array.isArray(old.toks) || !old.toks.length) continue;
      const mapped = old.toks.map((i) => indices.get(i));
      if (mapped.some((i) => i === undefined || used.has(i))) continue;
      if (!mapped.every((i, j) => {
        const prior = previousTokens[old.toks[j]], token = S.tokens[i];
        return token && token.sel && prior && token.cat === prior.cat;
      })) continue;
      mapped.forEach((i) => used.add(i));
      saved.push({ cat, toks: mapped });
    }
    S.subr = saved;
    for (const cat of 'napv') {
      if (!saved.some((s) => s.cat === cat)) S.subr.push(P.underlineOne(S, cat));
    }
    S.subr.sort((a, b) => 'napv'.indexOf(a.cat) - 'napv'.indexOf(b.cat));

    const candidates = P.prevCandidates(S);
    const kept = [null, null];
    for (const k of [0, 1]) {
      const old = previousPrev[k];
      if (!old || !String(old.txt || '').trim()) continue;
      if (!old.lplain || !Number.isInteger(old.i)) {
        // Una forma escrita manualmente no debe sustituirse por el sorteo.
        kept[k] = Object.assign({}, old); continue;
      }
      const index = indices.get(old.i);
      const candidate = candidates.find((c) => c.i === index && c.lplain === old.lplain);
      if (candidate) kept[k] = Object.assign({}, candidate, { txt: old.txt, n: old.n });
    }
    if (!kept.some(Boolean)) { P.preverbs(S); return; }
    S.prev = [0, 1].map((k) => kept[k] || {
      txt: '', n: k === 0 ? (kept[1] && kept[1].n === 3 ? 2 : 3)
        : (kept[0] && kept[0].n === 3 ? 2 : 3), rows: [], lplain: ''
    });
    for (const k of [0, 1]) if (!kept[k]) P.preverbOne(S, k);
  }

  let anaSeq = 0;
  M.analyzeNow = async function (force) {
    const S = M.S;
    const text = S.texto || '';
    if (!force && text === S.textAnalyzed) return;
    const my = ++anaSeq;
    // Un resultado tardío no debe aplicarse a otro examen ni a otro texto.
    const current = () => my === anaSeq && M.S === S && S.texto === text;
    const oldTokens = Array.isArray(S.tokens) ? S.tokens : [];
    const oldSubr = Array.isArray(S.subr) ? S.subr : [];
    const oldPrev = Array.isArray(S.prev) ? S.prev : [];
    $('#busy').classList.remove('hidden');
    try {
      const toks = text.trim() ? await M.call('analyze', { text }) : [];
      if (!current()) return;
      const matched = stableTokenMap(oldTokens, toks);
      if (!await restoreTokenLemmas(oldTokens, toks, matched, current) || !current()) return;
      // Crear vocabulario sin tocar el examen hasta que TODAS las consultas
      // terminen correctamente: un fallo no puede dejar texto y glosario cruzados.
      const items = await rebuildVocab(true, S, toks);
      if (!current() || !items) return;
      S.tokens = toks; S.vocabItems = items; S.textAnalyzed = text;
      restoreQuestionChoices(S, oldTokens, oldSubr, oldPrev, matched);
    } catch (e) {
      if (current()) M.toast('No se pudo analizar el texto: ' + e.message, 6000);
    } finally {
      if (current()) $('#busy').classList.add('hidden');
    }
    if (!current()) return;
    renderWords(); renderVocab(); renderSubr(); renderQ4(); changed();
  };

  M.ensureAnalyzed = async function (exam = M.S) {
    if (M.S !== exam) throw new Error('El examen ha cambiado durante la exportación.');
    if (exam.texto !== exam.textAnalyzed) await M.analyzeNow();
    if (M.S !== exam || exam.texto !== exam.textAnalyzed) {
      throw new Error('No se puede exportar un análisis antiguo. Comprueba el texto y vuelve a analizarlo.');
    }
  };
  const analyzeSoon = M.debounce(() => M.analyzeNow(), 700);

  /* ---------- vocabulario ---------- */
  function textLids(S = M.S, tokens = S.tokens) {
    const seen = new Set(); const out = [];
    for (const t of tokens || []) if (t.sel && !seen.has(t.sel.lid)) { seen.add(t.sel.lid); out.push(t.sel.lid); }
    return out;
  }
  async function rebuildVocab(fromText, S = M.S, tokens = S.tokens) {
    const priorTokens = S.tokens;
    const lids = textLids(S, tokens);
    const old = new Map((S.vocabItems || []).filter((v) => v.lid).map((v) => [v.lid, v]));
    const need = lids.filter((l) => !old.has(l));
    const fresh = need.length ? await M.vocabEntries({ lids: need, mode: S.qty }, tokens) : [];
    if (M.S !== S || S.tokens !== priorTokens) return null;
    const fm = new Map(fresh.map((e) => [e.lid, e]));
    const items = [];
    for (const lid of lids) {
      if (old.has(lid)) { items.push(old.get(lid)); continue; }
      const e = fm.get(lid); if (!e) continue;
      items.push({ lid, head: e.head, trad: e.trad, note: e.note, proper: e.proper, preferred: !!e.preferred, glosasSeparadas: e.glosasSeparadas === true, on: S.vocMode === 'todo' || !!e.proper });
    }
    for (const v of S.vocabItems || []) if (v.manual) items.push(v);
    const unknown = new Set();
    for (const t of tokens || []) if (!t.sel) {
      const e = M.Vocabulary.find([t.w], true) || M.Vocabulary.find([t.w]);
      if (e && !unknown.has(e.head)) {
        unknown.add(e.head);
        const previous = (S.vocabItems || []).find((v) => v.customWord === e.head);
        items.push(previous || { customWord: e.head, head: e.head, trad: e.trad, note: e.note, preferred: true, on: S.vocMode === 'todo' });
      }
    }
    // Durante un análisis nuevo, el llamador confirma el resultado de forma atómica.
    if (tokens === S.tokens) S.vocabItems = items;
    return items;
  }
  M.refreshVocab = async function () {
    const S = M.S;
    const fresh = await M.vocabEntries({ lids: textLids(S), mode: S.qty });
    if (M.S !== S) return;
    const fm = new Map(fresh.map((e) => [e.lid, e]));
    for (const v of S.vocabItems || []) if (fm.has(v.lid)) {
      const e = fm.get(v.lid);
      if (!v.eHead) v.head = e.head;
      if (!v.eTrad) v.trad = e.trad;
      if (!v.eNote) v.note = e.note;
      v.preferred = !!e.preferred;
      if (!v.glosasSeparadas && e.glosasSeparadas) v.glosasSeparadas = true;
    }
    S.vocabItems = S.vocabItems.filter((v) => !v.customWord);
    await rebuildVocab(false, S);
    if (M.S !== S) return;
    renderVocab(); renderWords(); changed();
  };
  async function requantify() {
    const S = M.S;
    const lids = S.vocabItems.filter((v) => v.lid && !v.eHead).map((v) => v.lid);
    if (!lids.length) return;
    const fresh = await M.vocabEntries({ lids, mode: S.qty });
    if (M.S !== S) return;
    const fm = new Map(fresh.map((e) => [e.lid, e]));
    for (const v of S.vocabItems) if (v.lid && !v.eHead && fm.has(v.lid)) v.head = fm.get(v.lid).head;
  }

  /* ---------- cambiar el lema de una palabra ---------- */
  async function setLemma(t, lid) {
    const cd = t.cands.find((c) => c.lid === lid); if (!cd) return;
    const morpho = cd.morphos[0] || '';
    const S = M.S;
    const info = await M.call('tokenInfo', { lid, morpho, word: t.w });
    if (M.S !== S || !S.tokens.includes(t)) return;
    t.sel = { lid, morpho }; t.lemma = cd.lemma; t.proper = cd.proper;
    if (info) Object.assign(t, info);
    // participio + sum
    await rebuildVocab(false, S);
    if (M.S !== S) return;
    renderWords(); renderVocab(); renderSubr(); changed();
  }

  /* ---------- editor ---------- */
  M.renderEditor = function () {
    const S = M.S;
    const ed = $('#editor');
    ed.innerHTML = `
      <div class="card">
        <h3>Cabecera</h3>
        <label>Tipo de documento<select class="documentMode"><option value="parcial">Examen parcial</option><option value="final">Examen final</option><option value="repaso">Texto de repaso</option></select></label>
        <div class="grid2">
          <label>Primera casilla (editable)<input type="text" data-k="tipo"></label>
          <label class="trimestreField">Trimestre<select class="trimestre"><option value="1">1.r trimestre</option><option value="2">2.º trimestre</option><option value="3">3.r trimestre</option></select></label>
          <label class="asigField">Materia (textos de repaso)<input type="text" data-k="asig"></label>
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
        <p class="vsaveHint small muted">«Guardar» conserva el enunciado, el significado y la aclaración para próximos exámenes en este dispositivo.</p>
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
        <div class="grid3 litMeta">${[['autor', 'Autor'], ['obra', 'Obra'], ['cita', 'Pasaje']].map(([k, label]) => `<label>${label}<input data-lit="${k}"></label>`).join('')}</div>
        <label class="full">Texto latino<textarea data-lit="texto" rows="5" spellcheck="false"></textarea></label>
        <label class="full">Traducción<textarea data-lit="traduccion" rows="5" placeholder="Pega aquí la traducción cuando quieras incorporarla."></textarea></label>
      </div>`;
    S.literatura = S.literatura || { texto: '', traduccion: '' };
    for (const inp of $$('[data-lit]', ed)) {
      inp.value = S.literatura[inp.dataset.lit] || '';
      inp.oninput = () => { S.literatura[inp.dataset.lit] = inp.value; changed(); };
    }
    // Los archivos .examen anteriores guardaban documento='examen' y
    // tipo='Examen'/'Repaso'. Conservar títulos personalizados.
    if (!DOCS[S.documento]) S.documento = 'parcial';
    if (!S.tipo || S.tipo === 'Examen' || S.tipo === 'Repaso') S.tipo = DOCS[S.documento];
    if (!['1', '2', '3'].includes(String(S.trimestre))) S.trimestre = '1';
    const updateHeaderControls = () => {
      $('.trimestreField', ed).classList.toggle('hidden', S.documento === 'repaso');
      $('.asigField', ed).classList.toggle('hidden', S.documento !== 'repaso');
    };
    $('.documentMode', ed).value = S.documento;
    $('.trimestre', ed).value = String(S.trimestre);
    updateHeaderControls();
    $('.documentMode', ed).onchange = (e) => {
      const previous = DOCS[S.documento];
      S.documento = e.target.value;
      if (!S.tipo || S.tipo === previous) S.tipo = DOCS[S.documento];
      $('[data-k="tipo"]', ed).value = S.tipo;
      updateHeaderControls();
      changed();
    };
    $('.trimestre', ed).onchange = (e) => {
      S.trimestre = e.target.value;
      M.store.set('trimestre', S.trimestre);
      changed();
    };
    for (const inp of $$('[data-k]', ed)) {
      inp.value = S[inp.dataset.k] || '';
      inp.addEventListener('input', () => {
        S[inp.dataset.k] = inp.value;
        if (inp.dataset.k === 'texto') {
          analyzeSoon();
          renderWords(); renderVocab();
        }
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
    if (act === 'vadd') {
      const k = S.vocabItems.push({ manual: true, head: '', trad: '', note: '', on: true }) - 1;
      renderVocab(); changed();
      // La lista está ordenada alfabéticamente: la nueva entrada vacía
      // NO coincide necesariamente con la última fila visible.
      const input = $('.vlist .vrow[data-k="' + k + '"] .vh', $('#editor'));
      if (input) {
        input.closest('.vrow').classList.add('new-manual');
        input.addEventListener('input', () => input.closest('.vrow').classList.remove('new-manual'), { once: true });
        input.focus();
        input.scrollIntoView({ block: 'nearest' });
      }
    }
    if (act === 'vall' || act === 'vnone') { for (const v of S.vocabItems) v.on = act === 'vall'; renderVocab(); renderWords(); changed(); }
    if (act === 'vdel') { const k = +b.dataset.k; S.vocabItems.splice(k, 1); renderVocab(); changed(); }
    if (act === 'vsave') {
      const v = S.vocabItems[+b.dataset.k];
      if (!v) return;
      try {
        M.Vocabulary.saveCorrection(v);
        v.preferred = true;
        v.eHead = false; v.eTrad = false; v.eNote = false;
        renderVocab(); changed();
        M.toast('Corrección guardada para futuros exámenes en este dispositivo.');
      } catch (error) {
        M.toast('No se pudo guardar la corrección: ' + error.message, 6000);
      }
      return;
    }
    if (act === 'vreset') {
      const v = S.vocabItems[+b.dataset.k]; if (!v) return;
      if (v.customWord) { const entry = M.Vocabulary.find([v.customWord]); if (entry) Object.assign(v, { head: entry.head, trad: entry.trad, note: entry.note }); renderVocab(); changed(); return; }
      if (!v.lid) return;
      const [e2] = await M.vocabEntries({ lids: [v.lid], mode: S.qty });
      if (e2) Object.assign(v, { head: e2.head, trad: e2.trad, note: e2.note, eHead: false, eTrad: false, eNote: false });
      renderVocab(); changed();
    }
    if (act === 'evolFilter') { openEvolFilters(); return; }
    if (act === 'latinFilter') { openLatinFilters(); return; }
    if (act === 'q4all') {
      P.preverbs(S); const ev = P.evol(S); P.pref(S); const lat = P.latin(S);
      if (!ev || !lat) M.toast('Los filtros no permiten generar cuatro palabras distintas en todos los apartados.');
      renderQ4(); changed();
    }
    if (act === 'prevOne') { if (!P.preverbOne(S, +b.dataset.k)) M.toast('No hay otro verbo de la lista en el texto que sirva.'); renderQ4(); changed(); }
    if (act === 'evolOne') { if (!P.evolOne(S, +b.dataset.k)) M.toast('No hay otra palabra compatible con las normas seleccionadas.'); renderQ4(); changed(); }
    if (act === 'prefOne') { P.prefOne(S, +b.dataset.k); renderQ4(); changed(); }
    if (act === 'latOne') { if (!P.latinOne(S, +b.dataset.k)) M.toast('No hay otro latinismo en el intervalo y paridad elegidos.'); renderQ4(); changed(); }
  }

  /* ---------- palabras del texto ---------- */
  function underlineCat(i) { for (const s of M.S.subr || []) if (s.toks.includes(i)) return s.cat; return null; }
  function renderWords() {
    const S = M.S, box = $('#editor .words'); if (!box) return;
    if (S.texto !== S.textAnalyzed || !S.tokens || !S.tokens.length) {
      box.innerHTML = `<div class="muted small">${S.texto && S.texto.trim() ? 'Análisis pendiente. El vocabulario y los subrayados anteriores no se utilizarán en la exportación.' : 'Aquí aparecerán las palabras del texto.'}</div>`;
      return;
    }
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
      h += `<span class="${cls.join(' ')}" data-i="${t.i}" title="${esc(t.lemma || 'forma desconocida')}">${esc(t.lig || t.w)}</span>`;
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

  /* ---------- filtros de léxico (sin alterar el texto del examen) ---------- */
  function openEvolFilters() {
    const F = M.LexicalFilters, S = M.S;
    const chosen = new Set(F.normasSeleccionadas(S));
    let soloPatrimoniales = S.evolSoloPatrimoniales === true;
    const html = '<p class="small muted">Se eligen cuatro palabras de cuatro fenómenos diferentes. Cada étimo debe respetar todas las normas que tenga registradas.</p>' +
      '<div class="row" style="margin-bottom:8px"><button class="tbtn sm" data-norm="all">Todas</button><button class="tbtn sm" data-norm="none">Ninguna</button><span class="small muted normCount"></span></div>' +
      '<div class="normGrid">' + F.normas.map((n) => '<label class="normOption"><input type="checkbox" data-norma="' +
        esc(n.id) + '"> <span>' + esc(n.id + ' · ' + n.nombre) + '</span></label>').join('') + '</div>' +
      '<label class="normPatrimonial"><input class="onlyPatrimonial" type="checkbox"> Sólo evoluciones patrimoniales <span class="muted small">(excluye adaptaciones cultas, voces regionales y fichas sin transmisión acreditada)</span></label>';
    const modal = M.modal('Seleccionar normas fonéticas', html, [
      { label: 'Cancelar' },
      { label: 'Aplicar', primary: true, onclick: () => {
        const test = Object.assign({}, S, { evolNormas: [...chosen], evolSoloPatrimoniales: soloPatrimoniales, evol: [] });
        if (!P.evol(test)) {
          M.toast('No hay cuatro fenómenos distintos con palabras compatibles. Amplía la selección de normas.', 6500);
          return false;
        }
        S.evolNormas = [...chosen]; S.evolSoloPatrimoniales = soloPatrimoniales; S.evol = test.evol;
        renderQ4(); changed();
      } }
    ], { width: '610px' });
    const body = modal.body;
    const paint = () => {
      $('[data-norma]', body).forEach((inp) => { inp.checked = chosen.has(inp.dataset.norma); });
      $('.normCount', body).textContent = chosen.size + ' de ' + F.normas.length;
      $('.onlyPatrimonial', body).checked = soloPatrimoniales;
    };
    body.addEventListener('change', (event) => {
      const input = event.target;
      if (input.classList.contains('onlyPatrimonial')) { soloPatrimoniales = input.checked; return; }
      if (!input.dataset.norma) return;
      if (input.checked) chosen.add(input.dataset.norma); else chosen.delete(input.dataset.norma);
      paint();
    });
    body.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-norm]');
      if (!btn) return;
      chosen.clear();
      if (btn.dataset.norm === 'all') F.normas.forEach((n) => chosen.add(n.id));
      paint();
    });
    paint();
  }

  function openLatinFilters() {
    const S = M.S, F = M.LexicalFilters;
    const prior = S.latinFilter || F.defaultLatin();
    const html = '<p class="small muted">Se conserva la numeración original de los 87 latinismos de GeneradorExamenes. Primero se filtra por número y paridad; después se sortean cuatro distintos.</p>' +
      '<div class="latinFilterGrid"><label>Desde <input class="latinFrom" type="number" min="1" max="9999" step="1"></label>' +
      '<label>Hasta <input class="latinTo" type="number" min="1" max="9999" step="1"></label>' +
      '<label>Paridad <select class="latinParity"><option value="todos">Todos</option><option value="pares">Pares</option><option value="impares">Impares</option></select></label></div>' +
      '<p class="small muted latinHelp"></p>';
    const modal = M.modal('Latinismos: intervalo y paridad', html, [
      { label: 'Cancelar' },
      { label: 'Sin filtro', onclick: () => {
        S.latinFilter = null; P.latin(S); renderQ4(); changed();
      } },
      { label: 'Aplicar', primary: true, onclick: (body) => {
        const fromValue = $('.latinFrom', body).value.trim(), toValue = $('.latinTo', body).value.trim();
        const desde = Number(fromValue), hasta = Number(toValue);
        const paridad = $('.latinParity', body).value;
        if (!fromValue || !toValue || !Number.isInteger(desde) || !Number.isInteger(hasta) ||
            desde < 1 || hasta > 9999 || desde > hasta) {
          M.toast('Indica un intervalo válido de números enteros entre 1 y 9999.');
          return false;
        }
        const next = { desde, hasta, paridad, activo: true };
        const test = Object.assign({}, S, { latinFilter: next, latin: [] });
        if (!P.latin(test)) {
          M.toast('En ese intervalo y paridad hay menos de cuatro latinismos disponibles.', 6500);
          return false;
        }
        S.latinFilter = next; S.latin = test.latin;
        renderQ4(); changed();
      } }
    ], { width: '570px' });
    const body = modal.body;
    $('.latinFrom', body).value = String(prior.desde);
    $('.latinTo', body).value = String(prior.hasta);
    $('.latinParity', body).value = prior.paridad || 'todos';
    const custom = F.customLatinCount();
    $('.latinHelp', body).textContent = (custom ? custom + ' entradas sin número siguen disponibles al usar «Sin filtro». ' : '') +
      'La numeración no se imprime en la pregunta.';
  }

  /* ---------- pregunta 4 ---------- */
  function renderQ4() {
    const S = M.S, box = $('#editor .q4'); if (!box) return;
    const nPrev = P.prevCandidates(S).length;
    const F = M.LexicalFilters;
    const selected = F ? F.normasSeleccionadas(S).size : 20;
    const evolStatus = selected + '/' + (F ? F.normas.length : 20) + ' normas' +
      (S.evolSoloPatrimoniales ? ' · patrimoniales' : '');
    const lf = S.latinFilter;
    const latinStatus = lf && lf.activo
      ? esc(lf.desde + '–' + lf.hasta + ' · ' + (lf.paridad || 'todos'))
      : 'sin filtro';
    box.innerHTML = `
      <div class="q4b"><div class="q4t">a. Modificación preverbial <span class="muted small">(${nPrev ? nPrev + (nPrev === 1 ? ' verbo de la lista en el texto' : ' verbos de la lista en el texto') : 'ningún verbo de la lista en el texto todavía'})</span></div>
        ${[0, 1].map((k) => `<div class="qrow"><input type="text" class="it" data-q="prev" data-k="${k}" value="${esc(P.prevDisplay(S, S.prev[k] || {}))}"><select data-q="prevn" data-k="${k}"><option value="3">3 derivados</option><option value="2">2 derivados</option></select><button class="tbtn sm" data-act="prevOne" data-k="${k}">Otro</button></div>`).join('')}
      </div>
      <div class="q4b"><div class="q4t">b. Evolución fonética <span class="muted small">(cuatro fenómenos distintos)</span><button class="tbtn sm" data-act="evolFilter">Seleccionar normas</button><span class="muted small">${evolStatus}</span></div>
        ${[0, 1, 2, 3].map((k) => `<div class="qrow"><input type="text" class="it" data-q="evol" data-k="${k}" value="${esc(P.evolDisplay((S.evol[k] || {}).w || ''))}"><span class="fen small muted">${esc((S.evol[k] || {}).g || '')}</span><button class="tbtn sm" data-act="evolOne" data-k="${k}">Otra</button></div>`).join('')}
      </div>
      <div class="q4b"><div class="q4t">c. Prefijos</div>
        ${[0, 1, 2, 3].map((k) => `<div class="qrow"><input type="text" class="it" data-q="pref" data-k="${k}" value="${esc(S.pref[k] || '')}"><button class="tbtn sm" data-act="prefOne" data-k="${k}">Otra</button></div>`).join('')}
      </div>
      <div class="q4b"><div class="q4t">d. Latinismos <button class="tbtn sm" data-act="latinFilter">Intervalo y paridad</button><span class="muted small">${latinStatus}</span></div>
        ${[0, 1, 2, 3].map((k) => `<div class="qrow"><input type="text" class="it" data-q="latin" data-k="${k}" value="${esc(P.latDisplay(S.latin[k] || ''))}"><button class="tbtn sm" data-act="latOne" data-k="${k}">Otro</button></div>`).join('')}
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
    if (S.texto !== S.textAnalyzed) {
      box.innerHTML = '<div class="muted small">Análisis del nuevo texto pendiente. No se mostrarán las entradas del texto anterior.</div>';
      $('.vhint', ed).textContent = 'Comprueba el texto antes de exportar; puedes reintentarlo desde Word o PDF.';
      return;
    }
    const updateHint = () => {
      const on = S.vocabItems.filter((v) => v.on).length;
      const incomplete = S.vocabItems.filter((v) => v.manual && v.on &&
        (!String(v.head || '').trim() || !String(v.trad || '').trim())).length;
      const description = !S.vocabItems.length ? 'El vocabulario se prepara al analizar el texto.'
        : S.vocMode === 'todo' ? `${on} de ${S.vocabItems.length} entradas en el examen, en orden alfabético. Desmarca las que no quieras.`
          : `${on} ${on === 1 ? 'entrada elegida' : 'entradas elegidas'}. Los nombres propios vienen marcados; marca aquí las demás que quieras, o púlsalas en el texto.`;
      $('.vhint', ed).textContent = description + (incomplete
        ? ` Atención: ${incomplete} ${incomplete === 1 ? 'entrada manual incompleta se omitirá' : 'entradas manuales incompletas se omitirán'} al exportar.`
        : '');
    };
    updateHint();
    const coll = new Intl.Collator('es', { sensitivity: 'base' });
    const order = S.vocabItems.map((v, k) => [v, k]).sort((a, b) => coll.compare(M.fold(a[0].head), M.fold(b[0].head)));
    box.innerHTML = order.map(([v, k]) => `<div class="vrow ${v.on ? '' : 'off'}" data-k="${k}">
      <input type="checkbox" class="von" ${v.on ? 'checked' : ''} title="En el examen">
      <input type="text" class="vh" value="${esc(v.head)}" placeholder="enunciado">
      <input type="text" class="vt" value="${esc(v.trad)}" placeholder="traducción">
      <input type="text" class="vn" value="${esc(v.note)}" placeholder="aclaración (opcional)">
      <button class="tbtn sm vsave ${v.preferred && !v.eHead && !v.eTrad && !v.eNote ? 'saved' : ''}" data-act="vsave" data-k="${k}" title="Guardar corrección para próximos exámenes en este dispositivo" aria-label="Guardar corrección de ${esc(v.head)}">${v.preferred && !v.eHead && !v.eTrad && !v.eNote ? '✓ Guardada' : 'Guardar'}</button>
      ${v.manual ? `<button class="xbtn" data-act="vdel" data-k="${k}" title="Quitar">×</button>` : `<button class="xbtn" data-act="vreset" data-k="${k}" title="Restablecer la entrada en este examen">↺</button>`}
      ${(v.manual || v.glosasSeparadas) ? `<label class="vsplitLabel" title="Entrecerrar cada glosa individual: separa traducciones mediante |"><input type="checkbox" class="vsplit" ${v.glosasSeparadas ? 'checked' : ''}> Glosas separadas <span class="vsplitHint">(escribe grande | camino)</span></label>` : ''}
    </div>`).join('');
    box.oninput = (e) => {
      if (!e.target.matches('.vh, .vt, .vn')) return;
      const row = e.target.closest('.vrow'); if (!row) return;
      const v = S.vocabItems[+row.dataset.k];
      if (e.target.classList.contains('vh')) { v.head = e.target.value; v.eHead = true; }
      if (e.target.classList.contains('vt')) { v.trad = e.target.value; v.eTrad = true; }
      if (e.target.classList.contains('vn')) { v.note = e.target.value; v.eNote = true; }
      const saveButton = row.querySelector('.vsave');
      if (saveButton) { saveButton.textContent = 'Guardar'; saveButton.classList.remove('saved'); }
      updateHint(); changed();
    };
    box.onchange = (e) => {
      if (e.target.classList.contains('vsplit')) {
        const row = e.target.closest('.vrow');
        if (!row) return;
        const v = S.vocabItems[+row.dataset.k];
        if (!v) return;
        v.glosasSeparadas = e.target.checked;
        const saveButton = row.querySelector('.vsave');
        if (saveButton) { saveButton.textContent = 'Guardar'; saveButton.classList.remove('saved'); }
        changed();
        return;
      }
      if (!e.target.classList.contains('von')) return;
      const row = e.target.closest('.vrow'); const v = S.vocabItems[+row.dataset.k];
      v.on = e.target.checked; row.classList.toggle('off', !v.on);
      renderWords(); changed();
      updateHint();
    };
  }

  M.loadExam = function (S) {
    ++anaSeq; // invalidar respuestas pendientes del examen anterior
    $('#busy').classList.add('hidden');
    M.S = S;
    M.renderEditor(); M.preview(); M.persist();
    if (S.texto && S.texto !== S.textAnalyzed) M.analyzeNow();
    else if (S.texto && Array.isArray(S.tokens) &&
      S.tokens.some((t) => /(ae|oe)/i.test(t.w || '') && t.lig === undefined)) {
      // Actualización no destructiva de .examen antiguos: no volvemos a
      // lematizar ni tocamos la selección manual o los subrayados.
      const tokens = S.tokens, original = S.texto;
      M.call('ligateTokens', { tokens }).then((words) => {
        if (M.S !== S || S.texto !== original || S.tokens !== tokens) return;
        tokens.forEach((t, i) => { if (typeof words[i] === 'string') t.lig = words[i]; });
        renderWords(); M.preview();
      }).catch(() => {});
    }
  };
})();

