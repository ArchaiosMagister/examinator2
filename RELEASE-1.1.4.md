# Examinator2 1.1.4 — tarjetas de lectura contextual en la vista previa

- Al pasar el ratón por una palabra del texto latino en la vista previa o tocarla en iPad/iPhone, se abre una ficha de Collatinus con lema, traducción, análisis preferente y lecturas alternativas.
- El texto principal reutiliza los análisis en memoria, incluidos los que se hayan seleccionado manualmente. La Literatura utiliza un análisis local con una pequeña caché asíncrona.
- Las fichas se dibujan fuera de la página A4; no se incluyen en Word, PDF ni en el archivo guardado del examen. No alteran subrayados, diptongos æ/œ ni espaciados.
- Las adiciones entre corchetes no se analizan, en consonancia con el motor académico.
- Funciona sin conexión porque reutiliza el motor local y añade el nuevo script a la caché PWA.
- Corrige el cálculo visual de escala de la hoja en WebKit móvil mediante un contenedor y `transform: scale`, necesarios para que las coordenadas táctiles coincidan con las palabras, manteniendo intacta la maqueta imprimible.
- El resultado contextual es una propuesta, no una comprobación filológica.

Verificación prevista: pruebas de lectura real con ratón y tacto en Chromium/WebKit, lectura literaria sin conexión, ausencia de cambios en la hoja impresa, regresión académica y exportación PDF iPad.
