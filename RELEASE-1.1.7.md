# Examinator2 1.1.7 — integridad del examen, decisiones docentes y autoguardado

Versión de mantenimiento sobre 1.1.6. No cambia los bancos académicos ni los criterios filológicos.

## Correcciones funcionales

- Conservar selecciones de lemas, palabras subrayadas por categoría y verbos para modificación preverbial cuando siguen siendo identificables tras editar el texto; volver a proponer solo elementos que ya no son válidos.
- Evitar que entradas manuales incompletas aparezcan en Word y PDF. Se mantienen en el editor y se advierte antes de exportar.
- Validar los archivos `.examen` antes de abrirlos, rechazando estructuras inválidas sin sustituir el examen que se está editando.
- Preparar análisis y vocabulario de forma atómica. Si falla Collatinus o la consulta de vocabulario, no se mezcla información del texto anterior con el nuevo. Las exportaciones requieren análisis vigente.
- Forzar guardado automático al ocultar o cerrar la página y comunicar fallos de almacenamiento.

## Pruebas y compatibilidad

- Nueva batería automatizada de integridad, recuperación y guardado.
- Prueba de navegador: descarga de `.examen`, modificación posterior, rechazo de un archivo dañado, reapertura y cotejo de documentos Word/PDF reales.
- Conservación de los mecanismos de importación anteriores para exámenes válidos.
- Las correcciones se despliegan únicamente después de superar la regresión funcional, visual y de PDF/iPad.
