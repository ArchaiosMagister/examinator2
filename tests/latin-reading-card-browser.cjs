/* Regresión de fichas Collatinus en pantalla, sin modificar la hoja exportable.
 * Ejecutar en Chromium y WebKit, escritorio e iPad emulado. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml',
  '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://test').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const bytes = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(bytes);
  } catch (_) { res.writeHead(404); res.end('not found'); }
});

async function position(page, selector, needle) {
  return page.evaluate(({ selector, needle }) => {
    const paragraph = document.querySelector(selector);
    if (!paragraph) throw new Error('Párrafo no encontrado: ' + selector);
    const text = paragraph.textContent || '';
    const start = text.indexOf(needle);
    if (start < 0) throw new Error('Palabra no encontrada: ' + needle + ' en ' + text);
    const end = start + needle.length;
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let offset = 0, first, last, begin, finish, node;
    while ((node = walker.nextNode())) {
      const length = node.textContent.length;
      if (!first && start >= offset && start < offset + length) {
        first = node; begin = start - offset;
      }
      if (end > offset && end <= offset + length) {
        last = node; finish = end - offset; break;
      }
      offset += length;
    }
    if (!first || !last) throw new Error('No se pudo delimitar ' + needle);
    const range = document.createRange();
    range.setStart(first, begin); range.setEnd(last, finish);
    const rect = range.getClientRects()[0];
    if (!rect || !rect.width) throw new Error('Sin rectángulo visible: ' + needle);
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { selector, needle });
}

async function prepare(page, mobile) {
  await page.goto(page.testUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.M && M.S && M.Exam &&
    document.querySelector('#sheet .page'));
  await page.evaluate(async (mobile) => {
    const S = M.S;
    const original = 'Poeta proelium et caelum videt. [additum] Poeta puellam amat.';
    S.texto = original;
    S.tokens = await M.call('analyze', { text: original });
    S.textAnalyzed = original;
    S.subr = [{ cat: 'n', toks: [1] }];
    S.literatura = { texto: 'Puella est bona. Poeta poema narrat.',
      traduccion: 'La muchacha es buena. El poeta narra un poema.',
      autor: 'AUTOR_OCULTO', obra: 'OBRA_OCULTA', cita: 'VII' };
    await M.Exam.prepareLiterature(S);
    if (mobile) document.body.dataset.mobileView = 'preview';
    M.preview();
  }, mobile);
  await page.waitForFunction(() => document.querySelector('#sheet .page .litLatin') &&
    document.querySelector('#sheet .txt').textContent.includes('prœlium'));
  await page.waitForTimeout(250);
}

async function openAt(page, selector, needle, mobile) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const { x, y } = await position(page, selector, needle);
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.move(x, y);
  await page.locator('.ex-latin-card .ex-latin-lemma-title').first().waitFor();
  return page.locator('.ex-latin-card');
}
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  try {
    for (const [engineName, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
      const browser = await engine.launch({ headless: true });
      try {
        for (const mobile of [false, true]) {
          const context = await browser.newContext({
            viewport: mobile ? { width: 820, height: 1180 } : { width: 1400, height: 950 },
            isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block'
          });
          const page = await context.newPage();
          page.testUrl = url;
          page.setDefaultTimeout(30000);
          const errors = [];
          page.on('pageerror', (err) => errors.push(err.message));
          await prepare(page, mobile);
          const before = await page.evaluate(() => ({
            exam: JSON.stringify(M.S),
            html: M.Exam.html(M.S),
            print: M.Exam.printDoc(M.S)
          }));
          const doc = await page.evaluate(() => {
            const p = document.querySelector('#sheet .txt');
            return { underlined: p.querySelector('u')?.textContent,
              html: p.innerHTML, content: p.textContent };
          });
          assert.equal(doc.underlined, 'prœlium', engineName + ': conservar subrayado');
          assert.match(doc.content, /cælum/, engineName + ': conservar diptongos');

          const card = await openAt(page, '#sheet .txt', 'prœlium', mobile);
          assert.match(await card.innerText(), /Análisis preferente/);
          assert.ok((await card.locator('.ex-latin-translation').count()) >= 1,
            engineName + ': debe incluir traducción');
          assert.match(await card.innerText(), /pr[œo]li/i);

          await page.evaluate(() => M.LatinReader.reset());
          assert.equal(await page.locator('.ex-latin-card').count(), 0);
          const bracket = await position(page, '#sheet .txt', 'additum');
          if (mobile) await page.touchscreen.tap(bracket.x, bracket.y);
          else { await page.mouse.move(bracket.x, bracket.y); await page.waitForTimeout(600); }
          assert.equal(await page.locator('.ex-latin-card').count(), 0,
            engineName + ': no analizar interpolaciones entre corchetes');

          // El análisis literario debe funcionar sin escribir tokens en S.
          await context.setOffline(true);
          const lit = await openAt(page, '#sheet .litLatin', 'poema', mobile);
          assert.match(await lit.innerText(), /Más probable según el contexto/);
          assert.ok((await lit.locator('.ex-latin-translation').count()) >= 1,
            engineName + ': traducción literaria sin red');
          await context.setOffline(false);

          const after = await page.evaluate(() => ({
            exam: JSON.stringify(M.S),
            html: M.Exam.html(M.S),
            print: M.Exam.printDoc(M.S),
            text: document.querySelector('#sheet .txt').innerHTML
          }));
          assert.deepEqual(after.exam, before.exam, 'Las fichas no escriben en el examen');
          assert.equal(after.html, before.html, 'El HTML imprimible permanece idéntico');
          assert.equal(after.print, before.print, 'El PDF de impresión permanece idéntico');
          assert.equal(after.text, doc.html, 'No se introducen spans ni se altera la maqueta');
          assert.ok(!after.print.includes('ex-latin-card'));
          assert.ok(!after.html.includes('ex-latin-card'));

          await page.evaluate(() => M.preview());
          await page.waitForTimeout(250);
          assert.equal(await page.locator('.ex-latin-card').count(), 0,
            'Las fichas deben cerrarse al regenerar la vista previa');
          assert.deepEqual(errors, [], engineName + ': no debe haber errores JS');
          await context.close();
          console.log('OK lectura Collatinus ' + engineName + (mobile ? ' iPad' : ' escritorio'));
        }
      } finally { await browser.close(); }
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
