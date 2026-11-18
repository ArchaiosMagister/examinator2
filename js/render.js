/* render.js — el examen como HTML (vista previa y PDF) y como documento de Word */
'use strict';
(function () {
  const { esc } = M;
  const E = M.Exam = {};

  /* ---------- contenido común ---------- */
  // Texto con subrayados: [{ t, u }]
  E.textRuns = function (S) {
    const text = S.texto || '';
    const under = new Set();
    for (const s of S.subr || []) for (const i of s.toks || []) under.add(i);
    // Todos los tokens, no solo los subrayados: la grafía æ/œ es visible
    // también en las palabras que no formen parte del análisis morfológico.
    const toks = (S.tokens || []).slice().sort((a, b) => a.s - b.s);
    const runs = []; let pos = 0;
    for (const t of toks) {
      if (t.s < pos || t.e > text.length || text.slice(t.s, t.e) !== t.w) continue;
      if (t.s > pos) runs.push({ t: text.slice(pos, t.s) });
      runs.push({ t: t.lig || t.w, u: under.has(t.i) });
      pos = t.e;
    }
    if (pos < text.length) runs.push({ t: text.slice(pos) });
    // texto seguido: saltos de línea → espacios
    for (const r of runs) r.t = r.t.replace(/\s*\n\s*/g, ' ');
    // lo que va entre corchetes ([...], añadidos) no va en cursiva
    const out = [];
    for (const r of runs) {
      for (const part of r.t.split(/(\[[^\]]*\])/)) { if (part) out.push(Object.assign({}, r, { t: part, n: /^\[[^\]]*\]$/.test(part) })); }
    }
    return out;
  };
  // La literatura mantiene intacto el texto que el docente pega o
  // selecciona. La grafía con ligaduras se calcula y guarda solo en memoria.
  const latinLiteratureCache = new WeakMap();
  E.literatureLatin = (S) => {
    const L = S.literatura;
    if (!L || !L.texto) return '';
    const hit = latinLiteratureCache.get(L);
    return hit && hit.source === L.texto ? hit.value : L.texto;
  };
  E.prepareLiterature = async (S) => {
    const L = S.literatura;
    if (!L || !L.texto) return false;
    const source = L.texto;
    const hit = latinLiteratureCache.get(L);
    if (hit && hit.source === source) return false;
    let result;
    try { result = await M.call('ligateText', { text: source }); }
    catch (_) { return false; /* La exportación debe funcionar aun sin Collatinus. */ }
    if (S.literatura !== L || L.texto !== source) return false;
    latinLiteratureCache.set(L, { source, value: result });
    return result !== source;
  };

  E.vocabGlosses = (v) => {
    const trad = String(v.trad || '');
    return v.glosasSeparadas
      ? trad.split('|').map((g) => g.trim()).filter(Boolean).map((g) => '‘' + g + '’').join(' ')
      : '‘' + trad + '’';
  };
  E.vocabList = function (S) {
    const out = (S.vocabItems || []).filter((v) => v.on);
    const coll = new Intl.Collator('es', { sensitivity: 'base' });
    // Æ/Œ son variantes tipográficas de ae/oe; conservar su posición
    // alfabética (sin perder el primer carácter por el filtro [a-z]).
    const sortKey = (head) => M.fold(head).replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/^[^a-z]+/, '');
    return out.slice().sort((a, b) => coll.compare(sortKey(a.head), sortKey(b.head)));
  };
  const listY = (arr) => { const a = arr.filter((x) => x && x.trim()); return a.length <= 1 ? a : [a.slice(0, -1), a[a.length - 1]]; };
  // Frases de la pregunta 4: [{ t, i }]
  // en el examen: orden alfabético y minúsculas (salvo nombres propios)
  const coll = new Intl.Collator('es', { sensitivity: 'base' });
  const abc = (arr) => arr.filter((x) => x && String(x).trim()).map((x) => String(x).trim()).sort((a, b) => coll.compare(a, b));
  E.q4 = function (S) {
    const p = (S.prev || []).filter((x) => x && x.txt).map((x) => Object.assign({}, x, { txt: M.Propose.prevDisplay(S, x).trim().toLowerCase() })).sort((a, b) => coll.compare(a.txt, b.txt));
    const qa = [{ t: 'Modificación preverbial a partir de ' }];
    if (p.length >= 2) { qa.push({ t: p[0].txt, i: true }, { t: ` (${p[0].n}) y de ` }, { t: p[1].txt, i: true }, { t: ` (${p[1].n}). Cinco derivados en total en lengua propia.` }); }
    else if (p.length === 1) { qa.push({ t: p[0].txt, i: true }, { t: ` (${p[0].n}). Cinco derivados en total en lengua propia.` }); }
    else qa.push({ t: '…. Cinco derivados en total en lengua propia.' });
    const items = (arr) => {
      const r = []; const a = arr.filter((x) => x && String(x).trim());
      a.forEach((w, k) => { if (k) r.push({ t: k === a.length - 1 ? ' y ' : ', ' }); r.push({ t: w, i: true }); });
      return r;
    };
    const commas = (arr) => { const r = []; arr.filter((x) => x && String(x).trim()).forEach((w, k) => { if (k) r.push({ t: ', ' }); r.push({ t: w, i: true }); }); return r; };
    return [
      qa,
      [{ t: 'Evolución fonética de ' }].concat(items(abc((S.evol || []).map((x) => x && M.Propose.evolDisplay(x.w)))), [{ t: '.' }]),
      [{ t: 'Señala el prefijo y el significado que aporta a estas palabras: ' }].concat(commas(abc((S.pref || []).map((w) => w && M.Propose.prefDisplay(String(w).trim())))), [{ t: '.' }]),
      [{ t: 'Latinismos: ' }].concat(commas(abc((S.latin || []).map((w) => w && M.Propose.latDisplay(String(w).trim())))), [{ t: '.' }])
    ];
  };
  E.questions = [
    'Traducción del texto. (4p.)',
    'Análisis sintáctico del texto. (1p.)',
    'Análisis morfológico de las palabras subrayadas. (1p.)',
    'Elige dos de estas cuatro preguntas (2p.):'
  ];
  E.fontSize = (S) => { const n = Number(S.tamano ?? 11); return Number.isFinite(n) && n >= 6 && n <= 36 ? n : 11; };
  E.questionSpace = (S) => { const n = Number(S.espacioPreguntas ?? 0.3); return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 0.3; };
  // S.hueco ya está expresado en centímetros en los archivos .examen antiguos.
  // Conservarlo evita migraciones y mantiene el mismo espaciado en Word, PDF y vista previa.
  E.q4Space = (S) => { const n = Number(S.hueco ?? 2.6); return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 2.6; };
  E.documentMode = (S) => S.documento === 'repaso' ? 'repaso' : S.documento === 'final' ? 'final' : 'parcial';
  E.documentNames = {
    parcial: 'Examen parcial de Latín II',
    final: 'Examen final de Latín II',
    repaso: 'Texto de repaso'
  };
  E.headerLeft = (S) => {
    const saved = String(S.tipo || '').trim();
    return !saved || saved === 'Examen' || saved === 'Repaso'
      ? E.documentNames[E.documentMode(S)] : saved;
  };
  E.trimesterLabel = (S) => {
    const t = String(S.trimestre || '1');
    return ({ '1': '1.r trimestre', '2': '2.º trimestre', '3': '3.r trimestre' })[t] || '1.r trimestre';
  };
  E.headerRight = (S) => E.documentMode(S) === 'repaso'
    ? String(S.asig || 'Latín II') : E.trimesterLabel(S);
  E.questionList = (S) => E.questions.map((q) => S.documento === 'repaso' ? q.replace(/\s*\(\d+p\.\)/g, '') : q);
  E.literatureRef = (L) => [L.autor, L.obra, L.cita].filter(Boolean).join(', ');
  E.hasLiterature = (S) => !!(S.literatura && S.literatura.texto);
  const LITERATURE_QUESTION = 'Literatura. Indique el autor y obra a que pertenece el siguiente texto. Contextualice y comente el pasaje. (2p.)';
  E.literatureQuestion = (S) => S.documento === 'repaso'
    ? LITERATURE_QUESTION.replace(' (2p.)', '') : LITERATURE_QUESTION;
  E.fontStack = (f) => `'${f || 'Palatino Linotype'}', 'Palatino Linotype', 'Book Antiqua', Palatino, 'Gentium Book Plus', serif`;

  /* ---------- HTML ---------- */
  const runsHtml = (rs) => rs.map((r) => { let h = esc(r.t); if (r.i) h = `<i>${h}</i>`; if (r.n) h = `<span class="nr">${h}</span>`; if (r.u) h = `<u>${h}</u>`; return h; }).join('');
  E.pageCss = function (S) {
    const lh = S.interlineado || 3;
    return `
.page { font-family: ${E.fontStack(S.fuente)}; font-size: ${E.fontSize(S)}pt; color: #111; line-height: 1.35; }
.page .hdr { width: 100%; border: .75pt solid #222; font-weight: bold; box-sizing: border-box; }
.page .hdr-row { display: grid; grid-template-columns: minmax(0, 74%) minmax(0, 26%); padding: 3pt 7pt; }
.page .hdr-row > span { min-width: 0; }
.page .hdr-row > span:last-child { text-align: left; }
/* Solo marco exterior; no dibujar líneas entre filas ni columnas. */
.page .ttl { margin: 9pt 0 0; padding: 5pt 0 6pt; border-top: .6pt solid #9a9a9a; border-bottom: .6pt solid #9a9a9a; text-align: center; }
.page .ttl .t { font-weight: bold; }
.page .txt { font-style: italic; text-align: justify; line-height: ${lh}; margin: 12pt 0 6pt; hyphens: manual; }
.page .litTable { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 6pt 0 0;
  font-family: 'Palatino Linotype', Palatino, 'Book Antiqua', 'Gentium Book Plus', serif;
  font-size: 10pt; font-weight: normal; line-height: 1.25;
  -webkit-text-size-adjust: none; text-size-adjust: none; }
.page .litTable td { width: 50%; padding: 5pt 7pt; border: .5pt solid #555;
  vertical-align: top; white-space: pre-wrap; overflow-wrap: break-word; font-weight: normal; }
.page .litTable .litLatin { font-style: italic; }
.page .litTable .litTranslation { font-style: normal; }
.page .txt .nr { font-style: normal; }
.page .txt u { text-decoration-thickness: .7pt; text-underline-offset: 2pt; }
.page .voc { border: 1px solid #222; padding: 3pt 7pt 4pt; margin: 6pt 0 10pt; }
.page .voc .vh { text-align: center; font-weight: bold; margin-bottom: 1pt; }
.page .voc p { margin: 0; padding-left: 1.2em; text-indent: -1.2em; }
.page ol.q { margin: 0; padding-left: 2.1em; }
.page ol.q > li { font-weight: bold; margin: 0 0 ${E.questionSpace(S)}cm; padding-left: .4em; }
.page ol.s { list-style: lower-alpha; font-weight: normal; padding-left: 1.6em; margin: 3pt 0 0; }
.page ol.s > li { font-weight: normal; text-align: justify; padding-left: .4em; margin-bottom: ${E.q4Space(S)}cm; }
.page ol.s > li:last-child { margin-bottom: 0; }
`;
  };
  E.html = function (S) {
    const voc = E.vocabList(S);
    const refHtml = [S.refAutor ? esc(S.refAutor) : '', S.refObra ? `<i>${esc(S.refObra)}</i>` : '', S.refCita ? esc(S.refCita) : ''];
    let ref = refHtml[0];
    if (refHtml[1]) ref += (ref ? ', ' : '') + refHtml[1];
    if (refHtml[2]) ref += (ref ? ' ' : '') + refHtml[2];
    const q4 = E.q4(S);
    const litQuestionHtml = E.hasLiterature(S)
      ? `<li class="literatureQuestion">${esc(E.literatureQuestion(S))}
        <table class="litTable"><tbody><tr>
          <td class="litLatin">${esc(E.literatureLatin(S))}</td>
          <td class="litTranslation">${esc(S.literatura.traduccion || '')}</td>
        </tr></tbody></table></li>` : '';
    return `<div class="page">
<div class="hdr"><div class="hdr-row"><span>${esc(E.headerLeft(S))}</span><span>${esc(E.headerRight(S))}</span></div><div class="hdr-row"><span>Nombre y apellidos:</span><span>Fecha:</span></div></div>
<div class="ttl">${S.titulo ? `<div class="t">${esc(S.titulo)}</div>` : ''}${ref ? `<div class="r">${ref}</div>` : ''}${!S.titulo && !ref ? '&nbsp;' : ''}</div>
<div class="txt">${runsHtml(E.textRuns(S)) || '&nbsp;'}</div>
${voc.length ? `<div class="voc"><div class="vh">Vocabulario</div>${voc.map((v) => `<p><i>${esc(v.head)}:</i> ${esc(E.vocabGlosses(v))}${v.note ? ` (${esc(v.note)})` : ''}</p>`).join('')}</div>` : ''}
<ol class="q">
${E.questionList(S).map((q, k) => `<li>${esc(q)}${k === 3 ? `<ol class="s">${q4.map((r) => `<li>${runsHtml(r)}</li>`).join('')}</ol>` : ''}</li>`).join('\n')}
${litQuestionHtml}
</ol>
</div>`;
  };
  E.printDoc = function (S) {
    const font = (f) => new URL('fonts/' + f, location.href).href;
    const faces = [['400', 'normal', 'gentium-book-plus-latin-400-normal'], ['400', 'italic', 'gentium-book-plus-latin-400-italic'], ['700', 'normal', 'gentium-book-plus-latin-700-normal'], ['700', 'italic', 'gentium-book-plus-latin-700-italic'],
      ['400', 'normal', 'gentium-book-plus-latin-ext-400-normal'], ['400', 'italic', 'gentium-book-plus-latin-ext-400-italic'], ['700', 'normal', 'gentium-book-plus-latin-ext-700-normal'], ['700', 'italic', 'gentium-book-plus-latin-ext-700-italic']]
      .map(([w, s, f]) => `@font-face{font-family:'Gentium Book Plus';font-weight:${w};font-style:${s};src:url(${font(f + '.woff2')}) format('woff2');}`).join('\n');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Examen</title><style>
${faces}
@page { size: A4; margin: 2cm 2.2cm 2cm 2.2cm; }
html, body { margin: 0; padding: 0; background: #fff; }
${E.pageCss(S)}
</style></head><body>${E.html(S)}</body></html>`;
  };

  /* ---------- Word ---------- */
  const X = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const run = (r, base) => {
    const p = (base || '') + (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '') + (r.u ? '<w:u w:val="single"/>' : '');
    return `<w:r>${p ? `<w:rPr>${p}</w:rPr>` : ''}<w:t xml:space="preserve">${X(r.t)}</w:t></w:r>`;
  };
  const para = (runs, ppr, base) => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs.map((r) => run(r, base)).join('')}</w:p>`;
  E.docx = async function (S) {
    await E.prepareLiterature(S);
    const font = S.fuente || 'Palatino Linotype';
    const W = 9354; // ancho útil en twips (A4 con márgenes de 2,2 cm)
    const bd = (sz) => `<w:top w:val="single" w:sz="${sz}" w:color="222222"/><w:left w:val="single" w:sz="${sz}" w:color="222222"/><w:bottom w:val="single" w:sz="${sz}" w:color="222222"/><w:right w:val="single" w:sz="${sz}" w:color="222222"/>`;
    const sp0 = '<w:spacing w:before="0" w:after="0"/>';
    let body = '';
    // cabecera
    const c1 = Math.round(W * 0.74), c2 = W - c1;
    const cell = (t, w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${para([{ t, b: true }], sp0)}</w:tc>`;
    const outerOnly = bd(6) + '<w:insideH w:val="nil"/><w:insideV w:val="nil"/>';
    body += `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${outerOnly}</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="${c1}"/><w:gridCol w:w="${c2}"/></w:tblGrid>` +
      `<w:tr>${cell(E.headerLeft(S), c1)}${cell(E.headerRight(S), c2)}</w:tr><w:tr>${cell('Nombre y apellidos:', c1)}${cell('Fecha:', c2)}</w:tr></w:tbl>`;
    // título y referencia entre filetes
    const pbdr = (top, bottom) => `<w:pBdr>${top ? '<w:top w:val="single" w:sz="4" w:space="5" w:color="999999"/>' : ''}${bottom ? '<w:bottom w:val="single" w:sz="4" w:space="5" w:color="999999"/>' : ''}</w:pBdr>`;
    const refRuns = [];
    if (S.refAutor) refRuns.push({ t: S.refAutor });
    if (S.refObra) { if (refRuns.length) refRuns.push({ t: ', ' }); refRuns.push({ t: S.refObra, i: true }); }
    if (S.refCita) { if (refRuns.length) refRuns.push({ t: ' ' }); refRuns.push({ t: S.refCita }); }
    const tl = [];
    if (S.titulo) tl.push([{ t: S.titulo, b: true }]);
    if (refRuns.length) tl.push(refRuns);
    if (!tl.length) tl.push([{ t: '' }]);
    tl.forEach((r, k) => { body += para(r, `${pbdr(k === 0, k === tl.length - 1)}<w:spacing w:before="${k === 0 ? 200 : 0}" w:after="0"/><w:jc w:val="center"/>`); });
    // texto
    const lh = Math.round(240 * (S.interlineado || 3));
    body += para(E.textRuns(S).map((r) => ({ t: r.t, u: r.u, i: !r.n })), `<w:spacing w:before="240" w:after="120" w:line="${lh}" w:lineRule="auto"/><w:jc w:val="both"/>`);
    // vocabulario
    const voc = E.vocabList(S);
    if (voc.length) {
      const ps = [para([{ t: 'Vocabulario', b: true }], sp0 + '<w:jc w:val="center"/>')]
        .concat(voc.map((v) => para([{ t: v.head + ':', i: true }, { t: ' ' + E.vocabGlosses(v) + (v.note ? ' (' + v.note + ')' : '') }], sp0 + '<w:ind w:left="284" w:hanging="284"/>')));
      body += `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${bd(6)}</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="${W}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${W}" w:type="dxa"/></w:tcPr>${ps.join('')}</w:tc></w:tr></w:tbl>`;
      body += para([{ t: '' }], sp0);
    }
    // preguntas
    E.questionList(S).forEach((q, k) => {
      body += para([{ t: (k + 1) + '.', b: true }, { t: '\t' }, { t: q, b: true }].map((r) => r.t === '\t' ? Object.assign(r, { tab: true }) : r), `<w:tabs><w:tab w:val="left" w:pos="709"/></w:tabs><w:spacing w:before="0" w:after="${Math.round(E.questionSpace(S) * 567)}"/><w:ind w:left="709" w:hanging="425"/>`);
    });
    const hue = Math.round(E.q4Space(S) * 567);
    E.q4(S).forEach((r, k) => {
      const last = k === 3;
      body += para([{ t: 'abcd'[k] + '.' }, { t: '\t' }].concat(r), `<w:tabs><w:tab w:val="left" w:pos="1134"/></w:tabs><w:spacing w:before="0" w:after="${last ? 0 : hue}"/><w:ind w:left="1134" w:hanging="425"/><w:jc w:val="both"/>`);
    });
    if (E.hasLiterature(S)) {
      // Misma numeración, negrita y sangría que las cuatro preguntas anteriores.
      body += para([{ t: '5.', b: true }, { t: '\t' },
        { t: E.literatureQuestion(S), b: true }],
        `<w:tabs><w:tab w:val="left" w:pos="709"/></w:tabs><w:spacing w:before="0" w:after="${Math.round(E.questionSpace(S) * 567)}"/><w:ind w:left="709" w:hanging="425"/><w:keepNext/>`);
      // 10 pt (20 medios puntos) y Palatino Linotype solo en la tabla.
      const litFont = '<w:rFonts w:ascii="Palatino Linotype" w:hAnsi="Palatino Linotype" w:cs="Palatino Linotype" w:eastAsia="Palatino Linotype"/><w:sz w:val="20"/><w:szCs w:val="20"/>';
      const litParagraphs = (content, italic) => String(content || '').split(/\r?\n/)
        .map((line) => para([{ t: line, i: italic }],
          '<w:spacing w:before="0" w:after="0" w:line="300" w:lineRule="auto"/>', litFont)).join('');
      const half = Math.round(W / 2), rest = W - half;
      const litCell = (content, width) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${content}</w:tc>`;
      body += `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${bd(4)}<w:insideV w:val="single" w:sz="4" w:color="222222"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${half}"/><w:gridCol w:w="${rest}"/></w:tblGrid><w:tr>${litCell(litParagraphs(E.literatureLatin(S), true), half)}${litCell(litParagraphs(S.literatura.traduccion || '', false), rest)}</w:tr></w:tbl>`;
    }
    body = body.replace(/<w:r><w:t xml:space="preserve">\t<\/w:t><\/w:r>/g, '<w:r><w:tab/></w:r>').replace(/<w:r><w:rPr>(<w:[bi]\/>)*<\/w:rPr><w:t xml:space="preserve">\t<\/w:t><\/w:r>/g, '<w:r><w:tab/></w:r>');
    const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1247" w:bottom="1134" w:left="1247" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;
    const fld = (code) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${fld('PAGE')}<w:r><w:t xml:space="preserve"> | </w:t></w:r>${fld('NUMPAGES')}</w:p></w:ftr>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${X(font)}" w:hAnsi="${X(font)}" w:cs="${X(font)}" w:eastAsia="${X(font)}"/><w:sz w:val="${Math.round(E.fontSize(S) * 2)}"/><w:szCs w:val="${Math.round(E.fontSize(S) * 2)}"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
    const z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>');
    z.file('word/document.xml', doc);
    z.file('word/styles.xml', styles);
    z.file('word/footer1.xml', footer);
    return z.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  };
})();

