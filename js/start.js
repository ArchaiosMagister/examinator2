/* start.js — arranque, archivos y ajustes */
'use strict';
(function () {
  const { $ } = M;
  const FONTS = ['Palatino', 'Palatino Linotype', 'Book Antiqua', 'Times New Roman', 'Garamond', 'Cambria', 'Georgia', 'Gentium Book Plus'];

  const baseName = (S = M.S) => {
    const t = [S.tipo || 'Examen', S.asig || '', S.refAutor || '', S.refCita || ''].filter(Boolean).join(' ');
    return t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Examen';
  };
  let exportingWord = false, exportingPdf = false;
  async function exportDocx() {
    if (exportingWord) return;
    exportingWord = true;
    const exam = M.S;
    try {
      const data = await M.Exam.docx(exam);
      const p = await window.api.saveFile({ defaultName: baseName(exam) + '.docx', filters: [{ name: 'Documento de Word', extensions: ['docx'] }], data, encoding: 'base64' });
      if (p) done(p); else if (window.api.web) M.toast('Documento de Word descargado.');
    } finally { exportingWord = false; }
  }
  async function exportPdf() {
    if (exportingPdf) return;
    exportingPdf = true;
    const exam = M.S;
    try {
      // Preparar siempre el mismo examen del comienzo al fin de la exportación.
      await M.Exam.prepareLiterature(exam);
      if (M.S !== exam) return;
      const p = await window.api.makePdf({ html: M.Exam.printDoc(exam), defaultName: baseName(exam) + '.pdf' });
      if (p && p.prepared) return; // iPad: descarga/compartición ya ofrecidas.
      if (p) done(p);
      else if (window.api.web) M.toast('En el diálogo de impresión elige «Guardar como PDF».', 6000);
    } finally { exportingPdf = false; }
  }
  function done(p) {
    M.modal('Examen guardado', `<p>Se ha guardado en:</p><p class="small" style="word-break:break-all">${M.esc(p)}</p>`, [
      { label: 'Mostrar en la carpeta', onclick: () => { window.api.showFile(p); } },
      { label: 'Abrir', primary: true, onclick: () => { window.api.openPath(p); } }]);
  }
  async function saveExam() {
    const data = JSON.stringify(Object.assign({ examinator: 1 }, M.S));
    const p = await window.api.saveFile({ defaultName: baseName() + '.examen', filters: [{ name: 'Examen de Examinator', extensions: ['examen'] }], data, encoding: 'utf8' });
    if (p) M.toast('Guardado: ' + p, 3500); else if (window.api.web) M.toast('Examen descargado (archivo .examen).');
  }
  // Las preferencias actuales no deben sobrescribir el interlineado de archivos antiguos.
  function restoreExam(saved) {
    const exam = Object.assign(M.newExam(), saved);
    if (!Object.prototype.hasOwnProperty.call(saved, 'interlineadoPuntos')) {
      exam.interlineadoPuntos = null;
    }
    if (!Object.prototype.hasOwnProperty.call(saved, 'espacioVocabularioPuntos')) {
      exam.espacioVocabularioPuntos = null;
    }
    return exam;
  }
  function showLatinSpacingWarning(value) {
    const msg = String(value).trim() ? M.Exam.latinSpacingWarning(M.S, value) : '';
    for (const id of ['#latinSpacingWarning', '#previewSpacingWarning']) {
      const el = $(id);
      if (!el) continue;
      el.textContent = msg;
      el.classList.toggle('hidden', !msg);
    }
  }
  M.syncLatinSpacingControls = function () {
    const S = M.S;
    if (!S) return;
    const value = String(M.Exam.latinLineSpacingPt(S));
    for (const id of ['#latinSpacingPt', '#previewLatinSpacing']) {
      const control = $(id);
      if (control && document.activeElement !== control) control.value = value;
    }
    const mode = $('#vocabGapMode'), gap = $('#vocabGapPt');
    const custom = S.espacioVocabularioPuntos !== null &&
      S.espacioVocabularioPuntos !== undefined && S.espacioVocabularioPuntos !== '';
    if (mode) mode.value = custom ? 'manual' : 'auto';
    if (gap) {
      gap.disabled = !custom;
      if (document.activeElement !== gap) gap.value = String(M.Exam.vocabGapPt(S));
    }
    showLatinSpacingWarning(value);
  };
  function setLatinSpacing(control) {
    const raw = control.value.trim(), n = Number(raw);
    if (!raw || !Number.isFinite(n) || n < 12 || n > 144) {
      control.value = String(M.Exam.latinLineSpacingPt(M.S));
      M.toast('Introduce un interlineado entre 12 y 144 puntos.');
      M.syncLatinSpacingControls();
      return;
    }
    M.S.interlineadoPuntos = n;
    M.store.set('interlineadoPuntos', n);
    M.persist(); M.preview();
    showLatinSpacingWarning(n);
  }
  async function openExam() {
    const r = await window.api.openFile({ filters: [{ name: 'Examen de Examinator', extensions: ['examen', 'json'] }] });
    if (!r) return;
    try { const S = JSON.parse(r.text); if (!S.examinator && !S.v) throw new Error(); delete S.examinator; M.loadExam(restoreExam(S)); M.toast('Examen abierto.'); }
    catch (e) { M.toast('Ese archivo no es un examen de Examinator.', 4000); }
  }
  function settings() {
    const S = M.S;
    const html = `
      <div class="field"><label for="themeMode">Apariencia</label>
        <select id="themeMode" class="stheme">
          <option value="light">Claro</option><option value="dark">Oscuro</option><option value="oled">OLED (negro puro)</option>
        </select>
        <span class="small muted">Solo cambia la interfaz. La hoja A4 y los documentos Word/PDF mantienen sus colores.</span>
      </div>
      <div class="field"><label>Tipo de letra del examen</label><select class="sf">${FONTS.map((f) => `<option>${f}</option>`).join('')}</select>
        <span class="small muted">Palatino y Palatino Linotype se usan si están instaladas; Gentium Book Plus está incluida como alternativa.</span></div>
      <div class="field"><label>Tamaño de letra (puntos)</label><select class="sz">${[10, 10.5, 11, 11.5, 12, 13, 14].map((n) => `<option value="${n}">${String(n).replace('.', ',')}</option>`).join('')}</select></div>
      <div class="field"><label>Espacio entre preguntas (cm)</label><input class="sq" type="number" min="0" max="10" step="0.1"></div>
      <div class="field"><label for="latinSpacingPt">Interlineado del texto latino (puntos de Word)</label>
        <input id="latinSpacingPt" class="si" type="number" min="12" max="144" step="any" inputmode="decimal" list="latinSpacingExamples">
        <datalist id="latinSpacingExamples">${[18, 24, 30, 36, 42, 48, 60].map((n) => `<option value="${n}"></option>`).join('')}</datalist>
        <span class="small muted">Escribe el valor exacto en puntos, también con decimales (12–144). Se aplica a la vista previa, Word y PDF.</span>
        <span id="latinSpacingWarning" class="spacing-warning hidden" role="status" aria-live="polite"></span>
      </div>
      <div class="field"><label for="vocabGapMode">Separación entre texto y vocabulario</label>
        <select id="vocabGapMode" class="vgm">
          <option value="auto">Automática (una línea de interlineado)</option>
          <option value="manual">Personalizada en puntos</option>
        </select>
        <input id="vocabGapPt" class="svgap" type="number" min="0" max="144" step="any" inputmode="decimal" aria-label="Separación personalizada en puntos">
        <span class="small muted">En automático sigue el interlineado. En personalizado puedes escribir de 0 a 144 pt, sin modificar las líneas del texto.</span>
      </div>
      <div class="field"><label for="q4Space">Espacio entre los apartados de la pregunta 4 (cm)</label><input id="q4Space" class="sh" type="number" min="0" max="10" step="0.05" inputmode="decimal"><span class="small muted">Hueco para responder, de 0 a 10 cm, ajustable de 0,05 en 0,05 cm. Se aplica a vista previa, Word y PDF.</span></div>
      <button class="tbtn sv">Vocabulario preferente…</button><p class="small muted">Los ajustes, el vocabulario y las descargas se guardan en este navegador.</p>`;
    const m = M.modal('Ajustes', html, [{ label: 'Cerrar', primary: true }]);
    const b = m.body;
    b.querySelector('.stheme').value = window.EXTheme.current();
    b.querySelector('.sz').value = String(S.tamano ?? 11);
    b.querySelector('.sq').value = String(S.espacioPreguntas ?? 0.3);
    b.querySelector('.sv').onclick = () => M.openVocabulary();
    b.querySelector('.sf').value = S.fuente; b.querySelector('.si').value = String(M.Exam.latinLineSpacingPt(S)); b.querySelector('.sh').value = String(M.Exam.q4Space(S));
    M.syncLatinSpacingControls();
    b.addEventListener('input', (e) => {
      if (e.target.classList.contains('si')) showLatinSpacingWarning(e.target.value);
    });
    b.addEventListener('change', (e) => {
      if (e.target.classList.contains('stheme')) {
        window.EXTheme.set(e.target.value);
        return; // Apariencia global, no modifica el examen ni la vista previa.
      }
      if (e.target.classList.contains('sz')) { S.tamano = +e.target.value; M.store.set('tamano', S.tamano); }
      if (e.target.classList.contains('sq')) { const n = +e.target.value; if (!Number.isFinite(n) || n < 0 || n > 10) return; S.espacioPreguntas = n; M.store.set('espacioPreguntas', n); }
      if (e.target.classList.contains('sf')) { S.fuente = e.target.value; M.store.set('fuente', S.fuente); }
      if (e.target.classList.contains('si')) {
        setLatinSpacing(e.target);
        return;
      }
      if (e.target.classList.contains('vgm')) {
        if (e.target.value === 'auto') {
          S.espacioVocabularioPuntos = null;
        } else {
          S.espacioVocabularioPuntos = M.Exam.vocabGapPt(S);
        }
        M.store.set('espacioVocabularioPuntos', S.espacioVocabularioPuntos);
      }
      if (e.target.classList.contains('svgap')) {
        const value = e.target.value.trim(), n = Number(value);
        if (!value || !Number.isFinite(n) || n < 0 || n > 144) {
          e.target.value = String(M.Exam.vocabGapPt(S));
          M.toast('Introduce una separación entre 0 y 144 puntos.');
          return;
        }
        S.espacioVocabularioPuntos = n;
        M.store.set('espacioVocabularioPuntos', n);
      }
      if (e.target.classList.contains('sh')) {
        const value = e.target.value.trim();
        const n = Number(value);
        if (!value || !Number.isFinite(n) || n < 0 || n > 10) {
          e.target.value = String(M.Exam.q4Space(S));
          M.toast('Introduce un espacio entre 0 y 10 cm.');
          return;
        }
        S.hueco = n; M.store.set('hueco', n);
      }
      M.persist(); M.preview();
    });
  }

  async function init() {
    const quickSpacing = $('#previewLatinSpacing');
    quickSpacing.addEventListener('input', (e) => showLatinSpacingWarning(e.target.value));
    quickSpacing.addEventListener('change', (e) => setLatinSpacing(e.target);
    $('#btnNew').onclick = () => M.modal('Examen nuevo', '<p>¿Empezar un examen nuevo? Se borrará el que estás editando (guárdalo antes si lo quieres conservar).</p>', [{ label: 'Cancelar' }, { label: 'Empezar', primary: true, onclick: () => { M.loadExam(M.newExam()); } }]);
    $('#btnOpen').onclick = () => openExam().catch((e) => M.toast('No se pudo abrir el examen: ' + e.message, 6000));
    $('#btnSave').onclick = saveExam;
    $('#btnLib').onclick = () => M.openLibrary();
    $('#btnLists').onclick = () => M.openLists();
    $('#btnSettings').onclick = settings;
    $('#btnDocx').onclick = () => exportDocx().catch((e) => M.toast('Error: ' + e.message, 6000));
    $('#btnPdf').onclick = () => exportPdf().catch((e) => M.toast('Error: ' + e.message, 6000));
    window.api.on('fatal', (msg) => M.toast('Error del motor: ' + msg, 10000));
    M.lists = await M.call('lists');
    const saved = M.store.get('current', null);
    // Una preferencia dañada no debe impedir abrir la aplicación.
    const valid = saved && typeof saved === 'object' && !Array.isArray(saved) &&
      typeof saved.texto === 'string';
    M.loadExam(valid ? restoreExam(saved) : M.newExam());
  }
  window.addEventListener('DOMContentLoaded', init);
})();

