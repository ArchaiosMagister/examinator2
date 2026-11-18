/* Tema visual: preferencia global del navegador, independiente de los exámenes.
 * Se carga en <head> para evitar un destello del tema claro al iniciar.
 */
'use strict';
(function () {
  const KEY = 'examinator.theme';
  const allowed = new Set(['light', 'dark', 'oled']);
  function valid(value) { return allowed.has(value) ? value : 'light'; }
  function stored() {
    try { return valid(JSON.parse(localStorage.getItem(KEY))); }
    catch (_) { return 'light'; }
  }
  let current = stored();
  function apply(value, save) {
    current = valid(value);
    document.documentElement.dataset.theme = current;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content',
      current === 'oled' ? '#000000' : current === 'dark' ? '#121619' : '#1d5466');
    if (save) {
      try { localStorage.setItem(KEY, JSON.stringify(current)); }
      catch (_) { /* almacenamiento privado o deshabilitado */ }
    }
    return current;
  }
  apply(current, false);
  window.EXTheme = {
    current: () => current,
    set: (value) => apply(value, true)
  };
})();
