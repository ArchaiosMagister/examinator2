/* UI real WebKit/Chromium: pasaje de literatura, foco de alta manual,
 * glosas por palabras y exportación PDF/Word sin regresiones.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2',
  '.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://test').pathname;
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try {const buf=fs.readFileSync(file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(buf);}
  catch(_){res.writeHead(404);res.end('not found');}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';
  try {
    for(const [engineName,engine] of [['WebKit',webkit],['Chromium',chromium)]){
      const browser=await engine.launch({headless:true});
      try {
        for(const [device,width,height] of [['desktop',1366,850],['iPhone',390,844]]){
          const context=await browser.newContext({viewport:{width,height},isMobile:device==='iPhone',
            hasTouch:device==='iPhone',serviceWorkers:'block'});
          const page=await context.newPage();
          page.setDefaultTimeout(90000);
          const errors=[];page.on('pageerror',e=>errors.push(e.message));
          await page.goto(url,{waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>window.M && M.S && M.Exam && M.Propose && document.querySelector('#editor .vlist'));
          const rect=await page.evaluate(()=>{
            const grid=document.querySelector('#editor .litMeta');
            const meta=grid.getBoundingClientRect(), field=grid.querySelector('[data-lit="cita"]').getBoundingClientRect();
            return { gridRight:meta.right,gridWidth:meta.width,inputRight:field.right,inputWidth:field.width };
          });
          assert.ok(rect.inputWidth>30 && rect.inputWidth<=135,engineName+' '+device+' ancho pasaje reducido');
          assert.ok(rect.inputRight<=rect.gridRight+1,engineName+' '+device+' pasaje no desborda');
          await page.evaluate(()=>{
            M.S.vocabItems=[
              {manual:true,head:'zeta',trad:'última',on:true,note:''},
              {manual:true,head:'alpha',trad:'primera',on:true,note:''}
            ];
            M.renderEditor();
          });
          await page.locator('#editor [data-act="vadd"]').click();
          const focused=await page.evaluate(()=>{
            const rows=[...document.querySelectorAll('#editor .vlist .vrow')];
            return {focusedK:document.activeElement.closest('.vrow')?.dataset.k,
              firstK:rows[0]?.dataset.k,lastK:rows[rows.length-1]?.dataset.k,
              headField:document.activeElement.classList.contains('vh')};
          });
          assert.equal(focused.focusedK,'2','El foco debe ir al índice añadido, no al final alfabético');
          assert.equal(focused.firstK,'2','La fila vacía aparece arriba');
          assert.notEqual(focused.lastK,'2','La última fila pertenece a otra palabra');
          assert.ok(focused.headField);
          const row=page.locator('#editor .vrow[data-k="2"]');
          await row.locator('.vh').fill('magnis itineribus');
          await row.locator('.vt').fill('grandes | caminos');
          await row.locator('.vsplit').check();
          const observed=await page.evaluate(()=>{
            const v=M.S.vocabItems[2];
            return {head:v.head,trad:v.trad,split:v.glosasSeparadas,
              html:M.Exam.html(M.S),
              doc:M.Exam.printDoc(M.S)};
          });
          assert.equal(observed.head,'magnis itineribus');
          assert.equal(observed.trad,'grandes | caminos');
          assert.equal(observed.split,true);
          assert.match(observed.html,/magnis itineribus:<\/i> ‘grandes’ ‘caminos’/);
          assert.match(observed.doc,/magnis itineribus:<\/i> ‘grandes’ ‘caminos’/);
          await row.locator('[data-act="vsave"]').click();
          const stored=await page.evaluate(()=>{
            const entry=M.Vocabulary.rows().find(x=>x.head==='magnis itineribus');
            return {entry,split:M.S.vocabItems[2].glosasSeparadas};
          });
          assert.ok(stored.entry,'Persistencia preferente');
          assert.equal(stored.entry.glosasSeparadas,true);
          const roundtrip=await page.evaluate(()=>{
            const exam=JSON.parse(JSON.stringify(M.S));
            M.loadExam(exam);
            return {checked:document.querySelector('#editor .vrow[data-k="2"] .vsplit')?.checked,
              formatted:M.Exam.vocabGlosses(exam.vocabItems[2])};
          });
          assert.equal(roundtrip.checked,true,'Mantener opción tras reabrir examen');
          assert.equal(roundtrip.formatted,'‘grandes’ ‘caminos’');

          // Word conserva los dos pares de comillas en el XML, sin tabla nueva.
          const word=await page.evaluate(async()=>{
            const b64=await M.Exam.docx(M.S);
            const zip=await JSZip.loadAsync(b64,{base64:true});
            return zip.file('word/document.xml').async('string');
          });
          assert.match(word,/magnis itineribus:/);
          assert.match(word,/‘grandes’ ‘caminos’/);
          assert.equal(errors.length,0,errors.join('; '));
          console.log('OK',engineName,device,'pasaje, foco exacto, glosas, persistencia y Word');
          await context.close();
        }
      } finally {await browser.close();}
    }
  } finally {await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
