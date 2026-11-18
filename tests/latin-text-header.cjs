/* Efectos conjuntos: diptongos en latín y literatura; cabecera exterior
 * sin divisiones y tres modos con trimestre en HTML/Word/PDF.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ctx = {console,setTimeout,clearTimeout,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Buffer,URL,location:{href:'https://archaiosmagister.github.io/examinator2/'}};
ctx.window = ctx;
vm.createContext(ctx);
const load = (p) => vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),ctx,{filename:p});
for(const p of ['js/datos.js','js/bancos-datos.js','js/lexico-bancos-datos.js','js/bancos-loader.js','js/incluidos.js']) load(p);
let handler,seq=0;const waiters=new Map();
const fakeFs = {
 readFileSync:p=>{if(!(p in ctx.EXDATA))throw Error('Missing '+p);return ctx.EXDATA[p];},
 existsSync:p=>p in ctx.EXDATA||Object.keys(ctx.EXDATA).some(k=>k.startsWith(p+'/')),
 readdirSync:p=>Object.keys(ctx.EXDATA).filter(k=>k.startsWith(p+'/')).map(k=>k.slice(p.length+1))
};
ctx.EXMODULES={fs:fakeFs,path:path.posix,worker_threads:{
 workerData:{appDir:'/app',dataRoot:'/datos'},
 parentPort:{on:(_,fn)=>{handler=fn},postMessage:m=>{if(m.type==='reply')waiters.get(m.id)(m)}}
}};
ctx.EXREADY=Promise.resolve();
load('js/motor.js');
(async()=>{
 await ctx.EXREADY;
 const call=(method,args)=>new Promise((resolve,reject)=>{
   const id=++seq;waiters.set(id,m=>m.error?reject(Error(m.error)):resolve(m.result));
   handler({type:'call',id,method,args});
 });
 load('js/util.js');load('js/render.js');load('lib/jszip.min.js');
 ctx.M.call=call;ctx.M.Propose={prefDisplay:s=>s};
 const E=ctx.M.Exam;

 const source='Poeta proelium et caelum videt; poeta poema narrat.';
 const tokens=await call('analyze',{text:source});
 const get=(word)=>tokens.find(t=>t.w.toLowerCase()===word);
 assert.ok(get('poeta')&&get('proelium')&&get('caelum')&&get('poema'));
 assert.equal(get('proelium').lig,'prœlium','En la forma flexionada prœlium hay diptongo');
 assert.equal(get('caelum').lig,'cælum','En la forma flexionada cælum hay diptongo');
 assert.equal(get('poeta').lig,'Poeta','La o-e de poeta es hiato');
 assert.equal(get('poema').lig,'poema','No sustituir o-e de poema');
 assert.equal(get('proelium').w,'proelium','La forma fuente no se altera');

 const latin = 'Poeta proelium et caelum videt.';
 const transformed=await call('ligateText',{text:latin});
 assert.equal(transformed,'Poeta prœlium et cælum videt.');
 assert.equal(await call('ligateText',{text:'Poeta poema narrat.'}),'Poeta poema narrat.');
 const originalTokens=tokens.map(t=>({ ...t, cands: undefined }));
 const older=originalTokens.map(t=>{const copy={...t};delete copy.lig;return copy;});
 const backward=await call('ligateTokens',{tokens:older});
 assert.equal(backward[get('proelium').i],'prœlium');
 assert.equal(backward[get('poema').i],'poema');
 const changedLemma=await call('tokenInfo',{
   lid:get('proelium').sel.lid,morpho:get('proelium').sel.morpho,word:'proelium'
 });
 assert.equal(changedLemma.lig,'prœlium');

 const S={
   documento:'final',trimestre:'1',tipo:'Examen final de Latín II',asig:'Latín II',
   texto:source,tokens,subr:[{cat:'n',toks:[get('proelium').i]}],
   titulo:'Ejemplo',vocabItems:[],prev:[],evol:[],pref:[],latin:[],
   literatura:{texto:'Poeta proelium narrat.\nCaelum videt.',traduccion:'El poeta narra la batalla.',
      autor:'Virgilio',obra:'Eneida',cita:'IV'},tamano:11
 };
 const before=JSON.stringify(S);
 assert.equal(await E.prepareLiterature(S),true,'Preparar literatura solo cuando haya ligaduras');
 const liter=E.literatureLatin(S);
 assert.match(liter,/prœlium/);
 assert.match(liter,/Cælum/);
 assert.equal(S.literatura.texto,'Poeta proelium narrat.\nCaelum videt.','Texto literario intacto');
 assert.equal(E.prepareLiterature?await E.prepareLiterature(S):null,false,'Evitar recalcular literatura no modificada');
 const runs=E.textRuns(S);
 assert.ok(runs.some(r=>r.t==='prœlium'&&r.u),'Subrayado compatible con ligaduras');
 assert.ok(runs.some(r=>r.t==='cælum'&&!r.u),'Ligaduras en términos no subrayados');
 const html=E.html(S),pdf=E.printDoc(S);
 for(const out of [html,pdf]){
   assert.match(out,/Examen final de Latín II/);
   assert.match(out,/1\.r trimestre/);
   assert.match(out,/Poeta <u>prœlium<\/u> et cælum videt/);
   assert.match(out,/Poeta prœlium narrat/);
   assert.ok(!out.includes('<table class="hdr">'),'Cabecera HTML sin tabla');
   assert.match(out,/<div class="hdr"><div class="hdr-row">/);
 }
 const css=E.pageCss(S);
 assert.match(css,/\.page \.hdr \{[^}]*border: \.75pt solid #222/);
 assert.match(css,/\.page \.hdr-row \{[^}]*display: grid/);
 assert.ok(!/\.page \.hdr td/.test(css),'No existen bordes ni selectores de celdas');

 const docx=await ctx.JSZip.loadAsync(await E.docx(S),{base64:true});
 const xml=await docx.file('word/document.xml').async('string');
 assert.match(xml,/Examen final de Latín II/);
 assert.match(xml,/1\.r trimestre/);
 assert.match(xml,/prœlium/);
 assert.match(xml,/cælum/);
 assert.match(xml,/Cælum/);
 const b=/<w:tblBorders>(.*?)<\/w:tblBorders>/.exec(xml);
 assert.ok(b,'Marco de Word');
 for(const side of ['top','bottom','left','right']) assert.match(b[1],new RegExp('<w:'+side+' w:val="single"'));
 assert.match(b[1],/<w:insideH w:val="nil"\/>/);
 assert.match(b[1],/<w:insideV w:val="nil"\/>/);
 assert.equal(JSON.stringify(S),before,'No modificar archivo fuente, unidades ni glosario al exportar');

 for(const [documento,trimestre,title,right] of [
   ['parcial','2','Examen parcial de Latín II','2.º trimestre'],
   ['final','3','Examen final de Latín II','3.r trimestre'],
   ['repaso','1','Texto de repaso','Latín II']
 ]) {
   const sample={...S,documento,trimestre,tipo:title};
   assert.equal(E.headerLeft(sample),title);
   assert.equal(E.headerRight(sample),right);
   const h=E.html(sample);
   assert.ok(h.includes(title));assert.ok(h.includes(right));
   const z=await ctx.JSZip.loadAsync(await E.docx(sample),{base64:true});
   const d=await z.file('word/document.xml').async('string');
   assert.ok(d.includes(title));assert.ok(d.includes(right));
   if(documento==='repaso')assert.ok(!E.questionList(sample).some(x=>/\(\dp/.test(x)));
 }
 assert.equal(E.headerLeft({documento:'examen',tipo:'Examen'}),'Examen parcial de Latín II');
 assert.equal(E.headerLeft({documento:'repaso',tipo:'Repaso'}),'Texto de repaso');
 assert.equal(E.headerLeft({documento:'final',tipo:'Actividad propia'}),'Actividad propia');

 const editor=fs.readFileSync(path.join(root,'js/exam.js'),'utf8');
 assert.match(editor,/value="parcial">Examen parcial/);
 assert.match(editor,/value="final">Examen final/);
 assert.match(editor,/value="repaso">Texto de repaso/);
 assert.match(editor,/class="trimestre"/);
 assert.match(editor,/data-k="tipo"/);
 assert.match(editor,/data-k="asig"/);
 assert.match(editor,/if \(!DOCS\[S\.documento\]\) S\.documento = 'parcial';/);
 assert.match(editor,/M\.call\('ligateTokens'/);
 const startup=fs.readFileSync(path.join(root,'js/start.js'),'utf8');
 assert.match(startup,/await M\.Exam\.prepareLiterature\(M\.S\)/);
 const worker=fs.readFileSync(path.join(root,'js/motor.js'),'utf8');
 assert.match(worker,/analyze, tokenInfo, vocabEntries, lookup, ligateText, ligateTokens/);
 console.log('OK: æ/œ filológicos en texto y literatura, hiatos, originales intactos, tres cabeceras, trimestre y solo borde externo en HTML/Word/PDF.');
})().catch(e=>{console.error(e);process.exitCode=1});
