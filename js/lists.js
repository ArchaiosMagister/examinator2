/* lists.js — edición de las listas de la pregunta 4 */
'use strict';
(function () {
  const { $, $$, esc } = M;
  const INFO = {
    preverbios: { t: 'Modificación preverbial', help: 'Una línea por verbo: el enunciado del verbo simple, dos puntos y sus compuestos separados por comas. Ej.: <i>duco, -ere, duxi, ductum: abduco, adduco, conduco</i>' },
    evolucion: { t: 'Evolución fonética', help: 'Una línea por fenómeno: el nombre, dos puntos y las palabras separadas por comas. En cada examen se eligen cuatro palabras de cuatro fenómenos distintos.' },
    prefijos: { t: 'Prefijos', help: 'Una palabra por línea.' },
    latinismos: { t: 'Latinismos', help: 'Un latinismo por línea. Si pones variantes con «o» (<i>placet o plácet</i>), en el examen sale la primera.' }
  };
  const toText = (name, data) => {
    if (name === 'preverbios') return data.map((r) => r.base + ': ' + r.compuestos.join(', ')).join('\n');
    if (name === 'evolucion') return data.map((g) => g.nombre + ': ' + g.palabras.join(', ')).join('\n');
    if (name === 'latinismos') return data.map((x) => x.termino).join('\n');
    return data.join('\n');
  };
  const fromText = (name, txt, old) => {
    const lines = txt.split('\n').map((l) => l.trim()).filter(Boolean);
    if (name === 'preverbios') return lines.map((l) => { const k = l.lastIndexOf(':'); return { base: (k > 0 ? l.slice(0, k) : l).trim(), compuestos: k > 0 ? l.slice(k + 1).split(',').map((x) => x.trim()).filter(Boolean) : [] }; });
    if (name === 'evolucion') {
      const om = new Map((old || []).map((g) => [g.nombre, g.desc]));
      return lines.map((l) => { const k = l.indexOf(':'); const nombre = (k > 0 ? l.slice(0, k) : l).trim(); return { nombre, desc: om.get(nombre) || '', palabras: k > 0 ? l.slice(k + 1).split(',').map((x) => x.trim()).filter(Boolean) : [] }; });
    }
    if (name === 'latinismos') { const om = new Map((old || []).map((x) => [x.termino, x.expl])); return lines.map((t) => ({ termino: t, expl: om.get(t) || '' })); }
    return lines;
  };
  M.openLists = function () {
    let cur = 'preverbios';
    const html = `<div class="seg ltabs">${Object.keys(INFO).map((k) => `<button data-n="${k}">${INFO[k].t}</button>`).join('')}</div>
      <p class="small muted lhelp"></p><textarea class="ltxt" spellcheck="false" style="width:100%;height:46vh;font-family:var(--text-font);font-size:14px;padding:8px;border:1px solid var(--rule);border-radius:7px;background:var(--paper)"></textarea>
      <div class="row small" style="margin-top:6px"><span class="lcount muted"></span><span class="spacer"></span><button class="tbtn sm" data-act="reset">Restaurar la lista original</button></div>`;
    const m = M.modal('Listas de la pregunta 4', html, [{ label: 'Cerrar' }, { label: 'Guardar esta lista', primary: true, onclick: async (b) => { await save(b); return false; } }], { width: '880px' });
    const b = m.body;
    const show = () => {
      $$('.ltabs button', b).forEach((x) => x.classList.toggle('on', x.dataset.n === cur));
      $('.lhelp', b).innerHTML = INFO[cur].help;
      $('.ltxt', b).value = toText(cur, M.lists[cur] || []);
      $('.ltxt', b).scrollTop = 0;
      count();
    };
    const count = () => { const n = $('.ltxt', b).value.split('\n').filter((l) => l.trim()).length; $('.lcount', b).textContent = n + ' líneas'; };
    async function save() {
      const data = fromText(cur, $('.ltxt', b).value, M.lists[cur]);
      await M.call('saveList', { name: cur, data });
      M.lists[cur] = data; M.toast('Lista guardada.');
      if (cur === 'preverbios' && M.S.texto) M.analyzeNow(true);
    }
    b.addEventListener('click', async (e) => {
      const t = e.target.closest('.ltabs button');
      if (t) { cur = t.dataset.n; show(); return; }
      if (e.target.dataset.act === 'reset') { M.lists[cur] = await M.call('resetList', { name: cur }); show(); M.toast('Lista original restaurada.'); if (cur === 'preverbios' && M.S.texto) M.analyzeNow(true); }
    });
    $('.ltxt', b).addEventListener('input', count);
    show();
  };
  void esc;
})();
