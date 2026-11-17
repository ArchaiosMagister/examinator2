# Ligaduras æ/œ en el vocabulario latino

## Alcance

La presentación del **vocabulario generado por Collatinus** utiliza `æ` y `œ` únicamente cuando los datos lexicográficos permiten reconocer un diptongo. No se reescriben el texto del autor, las listas de léxico de las preguntas, las traducciones ni las entradas que haya añadido o corregido el profesor.

El mismo enunciado se utiliza en el editor, en la vista previa, en el PDF y en Word. El orden alfabético considera `æ` equivalente a `ae` y `œ` equivalente a `oe`.

## Criterio filológico

Para cada lema se consultan **las dos representaciones del mismo enunciado Collatinus**: la seleccionada por el profesor (vocales del modelo, todas, sólo largas o ninguna) y la representación original con cantidades. El algoritmo sólo reemplaza `ae`/`oe` cuando la cantidad larga de la **primera vocal** acredita el diptongo y la segunda no está marcada como vocal independiente, o cuando la forma está inequívocamente documentada (pronombre *quae*). Si la segunda vocal presenta marca de cantidad, se trata como **hiato** y se conserva la grafía. Si las dos versiones no coinciden una vez eliminadas las marcas, no se hace ninguna modificación por seguridad.

Ejemplos comprobados:

| Enunciado de origen | Presentación | Justificación |
| --- | --- | --- |
| *prōelĭum* | *prœlium* | diptongo `oe` |
| *cāelŭm* | *cælum* | diptongo `ae` |
| *pōena, –āe* | *pœna, –æ* | dos diptongos auténticos |
| *pŏēta, –āe* | *poeta, –æ* | hiato `o-e` en el radical; diptongo `ae` en el genitivo |
| *cŏĕo* | *coeo* | hiato |
| *āēr* | *aer* | hiato |
| *ăēs, āerĭs* | *æs, æris* | diptongo, con excepción explícita a una inconsistencia de cantidades de Collatinus |
| *quī, quae, quod* | *quī, quæ, quod* | diptongo propio de la flexión pronominal |

Las palabras de etimología o silabación incierta **no se ligan por mera coincidencia gráfica**. No se trata de una sustitución masiva de las secuencias `ae` y `oe`.

## Compatibilidad

- Las preferencias de «Vocabulario preferente» y los enunciados modificados manualmente conservan su grafía literal; las ligaduras se pueden escribir manualmente si se desea.
- No cambia la elección de lema, la traducción, la clasificación gramatical ni el análisis de los textos.
- Los exámenes antiguos almacenados mantienen sus campos editados; al refrescar las entradas automáticas pueden obtener la nueva representación.
- La PWA incluye una nueva versión de la caché para que la corrección llegue a las aplicaciones instaladas.
- Pruebas: `node tests/vocab-ligatures.cjs` y `node tests/regression.cjs` (incluye Word y vista previa).

Fuentes del criterio: [Lewis & Short — *proelium*](https://atlas.perseus.tufts.edu/dictionaries/entry/urn%3Acite2%3Ascaife-viewer%3Adictionary-entries.atlas_v1%3Alat.ls.perseus-eng2-n38589/) y los paradigmas y cantidades del banco Collatinus incorporado en Examinator2.
