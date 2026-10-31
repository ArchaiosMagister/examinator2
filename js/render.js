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
    const toks = (S.tokens || []).filter((t) => under.has(t.i)).sort((a, b) => a.s - b.s);
    const runs = []; let pos = 0;
    for (const t of toks) {
      if (t.s < pos || t.e > text.length || text.slice(t.s, t.e) !== t.w) continue;
      if (t.s > pos) runs.push({ t: text.slice(pos, t.s) });
      runs.push({ t: t.w, u: true });
      pos = t.e;
    }
    if (pos < text.length) runs.push({ t: text.slice(pos) });
    // texto seguido: saltos de línea → espacios
    for (const r of runs) r.t = r.t.replace(/\s*\n\s*/g, ' ');
    return runs;
  };
  E.vocabList = function (S) {
    const out = (S.vocabItems || []).filter((v) => v.on);
    const coll = new Intl.Collator('es', { sensitivity: 'base' });
    return out.slice().sort((a, b) => coll.compare(M.fold(a.head).replace(/^[^a-z]+/, ''), M.fold(b.head).replace(/^[^a-z]+/, '')));
  };
  const listY = (arr) => { const a = arr.filter((x) => x && x.trim()); return a.length <= 1 ? a : [a.slice(0, -1), a[a.length - 1]]; };
  // Frases de la pregunta 4: [{ t, i }]
  E.q4 = function (S) {
    const p = (S.prev || []).filter((x) => x && x.txt);
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
      [{ t: 'Evolución fonética de ' }].concat(items((S.evol || []).map((x) => x && x.w)), [{ t: '.' }]),
      [{ t: 'Señala el prefijo y el significado que aporta a estas palabras: ' }].concat(commas(S.pref || []), [{ t: '.' }]),
      [{ t: 'Latinismos: ' }].concat(commas(S.latin || []), [{ t: '.' }])
    ];
  };
  E.questions = [
    'Traducción del texto. (4p.)',
    'Análisis sintáctico del texto. (1p.)',
    'Análisis morfológico de las palabras subrayadas. (1p.)',
    'Elige dos de estas cuatro preguntas (2p.):'
  ];
  E.fontStack = (f) => `'${f || 'Palatino Linotype'}', 'Palatino Linotype', 'Book Antiqua', Palatino, 'Gentium Book Plus', serif`;

  /* ---------- HTML ---------- */
  const runsHtml = (rs) => rs.map((r) => { let h = esc(r.t); if (r.i) h = `<i>${h}</i>`; if (r.u) h = `<u>${h}</u>`; return h; }).join('');
  E.pageCss = function (S) {
    const lh = S.interlineado || 3;
    return `
.page { font-family: ${E.fontStack(S.fuente)}; font-size: 11pt; color: #111; line-height: 1.35; }
.page .hdr { width: 100%; border: 1px solid #222; border-collapse: collapse; font-weight: bold; }
.page .hdr td { padding: 3pt 7pt; }
.page .hdr td:last-child { width: 26%; }
.page .ttl { margin: 9pt 0 0; padding: 5pt 0 6pt; border-top: .6pt solid #9a9a9a; border-bottom: .6pt solid #9a9a9a; text-align: center; }
.page .ttl .t { font-weight: bold; }
.page .txt { font-style: italic; text-align: justify; line-height: ${lh}; margin: 12pt 0 6pt; hyphens: manual; }
.page .txt u { text-decoration-thickness: .7pt; text-underline-offset: 2pt; }
.page .voc { border: 1px solid #222; padding: 3pt 7pt 4pt; margin: 6pt 0 10pt; }
.page .voc .vh { text-align: center; font-weight: bold; margin-bottom: 1pt; }
.page .voc p { margin: 0; padding-left: 1.2em; text-indent: -1.2em; }
.page ol.q { margin: 0; padding-left: 2.1em; }
.page ol.q > li { font-weight: bold; margin: 0 0 3pt; padding-left: .4em; }
.page ol.s { list-style: lower-alpha; font-weight: normal; padding-left: 1.6em; margin: 3pt 0 0; }
.page ol.s > li { font-weight: normal; text-align: justify; padding-left: .4em; margin-bottom: ${S.hueco || 2.6}cm; }
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
    return `<div class="page">
<table class="hdr"><tr><td>${esc(S.tipo || 'Examen')}</td><td>${esc(S.asig || 'Latín II')}</td></tr><tr><td>Nombre y apellidos:</td><td>Fecha:</td></tr></table>
<div class="ttl">${S.titulo ? `<div class="t">${esc(S.titulo)}</div>` : ''}${ref ? `<div class="r">${ref}</div>` : ''}${!S.titulo && !ref ? '&nbsp;' : ''}</div>
<div class="txt">${runsHtml(E.textRuns(S)) || '&nbsp;'}</div>
${voc.length ? `<div class="voc"><div class="vh">Vocabulario</div>${voc.map((v) => `<p><i>${esc(v.head)}:</i> ‘${esc(v.trad)}’${v.note ? ` (${esc(v.note)})` : ''}</p>`).join('')}</div>` : ''}
<ol class="q">
${E.questions.map((q, k) => `<li>${esc(q)}${k === 3 ? `<ol class="s">${q4.map((r) => `<li>${runsHtml(r)}</li>`).join('')}</ol>` : ''}</li>`).join('\n')}
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
    const font = S.fuente || 'Palatino Linotype';
    const W = 9354; // ancho útil en twips (A4 con márgenes de 2,2 cm)
    const bd = (sz) => `<w:top w:val="single" w:sz="${sz}" w:color="222222"/><w:left w:val="single" w:sz="${sz}" w:color="222222"/><w:bottom w:val="single" w:sz="${sz}" w:color="222222"/><w:right w:val="single" w:sz="${sz}" w:color="222222"/>`;
    const sp0 = '<w:spacing w:before="0" w:after="0"/>';
    let body = '';
    // cabecera
    const c1 = Math.round(W * 0.74), c2 = W - c1;
    const cell = (t, w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${para([{ t, b: true }], sp0)}</w:tc>`;
    body += `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${bd(6)}</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="${c1}"/><w:gridCol w:w="${c2}"/></w:tblGrid>` +
      `<w:tr>${cell(S.tipo || 'Examen', c1)}${cell(S.asig || 'Latín II', c2)}</w:tr><w:tr>${cell('Nombre y apellidos:', c1)}${cell('Fecha:', c2)}</w:tr></w:tbl>`;
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
    body += para(E.textRuns(S).map((r) => ({ t: r.t, u: r.u, i: true })), `<w:spacing w:before="240" w:after="120" w:line="${lh}" w:lineRule="auto"/><w:jc w:val="both"/>`);
    // vocabulario
    const voc = E.vocabList(S);
    if (voc.length) {
      const ps = [para([{ t: 'Vocabulario', b: true }], sp0 + '<w:jc w:val="center"/>')]
        .concat(voc.map((v) => para([{ t: v.head + ':', i: true }, { t: ' ‘' + v.trad + '’' + (v.note ? ' (' + v.note + ')' : '') }], sp0 + '<w:ind w:left="284" w:hanging="284"/>')));
      body += `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${bd(6)}</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="${W}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${W}" w:type="dxa"/></w:tcPr>${ps.join('')}</w:tc></w:tr></w:tbl>`;
      body += para([{ t: '' }], sp0);
    }
    // preguntas
    E.questions.forEach((q, k) => {
      body += para([{ t: (k + 1) + '.', b: true }, { t: '\t' }, { t: q, b: true }].map((r) => r.t === '\t' ? Object.assign(r, { tab: true }) : r), `<w:tabs><w:tab w:val="left" w:pos="709"/></w:tabs><w:spacing w:before="0" w:after="60"/><w:ind w:left="709" w:hanging="425"/>`);
    });
    const hue = Math.round((S.hueco || 2.6) * 567);
    E.q4(S).forEach((r, k) => {
      const last = k === 3;
      body += para([{ t: 'abcd'[k] + '.' }, { t: '\t' }].concat(r), `<w:tabs><w:tab w:val="left" w:pos="1134"/></w:tabs><w:spacing w:before="0" w:after="${last ? 0 : hue}"/><w:ind w:left="1134" w:hanging="425"/><w:jc w:val="both"/>`);
    });
    body = body.replace(/<w:r><w:t xml:space="preserve">\t<\/w:t><\/w:r>/g, '<w:r><w:tab/></w:r>').replace(/<w:r><w:rPr>(<w:[bi]\/>)*<\/w:rPr><w:t xml:space="preserve">\t<\/w:t><\/w:r>/g, '<w:r><w:tab/></w:r>');
    const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1247" w:bottom="1134" w:left="1247" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;
    const fld = (code) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${fld('PAGE')}<w:r><w:t xml:space="preserve"> | </w:t></w:r>${fld('NUMPAGES')}</w:p></w:ftr>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${X(font)}" w:hAnsi="${X(font)}" w:cs="${X(font)}" w:eastAsia="${X(font)}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
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
