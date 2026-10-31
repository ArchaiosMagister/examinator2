/* start.js — arranque, archivos y ajustes */
'use strict';
(function () {
  const { $ } = M;
  const FONTS = ['Palatino Linotype', 'Book Antiqua', 'Times New Roman', 'Garamond', 'Cambria', 'Georgia', 'Gentium Book Plus'];

  const baseName = () => {
    const S = M.S;
    const t = [S.tipo || 'Examen', S.asig || '', S.refAutor || '', S.refCita || ''].filter(Boolean).join(' ');
    return t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Examen';
  };
  async function exportDocx() {
    const data = await M.Exam.docx(M.S);
    const p = await window.api.saveFile({ defaultName: baseName() + '.docx', filters: [{ name: 'Documento de Word', extensions: ['docx'] }], data, encoding: 'base64' });
    if (p) done(p); else if (window.api.web) M.toast('Documento de Word descargado.');
  }
  async function exportPdf() {
    const p = await window.api.makePdf({ html: M.Exam.printDoc(M.S), defaultName: baseName() + '.pdf' });
    if (p) done(p); else if (window.api.web) M.toast('En la ventana de impresión elige «Guardar como PDF».', 6000);
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
  async function openExam() {
    const r = await window.api.openFile({ filters: [{ name: 'Examen de Examinator', extensions: ['examen', 'json'] }] });
    if (!r) return;
    try { const S = JSON.parse(r.text); if (!S.examinator && !S.v) throw new Error(); delete S.examinator; M.loadExam(Object.assign(M.newExam(), S)); M.toast('Examen abierto.'); }
    catch (e) { M.toast('Ese archivo no es un examen de Examinator.', 4000); }
  }
  function settings() {
    const S = M.S;
    const html = `
      <div class="field"><label>Tipo de letra del examen</label><select class="sf">${FONTS.map((f) => `<option>${f}</option>`).join('')}</select>
        <span class="small muted">Palatino Linotype y Book Antiqua vienen con Windows y tienen todas las vocales con cantidad.</span></div>
      <div class="field"><label>Interlineado del texto latino</label><select class="si"><option value="2">doble</option><option value="2.5">2,5</option><option value="3">triple</option><option value="3.5">3,5</option></select></div>
      <div class="field"><label>Espacio para responder tras cada apartado de la pregunta 4</label><select class="sh"><option value="1.8">pequeño</option><option value="2.6">medio</option><option value="3.5">grande</option></select></div>
      <p class="small muted">Los textos descargados y las listas se guardan en la carpeta <i>datos</i>, junto a la carpeta del programa.</p>`;
    const m = M.modal('Ajustes', html, [{ label: 'Cerrar', primary: true }]);
    const b = m.body;
    b.querySelector('.sf').value = S.fuente; b.querySelector('.si').value = String(S.interlineado); b.querySelector('.sh').value = String(S.hueco);
    b.addEventListener('change', (e) => {
      if (e.target.classList.contains('sf')) { S.fuente = e.target.value; M.store.set('fuente', S.fuente); }
      if (e.target.classList.contains('si')) { S.interlineado = +e.target.value; M.store.set('interlineado', S.interlineado); }
      if (e.target.classList.contains('sh')) { S.hueco = +e.target.value; M.store.set('hueco', S.hueco); }
      M.persist(); M.preview();
    });
  }

  async function init() {
    $('#btnNew').onclick = () => M.modal('Examen nuevo', '<p>¿Empezar un examen nuevo? Se borrará el que estás editando (guárdalo antes si lo quieres conservar).</p>', [{ label: 'Cancelar' }, { label: 'Empezar', primary: true, onclick: () => { M.loadExam(M.newExam()); } }]);
    $('#btnOpen').onclick = openExam;
    $('#btnSave').onclick = saveExam;
    $('#btnLib').onclick = () => M.openLibrary();
    $('#btnLists').onclick = () => M.openLists();
    $('#btnSettings').onclick = settings;
    $('#btnDocx').onclick = () => exportDocx().catch((e) => M.toast('Error: ' + e.message, 6000));
    $('#btnPdf').onclick = () => exportPdf().catch((e) => M.toast('Error: ' + e.message, 6000));
    window.api.on('fatal', (msg) => M.toast('Error del motor: ' + msg, 10000));
    M.lists = await M.call('lists');
    const saved = M.store.get('current', null);
    M.loadExam(saved ? Object.assign(M.newExam(), saved) : M.newExam());
  }
  window.addEventListener('DOMContentLoaded', init);
})();
