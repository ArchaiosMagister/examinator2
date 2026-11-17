/* Diagnóstico del paquete offline ya publicado en GitHub Pages.
 * Se ejecuta en CI desde un cliente externo al repo; HEAD evita bajar
 * los bancos grandes. Los resultados señalan qué URL HTTP no está disponible.
 */
'use strict';
const fs = require('node:fs');
const sw = fs.readFileSync('sw.js', 'utf8');
const arr = sw.match(/const PRECACHE = (\[[\s\S]*?\]);/);
if (!arr) throw new Error('No se ha podido interpretar PRECACHE en sw.js');
const paths = JSON.parse(arr[1].replace(/,\s*\]/g, ']'));
const base = new URL('https://archaiosmagister.github.io/examinator2/');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const failures = [];
  for (const path of paths) {
    const url = new URL(path, base);
    let ok = false, reason = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const abort = AbortSignal.timeout(15000);
        const response = await fetch(url, { method: 'HEAD', signal: abort, cache: 'no-store' });
        if (response.ok) { ok = true; break; }
        reason = 'HTTP ' + response.status;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
      } catch (e) {
        reason = String(e && e.message || e);
      }
      await pause(250 * attempt);
    }
    const msg = (ok ? 'OK ' : 'ERROR ') + path + (ok ? '' : ' — ' + reason);
    console.log(msg);
    if (!ok) failures.push(msg);
  }
  if (failures.length) {
    console.error('No disponibles en el despliegue actual:\n' + failures.join('\n'));
    process.exitCode = 1;
  } else console.log('OK: ' + paths.length + ' recursos disponibles en GitHub Pages');
})().catch((err) => { console.error(err); process.exitCode = 1; });
