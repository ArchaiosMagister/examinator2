# PWA de Examinator2 y bancos académicos independientes

Examinator2 se instala desde su URL de GitHub Pages (HTTPS), mediante el botón **Instalar** o el menú del navegador. La instalación prepara un *service worker* que almacena la interfaz, el motor, los diccionarios/textos incluidos, la exportación de Word y los bancos docentes. Una vez completada la primera carga online puede abrirse y generar exámenes **sin conexión**. Los textos opcionales de Perseus aún no descargados requieren acceso inicial a internet.

## Origen y autonomía

- Banco fonético: `ArchaiosMagister/GeneradorExamenes/data/fonetica/banco_examenes.json` (655 entradas `APTO_PROPUESTO`, agrupadas en las veinte normas del banco). Mantiene los datos de respuesta, estado y transmisión en `EXACADEMIC_SOURCE`, pero **no publica las soluciones en el examen**.
- Latinismos: `ArchaiosMagister/GeneradorExamenes/data/latinismos-docente.json` (87 entradas con definición docente), con el enunciado utilizado para la pregunta y la explicación conservada como metadato local.
- Ambos se empaquetan en `js/bancos-datos.js` y se aplican como listas originales mediante `js/bancos-loader.js`. No se consulta GeneradorExamenes, ninguna API ni un CDN en tiempo de ejecución.
- Las listas personales guardadas por el usuario conservan prioridad: no se sobrescriben. **Restaurar la lista original** recupera la copia nueva de Examinator2.
- Las otras dos listas (modificación preverbial y prefijos) quedan intactas.

Para incorporar cambios docentes futuros, obtener una copia local revisada del repositorio y ejecutar `node scripts/sync-bancos.mjs ../GeneradorExamenes`. Revisar diferencias filológicas, actualizar las referencias de los blobs de origen del encabezado, ejecutar `node tests/regression.cjs` y `node tests/pwa-banks.cjs`, aumentar la versión de caché en `sw.js` y abrir una PR. No hay sincronización automática externa que pueda alterar exámenes.

**Alcance filológico:** `APTO_PROPUESTO` significa elegible didácticamente, no certificación lexicográfica definitiva. Las adaptaciones cultas están distinguidas en el banco de origen mediante `tipoTransmision`; la pregunta de Examinator2 mantiene su presentación habitual (étimo y fenómeno), sin simular una evolución popular.
