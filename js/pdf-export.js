/* Exportación PDF autónoma para Safari iOS / PWA.
 * Renderiza el mismo contenido HTML del examen en un PDF A4 local.
 * No depende de window.print(), que puede no abrirse en PWA instalada.
 * Bundle html2pdf.js (licencias conservadas en lib/) precargado offline.
 */
'use strict';
(function () {
  function isIOS() {
    const n = navigator || {};
    return /iPad|iPhone|iPod/i.test(n.userAgent || '') ||
      (n.platform === 'MacIntel' && Number(n.maxTouchPoints) > 1);
  }

  function cleanName(name) {
    const stem = String(name || 'Examen').replace(/\.pdf$/i, '')
      .replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Examen';
    return stem.slice(0, 120) + '.pdf';
  }

  // pdfmake trabaja con objetos de texto y fuentes incrustadas: nunca
  // transforma el documento en una imagen. Los scripts son locales y
  // precargados por la PWA; se cargan solo al exportar desde iOS.
  let rendererPromise = null;
  let fontsReady = false;
  function script(src) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('No se pudo cargar ' + src + '. Pulsa Actualizar.'));
      document.head.appendChild(tag);
    });
  }
  function renderer() {
    if (window.pdfMake && window.pdfMake.createPdf && fontsReady) return Promise.resolve(window.pdfMake);
    if (!rendererPromise) rendererPromise = (async () => {
      if (!window.pdfMake || !window.pdfMake.createPdf) await script('lib/pdfmake.min.js');
      await script('lib/pdfmake-vfs.js');
      if (!window.pdfMake || !window.pdfMake.createPdf) {
        throw new Error('El generador PDF no está disponible. Pulsa Actualizar.');
      }
      // pdfmake 0.2 registra las fuentes mediante addVirtualFileSystem(),
      // pero no expone una propiedad pública pdfMake.vfs.
      fontsReady = true;
      return window.pdfMake;
    })().catch((err) => { rendererPromise = null; throw err; });
    return rendererPromise;
  }

  const cm = (n) => Number(n) * 72 / 2.54;
  function definition(S) {
    if (!S || !window.M || !M.Exam) throw new Error('No se ha cargado el examen.');
    const E = M.Exam;
    const size = E.fontSize(S);
    const noBorder = {
      hLineWidth: () => 0, vLineWidth: () => 0,
      paddingLeft: () => 0, paddingRight: () => 0,
      paddingTop: () => 0, paddingBottom: () => 0
    };
    const outlined = {
      hLineWidth: (i, node) => i === 0 || i === node.table.body.length ? 0.75 : 0,
      vLineWidth: (i, node) => i === 0 || i === node.table.widths.length ? 0.75 : 0,
      hLineColor: () => '#222222',
      vLineColor: () => '#222222',
      paddingLeft: () => 7, paddingRight: () => 7,
      paddingTop: () => 3, paddingBottom: () => 3
    };
    const rich = (runs) => runs.map((r) => {
      const out = { text: String(r.t || '') };
      if (r.i) out.italics = true;
      if (r.b) out.bold = true;
      if (r.u) out.decoration = 'underline';
      return out;
    });
    const content = [];
    // Cabecera: exclusivamente sus cuatro bordes exteriores.
    content.push({
      table: {
        widths: ['*', 122],
        dontBreakRows: true,
        body: [
          [{ text: E.headerLeft(S), bold: true }, { text: E.headerRight(S), bold: true }],
          [{ text: 'Nombre y apellidos:', bold: true }, { text: 'Fecha:', bold: true }]
        ]
      },
      layout: outlined
    });
    // Título y referencia en sus dos filetes propios.
    const maxWidth = 595.28 - 2 * cm(2.2);
    const line = () => ({ canvas: [{
      type: 'line', x1: 0, y1: 0, x2: maxWidth, y2: 0,
      lineColor: '#999999', lineWidth: 0.6
    }] });
    const refs = [];
    if (S.refAutor) refs.push({ text: S.refAutor });
    if (S.refObra) {
      if (refs.length) refs.push({ text: ', ' });
      refs.push({ text: S.refObra, italics: true });
    }
    if (S.refCita) {
      if (refs.length) refs.push({ text: ' ' });
      refs.push({ text: S.refCita });
    }
    const title = [line()];
    if (S.titulo) title.push({ text: S.titulo, bold: true, alignment: 'center', margin: [0, 5, 0, 1] });
    if (refs.length) title.push({ text: refs, alignment: 'center', margin: [0, S.titulo ? 0 : 5, 0, 5] });
    if (!S.titulo && !refs.length) title.push({ text: ' ', margin: [0, 5, 0, 5] });
    title.push(line());
    content.push({ stack: title, unbreakable: true, margin: [0, 9, 0, 0] });

    const latinRuns = E.textRuns(S);
    content.push({
      text: latinRuns.length ? latinRuns.map((r) => ({
        text: r.t, italics: !r.n,
        ...(r.u ? { decoration: 'underline' } : {})
      })) : ' ',
      alignment: 'justify',
      lineHeight: Number(S.interlineado) || 3,
      margin: [0, 12, 0, 6]
    });

    const vocabulary = E.vocabList(S);
    if (vocabulary.length) {
      const body = [[{ text: 'Vocabulario', bold: true, alignment: 'center' }]];
      vocabulary.forEach((v) => {
        body.push([{
          text: [
            { text: String(v.head || '') + ':', italics: true },
            { text: ' ‘' + String(v.trad || '') + '’' + (v.note ? ' (' + v.note + ')' : '') }
          ]
        }]);
      });
      // Una fila por entrada permite que el glosario continúe en otra
      // página si es extenso. No usar una única fila irrompible, porque
      // cortaría o desplazaría glosarios de varias decenas de palabras.
      content.push({
        table: { widths: ['*'], headerRows: 1, dontBreakRows: true, body },
        layout: {
          ...outlined,
          paddingTop: (i) => i === 0 ? 3 : 0,
          paddingBottom: (i, node) => i === node.table.body.length - 1 ? 4 : 0
        },
        margin: [0, 6, 0, 10]
      });
    }

    E.questionList(S).forEach((q, i) => {
      content.push({
        columns: [
          { text: String(i + 1) + '.', width: 24, bold: true },
          { text: q, width: '*', bold: true }
        ],
        columnGap: 0,
        margin: [0, 0, 0, cm(E.questionSpace(S))]
      });
      if (i === 3) E.q4(S).forEach((runs, k) => {
        content.push({
          columns: [
            { text: String.fromCharCode(97 + k) + '.', width: 35 },
            { text: rich(runs), width: '*', alignment: 'justify' }
          ],
          columnGap: 0,
          margin: [0, 3, 0, k === 3 ? 0 : cm(E.q4Space(S))]
        });
      });
    });

    if (S.literatura && S.literatura.texto) {
      const L = S.literatura;
      content.push({
        text: 'Literatura' + (E.documentMode(S) === 'repaso' ? '' : ' (2p.)'),
        bold: true, margin: [0, 12, 0, 4]
      });
      content.push({ text: E.literatureRef(L), margin: [0, 0, 0, 4] });
      content.push({ text: E.literatureLatin(S), italics: true, preserveLeadingSpaces: true, margin: [0, 0, 0, 8] });
      content.push({ text: 'Traducción', bold: true, margin: [0, 4, 0, 0] });
      content.push(L.traduccion
        ? { text: L.traduccion, margin: [0, 2, 0, 0] }
        : { text: '\n\n\n\n', margin: [0, 0, 0, 0] });
    }

    return {
      pageSize: 'A4',
      pageMargins: [cm(2.2), cm(2), cm(2.2), cm(2)],
      defaultStyle: {
        font: 'Roboto',
        fontSize: size,
        color: '#111111',
        lineHeight: 1.35
      },
      content,
      footer: (page, total) => ({
        text: page + ' | ' + total, alignment: 'center', fontSize: 9,
        color: '#333333', margin: [0, 0, 0, 18]
      }),
      info: { title: E.headerLeft(S), creator: 'Examinator2' }
    };
  }

  async function generate(S) {
    const pdfMake = await renderer();
    await M.Exam.prepareLiterature(S);
    const doc = definition(S);
    const result = await new Promise((resolve, reject) => {
      try { pdfMake.createPdf(doc).getBlob((blob) => resolve(blob)); }
      catch (e) { reject(e); }
    });
    if (!(result instanceof Blob) || result.size < 1000) {
      throw new Error('El PDF generado está vacío.');
    }
    return result;
  }

  function deliver(blob, requestedName) {
    const filename=cleanName(requestedName);
    const url=URL.createObjectURL(blob);
    // No revocar al cerrar el diálogo inmediatamente: Safari puede
    // seguir procesando "Guardar en Archivos" durante unos segundos.
    setTimeout(() => URL.revokeObjectURL(url), 15*60*1000);
    const link='<p>El PDF está preparado. Puedes descargarlo directamente'+
      ' o compartirlo para elegir <b>Guardar en Archivos</b> en el iPad.</p>'+
      '<p><a class="hbtn primary pdf-download-link" href="'+url+
      '" download="'+M.esc(filename)+'">Descargar PDF</a></p>';

    let file=null, canShare=false;
    if (typeof File === 'function' && typeof navigator.share === 'function') {
      file=new File([blob],filename,{type:'application/pdf'});
      try { canShare=!navigator.canShare || navigator.canShare({files:[file]}); }
      catch (_) { canShare=false; }
    }
    const actions=[];
    if (canShare) actions.push({
      label:'Compartir PDF',primary:true,
      // Llamada SIN await antes de share(): conserva el gesto del botón en iOS.
      onclick:() => {
        navigator.share({files:[file],title:filename}).catch(e=>{
          if (e && e.name !== 'AbortError') M.toast('No se pudo compartir: '+e.message,5000);
        });
        return false;
      }
    });
    actions.push({label:'Cerrar'});
    M.modal('PDF preparado',link,actions);
    return {prepared:true,filename};
  }

  window.EXPdf = { isIOS, generate, deliver, cleanName, definition };
})();
