/* Bancos docentes locales de Examinator2; ningún acceso de red en ejecución. */
'use strict';
(function () {
  const source = window.EXACADEMIC_SOURCE;
  if (!source || !source.fonetica || !source.latinismos) return;
  const f = source.fonetica;
  const groups = new Map(f.normas.map((n) => [n.id, {
    nombre: n.nombre, desc: n.descripcion || '', palabras: []
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
    termino: item.prompt, expl: item.answer
  }));
  // El motor conserva prioridad para las listas que el usuario haya personalizado.
  // Solo cambiamos los datos de fábrica integrados en el propio Examinator2.
  window.EXDATA = window.EXDATA || {};
  window.EXDATA['/app/data/listas/evolucion.json'] = JSON.stringify(evolucion);
  window.EXDATA['/app/data/listas/latinismos.json'] = JSON.stringify(latinismos);
  window.EXACADEMIC_BANKS = { evolucion, latinismos, origen: source.origen };
})();
