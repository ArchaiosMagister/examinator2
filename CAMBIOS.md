# Adaptación de Examinator

## Funciones disponibles

- Selector **Examen / Texto de repaso**. El repaso elimina las puntuaciones de los enunciados. La cabecera sigue siendo editable.
- **Ajustes**: Palatino y Palatino Linotype, tamaño 10,5 y otros tamaños, y espacio entre preguntas de 0 a 10 cm. Se aplican a la vista previa, a la impresión/PDF y a Word.
- **Ajustes → Vocabulario preferente**: importar JSON o texto con columnas separadas por tabuladores. Se conserva el motor de análisis y se sustituye el enunciado y la traducción cuando el lema está en la lista docente. Las palabras ausentes usan el diccionario original.
- Las cantidades de las entradas docentes se conservan como se escribieron; el selector de cantidades sigue actuando sobre las entradas del diccionario original.
- **Texto de literatura**: selección independiente de *Miles Gloriosus*, *Eneida* IV y *Heroida* I. Se conservan los versos y se deja la traducción vacía al seleccionar un fragmento nuevo; después puede pegarse y editarse.
- Textos incorporados: Eutropio, las dos obras de Julio César, *Miles Gloriosus*, *Eneida* y *Heroidas*. La biblioteca general permite consultar las obras completas; el selector de literatura limita Virgilio al libro IV y Ovidio a la primera epístola.
- Nombres de catálogo y referencias: **Julio César**, **De bello Gallico**, **De bello civili**.

## Vocabulario

Formato TSV, sin cabecera:

```text
enunciado<TAB>traducción<TAB>forma1|forma2<TAB>aclaración
```

Las dos últimas columnas son opcionales. Las formas permiten incluir palabras que el analizador original no reconozca.

Formato JSON:

```json
[
  {
    "lema": "puella",
    "head": "puella, -ae f.",
    "trad": "muchacha",
    "formas": ["puellae", "puellam"],
    "note": ""
  }
]
```

La lista se guarda en el navegador. Aplicar una lista nueva actualiza el vocabulario del documento abierto respetando las correcciones manuales de sus entradas. Las entradas seleccionadas se guardan también en los archivos `.examen`, como antes.

## Pendiente de los adjuntos

No se han recibido todavía la lista de palabras ni los dos documentos modelo. La lista docente aún está vacía y los modos usan una disposición provisional basada en el diseño original. Su maquetación y los enunciados definitivos se adaptarán al recibir los modelos.

Palatino debe estar instalada en el equipo; no se distribuye una copia de esa tipografía. Gentium Book Plus sigue incluida como alternativa.

## Comprobaciones

Con Node.js instalado:

```sh
node tests/regression.cjs
```

Comprueba sintaxis, ausencia de duplicados en el catálogo, disponibilidad de los textos sin conexión, los 705 versos de Eneida IV y los 116 de Heroida I, análisis latino, prioridad del vocabulario y diccionario de respaldo, modo repaso, espaciado cero y exportación Word con 21 medios puntos (10,5 pt).

También se ha comprobado en el navegador el cambio a repaso, las opciones de Palatino y 10,5 y la apertura del libro IV desde el selector de literatura. La impresión/PDF usa el HTML de la vista previa; no se ha verificado visualmente un PDF final ni un Word final, pendientes de los modelos.

Esta versión queda preparada para continuar la adaptación al recibir el vocabulario y los modelos.
