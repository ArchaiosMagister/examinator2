/* Literatura como pregunta 5 en la página A4: WebKit/Chromium y móvil.
 * Verifica la maquetación y que los datos editoriales no se filtren al examen.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { webkit, chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.woff2':'font/woff2', '.json':'application/json', '.png':'image/png',
  '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://test').pathname;
  const file = path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!file.startsWith(root+path.sep)) {res.writeHead(403);return res.end();}
  try {const b=fs.readFileSync(file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(b);}
  catch (_) {res.writeHead(404);res.end('not found');}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/';
  try {
    for(const [name,engine] of [['WebKit',webkit],['Chromium',chromium]]){
      const browser=await engine.launch({headless:true});
      try {
        for(const [device,width,height] of [['escritorio',1366,850],['iPhone',390,844]]) {
          const context=await browser.newContext({viewport:{width,height},
            isMobile:device==='iPhone',hasTouch:device==='iPhone',
            serviceWorkers:'block'});
          const page=await context.newPage();
          page.setDefaultTimeout(90000);
          const errors=[];page.on('pageerror',e=>errors.push(e.message));
          await page.goto(url,{waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>window.M&&M.S&&M.Exam&&document.querySelector('#sheet .page'));
          await page.evaluate(()=>{
            M.S.documento='parcial';
            M.S.fuente='Gentium Book Plus';
            M.S.tamano=14;
            M.S.literatura = {
              texto:'Cælum et prœlium.\nPoeta poema narrat.',
              traduccion:'El cielo y la batalla.\nEl poeta relata un poema.',
              autor:'AUTOR_SECRETO',obra:'OBRA_SECRETA',cita:'CITA_SECRETA'
            };
            if(document.body)document.body.dataset.mobileView='preview';
            M.preview();
          });
          await page.waitForFunction(()=>!!document.querySelector('#sheet ol.q > li.literatureQuestion .litTable'));
          const check=await page.evaluate(()=>{
            const sheet=document.querySelector('#sheet');
            const questions=[...sheet.querySelectorAll('ol.q > li')];
            const question=questions.at(-1);
            const table=question.querySelector('.litTable');
            const row=table.querySelector('tr');
            const tds=[...row.children];
            const bounds=(node)=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom}};
            return {
              count:questions.length,content:question.textContent,
              title:question.firstChild.textContent.trim(),
              tables:question.querySelectorAll('table').length,
              rows:table.querySelectorAll('tr').length,cells:tds.length,
              latin:tds[0]?.textContent,translation:tds[1]?.textContent,
              latinItalic:getComputedStyle(tds[0]).fontStyle,
              translationItalic:getComputedStyle(tds[1]).fontStyle,
              fontSize:parseFloat(getComputedStyle(tds[0]).fontSize),
              translationSize:parseFloat(getComputedStyle(tds[1]).fontSize),
              fontFamily:getComputedStyle(tds[0]).fontFamily,
              translationFamily:getComputedStyle(tds[1]).fontFamily,
              tableRect:bounds(table),sheetRect:bounds(sheet),cellRects:tds.map(bounds),
              print:M.Exam.printDoc(M.S)
            };
          });
          const sentence='Literatura. Indique el autor y obra a que pertenece el siguiente texto. Contextualice y comente el pasaje. (2p.)';
          assert.equal(check.count,5,name+' '+device+': literatura debe ser pregunta 5');
          assert.equal(check.title,sentence,'Enunciado completo');
          assert.equal(check.tables,1);
          assert.equal(check.rows,1);
          assert.equal(check.cells,2);
          assert.match(check.latin,/Cælum et prœlium/);
          assert.match(check.translation,/El cielo y la batalla/);
          assert.equal(check.latinItalic,'italic');
          assert.equal(check.translationItalic,'normal');
          assert.match(check.fontFamily,/Palatino Linotype/);
          assert.match(check.translationFamily,/Palatino Linotype/);
          assert.ok(Math.abs(check.fontSize-13.333)<.75, '10 pt en CSS: '+check.fontSize+'px en '+name+' '+device);
          assert.ok(Math.abs(check.translationSize-13.333)<.75, '10 pt en ambas columnas: '+check.translationSize+'px en '+name+' '+device);
          assert.ok(Math.abs(check.cellRects[0].width-check.cellRects[1].width)<2,'Columnas iguales');
          assert.ok(check.tableRect.width>60,'Tabla visible');
          assert.ok(check.tableRect.right<=check.sheetRect.right+2,'Tabla sin desbordamiento horizontal');
          assert.match(check.print,/class="literatureQuestion"/);
          assert.match(check.print,/font-size: 10pt/);
          assert.doesNotMatch(check.content,/AUTOR_SECRETO|OBRA_SECRETA|CITA_SECRETA|Traducción/);
          assert.doesNotMatch(check.print,/AUTOR_SECRETO|OBRA_SECRETA|CITA_SECRETA|<b>Traducción<\/b>/);

          await page.evaluate(()=>{M.S.documento='repaso';M.preview();});
          await page.waitForFunction(()=>{const q=document.querySelector('#sheet ol.q > li.literatureQuestion');return q && !q.firstChild.textContent.includes('(2p.)');});
          const repaso=await page.evaluate(()=>document.querySelector('#sheet ol.q > li.literatureQuestion').firstChild.textContent);
          assert.ok(!repaso.includes('(2p.)'),'Texto de repaso sin puntuaciones');
          await page.evaluate(()=>{M.S.literatura.texto='';M.preview();});
          await page.waitForFunction(()=>!document.querySelector('#sheet ol.q > li.literatureQuestion'));
          assert.equal(await page.locator('#sheet ol.q > li').count(),4,'La pregunta 5 solo aparece cuando hay texto');
          assert.equal(errors.length,0,errors.join('; '));
          console.log('OK:',name,device,'pregunta 5, A4, dos columnas, fuente 10pt, anonimato y repaso');
          await context.close();
        }
      } finally {await browser.close();}
    }
  } finally {await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
