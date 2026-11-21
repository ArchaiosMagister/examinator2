# Examinator2 1.1.1 — correcciones de edición y grafías latinas

Esta actualización mantiene intactos los bancos académicos salvo dos correcciones ortográficas de presentación expresamente solicitadas y no cambia el número ni la estructura de las preguntas.

- **Literatura:** el campo **Pasaje** ocupa una columna más corta y nunca desborda su tarjeta, incluso en iPhone.
- **Vocabulario a mano:** al pulsar «Añadir una entrada a mano», el foco se sitúa en la nueva entrada vacía, identificada por su índice real. Ya no se enfoca accidentalmente la última entrada ordenada alfabéticamente.
- **Glosas independientes:** las entradas añadidas a mano incluyen la opción **«Glosas separadas»**. Para `magnis itineribus`, escribir `grandes | caminos` y activar la casilla genera `‘grandes’ ‘caminos’` en la vista previa, Word y PDF. Sin activarla se conserva el entrecomillado tradicional de una única glosa. La opción se conserva en exámenes y en el vocabulario preferente.
- **Modificación preverbial:** las propuestas automáticas muestran `æ/œ` solo cuando el análisis morfológico ya las ha verificado; los hiatos y los textos introducidos manualmente no se transforman indiscriminadamente.
- **Evolución fonética:** se recuperan las ligaduras documentadas en el banco local, incluyendo ejercicios guardados con la ortografía antigua, sin alterar el dato guardado ni convertir hiatos.
- **Latinismos:** `ad kalendas Graecas` conserva la mayúscula del gentilicio; `ex æquo` muestra el diptongo. Ambos mantienen sus números originales, 7 y 29 respectivamente, y siguen siendo reconocidos en exámenes anteriores y listas personalizadas.

Los cuatro apartados de la pregunta 4, los modelos de examen, los bancos, la biblioteca, los temas claro/oscuro/OLED y el flujo de PDF original se mantienen. Las pruebas automatizadas abarcan regresión académica y pruebas reales de navegador WebKit/Chromium en escritorio e iPhone, además de Word.

**Uso:** después de publicar la versión, pulsa «Actualizar» dentro de Examinator2 para renovar los recursos locales de la PWA.
