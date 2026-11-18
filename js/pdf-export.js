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

  async function generate(html) {
    if (typeof window.html2pdf !== 'function') {
      throw new Error('No se ha podido cargar el generador de PDF sin conexión. Pulsa Actualizar.');
    }
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const source = parsed.body.querySelector('.page');
    const sourceCss = parsed.querySelector('style');
    if (!source || !sourceCss) throw new Error('El examen no contiene una página exportable.');

    const css = document.createElement('style');
    css.dataset.pdfExport = 'styles';
    css.textContent = sourceCss.textContent;
    document.head.appendChild(css);
    const host = document.createElement('div');
    host.dataset.pdfExport = 'host';
    // La hoja A4 tiene 210mm de ancho; dejamos 22mm a cada lado.
    // Se utiliza el contenido ya generado, sin regenerar preguntas.
    host.style.cssText = 'position:absolute;left:-12000px;top:0;width:166mm;pointer-events:none;';
    const content = document.importNode(source, true);
    content.style.cssText = 'box-sizing:border-box;width:166mm;max-width:166mm;margin:0;transform:none;zoom:1;';
    host.appendChild(content);
    document.body.appendChild(host);
    try {
      await document.fonts.ready;
      const pdf = await window.html2pdf().set({
        margin: [20, 22, 20, 22],
        filename: 'examen.pdf',
        image: { type:'jpeg', quality:0.97 },
        html2canvas: {
          scale:2, useCORS:true, allowTaint:false,
          backgroundColor:'#ffffff', windowWidth:1050
        },
        jsPDF: { unit:'mm', format:'a4', orientation:'portrait', compress:true },
        pagebreak: { mode:['css','legacy'], avoid:['.hdr','.ttl','.voc .vh','.literature h3'] }
      }).from(content).toPdf().get('pdf');
      const pages = pdf.internal.getNumberOfPages();
      if (!pages || pages > 100) throw new Error('No se han podido componer las páginas del PDF.');
      // Mismo contador que el Word: 1 | 2, 2 | 2, etc.
      pdf.setFont('helvetica','normal');
      pdf.setFontSize(9);
      for (let i=1;i<=pages;i++) {
        pdf.setPage(i);
        pdf.setTextColor(35,35,35);
        pdf.text(i+' | '+pages,105,288,{align:'center'});
      }
      const result=pdf.output('blob');
      if (!(result instanceof Blob) || result.size < 1000) throw new Error('El PDF generado está vacío.');
      return result;
    } finally {
      host.remove();
      css.remove();
    }
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

  window.EXPdf = { isIOS, generate, deliver, cleanName };
})();
