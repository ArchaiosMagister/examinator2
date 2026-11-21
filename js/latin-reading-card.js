/* Ficha contextual de lectura: exclusivamente en la vista previa, nunca en Word/PDF. */
'use strict';
(function () {
  const sheet = document.getElementById('sheet');
  const M = window.M;
  if (!sheet || !M) return;

  const WORD = /[\p{L}][\p{L}\p{M}]*/gu;
  const normalize = (word) => String(word || '').toLowerCase().normalize('NFD')
    .replace(/\p{M}/gu, '').replace(/æ/g, 'ae').replace(/œ/g, 'oe');
  const cache = new Map();
  const MAX_CACHED = 6;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let popup = null, opened = '', request = 0, hoverTimer, downAt = null;

  function wordList(text) {
    // El motor académico no analiza las adiciones entre corchetes.
    const brackets = [...text.matchAll(/\[[^\]]*\]/g)]
      .map((m) => [m.index, m.index + m[0].length]);
    return [...text.matchAll(WORD)].map((m) => ({
      start: m.index, end: m.index + m[0].length, word: m[0]
    })).filter((w) => !brackets.some(([a, b]) => w.start >= a && w.end <= b));
  }

  function rangeFor(paragraph, start, end) {
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let node, offset = 0, first = null, last = null, begin = 0, finish = 0;
    while ((node = walker.nextNode())) {
      const length = node.textContent.length;
      if (!first && start >= offset && start < offset + length) {
        first = node; begin = start - offset;
      }
      if (end > offset && end <= offset + length) {
        last = node; finish = end - offset; break;
      }
      offset += length;
    }
    if (!first || !last) return null;
    const range = document.createRange();
    range.setStart(first, begin);
    range.setEnd(last, finish);
    return range;
  }

  function hitAt(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element || !sheet.contains(element)) return null;
    let paragraph = element.closest('.page .txt, .page .litLatin');
    if (!paragraph) {
      // Safari con zoom puede asignar el punto al papel en vez del texto.
      paragraph = [...sheet.querySelectorAll('.page .txt, .page .litLatin')]
        .find((p) => {
          const r = p.getBoundingClientRect();
          return x >= r.left - 2 && x <= r.right + 2 &&
            y >= r.top - 2 && y <= r.bottom + 2;
        });
    }
    if (!paragraph) return null;
    const latin = paragraph.textContent || '';
    const words = wordList(latin);
    let preferred = null;
    const doc = document;
    const position = doc.caretPositionFromPoint?.(x, y) || (() => {
      const r = doc.caretRangeFromPoint?.(x, y);
      return r && { offsetNode: r.startContainer, offset: r.startOffset };
    })();
    if (position && paragraph.contains(position.offsetNode)) {
      try {
        const prefix = document.createRange();
        prefix.selectNodeContents(paragraph);
        prefix.setEnd(position.offsetNode, position.offset);
        const offset = prefix.toString().length;
        preferred = words.find((w) => offset >= w.start && offset <= w.end);
      } catch (_) { /* Buscar por geometría si Safari no ofrece caret válido. */ }
    }
    const exact = (w) => {
      const r = rangeFor(paragraph, w.start, w.end);
      if (!r) return null;
      for (const rect of r.getClientRects()) {
        if (rect.width > 0 && rect.height > 0 &&
            x >= rect.left - 2 && x <= rect.right + 2 &&
            y >= rect.top - 2 && y <= rect.bottom + 2) {
          return { paragraph, latin, start: w.start, end: w.end,
            word: w.word, rect, ordinal: words.findIndex((q) => q.start === w.start),
            literature: paragraph.classList.contains('litLatin') };
        }
      }
      return null;
    };
    if (preferred) {
      const found = exact(preferred);
      if (found) return found;
    }
    for (const w of words) {
      if (preferred && w.start === preferred.start) continue;
      const found = exact(w);
      if (found) return found;
    }
    return null;
  }

  function tokenAt(tokens, hit) {
    const token = Array.isArray(tokens) && tokens[hit.ordinal];
    return token && normalize(token.w) === normalize(hit.word) ? token : null;
  }

  function analyzed(text) {
    const key = String(text || '');
    if (cache.has(key)) {
      const existing = cache.get(key);
      cache.delete(key); cache.set(key, existing);
      return existing;
    }
    const pending = M.call('analyze', { text: key }).catch((error) => {
      if (cache.get(key) === pending) cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
    return pending;
  }

  async function tokenFor(hit, exam) {
    const source = hit.literature ? exam.literatura?.texto || '' : exam.texto || '';
    if (!hit.literature && source === exam.textAnalyzed) {
      const existing = tokenAt(exam.tokens, hit);
      if (existing) return existing; // Reutilizar correcciones docentes y análisis en memoria.
    }
    return tokenAt(await analyzed(source), hit);
  }

  function node(tag, className, content) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (content !== undefined) n.textContent = String(content);
    return n;
  }

  function locate(card, rect) {
    if (window.innerWidth <= 600) return; // Hoja inferior: CSS móvil.
    const width = Math.min(380, window.innerWidth - 20);
    card.style.width = width + 'px';
    const left = Math.max(10, Math.min(window.innerWidth - width - 10,
      rect.left + (rect.width - width) / 2));
    const below = rect.bottom + 10;
    const top = below + card.offsetHeight <= window.innerHeight - 12
      ? below : Math.max(10, rect.top - card.offsetHeight - 10);
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }

  function dismiss() {
    request++;
    opened = '';
    if (popup) popup.remove();
    popup = null;
  }
  function cancelHover() {
    if (hoverTimer !== undefined) clearTimeout(hoverTimer);
    hoverTimer = undefined;
  }
  function reset() { cancelHover(); dismiss(); }

  function render(card, token, hit) {
    card.querySelector('.ex-latin-card-body')?.remove();
    const body = node('div', 'ex-latin-card-body');
    const candidates = Array.isArray(token?.cands) ? token.cands : [];
    if (!candidates.length) {
      body.append(node('p', 'ex-latin-empty', 'Collatinus no reconoce esta forma.'));
    } else {
      const preferred = token.sel || null;
      const sorted = [...candidates].sort((a, b) =>
        Number(b.lid === preferred?.lid) - Number(a.lid === preferred?.lid));
      sorted.slice(0, 8).forEach((cand) => {
        const chosen = cand.lid === preferred?.lid;
        const group = node('section', 'ex-latin-lemma' + (chosen ? ' ex-latin-chosen' : ''));
        if (chosen) group.append(node('div', 'ex-latin-preferred',
          hit.literature ? 'Más probable según el contexto' :
            'Análisis preferente (Collatinus o selección docente)'));
        const heading = node('div', 'ex-latin-lemma-title');
        const lemma = node('strong', '', cand.lemma || hit.word);
        lemma.lang = 'la';
        heading.append(lemma);
        if (cand.im) heading.append(node('span', 'ex-latin-indication', cand.im));
        group.append(heading);
        if (cand.trad) group.append(node('p', 'ex-latin-translation', cand.trad));
        const morphs = Array.isArray(cand.morphos) ? [...cand.morphos] : [];
        morphs.sort((a, b) => Number(b === preferred?.morpho && chosen) -
          Number(a === preferred?.morpho && chosen));
        if (morphs.length) {
          const list = node('ul', 'ex-latin-morphs');
          for (const morph of morphs.slice(0, 6)) {
            const item = node('li', chosen && morph === preferred?.morpho
              ? 'ex-latin-selected' : '', morph || 'Análisis no especificado');
            list.append(item);
          }
          group.append(list);
          if (morphs.length > 6) group.append(node('p', 'ex-latin-extra',
            'Se muestran seis de ' + morphs.length + ' análisis.'));
        }
        body.append(group);
      });
      if (sorted.length > 8) body.append(node('p', 'ex-latin-extra',
        'Se muestran ocho de ' + sorted.length + ' lemas.'));
      body.append(node('p', 'ex-latin-caveat',
        'La lectura de Collatinus es orientativa, no una comprobación filológica.'));
    }
    card.append(body);
    locate(card, hit.rect);
  }

  async function show(hit) {
    const exam = M.S;
    if (!exam) return;
    const id = (hit.literature ? 'literatura' : 'texto') + ':' +
      hit.start + ':' + hit.end + ':' + hit.word;
    if (opened === id && popup) return;
    dismiss();
    opened = id;
    const current = ++request;
    const source = hit.literature ? exam.literatura?.texto : exam.texto;
    const card = node('section', 'ex-latin-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Análisis morfológico de ' + hit.word);
    const head = node('div', 'ex-latin-card-head');
    const title = node('strong', '', hit.word);
    title.lang = 'la';
    const close = node('button', 'ex-latin-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar análisis');
    close.addEventListener('click', dismiss);
    head.append(title, close);
    card.append(head, node('div', 'ex-latin-card-body', 'Consultando Collatinus…'));
    document.body.append(card);
    popup = card;
    locate(card, hit.rect);
    try {
      const token = await tokenFor(hit, exam);
      if (current !== request || M.S !== exam ||
          !sheet.contains(hit.paragraph) || hit.paragraph.textContent !== hit.latin ||
          source !== (hit.literature ? exam.literatura?.texto : exam.texto)) return;
      render(card, token, hit);
    } catch (_) {
      if (current !== request || !card.isConnected) return;
      const body = card.querySelector('.ex-latin-card-body');
      if (body) body.textContent = 'No se pudo consultar el análisis local de Collatinus.';
      locate(card, hit.rect);
    }
  }

  sheet.addEventListener('pointermove', (event) => {
    if (!finePointer || event.buttons || event.pointerType === 'touch') return;
    cancelHover();
    const hit = hitAt(event.clientX, event.clientY);
    if (!hit) return;
    const id = (hit.literature ? 'literatura' : 'texto') + ':' +
      hit.start + ':' + hit.end + ':' + hit.word;
    if (opened === id && popup) return;
    hoverTimer = window.setTimeout(() => { void show(hit); }, 450);
  });
  sheet.addEventListener('pointerleave', cancelHover);
  sheet.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  sheet.addEventListener('click', (event) => {
    const selected = window.getSelection();
    if (selected && !selected.isCollapsed && selected.toString().trim()) return;
    if (downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 10) return;
    const hit = hitAt(event.clientX, event.clientY);
    if (hit) void show(hit);
    else dismiss();
  });
  document.addEventListener('pointerdown', (event) => {
    if (popup && !popup.contains(event.target) && !sheet.contains(event.target)) dismiss();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismiss();
  });
  window.addEventListener('resize', () => {
    if (popup) dismiss(); // Evitar fichas descolocadas después del zoom/giro.
  });
  M.LatinReader = { reset };
})();
