# Examinator2 1.1.5 — auditoría visual continua e interfaz adaptada a iPad

La versión incorpora la batería independiente de regresión visual y de documentos de la PR #14, actualizada sobre 1.1.4.

- El diseño compacto de menús, accesos a Biblioteca y pestañas Editar/Vista previa se activa en pantallas de hasta 1100 px, incluidas las de iPad, evitando desbordamientos en orientación vertical y horizontal.
- Se conservan sin modificar las tarjetas contextuales de Collatinus, la detección de palabras táctiles en WebKit, el escalado mediante `transform` y `#sheetSizer` y las exportaciones de la versión 1.1.4.
- Nueva verificación real de 8 perfiles de pantalla en Chromium y WebKit: menú, editor, previsualización, cabecera, biblioteca y lector, con capturas diagnósticas.
- Nueva comprobación comparada de Word y PDF mediante LibreOffice y Poppler: posición de cabecera, marco exterior, ausencia de divisiones interiores y márgenes coherentes.
- Evidencias visuales de GitHub Actions conservadas 14 días. La auditoría corre también en futuros cambios de main.
- No se modifican bancos académicos, lematización, generación de preguntas ni la estructura de los exámenes guardados.

Las pruebas deben terminar correctamente antes de fusionar y publicar.
