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

  // El motor da siempre prioridad a las listas personales guardadas en /datos/listas.
  // Solo sustituimos los valores de fábrica, sin alterar el motor ni el almacenamiento.
  window.EXDATA = window.EXDATA || {};
  window.EXDATA['/app/data/listas/evolucion.json'] = JSON.stringify(evolucion);
  window.EXDATA['/app/data/listas/latinismos.json'] = JSON.stringify(latinismos);
  if (preverbios) window.EXDATA['/app/data/listas/preverbios.json'] = JSON.stringify(preverbios);
  if (prefijos) window.EXDATA['/app/data/listas/prefijos.json'] = JSON.stringify(prefijos);
  window.EXACADEMIC_BANKS = { evolucion, latinismos, preverbios, prefijos,
    origen: source.origen, origen_lexico: lexical && lexical.origen };
})();
