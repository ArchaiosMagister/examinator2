/* Impresión HTML: WebKit/Chromium en vista iPad/iPhone.
 * La automatización verifica la ruta de impresión y el CSS, pero no afirma
 * que el diálogo nativo de una PWA iOS 27 se abra en un dispositivo físico.
 */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://test').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = fs.readFileSync(file);
    const mime = {
      '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png'
    };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (_) { res.writeHead(404); res.end('not found'); }
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  try {
    for (const [name, engine] of [['WebKit', webkit], ['Chromium', chromium]]) {
      const browser = await engine.launch({ headless: true });
      try {
        for (const [device, width, height, standalone] of [
          ['iPad Safari', 820, 1180, false],
          ['iPhone PWA', 390, 844, true]
        ]) {
          const context = await browser.newContext({
            viewport: { width, height }, isMobile: true, hasTouch: true,
            serviceWorkers: 'block',
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 Version/27.1 Mobile/15E148 Safari/604.1'
          });
          const page = await context.newPage();
          page.setDefaultTimeout(90000);
          const pageErrors = [];
          page.on('pageerror', (err) => pageErrors.push(err.message));
          await page.addInitScript((installed) => {
            Object.defineProperty(navigator, 'standalone', { configurable: true, value: installed });
            window.__printCalls = 0;
            window.print = () => { window.__printCalls++; };
          }, standalone);
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => !!(window.M && M.S && M.Exam && window.EXPrint));
          await page.evaluate(() => {
            M.S = {
              ...M.S, documento: 'parcial', fuente: 'Palatino', titulo: 'PRUEBA PALATINO PDF',
              texto: 'Cæsar in Galliā prœlium narrat.', tokens: [], subr: [], vocabItems: [
                { on: true, head: 'Cæsar, -aris', trad: 'César' }
              ],
              literatura: { texto: 'Prœlium ac cælum.', traduccion: 'Combate y cielo.',
                autor: 'Virgilio', obra: 'Eneida', cita: 'IV' }
            };
            document.getElementById('btnPrintPdf').click();
          });
          const state = await page.evaluate(() => {
            const sheet = document.querySelector('#examinator-print-root .ex-print-sheet');
            const printCss = document.querySelector('#examinator-print-styles').textContent;
            return {
              printCalls: window.__printCalls,
              preview: sheet.innerText,
              font: getComputedStyle(sheet.querySelector('.page')).fontFamily,
              hasA4: printCss.includes('@page { size: A4; margin: 2cm 2.2cm 2cm 2.2cm; }'),
              links: document.querySelector('.ex-print-open').href,
              warning: document.querySelector('.ex-print-note').textContent
            };
          });
          assert.equal(state.printCalls, 1, name + ' ' + device + ': impresión directa desde botón');
          assert.match(state.preview, /PRUEBA PALATINO PDF/);
          assert.match(state.preview, /Cæsar in Galliā prœlium narrat/);
          assert.match(state.font, /Palatino/);
          assert.ok(state.hasA4);
          assert.ok(state.links.startsWith('blob:'), 'Vista imprimible independiente disponible');
          if (standalone) assert.match(state.warning, /puede bloquear la impresión/);
          await page.emulateMedia({ media: 'print' });
          const hidden = await page.evaluate(() => ({
            header: getComputedStyle(document.querySelector('header')).display,
            root: getComputedStyle(document.querySelector('#examinator-print-root')).display,
            toolbar: getComputedStyle(document.querySelector('.ex-print-toolbar')).display,
            paperZoom: getComputedStyle(document.querySelector('.ex-print-sheet')).zoom
          }));
          assert.equal(hidden.header, 'none', name + ' ' + device + ': ocultar interfaz');
          assert.notEqual(hidden.root, 'none', 'Mostrar el examen al imprimir');
          assert.equal(hidden.toolbar, 'none', 'Ocultar controles del PDF');
          assert.equal(Number(hidden.paperZoom), 1, 'Imprimir a escala real');
          if (name === 'Chromium' && !standalone) {
            const pdf = await page.pdf({ format: 'A4', printBackground: true });
            assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
            const extracted = spawnSync('pdftotext', ['-layout', '-', '-'], {
              input: pdf, encoding: 'utf8'
            });
            assert.equal(extracted.status, 0, 'El PDF de impresión permite extraer texto');
            assert.match(extracted.stdout, /PRUEBA PALATINO PDF/);
            assert.match(extracted.stdout, /Cæsar in Galliā prœlium narrat/);
            assert.doesNotMatch(extracted.stdout, /Guardar examen|Actualizar|Biblioteca/);
          }
          await page.emulateMedia({ media: 'screen' });
          await page.locator('.ex-print-action').click();
          assert.equal(await page.evaluate(() => window.__printCalls), 2, 'Reintento de impresión');
          await page.locator('.ex-print-close').click();
          assert.equal(await page.locator('#examinator-print-root').count(), 0);
          assert.equal(await page.locator('#examinator-print-styles').count(), 0);
          assert.equal(pageErrors.length, 0, pageErrors.join('; '));
          console.log('OK:', name, device, 'Palatino local, impresión A4, salida sin interfaz y retorno al editor');
          await context.close();
        }
      } finally { await browser.close(); }
    }
  } finally { await new Promise((r) => server.close(r)); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
