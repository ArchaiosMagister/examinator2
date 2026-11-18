/* La franja superior desplaza el encabezado y mantiene alineada la biblioteca.
 * Pruebas estáticas de CSS/HTML; la verificación óptica final se hace en iPad.
 */
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const css = fs.readFileSync('styles.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

const band = /--top-band-height:\s*(\d+)px\s*;/g.exec(css);
assert.ok(band, 'La altura de franja debe tener una variable única');
const pixels = Number(band[1]);
assert.ok(pixels === 50, 'La franja superior solicitada debe medir exactamente 50px');
assert.match(css, /--accent:\s*#1d5466\s*;/);
assert.match(css, /body\s*\{\s*display:\s*grid;\s*grid-template-rows:\s*var\(--top-band-height\)\s+48px\s+1fr;/);
const barStyle = /body::before\s*\{([^}]*)\}/.exec(css)?.[1];
const brandStyle = /\.brand\s*\{([^}]*)\}/.exec(css)?.[1];
assert.ok(barStyle && brandStyle, 'La franja y el logotipo inferior conservan sus estilos');
assert.match(barStyle, /content:\s*'Examinator';/, 'El título es Examinator');
assert.match(barStyle, /display:\s*flex;/);
assert.match(barStyle, /align-items:\s*center;/);
assert.match(barStyle, /justify-content:\s*center;/);
assert.match(barStyle, /background:\s*var\(--accent\);/);
assert.match(barStyle, /color:\s*#fff;/);
assert.match(barStyle, /pointer-events:\s*none;/);
for (const prop of ['font-family', 'font-size', 'letter-spacing', 'font-variant']) {
  const value = brandStyle.match(new RegExp(prop + ':\\s*([^;]+);'))?.[1]?.trim();
  assert.ok(value, 'Tipografía ausente del título inferior: ' + prop);
  assert.ok(barStyle.includes(prop + ': ' + value + ';'),
    'El título de la franja debe conservar el mismo ' + prop + ' que la marca inferior');
}
assert.match(css, /header\s*\{\s*display:\s*flex;\s*align-items:\s*center;[^}]*padding:\s*0 14px;/);
assert.match(css, /#lib\s*\{[^}]*inset:\s*calc\(48px \+ var\(--top-band-height\)\)\s+0\s+0\s+0;/);
assert.match(css, /#lib\s*\{[^}]*z-index:\s*40;/);
assert.match(css, /main\s*\{\s*display:\s*grid;/);
const topButtonIds = ['btnNew', 'btnOpen', 'btnSave', 'btnLib', 'btnLists', 'btnSettings',
  'btnInstall', 'btnUpdate', 'btnDocx', 'btnPdf'];
for(const id of topButtonIds) {
  const count = html.split('id="' + id + '"').length - 1;
  assert.equal(count, 1, id + ' sigue existiendo exactamente una vez');
}
assert.equal((html.match(/<header>/g)||[]).length, 1, 'Cabecera sin duplicar');
assert.equal((html.match(/<\/header>/g)||[]).length, 1, 'Cabecera intacta');
assert.match(sw, /examinator2-v15-ios-pdf-stable-vocab-20261118/);
assert.match(sw, /"\.\/styles\.css"/);
assert.equal(48 + pixels, 98, 'La biblioteca empieza bajo la cabecera de 48px y la banda de 50px');
console.log('OK: Examinator blanco centrado en banda verde de ' + pixels + ' px, tipografía igual, biblioteca alineada y PWA versionada.');
