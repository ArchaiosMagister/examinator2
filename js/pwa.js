/* Instalación PWA; Examinator también funciona como web normal. */
'use strict';
(function () {
  const btn = document.getElementById('btnInstall');
  if (!btn) return;
  let pendingInstall = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
  if (standalone()) btn.classList.add('hidden');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pendingInstall = event;
    if (!standalone()) btn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    pendingInstall = null;
    btn.classList.add('hidden');
    if (window.M && M.toast) M.toast('Examinator instalado.');
  });

  btn.addEventListener('click', async () => {
    if (pendingInstall) {
      const event = pendingInstall;
      pendingInstall = null;
      await event.prompt();
      await event.userChoice;
      return;
    }
    let message;
    if (location.protocol === 'file:') {
      message = 'Para instalar Examinator como webapp, abre la versión publicada mediante HTTPS. Los archivos locales no pueden registrar el modo sin conexión.';
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      message = 'En Safari, pulsa Compartir y después «Añadir a pantalla de inicio».';
    } else if (/Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)) {
      message = 'En Safari, utiliza Archivo → Añadir al Dock.';
    } else {
      message = 'Utiliza la opción «Instalar aplicación» o «Crear acceso directo» del menú de tu navegador. En Chrome o Edge también puede aparecer un icono de instalación junto a la barra de direcciones.';
    }
    if (window.M && M.modal) M.modal('Instalar Examinator', '<p>' + message + '</p>', [{ label: 'Cerrar', primary: true }]);
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('No se pudo preparar Examinator para uso sin conexión:', err);
      });
    });
  }
})();
