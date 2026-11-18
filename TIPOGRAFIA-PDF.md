# Tipografías de Examinator2 y PDF en iPad

## Estado a 18 de noviembre de 2026

- **Vista previa y Word:** los exámenes nuevos seleccionan «Palatino» por defecto. Es el **nombre de una fuente local**: si el dispositivo no la tiene, la cadena CSS busca Palemonas MUFI y por último la alternativa libre Gentium Book Plus.
- **Palemonas MUFI:** existe como opción para el profesor **si la ha instalado**. No se incorpora al repositorio ni se promete que esté en cualquier dispositivo.
- **Exámenes anteriores:** se conserva el nombre de tipografía ya guardado, incluso «Palatino Linotype».
- **Imprimir / PDF (Safari):** una segunda opción utiliza la impresión HTML nativa con fuente local Palatino (o Palatino Linotype si realmente está instalada). No requiere incorporar archivos comerciales. Imprime el mismo documento HTML A4 que ya se usa en la vista previa y Word. En una PWA instalada, iOS/iPadOS puede impedir la apertura del diálogo aunque la llamada `window.print()` se ejecute correctamente; existe una vista imprimible independiente y se mantiene la exportación directa. El nombre de la fuente seleccionada **no prueba** qué familia quedó realmente incrustada por Safari en el PDF.
- **PDF directo en iPad/iPhone:** `pdfmake` genera texto Unicode seleccionable y embebe **Roboto** (Apache 2.0). Esto se hace deliberadamente: `pdfmake` no puede incrustar una fuente local del iPad únicamente a partir de su nombre CSS. La selección de tipografía de la vista previa y Word **no altera** los caracteres ni las reglas académicas, pero tampoco modifica automáticamente la fuente del PDF de iOS.
- **Word:** la fuente se declara por nombre; no se redistribuye con el documento como archivo de tipografía.

## Licencias y límites de distribución

- **Palatino Linotype:** licencia comercial; no se han adquirido ni incorporado permisos específicos para redistribuirla con la PWA. Véanse las [condiciones de Microsoft](https://learn.microsoft.com/en-us/typography/fonts/font-faq) y la [página de licencias de Monotype](https://www.myfonts.com/collections/palatino-linotype-font-zapf-alphabets?tab=licensing).
- **Palatino:** cuando está disponible como fuente del sistema Apple, puede seleccionarse por nombre, pero la PWA **no** copia ni distribuye sus archivos.
- **Palemonas MUFI:** se ofrece para instalación independiente, pero no se ha podido verificar una autorización inequívoca de **redistribución dentro de una webapp pública**. Que pueda descargarse gratuitamente desde MUFI no equivale a dicha licencia. No confundir esta variante con la fuente lituana Palemonas.
- **Gentium Book Plus:** archivo incluido previamente en `fonts/`, bajo SIL Open Font License, según `fonts/OFL.txt`.
- **Roboto:** incluido por `pdfmake-vfs.js`, bajo Apache License 2.0, según `lib/pdfmake.LICENSE.txt`.

No se incorporarán Palatino Linotype, Palatino ni Palemonas MUFI como archivos distribuibles sin comprobar una licencia aplicable. Si se decide usar una alternativa libre distinta en el motor PDF, habrá que generar el VFS, revisar su cobertura de glifos y comprobar `pdftotext`, `pdfimages`, las cursivas, los acentos y las ligaduras æ/œ en WebKit y Chromium.

## Pruebas

La suite de GitHub Actions incluye regresión académica, exportación DOCX, PDF sin rasterización, y la simulación de impresión nativa en WebKit y Chromium con A4, ocultación de controles y extracción de texto. El diálogo nativo de AirPrint en un iPad/iPhone físico no puede verificarse mediante el emulador de Playwright; hay que comprobarlo directamente antes de garantizar la experiencia en PWA. La PR puede fusionarse solo cuando estos controles finalicen correctamente y se decida la fuente incrustada definitiva.
