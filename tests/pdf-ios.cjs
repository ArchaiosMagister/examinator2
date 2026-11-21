/* Guardado/compartición del PDF de iPad sin menú de impresión. */
'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'js/pdf-export.js'),'utf8');
const shim=fs.readFileSync(path.join(root,'js/shim.js'),'utf8');
const start=fs.readFileSync(path.join(root,'js/start.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const styles=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const pdfLibrary=fs.readFileSync(path.join(root,'lib/html2pdf.bundle.min.js'),'utf8');
const license=fs.readFileSync(path.join(root,'lib/html2pdf.bundle.min.js.LICENSE.txt'),'utf8');
assert.ok(pdfLibrary.length>500000,'Biblioteca local completa');
assert.ok(license.length>10000,'Conservar licencias de terceros');
assert.match(html,/<script src="lib\/html2pdf.bundle\.min\.js"><\/script>/);
assert.match(html,/<script src="js\/pdf-export\.js"><\/script>/);
assert.match(sw,/"\.\/lib\/html2pdf\.bundle\.min\.js"/);
assert.match(sw,/"\.\/js\/pdf-export\.js"/);
assert.match(shim,/if \(window\.EXPdf && window\.EXPdf\.isIOS\(\)\)/);
assert.match(shim,/window\.EXPdf\.generate\(html\)/);
assert.match(shim,/window\.EXPdf\.deliver\(blob, defaultName\)/);
assert.match(shim,/fr\.contentWindow\.focus\(\); fr\.contentWindow\.print\(\)/,'Conservar impresión escritorio');
assert.match(start,/if \(p && p\.prepared\) return/);
assert.match(styles,/\.vrow \.vsave \{[^}]*width: 90px;[^}]*min-width: 90px/);
assert.match(styles,/\.vrow \{[^}]*90px 24px/);
assert.match(styles,/\.vrow \{[^}]*90px 25px/);

const calls=[];
const n={
  userAgent:'Mozilla/5.0 (iPad; CPU OS 27_1 like Mac OS X)',
  platform:'MacIntel',maxTouchPoints:5,
  canShare:({files})=>Array.isArray(files)&&files.length===1,
  share:({files,title})=>{calls.push({name:files[0].name,title,size:files[0].size});return Promise.resolve();}
};
let modal,ref=0;
class TestFile extends Blob{
  constructor(bits,name,options){super(bits,options);this.name=name}
}
const ctx={
 navigator:n, Blob,File:TestFile,
 URL:{createObjectURL:()=>('blob:test-'+(++ref)),revokeObjectURL:()=>{}},
 setTimeout:(fn)=>0,
 window:{},M:{
   esc:s=>String(s).replace(/"/g,'&quot;'),
   modal:(title,body,buttons)=>{modal={title,body,buttons};return modal},
   toast:s=>calls.push({error:s})
 }
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(code,ctx);
assert.equal(ctx.EXPdf.isIOS(),true);
assert.equal(ctx.EXPdf.cleanName('Examen de Latín II.pdf'),'Examen de Latín II.pdf');
assert.equal(ctx.EXPdf.cleanName('a/b\\c.pdf'),'a b c.pdf');
const blob=new Blob([new Uint8Array(2048)],{type:'application/pdf'});
const r=ctx.EXPdf.deliver(blob,'Caesar.pdf');
assert.equal(r.prepared,true);
assert.equal(r.filename,'Caesar.pdf');
assert.equal(modal.title,'PDF preparado');
assert.match(modal.body,/Descargar PDF/);
assert.match(modal.body,/blob:test-1/);
assert.ok(modal.buttons.some(x=>x.label==='Compartir PDF'));
const btn=modal.buttons.find(x=>x.label==='Compartir PDF');
assert.equal(btn.onclick(),false,'No cierre prematuro del diálogo');
assert.equal(calls.length,1);
assert.equal(calls[0].name,'Caesar.pdf');

n.platform='MacIntel';n.maxTouchPoints=0;n.userAgent='Mozilla/5.0 (Macintosh; Intel Mac OS X)';
assert.equal(ctx.EXPdf.isIOS(),false,'Escritorio no cambia');
n.maxTouchPoints=5;
assert.equal(ctx.EXPdf.isIOS(),true,'Detectar iPad que se presenta como MacIntel');
console.log('OK: iPad PWA PDF compartible y descargable, vista previa intacta, versión offline y ancho fijo del botón.');
