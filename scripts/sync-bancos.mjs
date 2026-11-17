/* Actualización docente opcional en tiempo de mantenimiento.
 * Uso: node scripts/sync-bancos.mjs ../GeneradorExamenes
 * La PWA desplegada NO necesita ese repositorio ni acceso a la red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = path.resolve(process.argv[2] || path.join(dir, '..', 'GeneradorExamenes'));
const read = (p) => JSON.parse(fs.readFileSync(path.join(upstream, p), 'utf8'));
const fpath = 'data/fonetica/banco_examenes.json';
const lpath = 'data/latinismos-docente.json';
const ppath = 'data/modificacion-preverbial-docente.json';
const xpath = 'data/prefijos-docente.json';
const fonetica = read(fpath), latinismos = read(lpath);
const preverbios = read(ppath), prefijos = read(xpath);
if (fonetica.esquema !== 'evoluciones-latin-castellano/v1' ||
    !Array.isArray(fonetica.normas) || !Array.isArray(fonetica.items) ||
    fonetica.items.some((x) => !x.id || !x.latin || !Array.isArray(x.normas)) ||
    !Array.isArray(latinismos.items) ||
    latinismos.items.some((x) => !x.prompt || !x.answer || !Number.isInteger(x.number)) ||
    !Array.isArray(preverbios.items) ||
    preverbios.items.some((x) => !x.id || !x.prompt || !x.enunciado || !Array.isArray(x.derivatives)) ||
    !Array.isArray(prefijos.items) ||
    prefijos.items.some((x) => !x.prompt || !x.prefix)) {
  throw new Error('Esquema docente desconocido o entradas incompletas. Revisar antes de sincronizar.');
}
if (new Set(fonetica.items.map((x) => x.id)).size !== fonetica.items.length ||
    new Set(latinismos.items.map((x) => x.prompt)).size !== latinismos.items.length ||
    new Set(latinismos.items.map((x) => x.number)).size !== latinismos.items.length ||
    new Set(preverbios.items.map((x) => x.id)).size !== preverbios.items.length ||
    new Set(prefijos.items.map((x) => x.prompt)).size !== prefijos.items.length) {
  throw new Error('El banco contiene identificadores o latinismos duplicados.');
}
const output = path.join(dir, 'js/bancos-datos.js');
const origen = {
  phonetic_path: fpath, phonetic_blob_sha: '',
  latinisms_path: lpath, latinisms_blob_sha: '',
  source_repository: 'ArchaiosMagister/GeneradorExamenes',
  snapshot_date: new Date().toISOString().slice(0, 10),
  update_instructions: 'node scripts/sync-bancos.mjs ../GeneradorExamenes'
};
const contents = '/* Copia independiente y offline del banco académico. Generado con scripts/sync-bancos.mjs. */\n' +
  "'use strict';\nwindow.EXACADEMIC_SOURCE = " +
  JSON.stringify({ origen, fonetica, latinismos }) + ';\n';
const additionalOrigin = {
  repositorio: 'ArchaiosMagister/GeneradorExamenes',
  fecha_copia: new Date().toISOString().slice(0, 10),
  preverbios: { path: ppath, sha: '' },
  prefijos: { path: xpath, sha: '' }
};
const extraPath = path.join(dir, 'js/lexico-bancos-datos.js');
const extraContents = '/* Instantánea docente local: uso autónomo sin descargar bancos externos. */\n' +
  "'use strict';\nwindow.EXACADEMIC_LEXICO_SOURCE = " +
  JSON.stringify({ origen: additionalOrigin, preverbios, prefijos }) + ';\n';
fs.writeFileSync(output, contents);
fs.writeFileSync(extraPath, extraContents);
console.log('Copias locales preparadas:', fonetica.items.length, 'étimos,',
  latinismos.items.length, 'latinismos,', preverbios.items.length, 'preverbios y',
  prefijos.items.length, 'palabras con prefijos.');
console.log('Revisar decisiones docentes, pruebas y SHA de origen; después aumentar la versión de la caché.');
