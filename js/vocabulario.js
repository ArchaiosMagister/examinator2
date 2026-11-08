/* Vocabulario docente preferente; Collatinus sigue siendo el respaldo. */
'use strict';
(function () {
  const key = (s) => M.fold(s).replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/j/g, 'i').replace(/v/g, 'u').replace(/\d+$/, '').trim();
  const lemma = (s) => key(String(s || '').split(/[,\s(]/)[0]);
  const V = M.Vocabulary = {};
  V.parse = function (text) {
    if (!text.trim()) return [];
    let rows;
    if (text.trim().startsWith('[')) rows = JSON.parse(text);
    else rows = text.split(/\r?\n/).filter((s) => s.trim()).map((line) => {
      const [head, trad, formas = '', note = ''] = line.split('\t');
      return { head, trad, formas: formas.split('|').filter(Boolean), note };
    });
    if (!Array.isArray(rows)) throw new Error('Se necesita una lista de entradas.');
    const seen = new Set();
    return rows.map((r, i) => {
      const head = String(r.head || r.enunciado || '').trim();
      const trad = String(r.trad || r.traduccion || '').trim();
      if (!head || !trad) throw new Error(`Entrada ${i + 1}: faltan el enunciado o la traducción.`);
      const forms = r.formas || [];
      if (!Array.isArray(forms) || forms.some((s) => typeof s !== 'string')) throw new Error(`Entrada ${i + 1}: las formas deben ser una lista de palabras.`);
      const k = lemma(r.lema || head);
      if (!k || seen.has(k)) throw new Error(`Entrada ${i + 1}: lema vacío o repetido (${k}).`);
      seen.add(k);
      return { lema: r.lema || head.split(',')[0].trim(), head, trad, formas: forms, note: String(r.note || '') };
    });
  };
  V.rows = () => M.store.get('vocabulario', []);
  V.find = function (names, formsOnly) {
    const keys = new Set(names.filter(Boolean).map(formsOnly ? key : lemma));
    return V.rows().find((r) => (formsOnly ? r.formas.map(key) : [lemma(r.lema || r.head)]).some((k) => keys.has(k)));
  };
  M.vocabEntries = async function (args) {
    const entries = await M.call('vocabEntries', args);
    for (const e of entries) {
      const t = (M.S.tokens || []).find((t) => t.sel && t.sel.lid === e.lid);
      const preferred = V.find([t && t.lplain, t && t.lemma, e.head]);
      if (preferred) Object.assign(e, { head: preferred.head, trad: preferred.trad, note: preferred.note, preferred: true });
    }
    return entries;
  };
  M.openVocabulary = function () {
    const modal = M.modal('Vocabulario preferente', `<p>Una entrada por línea, con columnas separadas por tabuladores: enunciado, traducción y, opcionalmente, formas separadas por | y aclaración. También puedes importar JSON.</p><p class="small muted">Las palabras ausentes seguirán usando el diccionario actual. Las cantidades de tu lista se conservan tal como las escribas.</p><input class="vf" type="file" accept=".json,.tsv,.txt"><textarea class="vd" rows="12" spellcheck="false"></textarea><p class="ve" role="alert"></p>`, [
      { label: 'Cancelar' },
      { label: 'Aplicar vocabulario', primary: true, onclick: async (body) => {
        try {
          const rows = V.parse(M.$('.vd', body).value);
          const serialized = JSON.stringify(rows);
          localStorage.setItem('examinator.vocabulario', serialized);
          await M.refreshVocab();
          M.toast(`${rows.length} entradas preferentes aplicadas.`);
        } catch (e) { M.$('.ve', body).textContent = e.message; return false; }
      } }
    ], { width: '720px' });
    M.$('.vd', modal.body).value = JSON.stringify(V.rows(), null, 2);
    M.$('.vf', modal.body).onchange = async (e) => {
      try { if (e.target.files[0]) M.$('.vd', modal.body).value = await e.target.files[0].text(); }
      catch (e) { M.$('.ve', modal.body).textContent = e.message; }
    };
  };
})();
