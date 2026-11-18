# Examinator2 1.1.3 — espaciado entre latinismos y Literatura

Corrección puntual de la pregunta 5 sin cambios en las funciones académicas, los modelos ni los bancos.

- Cuando se ha incluido un pasaje de Literatura (pregunta 5), el espacio **entre la última subpregunta de la pregunta 4 (latinismos) y Literatura** utiliza exactamente el ajuste existente **«Espacio entre preguntas de la pregunta 4»**, también en la vista previa, Word y PDF.
- Se evita sumar por duplicado el intervalo general entre preguntas.
- Con un valor de 0 cm, la nueva separación también es 0. La configuración existente `hueco` se sigue midiendo en centímetros y se conserva al guardar/abrir exámenes.
- Si no hay pregunta de Literatura, no se modifica el espacio después de los latinismos.
- No cambian el texto de la pregunta 5, su tabla de dos columnas en Palatino Linotype a 10 puntos, los diptongos, los temas de color ni el motor de exportación.

Pruebas: seis valores de separación en HTML y XML Word, con y sin Literatura; verificación visual en WebKit y Chromium para escritorio e iPhone; regresión académica general y PDF iPad.
