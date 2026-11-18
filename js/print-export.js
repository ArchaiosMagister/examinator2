/* Impresión nativa para Safari: alternativa al PDF directo.
 * Palatino se toma del sistema si existe: no se distribuyen fuentes comerciales.
 * Se imprime el documento superior, no un iframe (más fiable en Safari iOS).
 */
'use strict';
(function () {
  let active = null;
  const mobileApple = () => /iPad|iPhone|iPod/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => !!navigator.standalone ||
    !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  function close() {
    if (!active) return;
    const current = active;
    active = null;
    window.removeEventListener('keydown', current.key);
    window.removeEventListener('resize', current.resize);
    current.root.remove();
    current.style.remove();
    // Safari puede estar cargando la pestaña imprimible.
    setTimeout(() => URL.revokeObjectURL(current.url), 5 * 60 * 1000);
  }

  function open(exam, options) {
    if (!exam || !window.M || !M.Exam) throw new Error('No hay un examen preparado para imprimir.');
    close();
    const E = M.Exam;
    const printableHtml = E.printDoc(exam);
    const url = URL.createObjectURL(new Blob([printableHtml], { type: 'text/html;charset=utf-8' }));
    const style = document.createElement('style');
    style.id = 'examinator-print-styles';
    style.textContent = E.pageCss(exam) + [
      '@page { size: A4; margin: 2cm 2.2cm 2cm 2.2cm; }',
      '@media screen {',
      '  #examinator-print-root { position:fixed; inset:0; z-index:1000; overflow:auto;',
      '    background:#d9d6cf; color:#26292b; font-family:system-ui,sans-serif; }',
      '  #examinator-print-root .ex-print-toolbar { position:sticky; top:0; z-index:2;',
      '    display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 16px;',
      '    background:#fbfaf6; border-bottom:1px solid #c5c0b5; }',
      '  #examinator-print-root .ex-print-toolbar button,',
      '  #examinator-print-root .ex-print-toolbar a { display:inline-block; font:inherit;',
      '    font-size:14px; cursor:pointer; border:1px solid #aeb4b6; border-radius:7px;',
      '    padding:9px 12px; color:#1d5466; background:white; text-decoration:none; }',
      '  #examinator-print-root .ex-print-toolbar .ex-print-action {',
      '    background:#1d5466; border-color:#1d5466; color:white; }',
      '  #examinator-print-root .ex-print-note { flex-basis:100%; margin:0; font-size:12px;',
      '    line-height:1.45; color:#4d5457; }',
      '  #examinator-print-root .ex-print-sheet { width:210mm; min-height:297mm; box-sizing:border-box;',
      '    margin:16px auto 32px; padding:2cm 2.2cm; background:white;',
      '    box-shadow:0 4px 20px #0002; }',
      '}',
      '@media print {',
      '  html, body { height:auto !important; min-height:0 !important;',
      '    overflow:visible !important; display:block !important; padding:0 !important;',
      '    margin:0 !important; background:white !important; }',
      '  body::before, body > :not(#examinator-print-root) { display:none !important; }',
      '  #examinator-print-root { display:block !important; position:static !important;',
      '    width:auto !important; height:auto !important; overflow:visible !important;',
      '    margin:0 !important; padding:0 !important; background:white !important; }',
      '  #examinator-print-root .ex-print-toolbar { display:none !important; }',
      '  #examinator-print-root .ex-print-sheet { zoom:1 !important; width:auto !important;',
      '    height:auto !important; min-height:0 !important; margin:0 !important;',
      '    padding:0 !important; box-shadow:none !important; background:white !important; }',
      '  #examinator-print-root .page { zoom:1 !important; transform:none !important;',
      '    width:auto !important; margin:0 !important; padding:0 !important; }',
      '  #examinator-print-root .hdr, #examinator-print-root .ttl { break-inside:avoid; }',
      '}'
    ].join('\n');
    const root = document.createElement('section');
    root.id = 'examinator-print-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Vista imprimible del examen');
    const standalone = mobileApple() && isStandalone();
    const note = standalone
      ? 'En la webapp instalada de iPad/iPhone el sistema puede bloquear la impresión. Si no aparece el diálogo, pulsa «Abrir vista imprimible» y utiliza Compartir → Imprimir desde Safari, si se abre allí. El PDF directo sigue disponible.'
      : 'En Safari, abre la vista previa del diálogo y usa Compartir → Guardar en Archivos para conservar el PDF. Se usa Palatino si está disponible en el dispositivo; de lo contrario, otra fuente.';
    root.innerHTML =
      '<div class="ex-print-toolbar">' +
        '<button type="button" class="ex-print-action">Imprimir / Guardar PDF</button>' +
        '<a class="ex-print-open" target="_blank" rel="noopener">Abrir vista imprimible</a>' +
        '<button type="button" class="ex-print-close">Cerrar</button>' +
        '<p class="ex-print-note"></p>' +
      '</div><div class="ex-print-sheet">' + E.html(exam) + '</div>';
    root.querySelector('.ex-print-note').textContent = note;
    root.querySelector('.ex-print-open').href = url;
    const print = () => {
      // Debe ejecutarse desde el gesto del usuario; una promesa previa
      // puede hacer que Safari bloquee el cuadro de impresión.
      try { window.print(); }
      catch (error) {
        if (M.toast) M.toast('No se pudo abrir el diálogo de impresión: ' + error.message, 6000);
      }
    };
    root.querySelector('.ex-print-action').addEventListener('click', print);
    root.querySelector('.ex-print-close').addEventListener('click', close);
    const key = (e) => { if (e.key === 'Escape') close(); };
    const resize = () => {
      const paper = root.querySelector('.ex-print-sheet');
      const scale = Math.min(1, Math.max(0.3, (window.innerWidth - 28) / 794));
      paper.style.zoom = String(scale);
    };
    document.head.appendChild(style);
    document.body.appendChild(root);
    active = { style, root, url, key, resize };
    window.addEventListener('keydown', key);
    window.addEventListener('resize', resize);
    resize();
    root.querySelector('.ex-print-action').focus();
    if (!options || options.immediate !== false) {
      root.getBoundingClientRect(); // Forzar diseño antes de imprimir.
      print();
    }
    return { prepared: true, standalone, selectedFont: exam.fuente || 'Palatino' };
  }
  window.EXPrint = { open, close, isStandalone };
})();
