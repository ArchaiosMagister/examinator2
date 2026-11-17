/* Filtros docentes de la pregunta 4. Lectura local; nunca descargan bancos.
 * No alteran M.lists ni la edición manual de palabras y lemas.
 */
'use strict';
(function () {
  const F = M.LexicalFilters = {};
  const source = window.EXACADEMIC_SOURCE || {};
  F.normas = (source.fonetica && source.fonetica.normas) || [];
  F.defaultLatin = () => ({ desde: 1, hasta: 87, paridad: 'todos', activo: false });
  const key = (value) => String(value || '').toLocaleLowerCase('es')
    .replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  F.key = key;
  const normaByName = new Map(F.normas.map((n) => [key(n.nombre), n.id]));
  const byEtimo = new Map();
  for (const item of (source.fonetica && source.fonetica.items) || []) {
    if (item.estado !== 'APTO_PROPUESTO' || !item.latin || !Array.isArray(item.normas)) continue;
    const k = key(item.latin);
    if (!byEtimo.has(k)) byEtimo.set(k, []);
    byEtimo.get(k).push(item);
  }
  F.normasSeleccionadas = (S) => {
    const valid = new Set(F.normas.map((n) => n.id));
    return Array.isArray(S.evolNormas)
      ? new Set(S.evolNormas.filter((id) => valid.has(id)))
      : new Set(valid);
  };
  F.evolPool = function (S) {
    const selected = F.normasSeleccionadas(S);
    const total = F.normas.length;
    const restricted = selected.size !== total;
    const onlyPatrimonial = S.evolSoloPatrimoniales === true;
    // Sin filtros activos, reproducir exactamente el sorteo histórico,
    // incluidas las entradas personalizadas sin ficha académica.
    if (!restricted && !onlyPatrimonial) return M.lists.evolucion || [];
    if (!selected.size) return [];
    return (M.lists.evolucion || []).map((g) => {
      const id = g.id || normaByName.get(key(g.nombre));
      if (id && !selected.has(id)) return null;
      if (!id && (restricted || onlyPatrimonial)) return null; // sin homologación
      const palabras = (g.palabras || []).filter((word) => {
        const hits = byEtimo.get(key(word));
        if (!hits || !hits.length) return !restricted && !onlyPatrimonial; // altas personales sin filtro
        // Una palabra puede presentar varias normas, y no es válida si una
        // norma necesaria queda fuera del temario elegido.
        return hits.some((item) => item.normas.every((n) => selected.has(n)) &&
          (!id || item.normas.includes(id)) &&
          (!onlyPatrimonial || item.tipoTransmision === 'PATRIMONIAL'));
      });
      return palabras.length ? { id, nombre: g.nombre, palabras } : null;
    }).filter(Boolean);
  };
  const latinNum = new Map((((source.latinismos || {}).items) || []).map((r) => [key(r.prompt), r.number]));
  F.latinNumber = (entry) => {
    if (entry && Number.isInteger(entry.number) && entry.number > 0) return entry.number;
    return latinNum.get(key(entry && entry.termino || entry)) || null;
  };
  F.latinPool = function (S) {
    const filter = S.latinFilter || F.defaultLatin();
    const active = filter.activo === true;
    const from = Number(filter.desde), to = Number(filter.hasta);
    const parity = filter.paridad || 'todos';
    const seen = new Set();
    return (M.lists.latinismos || []).filter((entry) => {
      const n = F.latinNumber(entry);
      if (active && (!n || !Number.isInteger(from) || !Number.isInteger(to) ||
        n < from || n > to || (parity === 'pares' && n % 2 !== 0) ||
        (parity === 'impares' && n % 2 !== 1))) return false;
      const display = M.Propose && M.Propose.latDisplay
        ? M.Propose.latDisplay(entry) : String(entry.termino || entry).trim().toLowerCase();
      const k = key(display);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  F.customLatinCount = () => (M.lists.latinismos || []).filter((x) => !F.latinNumber(x)).length;
})();
