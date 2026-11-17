/* Auditoría de grafías del léxico Collatinus; no toca los bancos. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const ctx = { console,setTimeout,clearTimeout,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Buffer };
ctx.window=ctx;vm.createContext(ctx);
const load=p=>vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),ctx,{filename:p});
load('js/datos.js');load('js/bancos-datos.js');load('js/lexico-bancos-datos.js');load('js/bancos-loader.js');load('js/incluidos.js');
let handler;let id=0;const replies=new Map();
const fakeFs={readFileSync:p=>{if(!(p in ctx.EXDATA))throw Error('Missing '+p);return ctx.EXDATA[p]},existsSync:p=>p in ctx.EXDATA||Object.keys(ctx.EXDATA).some(k=>k.startsWith(p+'/')),readdirSync:p=>Object.keys(ctx.EXDATA).filter(k=>k.startsWith(p+'/')).map(k=>k.slice(p.length+1))};
ctx.EXMODULES={fs:fakeFs,path:path.posix,worker_threads:{workerData:{appDir:'/app',dataRoot:'/datos'},parentPort:{on:(_,f)=>{handler=f},postMessage:m=>{if(m.type==='reply')replies.get(m.id)(m)}}}};
ctx.EXREADY=Promise.resolve();load('js/motor.js');
(async()=>{await ctx.EXREADY;const call=(method,args)=>new Promise((resolve,reject)=>{let n=++id;replies.set(n,m=>m.error?reject(Error(m.error)):resolve(m.result));handler({type:'call',id:n,method,args})});
 const words=['poeta','poeticus','poema','poesis','proelium','proelior','praelium','caelum','caelestis','aequus','aequitas','aes','aer','aeris','aetas','praetor','praesidium','Aeneas','Aeneis','coepio','coepi','coepit','coetus','coeo','coitio','poena','poenalis','foedus','foederis','foedatus','moenia','amoenus','Oedipus','Oeagrius','Poenus','Poenicus','Alcmaeon','Alcmaeonis','Iudaeus','Iudaea','aeneus','aerumna','scaena','Phaedra','Maecenas','deinde','deest','suae','vitae','quae','cuius'];
 for(const word of words){const candidates=(await call('lookup',{word})).slice(0,5); const lids=candidates.map(x=>x.lid); const outputs = await call('vocabEntries',{lids,mode:'todas'}); const models=await call('vocabEntries',{lids,mode:'modelo'}); const mapped=outputs.map((x,i)=>({lemma:candidates[i]?.lemma,all:x.head,model:models[i]?.head}));console.log('AUDIT_DIPH '+JSON.stringify({word,matches:mapped}));}
})().catch(e=>{console.error(e);process.exitCode=1});
