/* WebKit/Chromium: PDF verdadero en PWA iPad y columnas del vocabulario.
 * GitHub Actions usa la imagen de Playwright con ambos navegadores offline.
 */
'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {webkit,chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+(new URL(req.url,'http://test').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://test').pathname)));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  try{
    const data=fs.readFileSync(file);
    const ext=path.extname(file);
    res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.html':'text/html','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream'});
    res.end(data);
  }catch(e){res.writeHead(404);res.end('not found')}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';
  const passes=[];
  try{
    for(const [label,engine] of [['WebKit Safari',webkit],['Chromium',chromium]]){
      const browser=await engine.launch({headless:true});
      try{
        const context=await browser.newContext({
          viewport:{width:820,height:1180},isMobile:true,hasTouch:true,
          userAgent:'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
          serviceWorkers:'block'
        });
        const page=await context.newPage();
        page.setDefaultTimeout(80000);
        const jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
        await page.addInitScript(()=>{
          navigator.share=({files})=>{window.__sharedFile={name:files[0].name,size:files[0].size};return Promise.resolve()};
          navigator.canShare=({files})=>!!(files&&files.length);
        });
        await page.goto(url,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.M && M.S && M.Exam && document.querySelector('#editor .card'),null,{timeout:80000});
        assert.equal(await page.evaluate(()=>window.EXPdf.isIOS()),true);
        // Interacción explícita dentro del documento para simular toque iPad
        // sin depender del desbordamiento previo de la cabecera de escritorio.
        await page.evaluate(()=>{
          const originalDeliver=window.EXPdf.deliver;
          window.EXPdf.deliver=(blob,name)=>{window.__exportedPdf=blob;return originalDeliver(blob,name)};
          const b=document.createElement('button');b.textContent='Probar PDF';
          b.id='testPdf';b.style.cssText='position:fixed;z-index:200;top:25px;left:10px;padding:12px;background:#fff';
          const source='Poeta proelium et caelum videt.';
          const S={...M.S,documento:'parcial',tipo:'Examen parcial de Latín II',
            texto:source, titulo:'Prueba de PDF desde iPad',
            tokens:[
              {i:0,w:'Poeta',lig:'Poeta',s:0,e:5},
              {i:1,w:'proelium',lig:'prœlium',s:6,e:14},
              {i:2,w:'et',s:15,e:17},
              {i:3,w:'caelum',lig:'cælum',s:18,e:24},
              {i:4,w:'videt',s:25,e:30}
            ],
            subr:[{cat:'n',toks:[1]}],
            refAutor:'César',refObra:'De bello Gallico',refCita:'I 1',
            vocabItems:[{on:true,head:'Cæsar, -aris',trad:'César',note:'nombre propio'}],
            literatura:{texto:'Prœlium ac cælum.',traduccion:'Combate y cielo.',autor:'Virgilio',obra:'Eneida',cita:'IV'}
          };
          b.onclick=()=>window.api.makePdf({
            html:M.Exam.printDoc(S),exam:S,defaultName:'examen parcial lat2.pdf'
          }).catch(e=>{window.__pdfError=e.message});
          document.body.appendChild(b);
        });
        await page.locator('#testPdf').click();
        await page.waitForFunction(()=>!!document.querySelector('.pdf-download-link')||!!window.__pdfError,null,{timeout:90000});
        const pdf=await page.evaluate(async()=>{
          if(window.__pdfError)throw Error(window.__pdfError);
          const a=document.querySelector('.pdf-download-link');
          // WebKit de pruebas bloquea fetch(blob:), aunque el enlace PDF
          // esté presente. Validar los bytes producidos antes de crear URL.
          const bytes=new Uint8Array(await window.__exportedPdf.arrayBuffer());
          return {
            name:a.getAttribute('download'),
            size:bytes.length,
            magic:String.fromCharCode(...bytes.slice(0,5)),
            share:!![...document.querySelectorAll('.modal .mf button')].find(b=>b.textContent==='Compartir PDF')
          };
        });
        assert.equal(pdf.magic,'%PDF-');
        assert.ok(pdf.size>3000,'PDF generado incompleto');
        assert.equal(pdf.name,'examen parcial lat2.pdf');
        assert.ok(pdf.share,'En iPad debe ofrecer Compartir PDF');
        await page.getByRole('button',{name:'Compartir PDF'}).click();
        const shared=await page.evaluate(()=>window.__sharedFile);
        assert.equal(shared.name,pdf.name);
        assert.equal(shared.size,pdf.size);

        // Insertar filas visuales con los dos estados del botón y
        // comparar exactamente las posiciones de todas sus columnas.
        await page.evaluate(()=>{
          const root=document.createElement('div');
          root.id='testRows';root.style.cssText='width:100%;max-width:560px';
          root.className='vlist';
          const row=saved=>'<div class="vrow">'+
            '<input type="checkbox" class="von"><input class="vh" value="Caesar">'+
            '<input class="vt" value="César"><input class="vn" value="">'+
            '<button class="tbtn sm vsave '+(saved?'saved':'')+'">'+
            (saved?'✓ Guardada':'Guardar')+'</button><button class="xbtn">↺</button></div>';
          root.innerHTML=row(false)+row(true);
          document.querySelector('#editor').appendChild(root);
        });
        for (const viewport of [{width:820,height:1180},{width:390,height:844}]) {
          await page.setViewportSize(viewport);
          const positions=await page.evaluate(()=>{
            const rows=[...document.querySelectorAll('#testRows .vrow')];
            return rows.map(row=>{
              const fields=['.von','.vh','.vt','.vn','.vsave','.xbtn'];
              return fields.map(f=>{
                const x=row.querySelector(f).getBoundingClientRect();
                return {left:Math.round(x.left*10)/10,width:Math.round(x.width*10)/10};
              });
            });
          });
          for(let i=0;i<6;i++){
            assert.ok(Math.abs(positions[0][i].left-positions[1][i].left)<0.2,
              label+' '+viewport.width+'px columna '+i+' desplazada: '+JSON.stringify(positions));
          }
          assert.equal(positions[0][4].width,90);
          assert.equal(positions[1][4].width,90);
        }
        assert.equal(jsErrors.length,0,'Error JS '+jsErrors.join('; '));
        passes.push(label+': PDF '+pdf.size+' bytes y columnas fijas');
        await context.close();
      }finally{await browser.close()}
    }
  }finally{await new Promise(r=>server.close(r))}
  for(const p of passes)console.log('OK',p);
})().catch(e=>{console.error(e);process.exitCode=1});
