/* Pruebas: las correcciones docentes del editor quedan disponibles en el
 * Vocabulario preferente, sobreviven a exámenes nuevos y no dañan otras fichas.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const storage = new Map();
const data = {
  101: {lid:101,head:'Cæsar, -aris',trad:'César, emperador',note:'',proper:true},
  102: {lid:102,head:'poeta, –æ',trad:'poeta',note:'',proper:false}
};
const setup = () => {
  const ctx = {
    console,
    localStorage: {
      getItem(k) { return storage.get(k) ?? null; },
      setItem(k,v) { storage.set(k,v); }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const load = (p) => vm.runInContext(fs.readFileSync(path.join(root,p), 'utf8'), ctx, {filename:p});
  load('js/util.js');
  load('js/vocabulario.js');
  ctx.M.call = async (method, args) => {
    assert.equal(method, 'vocabEntries');
    return args.lids.map(lid=>({...data[lid]}));
  };
  ctx.M.S = {tokens:[
    {sel:{lid:101},lplain:'caesar',lemma:'Cæsar'},
    {sel:{lid:102},lplain:'poeta',lemma:'pŏēta'}
  ]};
  return ctx;
};

(async()=>{
  const ctx = setup();
  const V = ctx.M.Vocabulary;
  const existing = V.parse('Gallia, –æ\tGalia preferente\tGalliam|Galliæ\tGeografía');
  ctx.M.store.set('vocabulario', existing);
  assert.equal(V.rows().length,1);

  const before = await ctx.M.vocabEntries({lids:[101],mode:'modelo'});
  assert.equal(before[0].trad,'César, emperador', 'El diccionario original no se altera');

  // Corrección de la traducción, manteniendo el lema real aunque se
  // corrija también la grafía del enunciado.
  const item = {lid:101,head:'Cæsar, –aris',trad:'César',note:''};
  const saved = V.saveCorrection(item);
  assert.equal(saved.lema, 'caesar');
  assert.equal(saved.trad, 'César');
  assert.equal(saved.head, 'Cæsar, –aris');
  assert.equal(V.rows().length,2);
  assert.equal(V.find(['Gallia']).trad,'Galia preferente');
  assert.equal(V.find(['Galliam'],true).trad,'Galia preferente', 'Conservar formas adicionales de otras entradas');
  assert.equal(V.find(['Caesar']).trad,'César');
  assert.equal(V.find(['Cæsar']).trad,'César');
  assert.equal(V.find(['caesar']).trad,'César');

  const newExam = setup(); // Nuevo contexto, con el mismo almacenamiento persistente.
  const preferred = await newExam.M.vocabEntries({lids:[101,102],mode:'modelo'});
  assert.equal(preferred[0].head,'Cæsar, –aris');
  assert.equal(preferred[0].trad,'César');
  assert.equal(preferred[0].preferred,true);
  assert.equal(preferred[1].trad,'poeta');
  assert.equal(preferred[1].preferred,undefined,'Sin preferencias, Collatinus sigue resolviendo la entrada');
  assert.equal(newExam.M.Vocabulary.rows().length,2);

  // Guardar de nuevo la misma entrada actualiza, no duplica ni borra datos.
  V.saveCorrection({lid:101,head:'Caesar, –aris',trad:'César',note:'nombre propio'});
  assert.equal(V.rows().length,2);
  assert.equal(V.find(['Cæsar']).note,'nombre propio');

  // Una entrada preferente con formas auxiliares mantiene esas formas
  // cuando se reescribe su significado desde el editor.
  const galliaEntry = V.find(['Gallia']);
  ctx.M.store.set('vocabulario', V.rows().concat(
    V.parse('amo, amas, amare\tamar\tamat|amavit')
  ));
  ctx.M.S.tokens.push({sel:{lid:103},lplain:'amo',lemma:'amo'});
  V.saveCorrection({lid:103,head:'amo, –as, –are',trad:'amar, querer',note:'verbo'});
  assert.equal(V.find(['amavit'],true).trad,'amar, querer');
  assert.equal(V.rows().length,3);
  assert.equal(V.find(['Gallia']).note,galliaEntry.note);

  // Una entrada manual puede guardarse, siempre que tenga lema y significado.
  V.saveCorrection({manual:true,head:'flumen, –inis',trad:'río',note:'neutro'});
  assert.equal(V.find(['flumen']).trad,'río');

  // No guardar entradas incompletas, ambiguas o sin lema verificable.
  const frozen = storage.get('examinator.vocabulario');
  assert.throws(()=>V.saveCorrection({lid:101,head:'Cæsar, –aris',trad:'  '}),/significado/);
  assert.throws(()=>V.saveCorrection({lid:555,head:'ignotus',trad:'desconocido'}),/lema/);
  assert.equal(storage.get('examinator.vocabulario'),frozen,'Un error no debe modificar las preferencias');

  // No comunicar éxito si el navegador rechaza la escritura.
  const originalSet = ctx.localStorage.setItem;
  ctx.localStorage.setItem = () => { throw new Error('Cuota de almacenamiento agotada'); };
  assert.throws(()=>V.saveCorrection({lid:101,head:'Cæsar',trad:'César nuevo'}),/Cuota/);
  ctx.localStorage.setItem = originalSet;
  assert.equal(storage.get('examinator.vocabulario'),frozen);

  const exam = fs.readFileSync(path.join(root,'js/exam.js'),'utf8');
  const styles = fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert.match(exam,/data-act="vsave"/);
  assert.match(exam,/M\.Vocabulary\.saveCorrection\(v\)/);
  assert.match(exam,/data-act="vreset"/,'Se conserva Restablecer');
  assert.match(exam,/if \(act === 'vsave'\)/);
  assert.match(exam,/saveButton\.textContent = 'Guardar'/,'Editar vuelve a marcar pendiente de guardar');
  assert.match(styles,/\.vrow\s*\{[^}]*grid-template-columns:[^}]*90px 24px/);
  assert.match(styles,/\.vrow \.vsave\s*\{[^}]*width: 90px;[^}]*min-width: 90px;[^}]*max-width: 90px/);
  assert.match(styles,/\.vrow\s*\{[^}]*grid-template-columns:[^}]*90px 25px/,'Ancho fijo también en iPhone');
  assert.match(styles,/\.vrow \.vsave\s*\{/);
  assert.match(styles,/\.vrow \.vsave\.saved\s*\{/);
  console.log('OK: guardar significado de Cæsar, reabrir examen, preferencias existentes, edición, errores de cuota y botón visible.');
})().catch(e=>{console.error(e);process.exitCode=1});
