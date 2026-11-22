# Examinator2 1.1.6 — interlineado latino, vocabulario y paginación

Esta versión incorpora las mejoras publicadas y verificadas de las PR #25 y #26, posteriores a la versión 1.1.5.

## Texto latino y vocabulario
- Interlineado latino exacto en puntos de Word: escritura directa de valores entre 12 y 144 pt, incluidos decimales; aplicado a vista previa, PDF y DOCX.
- Separación automática del vocabulario proporcional al interlineado del texto.
- Opción de separación independiente entre texto y vocabulario (0–144 pt), sin modificar el interlineado latino; guardada en los exámenes y preferencias.
- Control rápido de interlineado junto a la vista previa y sincronización con Ajustes.
- Aviso no bloqueante ante un interlineado reducido para macrones y breves, ajustado al tamaño de letra.

## Paginación y compatibilidad
- Prevención de viudas y huérfanas en la composición CSS.
- En Word, el título de Vocabulario permanece junto a su primera entrada.
- Compatibilidad con archivos de examen antiguos que emplean interlineado multiplicador.
- Los bancos de textos, análisis morfológicos, contenidos académicos y motores de generación de ejercicios no se modifican.

## Pruebas
- Regresiones funcionales y PWA, pruebas visuales en Chromium/WebKit, y maquetación PDF/iPad: todas superadas en main después de fusionar las PR.
- Verificación de documentos reales multipágina con interlineados de 24, 36, 48 y 60 pt tanto en PDF como en Word: 70 marcadores de texto conservados, sin páginas vacías ni vocabularios adelantados, superpuestos o con encabezado aislado.
- Publicación GitHub Pages de la PR #26 verificada en el commit `89687d97ce8e2291b984d23f0523228271bc097e`.

La nueva etiqueta v1.1.6 se generará automáticamente en el commit que se publique tras fusionar esta preparación, únicamente si las comprobaciones de GitHub Actions y Pages finalizan correctamente.
