/* Auditoría visual real de Examinator2: Chromium y WebKit.
 * Sin mocks del DOM: viewport, elementos visibles, recortes y capturas.
 * Ejecutar: node tests/visual/browser.cjs (requiere playwright).
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'artifacts', 'visual');
fs.mkdirSync(OUT, { recursive: true });
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.svg':'image/svg+xml',
  '.woff':'font/woff', '.woff2':'font/woff2',
  '.webmanifest':'application/manifest+json'
};
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const full = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!full.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = fs.readFileSync(full);
    res.writeHead(200, {'Content-Type': MIME[path.extname(full)] || 'application/octet-stream'});
    res.end(data);
  } catch (_) { res.writeHead(404); res.end('Not found'); }
});
const views = [
  { name:'iphone-se', width:375, height:667, touch:true },
  { name:'iphone-compact', width:320, height:568, touch:true },
  { name:'iphone-modern', width:390, height:844, touch:true },
  { name:'iphone-landscape', width:844, height:390, touch:true },
  { name:'ipad-portrait', width:768, height:1024, touch:true },
  { name:'ipad-air', width:820, height:1180, touch:true },
  { name:'ipad-landscape', width:1024, height:768, touch:true },
  { name:'desktop', width:1440, height:900, touch:false }
];
const failures = [];
const failed = (name, err) => failures.push(name + ': ' + (err && err.stack || err));
const delay = (ms) => new Promise(r => setTimeout(r, ms));
async function visibleInViewport(page, selector, name) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box && box.width > 4 && box.height > 4, name + ' invisible');
  const size = page.viewportSize();
  assert.ok(box.x >= -3 && box.x + box.width <= size.width + 3 &&
    box.y >= -3 && box.y < size.height - 4,
  name + ' fuera de pantalla: ' + JSON.stringify(box) + ' en ' + JSON.stringify(size));
}
async function stable(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}
async function pageAudit(browser, engine, v, base) {
  const ctx = await browser.newContext({
    viewport:{width:v.width,height:v.height},deviceScaleFactor:1,
    isMobile:v.touch,hasTouch:v.touch,serviceWorkers:'block'
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  const prefix=engine+'-'+v.name;
  async function snap(name) {
    await page.screenshot({path:path.join(OUT,prefix+'-'+name+'.png'),animations:'disabled'});
  }
  try {
    await page.goto(base, {waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(() => window.M && M.S && M.Exam &&
      document.querySelector('#editor .card'),null,{timeout:60000});
    await stable(page);
    // La pantalla completa debe tener ancho real; nada puede aumentar el
    // documento fuera del viewport aunque body tenga overflow:hidden.
    const overall = await page.evaluate(() => ({
      viewport:innerWidth,
      root:document.documentElement.scrollWidth,
      body:document.body.scrollWidth,
      editor:document.querySelector('#editor').clientWidth
    }));
    assert.ok(overall.root <= overall.viewport+2 && overall.body <= overall.viewport+2,
      'Desbordamiento horizontal: '+JSON.stringify(overall));
    await snap('editor');
    const compact = v.width <= 1024;
    if (compact) {
      await visibleInViewport(page,'#btnMobileMenu','Menú compacto');
      await visibleInViewport(page,'#btnMobileLibrary','Biblioteca móvil');
      await visibleInViewport(page,'#mobileViews [data-view="preview"]','Pestaña vista previa');
      await page.locator('#btnMobileMenu').click();
      await visibleInViewport(page,'#headerActions','Menú desplegado');
      for (const id of ['btnNew','btnOpen','btnSave','btnLists','btnSettings','btnDocx','btnPdf']) {
        const btn=page.locator('#'+id);
        await btn.scrollIntoViewIfNeeded();
        await visibleInViewport(page,'#'+id,id+' desde menú móvil');
      }
      await snap('menu');
      await page.locator('#btnMobileMenu').click();
      await page.locator('#mobileViews [data-view="preview"]').click();
    } else {
      for (const id of ['btnNew','btnLib','btnLists','btnSettings','btnDocx','btnPdf'])
        await visibleInViewport(page,'#'+id,id+' escritorio');
    }
    await page.waitForFunction(() => {
      const el=document.querySelector('#preview');
      return el && getComputedStyle(el).display!=='none' && el.clientWidth>0;
    });
    await page.waitForFunction(() => !!document.querySelector('#sheet .hdr'));
    await stable(page);
    await visibleInViewport(page,'#preview','#preview');
    const doc = await page.evaluate(() => {
      const pv=document.querySelector('#preview'), sh=document.querySelector('#sheet');
      const header=sh.querySelector('.hdr');
      return {
        previewWidth:pv.clientWidth,sheetWidth:sh.getBoundingClientRect().width,
        zoom:parseFloat(sh.style.zoom)||1, headerRows:header.querySelectorAll('.hdr-row').length,
        headerBorder:getComputedStyle(header).borderTopWidth,
        headerInside:[...header.querySelectorAll('.hdr-row')].some(x=>
          getComputedStyle(x).borderTopStyle!=='none' || getComputedStyle(x).borderBottomStyle!=='none')
      };
    });
    assert.equal(doc.headerRows,2,'Cabecera con dos filas');
    assert.ok(parseFloat(doc.headerBorder)>0,'Falta borde exterior');
    assert.ok(!doc.headerInside,'No deben aparecer bordes interiores');
    assert.ok(doc.sheetWidth <= doc.previewWidth+2,
      'Hoja recortada en vista previa: '+JSON.stringify(doc));
    await snap('preview');
    // El catálogo y el lector son flujos visuales distintos en móviles.
    if (compact) await page.locator('#btnMobileLibrary').click();
    else await page.locator('#btnLib').click();
    await page.waitForFunction(() => {
      const l=document.querySelector('#lib');
      return l && !l.classList.contains('hidden') && l.querySelector('.llist .lrow');
    },null,{timeout:60000});
    await stable(page);
    await visibleInViewport(page,'#lib','#lib');
    await visibleInViewport(page,'#lib .llist','Listado de obras');
    await snap('catalogo');
    const downloaded=page.locator('#lib .llist .lrow.have').first();
    assert.ok(await downloaded.count(),'Falta alguna obra incorporada sin conexión');
    await downloaded.click();
    await page.waitForFunction(() => {
      const content=document.querySelector('#lib .rtext');
      return content && content.querySelectorAll('.rl').length>0;
    },null,{timeout:60000});
    await stable(page);
    await visibleInViewport(page,'#lib .rtext','Lector de obras');
    await visibleInViewport(page,'#lib [data-act="use"]','Usar la selección');
    await snap('lector');
    assert.equal(errors.length,0,'Errores de JavaScript del navegador: '+errors.join(' | '));
    console.log('OK visual',prefix,JSON.stringify(doc));
    if (engine==='chromium' && v.name==='desktop') {
      await page.locator('#lib [data-act="close"]').click();
      const fixture=await page.evaluate(async () => {
        const S=M.newExam();
        Object.assign(S,{
          documento:'final',tipo:'Examen final de Latín II',trimestre:'2',
          titulo:'Una batalla',refAutor:'César',refObra:'De bello Gallico',refCita:'I 1',
          texto:'Poeta proelium et caelum videt.',textAnalyzed:'Poeta proelium et caelum videt.',
          tokens:[],vocabItems:[{on:true,head:'prœlium, –ī',trad:'combate'}],
          literatura:{texto:'Caelum foedus est.',traduccion:'',autor:'Virgilio',obra:'Eneida',cita:'IV 1'}
        });
        M.loadExam(S);
        await M.Exam.prepareLiterature(S);
        M.preview();
        return {pdfHtml:M.Exam.printDoc(S),docx:await M.Exam.docx(S)};
      });
      fs.writeFileSync(path.join(OUT,'examinator-visual.docx'),Buffer.from(fixture.docx,'base64'));
      const printPage=await ctx.newPage();
      await printPage.goto(base,{waitUntil:'domcontentloaded'});
      await printPage.setContent(fixture.pdfHtml,{waitUntil:'load'});
      await printPage.evaluate(() => document.fonts.ready);
      await printPage.pdf({
        path:path.join(OUT,'examinator-print.pdf'),format:'A4',
        printBackground:true,preferCSSPageSize:true
      });
      await printPage.close();
      await page.waitForTimeout(250);
      await page.locator('#sheet .hdr').screenshot({path:path.join(OUT,'cabecera-vista-previa.png')});
      console.log('OK visual export: documentos PDF/Word generados por el motor real.');
    }
  } catch (e) {
    await snap('fallo').catch(()=>{});
    failed(prefix,e);
    console.error('FAIL visual',prefix,e.message);
  } finally { await ctx.close(); }
}
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/';
  try {
    for (const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
      let browser;
      try { browser=await type.launch({headless:true}); }
      catch (e) { failed(engine+' launch',e);continue; }
      try { for(const v of views) await pageAudit(browser,engine,v,base); }
      finally { await browser.close(); }
    }
  } finally { await new Promise(resolve=>server.close(resolve)); }
  if (failures.length) {
    console.error('Errores visuales ('+failures.length+'):\n'+failures.join('\n\n'));
    process.exitCode=1;
  } else console.log('OK: todos los perfiles, menús, editores, cabeceras, PDF y biblioteca sin recortes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
