/* Pruebas filológicas de ligaduras æ/œ en el vocabulario de Collatinus.
 * No altera la forma de los textos latinos ni el léxico docente guardado.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const ctx = { console, setTimeout, clearTimeout, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, Buffer };
ctx.window = ctx; vm.createContext(ctx);
const load = (p) => vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),ctx,{filename:p});
load('js/datos.js'); load('js/bancos-datos.js'); load('js/lexico-bancos-datos.js');
load('js/bancos-loader.js'); load('js/incluidos.js');
let handler, id=0; const replies=new Map();
const fakeFs = {
  readFileSync:p=>{ if(!(p in ctx.EXDATA)) throw Error('Missing '+p); return ctx.EXDATA[p]; },
  existsSync:p=>p in ctx.EXDATA||Object.keys(ctx.EXDATA).some(k=>k.startsWith(p+'/')),
  readdirSync:p=>Object.keys(ctx.EXDATA).filter(k=>k.startsWith(p+'/')).map(k=>k.slice(p.length+1))
};
ctx.EXMODULES={fs:fakeFs,path:path.posix,worker_threads:{
  workerData:{appDir:'/app',dataRoot:'/datos'},
  parentPort:{on:(_,f)=>{handler=f},postMessage:m=>{if(m.type==='reply')replies.get(m.id)(m)}}
}};
ctx.EXREADY=Promise.resolve();load('js/motor.js');

(async()=>{
  await ctx.EXREADY;
  const call=(method,args)=>new Promise((resolve,reject)=>{
    const n=++id;
    replies.set(n,m=>m.error?reject(Error(m.error)):resolve(m.result));
    handler({type:'call',id:n,method,args});
  });
  async function entry(word,mode='modelo',preferredLemma) {
    const candidates=await call('lookup',{word});
    const candidate=preferredLemma
      ? candidates.find(x=>x.lemma.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').startsWith(preferredLemma))
      : candidates[0];
    assert.ok(candidate,'Collatinus debe reconocer '+word);
    const results=await call('vocabEntries',{lids:[candidate.lid],mode});
    assert.equal(results.length,1,'Una entrada única para '+word);
    return results[0];
  }

  // El caso decisivo: la vocal larga es e en pŏēta (hiato), mientras que
  // en prōelium la marca es de o (diptongo). La desinencia -ae de poeta
  // sí es un diptongo, aunque el radical de la misma palabra no lo sea.
  assert.match((await entry('poeta')).head,/^poeta, –æ$/);
  assert.match((await entry('poeticus')).head,/^poetĭcus,/);
  assert.match((await entry('poema')).head,/^poema,/);
  assert.match((await entry('poesis')).head,/^poesis,/);
  assert.match((await entry('proelium')).head,/^prœlĭum, –ī$/);
  assert.match((await entry('proelior')).head,/^prœlĭor,/);
  assert.match((await entry('praelium')).head,/^prælĭum,/);

  // Otros diptongos documentados; conservar las cantidades de las
  // restantes vocales, el paradigma y las grafías en mayúscula.
  assert.match((await entry('caelum')).head,/^cælum, –ī$/);
  assert.match((await entry('aequitas')).head,/^æquĭtas, æquĭtatis$/);
  assert.match((await entry('praetor')).head,/^prætor,/);
  assert.match((await entry('praesidium')).head,/^præsĭdĭum,/);
  assert.match((await entry('poena')).head,/^pœna, –æ$/);
  assert.match((await entry('foedus')).head,/^fœdus,/);
  assert.match((await entry('moenia')).head,/^mœnĭa,/);
  assert.match((await entry('coetus')).head,/^cœtus,/);
  assert.match((await entry('Aeneas')).head,/^Ænēas,/);
  assert.match((await entry('Phaedra')).head,/^Phædra,/);
  assert.match((await entry('quae')).head,/quæ/);

  // Hiatos del mismo aspecto superficial: no pueden convertirse a
  // ligaduras por sustitución global.
  for(const word of ['coeo','aer','poeta','poema','poesis','poeticus']){
    const head=(await entry(word,'ninguna')).head;
    const first=head.split(',')[0];
    assert.ok(!first.includes('œ')&&!first.includes('æ'),
      word+' tiene hiato en su lema, no diptongo: '+head);
  }
  assert.match((await entry('aeris','ninguna','aer')).head,/^aer,/);

  // Caso histórico excepcional de la fuente: ăēs, āeris para el bronce
  // (diptongo) frente a āēr, -os para el aire (hiato).
  assert.match((await entry('aes')).head,/^æs, æris$/);
  assert.match((await entry('aer')).head,/^aer, –os$/);
  assert.match((await entry('aeris','ninguna','aes')).head,/^æs, æris$/);
  assert.match((await entry('aeris','ninguna','aer')).head,/^aer, –os$/);

  for(const mode of ['modelo','todas','largas','ninguna']){
    const poet=(await entry('poeta',mode)).head;
    const battle=(await entry('proelium',mode)).head;
    assert.match(poet,/^p.*o.*e.*ta, –æ$/,mode+': poeta no debe adquirir œ');
    assert.ok(!poet.includes('œ'));
    assert.match(battle,/^prœl/,mode+': prœlium siempre debe llevar œ');
    assert.ok(!battle.includes('proel'));
  }

  // La grafía del original de la obra o frase no cambia: sólo el campo
  // head de vocabEntries se presenta con ligaduras.
  const latin='Poeta proelium narrat; caelum videt.';
  const analyzed=await call('analyze',{text:latin});
  assert.ok(analyzed.some(x=>/poeta/i.test(x.w)));
  assert.ok(analyzed.some(x=>/proelium/i.test(x.w)));
  assert.equal(analyzed.map(x=>x.w).join(' ').includes('prœlium'),false);
  const h=(await entry('proelium')).head;
  const orig=(await entry('poeta')).head;
  assert.equal(h.includes('œ'),true);
  assert.equal(orig.includes('œ'),false);

  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.ok(sw.includes('./js/motor.js'));
  console.log('OK: diptongos æ/œ según lema y cantidades, hiatos, excepciones, cuatro modos y texto original intacto.');
})().catch(e=>{console.error(e);process.exitCode=1});
