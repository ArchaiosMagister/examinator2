/* Regresión visual de tres temas en WebKit y Chromium, escritorio y móvil.
 * La vista previa A4 y el HTML de impresión han de ser independientes del tema.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {webkit,chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.woff2':'font/woff2','.json':'application/json','.png':'image/png',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://test').pathname;
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  try{const b=fs.readFileSync(file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(b)}
  catch(_){res.writeHead(404);res.end('not found')}
});
const colors={
  light: { paper:'rgb(244, 241, 234)', sheet:'rgb(255, 255, 255)' },
  dark: { paper:'rgb(18, 22, 25)', sheet:'rgb(255, 255, 255)' },
  oled: { paper:'rgb(0, 0, 0)', sheet:'rgb(255, 255, 255)' }
};
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';
  try {
    for(const [engineName,engine] of [['WebKit',webkit],['Chromium',chromium]]) {
      const browser=await engine.launch({headless:true});
      try {
        for(const [device,width,height] of [['escritorio',1366,850],['iPhone',390,844]]) {
          const context=await browser.newContext({viewport:{width,height},isMobile:device==='iPhone',
            hasTouch:device==='iPhone',serviceWorkers:'block'});
          const page=await context.newPage();
          page.setDefaultTimeout(85000);
          const errors=[];page.on('pageerror',e=>errors.push(e.message));
          await page.goto(url,{waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>window.M && M.S && M.Exam && document.querySelector('#sheet .page'));
          const printBefore=await page.evaluate(()=>M.Exam.printDoc(M.S));
          if(device==='iPhone') await page.locator('#btnMobileMenu').click();
          await page.locator('#btnSettings').click();
          const modal=page.locator('.modal');
          await modal.locator('#themeMode').waitFor();
          for(const theme of ['dark','oled','light']){
            await modal.locator('#themeMode').selectOption(theme);
            const actual=await page.evaluate(()=>({
              active:document.documentElement.dataset.theme,
              body:getComputedStyle(document.body).backgroundColor,
              header:getComputedStyle(document.querySelector('header')).backgroundColor,
              card:getComputedStyle(document.querySelector('#editor .card')).backgroundColor,
              preview:getComputedStyle(document.querySelector('#preview')).backgroundColor,
              sheet:getComputedStyle(document.querySelector('.sheet')).backgroundColor,
              pageText:getComputedStyle(document.querySelector('.sheet .page')).color,
              modal:getComputedStyle(document.querySelector('.modal')).backgroundColor,
              input:getComputedStyle(document.querySelector('#themeMode')).backgroundColor,
              primary:getComputedStyle(document.querySelector('#btnPdf')).backgroundColor,
              meta:document.querySelector('meta[name="theme-color"]').content,
              stored:JSON.parse(localStorage.getItem('examinator.theme')),
              wordStyleUnchanged:M.Exam.printDoc(M.S)
            }));
            assert.equal(actual.active,theme,engineName+' '+device+' selector '+theme);
            assert.equal(actual.body,colors[theme].paper);
            assert.equal(actual.sheet,colors[theme].sheet,'La hoja A4 siempre blanca');
            assert.equal(actual.pageText,'rgb(17, 17, 17)','El documento A4 siempre tinta negra');
            assert.equal(actual.stored,theme);
            assert.equal(actual.wordStyleUnchanged,printBefore,'Impresión independiente del tema');
            assert.notEqual(actual.primary,'rgb(0, 0, 0)','El botón PDF conserva su color');
            assert.notEqual(actual.primary,actual.body,'Botón PDF visible');
            if(theme==='oled'){
              for(const key of ['header','card','preview','modal','input']) {
                assert.equal(actual[key],'rgb(0, 0, 0)',key+' OLED negro puro');
              }
              assert.equal(actual.meta,'#000000');
            }else if(theme==='dark'){
              assert.equal(actual.meta,'#121619');
              assert.notEqual(actual.card,'rgb(255, 255, 255)','Tarjetas adaptadas');
              assert.notEqual(actual.input,'rgb(255, 255, 255)','Controles adaptados');
            }else assert.equal(actual.meta,'#1d5466');
          }
          await modal.locator('#themeMode').selectOption('oled');
          await page.reload({waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>window.M && M.S && M.Exam && document.querySelector('#sheet .page'));
          assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'oled','OLED persiste tras recarga');
          assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(0, 0, 0)');
          assert.equal(errors.length,0,errors.join('; '));
          console.log('OK:',engineName,device,'3 modos, controles, documento A4 y persistencia');
          await context.close();
        }
      } finally { await browser.close(); }
    }
  } finally {await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
