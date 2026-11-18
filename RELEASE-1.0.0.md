# Examinator2 — versión estable 1.0.0

**Fecha:** 18 de noviembre de 2026  
**Alcance:** estabilización sin modificar las funciones docentes existentes.

Esta versión conserva el editor, los bancos locales, la biblioteca, los estilos de examen, el guardado de archivos `.examen` y la exportación Word/PDF. En iPad/iPhone se mantiene expresamente el mecanismo de PDF anterior a la PR #16 (páginas rasterizadas, descargables o compartibles); en escritorio se mantiene la impresión del navegador.

## Correcciones de fiabilidad

- El análisis y el vocabulario asíncronos se invalidan al cambiar de examen. Respuestas tardías ya no deben modificar el examen nuevo.
- La selección de otro lema y la actualización del vocabulario no aplican resultados a un examen que ya no está abierto.
- Las exportaciones Word y PDF evitan ejecuciones duplicadas accidentales y mantienen el nombre del examen desde el inicio de la operación.
- La lectura de archivos `.examen` informa errores de lectura y resuelve las cancelaciones del selector cuando el navegador emite el evento estándar `cancel`.
- La configuración inválida y los datos de sesión guardados con un tipo inesperado no deben bloquear el arranque.
- Actualización del identificador de caché PWA para descargar el paquete 1.0 de forma coherente.
- Corrección de las instrucciones de usuario acerca de la exportación PDF desde iPad/iPhone.

## Comprobaciones exigidas

- Suite de regresión académica, morfología, vocabulario, diptongos, textos latinos, selección táctil, biblioteca y listas.
- Nuevos escenarios de concurrencia durante el análisis y de cancelación de la selección de archivo.
- Exportación y compartición PDF en WebKit/Chromium simulando iPad; maquetación de filas del vocabulario.
- Carga offline completa, actualización segura de la PWA, y publicación en GitHub Pages.

## Limitaciones conocidas

- El PDF directo desde iPad/iPhone sigue siendo un PDF con imágenes de las páginas, **no texto seleccionable**. Se conserva el funcionamiento anterior por decisión del profesor.
- La selección de «Palatino Linotype» usa la tipografía local solo cuando está instalada; no se incluye ni redistribuye la fuente.
- Las pruebas automatizadas no equivalen a comprobar todas las versiones físicas de iPadOS, Safari, macOS, Windows y Linux. Los cambios no garantizan ausencia absoluta de errores.

No se incorporan funciones de cuadernos, importación de Word ni exportación conjunta. Esas funciones se desarrollan separadamente en CuadernoTextosLatinos.
