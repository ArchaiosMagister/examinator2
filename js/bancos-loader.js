/* Bancos docentes locales de Examinator2; ningún acceso de red en ejecución. */
'use strict';
(function () {
  const source = window.EXACADEMIC_SOURCE;
  if (!source || !source.fonetica || !source.latinismos) return;
  const f = source.fonetica;
  const groups = new Map(f.normas.map((n) => [n.id, {
    id: n.id, nombre: n.nombre, desc: n.descripcion || '', palabras: []
  }]));
  const seen = new Map(f.normas.map((n) => [n.id, new Set()]));
  for (const item of f.items) {
    if (item.estado !== 'APTO_PROPUESTO' || !item.latin) continue;
    for (const key of item.normas || []) {
      if (!groups.has(key)) continue;
      const word = item.latin.trim();
      const identifier = word.toLocaleLowerCase('es');
      if (seen.get(key).has(identifier)) continue;
      seen.get(key).add(identifier);
      groups.get(key).palabras.push(word);
    }
  }
  const evolucion = [...groups.values()].filter((g) => g.palabras.length);
  const latinismos = source.latinismos.items.map((item) => ({
    termino: item.prompt, expl: item.answer, number: item.number
  }));
  const lexical = window.EXACADEMIC_LEXICO_SOURCE;
  const preverbios = lexical && lexical.preverbios && Array.isArray(lexical.preverbios.items)
    ? lexical.preverbios.items.map((item) => ({
      base: item.enunciado || item.prompt,
      compuestos: item.derivatives.slice(),
      sourceId: item.id, ambiguousPrompt: !!item.ambiguousPrompt
    })) : null;
  const prefijos = lexical && lexical.prefijos && Array.isArray(lexical.prefijos.items)
    ? lexical.prefijos.items.map((item) => item.prompt) : null;
  // Conservamos cualquier entrada de la antigua lista de fábrica que no
  // figure en el repertorio nuevo. No la etiquetamos como fuente docente.
  const oldDefaults = (name) => {
    try { return JSON.parse((window.EXDATA || {})['/app/data/listas/' + name + '.json'] || '[]'); }
    catch (_) { return []; }
  };
  const legacyPreverbs = [];
  if (preverbios) {
    const byBase = new Map(preverbios.map((row) => [row.base, row]));
    for (const row of oldDefaults('preverbios')) {
      const target = byBase.get(row.base);
      if (!target) {
        const kept = Object.assign({ legadoExaminator: true }, row);
        preverbios.push(kept); legacyPreverbs.push(kept.base);
        byBase.set(kept.base, kept);
      } else {
        const seen = new Set(target.compuestos.map((s) => s.toLocaleLowerCase('es')));
        for (const derivative of (row.compuestos || [])) {
          if (seen.has(derivative.toLocaleLowerCase('es'))) continue;
          target.compuestos.push(derivative);
          seen.add(derivative.toLocaleLowerCase('es'));
          (target.derivadosLegado = target.derivadosLegado || []).push(derivative);
        }
      }
    }
  }
  const legacyPrefixes = [];
  if (prefijos) {
    const seen = new Set(prefijos.map((s) => s.toLocaleLowerCase('es')));
    for (const word of oldDefaults('prefijos')) {
      const k = word.toLocaleLowerCase('es');
      if (seen.has(k)) continue;
      seen.add(k); prefijos.push(word); legacyPrefixes.push(word);
    }
  }

  // El motor da siempre prioridad a las listas personales guardadas en /datos/listas.
  // Solo sustituimos los valores de fábrica, sin alterar el motor ni el almacenamiento.
  window.EXDATA = window.EXDATA || {};
  window.EXDATA['/app/data/listas/evolucion.json'] = JSON.stringify(evolucion);
  window.EXDATA['/app/data/listas/latinismos.json'] = JSON.stringify(latinismos);
  if (preverbios) window.EXDATA['/app/data/listas/preverbios.json'] = JSON.stringify(preverbios);
  if (prefijos) window.EXDATA['/app/data/listas/prefijos.json'] = JSON.stringify(prefijos);
  window.EXACADEMIC_BANKS = { evolucion, latinismos, preverbios, prefijos,
    legado: { preverbios: legacyPreverbs, prefijos: legacyPrefixes },
    origen: source.origen, origen_lexico: lexical && lexical.origen };
})();
