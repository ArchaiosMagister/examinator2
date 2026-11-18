# Examinator2 1.1.2 — Literatura como quinta pregunta

Esta actualización ajusta exclusivamente la presentación de la pregunta de Literatura. Se conservan el editor, la selección y edición de pasajes, los datos académicos, los ejercicios 1–4, la biblioteca, los tres modos de apariencia y las exportaciones Word/PDF existentes.

- Cuando se incorpora un fragmento literario, aparece como **pregunta 5** de la misma lista y con el mismo sistema de negrita, sangría y numeración: «Literatura. Indique el autor y obra a que pertenece el siguiente texto. Contextualice y comente el pasaje. (2p.)».
- No aparecen en el documento del alumno la identificación del autor, obra ni pasaje, ni la etiqueta «Traducción». Esos metadatos se siguen conservando en el editor, sin perder los datos guardados.
- Bajo la pregunta se incorpora una tabla con **una fila y dos columnas**, sin encabezados. Primera columna: texto latino en cursiva, con las ligaduras `æ/œ` verificadas por el analizador; segunda columna: traducción en redonda.
- Ambas celdas utilizan explícitamente **Palatino Linotype a 10 puntos**, independientemente del tamaño o de la fuente general que se haya elegido para el examen. En dispositivos donde no esté instalada se utilizará una fuente alternativa disponible; en Word la familia declarada sigue siendo Palatino Linotype.
- Se preservan los saltos de línea del fragmento en ambas columnas. La tabla es un elemento nativo de Word y también se representa en HTML para la vista previa y el PDF.
- En los «Textos de repaso» se respeta la supresión previa de puntuaciones: la misma pregunta, pero sin «(2p.)».
- Sin pasaje literario, el examen continúa mostrando solo las cuatro preguntas anteriores.

**Pruebas:** regresión del motor y archivos existentes; comprobación de que los datos de atribución no llegan al HTML ni al documento Word; tabla Word real de dos celdas, cursiva y tamaños; verificación de presentación en WebKit/Chromium de escritorio e iPhone, además de pruebas de PDF iPad y PWA offline.

Esta versión no incorpora fuentes comerciales ni altera el funcionamiento original de exportación de PDF.
