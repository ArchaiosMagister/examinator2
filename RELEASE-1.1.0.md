# Examinator2 1.1.0 — temas oscuro y OLED

La aplicación incorpora tres modos de apariencia en **Ajustes → Apariencia**:

- **Claro**: conserva el aspecto tradicional.
- **Oscuro**: reduce el brillo con fondos gris oscuro y controles adaptados.
- **OLED**: utiliza negro puro (#000000) en fondo, tarjetas, biblioteca, ventanas y área circundante a la hoja.

La preferencia se guarda en el navegador y se recupera al abrir la PWA, incluso sin conexión. No afecta al contenido de los exámenes.

La **vista previa A4 siempre se mantiene blanca con texto oscuro**. Las exportaciones Word y PDF, las tipografías académicas, la lematización, la selección de textos, los bancos, los archivos guardados y las preguntas no se modifican.

Se añaden pruebas de regresión de la persistencia, contraste de controles, hoja A4 y comparación del HTML de impresión en WebKit y Chromium (escritorio e iPhone).

Esta versión mantiene el motor PDF original del iPad, sin introducir PDF vectorial ni un botón de impresión adicional. El modo OLED depende del brillo y del panel del dispositivo: negro de CSS no garantiza ahorro equivalente en todos los equipos.
