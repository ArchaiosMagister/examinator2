/* Navegación compacta de iPhone: sin duplicar ni reemplazar acciones.
 * Las acciones existentes se alojan en el menú desplegable; el editor
 * y la vista previa comparten el ancho disponible cuando es estrecho.
 */
'use strict';
(function () {
  const mobileQuery = '(max-width: 760px), (max-width: 950px) and (max-height: 550px)';
  function initMobile() {
    const menu = document.getElementById('btnMobileMenu');
    const actions = document.getElementById('headerActions');
    const header = menu && menu.closest('header');
    const libShortcut = document.getElementById('btnMobileLibrary');
    const views = document.getElementById('mobileViews');
    if (!menu || !header || !actions || !views || !libShortcut) return;

    function menuOpen(open) {
      header.classList.toggle('menu-open', open);
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Cerrar menú de acciones' : 'Abrir menú de acciones');
    }
    function view(name) {
      if (name !== 'editor' && name !== 'preview') return;
      document.body.dataset.mobileView = name;
      for (const b of views.querySelectorAll('[data-view]')) {
        const active = b.dataset.view === name;
        b.classList.toggle('on', active);
        b.setAttribute('aria-pressed', String(active));
      }
      menuOpen(false);
      // Vista previa: antes estaba oculta y su ancho era cero; recalcular
      // después de hacerla visible en la rejilla.
      if (name === 'preview' && window.M) {
        if (typeof M.preview === 'function') M.preview();
        if (typeof M.fitSheet === 'function') {
          requestAnimationFrame(() => M.fitSheet());
        }
      }
    }

    M.showMobileView = view;
    menu.addEventListener('click', () => menuOpen(!header.classList.contains('menu-open')));
    libShortcut.addEventListener('click', () => {
      menuOpen(false);
      document.getElementById('btnLib').click();
    });
    actions.addEventListener('click', (e) => {
      if (e.target.closest('button')) menuOpen(false);
    });
    views.addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (b) view(b.dataset.view);
    });
    document.addEventListener('click', (e) => {
      if (header.classList.contains('menu-open') && !header.contains(e.target)) menuOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') menuOpen(false);
    });
    window.addEventListener('resize', () => {
      if (!window.matchMedia(mobileQuery).matches) menuOpen(false);
    });
    view(document.body.dataset.mobileView || 'editor');
  }
  window.addEventListener('DOMContentLoaded', initMobile);
})();
