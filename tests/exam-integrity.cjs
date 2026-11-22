/* Integridad del examen: decisiones docentes, exportación y guardado seguro.
 * Ejecutar: node tests/exam-integrity.cjs
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stable = (s) => JSON.parse(JSON.stringify(s));
const tick = () => new Promise((r) => setImmediate(r));

function boot() {
  const events = {}, notices = [], storage = new Map(), messages = [];
  let failStore = false, analyzer = null, failVocabulary = false;
  const M = {
    Propose: {},
    $: (sel) => sel === '#busy' ? {classList: { add() {}, remove() {} }} : null,
    $$: () => [], el: () => ({}), esc: (s) => String(s),
    store: { get: (k, d) => storage.has(k) ? storage.get(k) : d,
      set: (k, value) => { if (failStore) return false; storage.set(k, stable(value)); return true; }},
    debounce: () => () => {}, toast: (msg) => notices.push(msg),
    Vocabulary: {find: () => null},
    call: async (name, args) => {
      if (name === 'analyze') {
        if (analyzer) return analyzer(args.text);
        return [];
      }
      if (name === 'tokenInfo') return {};
      throw Error('Consulta no esperada: ' + name);
    },
    vocabEntries: async ({lids}, tokens) => {
      if (failVocabulary) throw Error('Simulación de error de vocabulario');
      messages.push(tokens ? 'vocabulario con tokens nuevos' : 'vocabulario antiguo');
      return lids.map((lid) => ({lid, head:'lemma' + lid,trad:'significado'}));
    }
  };
  M.Propose.underlineOne = (S, cat) => {
    const used = new Set((S.subr || []).flatMap(x=>x.toks));
    const token = (S.tokens || []).find(t=>t.cat===cat && !used.has(t.i));
    return {cat,toks:token?[token.i]:[]};
  };
  M.Propose.underline = (S) => {
    S.subr=[];
    for (const cat of 'napv') S.subr.push(M.Propose.underlineOne(S,cat));
  };
  M.Propose.prevCandidates = (S) => (S.tokens||[])
    .filter(t=>t.cat==='v' && t.sel && t.rows && t.rows.length)
    .map(t=>({i:t.i,lplain:t.lplain,rows:t.rows,txt:t.w,sum:false}));
  M.Propose.preverbs = (S) => {
    const a=M.Propose.prevCandidates(S);
    S.prev=[0,1].map((k)=>a[k]?{...a[k],n:k===0?3:2}:{txt:'',rows:[],lplain:'',n:k===0?3:2});
  };
  M.Propose.preverbOne=(S,k)=>{
    const other=S.prev[1-k];
    const next=M.Propose.prevCandidates(S).find(c=>!other.lplain || c.lplain!==other.lplain);
    if(!next) return false;
    S.prev[k]={...next,n:S.prev[k].n};return true;
  };
  for (const name of ['evol','pref','latin']) M.Propose[name]=()=>{};
  M.Propose.prevDisplay=(_,item)=>item.txt||'';
  M.Propose.evolDisplay=(v)=>v;
  M.Propose.prefDisplay=(v)=>v;
  M.Propose.latDisplay=(v)=>v;
  const window = { addEventListener:(event, callback)=>{events[event]=callback;},
    matchMedia:()=>({matches:false}) };
  const document = {visibilityState:'visible',
    addEventListener:(event, callback)=>{events[event]=callback;}};
  const context={M,window,document,setTimeout,clearTimeout,console,Intl};
  vm.createContext(context);
  vm.runInContext(read('js/exam.js'),context,{filename:'js/exam.js'});
  vm.runInContext(read('js/render.js'),context,{filename:'js/render.js'});
  vm.runInContext(read('lib/jszip.min.js'),context,{filename:'lib/jszip.min.js'});
  M.renderEditor=()=>{};
  M.preview=()=>{};
  return {M,events,storage,notices,messages,
    setAnalyzer:(value)=>{analyzer=value;},
    setFailVocabulary:(value)=>{failVocabulary=value;},
    setFailStore:(value)=>{failStore=value;},context};
}
function token(w,i,cat,lid,s) {
  return {w,i,cat,s,e:s+w.length,
    sel:{lid,morpho:cat},cands:[{lid,morphos:[cat],lemma:w,proper:false}],
    lplain:cat==='v'?'amo'+lid:w.toLowerCase(),
    rows:cat==='v'?['amo'+lid]:[],lemma:w};
}
function exam(tokens,text) {
  return {texto:text,textAnalyzed:text,tokens,qty:'modelo',vocMode:'elegir',
    vocabItems:[{lid:1,head:'Caesar, -aris',trad:'César',on:true}],
    subr:[{cat:'n',toks:[0]},{cat:'v',toks:[1]}],
    prev:[{i:1,txt:'amat',n:3,lplain:'amo2',rows:['amo2']},
      {txt:'cupit',n:2,lplain:'',rows:[]}],
    documento:'parcial',evol:[],pref:[],latin:[],literatura:{texto:'',traduccion:''}};
}
async function verifySelections() {
  const {M,setAnalyzer}=boot();
  const a=[token('Caesar',0,'n',1,0),token('amat',1,'v',2,7)];
  const S=exam(a,'Caesar amat.');
  M.S=S;
  S.texto='Caesar, amat.';
  setAnalyzer(()=>[token('Caesar',0,'n',1,0),token('amat',1,'v',2,8)]);
  await M.analyzeNow();
  assert.equal(S.textAnalyzed,S.texto,'Termina el análisis del texto actual');
  assert.equal(JSON.stringify(S.subr.filter(x=>x.toks.length).map(x=>[x.cat,...x.toks])),
    JSON.stringify([['n',0],['v',1]]),'Conservar subrayados al cambiar puntuación');
  assert.equal(S.prev[0].txt,'amat','Conservar verbo de modificación');
  assert.equal(S.prev[1].txt,'cupit','Conservar propuesta manual de modificación');
  S.texto='Et Caesar, amat.';
  setAnalyzer(()=>[
    token('Et',0,'p',9,0),token('Caesar',1,'n',1,3),token('amat',2,'v',2,11)
  ]);
  await M.analyzeNow();
  assert.deepEqual(stable(S.subr.find(x=>x.cat==='n').toks),[1],
    'Remapear el subrayado después de una inserción de palabra');
  assert.deepEqual(stable(S.subr.find(x=>x.cat==='v').toks),[2],
    'Remapear el verbo después de una inserción');
  assert.equal(S.prev[0].i,2,'Remapear el índice del verbo sin regenerar');
  assert.equal(S.prev[1].txt,'cupit','No perder texto editado por el profesor');
  S.texto='Et Caesar, clamat.';
  setAnalyzer(()=>[
    token('Et',0,'p',9,0),token('Caesar',1,'n',1,3),token('clamat',2,'v',3,11)
  ]);
  await M.analyzeNow();
  assert.deepEqual(stable(S.subr.find(x=>x.cat==='n').toks),[1],
    'No se regeneran categorías todavía válidas');
  assert.ok(S.subr.find(x=>x.cat==='v').toks.length===1,'Regenerar solo verbo que dejó de existir');
  assert.equal(S.prev[1].txt,'cupit','La modificación manual permanece');
  console.log('OK: subrayados y preverbios preservados tras puntuación, inserción y sustitución.');
}
async function verifyAtomicAnalysis() {
  const {M,setAnalyzer,setFailVocabulary,notices}=boot();
  const a=[token('Caesar',0,'n',1,0),token('amat',1,'v',2,7)];
  const S=exam(a,'Caesar amat.'); M.S=S;
  const beforeTokens=S.tokens, beforeVocab=S.vocabItems;
  S.texto='Roma currit.';
  setAnalyzer(()=>{ throw Error('Motor temporalmente inaccesible'); });
  await M.analyzeNow();
  assert.equal(S.tokens,beforeTokens);
  assert.equal(S.vocabItems,beforeVocab);
  assert.notEqual(S.textAnalyzed,S.texto);
  assert.ok(notices.some(x=>x.includes('Motor temporalmente inaccesible')));
  await assert.rejects(()=>M.ensureAnalyzed(S),/No se puede exportar un análisis antiguo/);
  const rendered=M.Exam.html(S);
  assert.doesNotMatch(rendered,/Caesar, -aris/,'No mostrar vocabulario del texto antiguo');
  assert.doesNotMatch(rendered,/<u>Caesar<\/u>/,'No mostrar subrayados anteriores');
  setAnalyzer(()=>[token('Roma',0,'n',3,0),token('currit',1,'v',4,5)]);
  setFailVocabulary(true);
  await M.analyzeNow();
  assert.equal(S.tokens,beforeTokens,'Ante fallos del vocabulario no sustituir tokens');
  assert.equal(S.vocabItems,beforeVocab,'Ante fallos del vocabulario no mezclar glosas');
  assert.notEqual(S.textAnalyzed,S.texto);
  setFailVocabulary(false);
  await M.ensureAnalyzed(S);
  assert.equal(S.textAnalyzed,S.texto);
  assert.equal(S.tokens[0].w,'Roma');
  assert.ok(S.vocabItems.every(v=>v.lid!==1),'No conservar lemas inexistentes');
  console.log('OK: fallo de análisis o glosario no contamina exportaciones y permite reintento.');
}
async function verifyIncompleteVocab() {
  const {M,context}=boot();
  const base=exam([], 'Roma est.');
  base.textAnalyzed=base.texto;
  base.vocabItems=[
    {manual:true,head:'',trad:'',on:true},
    {manual:true,head:'amo, amas',trad:'',on:true},
    {manual:true,head:'puella, -ae',trad:'muchacha',on:true},
    {lid:10,head:'flumen, -inis',trad:'río',on:true}
  ];
  const kept=M.Exam.vocabList(base);
  assert.deepEqual(kept.map(x=>x.head),['flumen, -inis','puella, -ae']);
  const html=M.Exam.html(base);
  assert.doesNotMatch(html,/<i>:\s*<\/i>|<i>amo, amas:/);
  assert.match(html,/puella, -ae/);
  const zip=await context.JSZip.loadAsync(await M.Exam.docx(base),{base64:true});
  const xml=await zip.file('word/document.xml').async('string');
  assert.ok(!xml.includes('amo, amas'));
  assert.ok(xml.includes('puella, -ae'));
  assert.ok(!xml.includes('‘’'));
  console.log('OK: vocabulario manual incompleto excluido de HTML/PDF y Word.');
}
async function verifySaving() {
  const {M,events,storage,notices,setFailStore}=boot();
  const S=exam([], 'Roma est.');M.S=S;
  M.persist();
  S.titulo='Versión corregida';
  events.pagehide();
  assert.equal(storage.get('current').titulo,'Versión corregida',
    'pagehide fuerza guardado del último cambio');
  S.titulo='Nueva versión';
  M.persist();
  events.visibilitychange(); // visible: no fuerza guardado
  assert.equal(storage.get('current').titulo,'Versión corregida');
  events.pagehide();
  assert.equal(storage.get('current').titulo,'Nueva versión');
  setFailStore(true);
  S.titulo='No se pudo guardar';
  assert.equal(M.persistNow(),false);
  assert.ok(notices.some(x=>x.includes('No se pudo guardar automáticamente')),
    'El fallo de cuota se comunica al usuario');
  console.log('OK: pagehide sincroniza y cuota llena no se notifica como guardado.');
}
(async()=>{
  await verifySelections();
  await verifyAtomicAnalysis();
  await verifyIncompleteVocab();
  await verifySaving();
})().catch((e)=>{console.error(e);process.exitCode=1;});
