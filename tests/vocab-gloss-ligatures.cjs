/* Incidencias 1.1.1: glosas de sintagmas y diptongos filológicos.
 * No se alteran los textos originales del docente ni los datos de los exámenes.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const ctx={console,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Buffer,location:{href:'https://example.org/examinator2/'}};
ctx.window=ctx;
vm.createContext(ctx);
const run=(p)=>vm.runInContext(read(p),ctx,{filename:p});
run('js/bancos-datos.js');
const storage=new Map();
ctx.localStorage={
  getItem:(k)=>storage.get(k)??null,
  setItem:(k,v)=>storage.set(k,v),
  removeItem:(k)=>storage.delete(k)
};
run('js/util.js');
ctx.M.call=async(_,args)=>args.text||'';
ctx.M.lists={prefijos:[],latinismos:[],evolucion:[]};
ctx.M.pick=(xs)=>xs[0];
ctx.M.shuffle=(xs)=>xs;
run('js/propose.js');
run('js/vocabulario.js');
run('js/render.js');
run('lib/jszip.min.js');
const P=ctx.M.Propose,E=ctx.M.Exam,V=ctx.M.Vocabulary;
const source=ctx.EXACADEMIC_SOURCE;
assert.equal(source.latinismos.items.find(x=>x.number===7).prompt,'ad kalendas Graecas');
assert.equal(source.latinismos.items.find(x=>x.number===29).prompt,'ex æquo');
assert.equal(source.fonetica.items.length,655,'No cambiar las fichas fonéticas');
assert.equal(source.latinismos.items.length,87,'No cambiar el número de latinismos');
assert.equal(P.latDisplay('ad kalendas graecas'),'ad kalendas Graecas');
assert.equal(P.latDisplay('EX AEQUO'),'ex æquo');
assert.equal(P.evolDisplay('caelum'),'cælum','Lematización canónica con ligadura');
assert.equal(P.evolDisplay('Chloen'),'Chloen','No convertir hiatos');
assert.equal(P.evolDisplay('poeta'),'poeta','No convertir hiatos de otras palabras');
assert.equal(P.evolDisplay('aer'),'aer','No convertir ae indiscriminadamente');

const t={i:0,w:'praedicat',lig:'prædicat',cat:'v',proper:false,sel:{lid:2},lplain:'praedico',rows:[0]};
const S={
  documento:'repaso',tipo:'Texto de repaso',asig:'Latín II',
  texto:'praedicat',textAnalyzed:'praedicat',tokens:[t],subr:[],
  titulo:'',refAutor:'',refObra:'',refCita:'',
  fuente:'Palatino Linotype',tamano:10.5,interlineado:3,espacioPreguntas:.3,hueco:2.6,
  vocabItems:[{manual:true,on:true,head:'magnis itineribus',trad:'grandes | caminos',glosasSeparadas:true,note:''}],
  prev:[{txt:'praedicat',i:0,lplain:'praedico',n:3},{txt:'amo',n:2}],
  evol:[{g:'Monoptongación',w:'caelum'},{g:'Hiato',w:'Chloen'}],
  pref:[],latin:['ad kalendas graecas','ex aequo'],
  literatura:{texto:'',traduccion:''}
};
ctx.M.S=S;
assert.equal(P.formOf(S,t),'prædicat');
assert.equal(P.prevDisplay(S,S.prev[0]),'prædicat');
assert.equal(P.prevDisplay(S,{txt:'praedicat',i:0,lplain:''}),'praedicat','No cambiar entradas editadas');
const q4=E.q4(S).map(rows=>rows.map(r=>r.t).join('')).join('\n');
assert.match(q4,/prædicat/);
assert.match(q4,/cælum/);
assert.match(q4,/ad kalendas Graecas/);
assert.match(q4,/ex æquo/);
assert.doesNotMatch(q4,/ad kalendas graecas/);
assert.equal(S.prev[0].txt,'praedicat','No sobrescribir datos guardados');
assert.equal(S.evol[0].w,'caelum','No sobrescribir datos guardados');
assert.equal(S.latin[0],'ad kalendas graecas','Compatibilidad con exámenes antiguos');
assert.equal(E.vocabGlosses(S.vocabItems[0]),'‘grandes’ ‘caminos’');
assert.equal(E.vocabGlosses({trad:'por grandes caminos'}),'‘por grandes caminos’');
assert.equal(E.vocabGlosses({trad:'una expresión | de varios términos'}),'‘una expresión | de varios términos’');
const html=E.html(S),print=E.printDoc(S);
assert.match(html,/magnis itineribus:<\/i> ‘grandes’ ‘caminos’/);
assert.match(print,/magnis itineribus:<\/i> ‘grandes’ ‘caminos’/);
assert.match(html,/ad kalendas Graecas/);
assert.match(html,/ex æquo/);
assert.match(html,/cælum/);

(async()=>{
  const b64=await E.docx(S);
  const zip=await ctx.JSZip.loadAsync(b64,{base64:true});
  const doc=await zip.file('word/document.xml').async('string');
  assert.match(doc,/magnis itineribus:/);
  assert.match(doc,/‘grandes’ ‘caminos’/);
  assert.match(doc,/ad kalendas Graecas/);
  assert.match(doc,/ex æquo/);
  assert.match(doc,/cælum/);
  const saved=V.saveCorrection(S.vocabItems[0]);
  assert.equal(saved.glosasSeparadas,true);
  assert.equal(V.rows()[0].glosasSeparadas,true);
  assert.equal(V.parse(JSON.stringify(V.rows()))[0].glosasSeparadas,true);
  assert.equal(V.parse('[{"head":"ager","trad":"campo"}]')[0].glosasSeparadas,undefined,'Entradas previas compatibles');
  const restored=JSON.parse(JSON.stringify(S.vocabItems[0]));
  assert.equal(E.vocabGlosses(restored),'‘grandes’ ‘caminos’');
  console.log('OK: latinismos corregidos, excepciones fonéticas, preverbial, dos glosas Word/HTML, preferentes y exámenes antiguos.');
})().catch(e=>{console.error(e);process.exitCode=1});
