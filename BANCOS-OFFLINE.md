# PWA de Examinator2 y bancos académicos independientes

Examinator2 se instala desde su URL de GitHub Pages (HTTPS), mediante el botón **Instalar** o el menú del navegador. La instalación prepara un *service worker* que almacena la interfaz, el motor, los diccionarios/textos incluidos, la exportación de Word y los bancos docentes. Una vez completada la primera carga online puede abrirse y generar exámenes **sin conexión**. Los textos opcionales de Perseus aún no descargados requieren acceso inicial a internet.

## Actualización manual y espacio de respuesta

El botón **Actualizar** de la cabecera busca la nueva versión del service worker y vuelve a descargar **todos** los recursos incluidos de la webapp, incluso si el service worker no ha cambiado. Descarga cada archivo por separado para evitar la saturación de GitHub Pages y reintenta los errores temporales. Prepara una caché temporal y reemplaza la anterior solo después de descargarla íntegra. Si falla definitivamente, indica qué archivo y qué código HTTP impidieron la operación. Si el dispositivo está sin conexión o falta algún recurso, conserva la copia anterior y muestra un aviso. Antes de recargar, guarda de forma síncrona el examen abierto en el almacenamiento local; nunca borra las listas personalizadas, los textos de Perseus descargados ni los ajustes.

En **Ajustes → Espacio entre los apartados de la pregunta 4 (cm)** se admite una cantidad precisa entre 0 y 10 cm, con controles de 0,05 cm. El valor predeterminado sigue siendo **2,6 cm**; los exámenes y preferencias antiguas, incluidos los valores equivalentes a «pequeño» (1,8 cm) y «grande» (3,5 cm), se respetan sin migración. Se usa el mismo valor en la vista previa, en el PDF y en Word (con conversión a twips).

## Origen y autonomía

- Banco fonético: `ArchaiosMagister/GeneradorExamenes/data/fonetica/banco_examenes.json` (655 entradas `APTO_PROPUESTO`, agrupadas en las veinte normas del banco). Mantiene los datos de respuesta, estado y transmisión en `EXACADEMIC_SOURCE`, pero **no publica las soluciones en el examen**.
- Latinismos: `ArchaiosMagister/GeneradorExamenes/data/latinismos-docente.json` (87 entradas con definición docente), con el enunciado utilizado para la pregunta y la explicación conservada como metadato local.
- Ambos se empaquetan en `js/bancos-datos.js` y se aplican como listas originales mediante `js/bancos-loader.js`. No se consulta GeneradorExamenes, ninguna API ni un CDN en tiempo de ejecución.
- Las listas personales guardadas por el usuario conservan prioridad: no se sobrescriben. **Restaurar la lista original** recupera la copia nueva de Examinator2.
- El banco de modificación preverbial añade **120 fichas** de verbos simples y derivados documentados, adaptadas al formato `base / compuestos` del motor de Examinator2. El motor sigue seleccionando únicamente verbos reconocidos en el texto latino; no se proponen derivados por conjetura.
- Los prefijos incorporan **286 entradas** del repertorio docente y conservan además **«Ultrapuertos»** como entrada preexistente de Examinator2 (287 en total). El significado/prefijo orientativo y sus metadatos están disponibles en la copia local para revisión, pero el examen conserva su enunciado y no incorpora soluciones.
- La adaptación preserva asimismo las palabras y los derivados que estuvieran en la antigua lista de fábrica, sin atribuirlos falsamente a GeneradorExamenes; los metadatos de procedencia quedan diferenciados en `EXACADEMIC_BANKS.legado` y `derivadosLegado`.
- Las cuatro listas de fábrica se preparan en `js/bancos-loader.js`. Las listas propias guardadas en IndexedDB/localStorage tienen prioridad y no se reemplazan automáticamente. `Restaurar la lista original` recupera el repertorio docente actualizado.

## Selección de normas fonéticas y latinismos

En la **pregunta 4, apartado b**, el botón «Seleccionar normas» permite marcar las veinte normas con sus códigos estables N01–N20. Por defecto no hay restricciones y se mantiene la generación anterior. Con filtros activos sólo se eligen los étimos cuya **lista completa de normas** está permitida; se mantienen cuatro fenómenos distintos y no se repiten étimos. Las palabras personalizadas sin normas homologadas permanecen en la lista editable y participan en el sorteo **sin restricciones**, pero no se incorporan arbitrariamente al sorteo filtrado. Si una selección es incompatible con cuatro fenómenos distintos, se avisa antes de aplicarla.

En el **apartado d** el botón «Intervalo y paridad» permite combinar un intervalo numérico con «Todos», «Pares» o «Impares», usando siempre el número de origen de cada latinismo (1–87), no su posición tras el filtro. «Sin filtro» recupera el comportamiento anterior, incluyendo los latinismos particulares sin número. Una entrada personal sólo participa en un filtro numérico si tiene número (por edición explícita o por coincidencia con un latinismo canónico); se comprueba que haya cuatro candidatos antes de aplicar el filtro.

En **Listas → Latinismos** se admiten tanto las líneas tradicionales `a posteriori` como las líneas numeradas `1. a posteriori`. Los números y los identificadores de normas y preverbios se conservan al editar; los exámenes antiguos sin `evolNormas` o `latinFilter` mantienen el comportamiento original. Los filtros nuevos afectan al sorteo, pero no sobrescriben las respuestas editadas manualmente. La vista previa, Word y PDF mantienen exactamente los mismos enunciados.

Para incorporar cambios docentes futuros, obtener una copia local revisada del repositorio y ejecutar `node scripts/sync-bancos.mjs ../GeneradorExamenes`. Revisar diferencias filológicas, actualizar las referencias de los blobs de origen del encabezado, ejecutar `node tests/regression.cjs`, `node tests/pwa-banks.cjs` y `node tests/lexico-filtros.cjs`, aumentar la versión de caché en `sw.js` y abrir una PR. No hay sincronización automática externa que pueda alterar exámenes.

**Alcance filológico:** `APTO_PROPUESTO` significa elegible didácticamente, no certificación lexicográfica definitiva. Las adaptaciones cultas están distinguidas en el banco de origen mediante `tipoTransmision`; la pregunta de Examinator2 mantiene su presentación habitual (étimo y fenómeno), sin simular una evolución popular.

## Icono

El icono mantiene la identidad del diseño anterior: fondo verde azulado, hoja clara, tres líneas y monograma «II». Se suministran la versión vectorial y los PNG locales de 192 y 512 píxeles. Según el navegador y el sistema operativo, puede ser necesario quitar y volver a instalar el acceso directo para que se renueve el icono de la pantalla de inicio.
