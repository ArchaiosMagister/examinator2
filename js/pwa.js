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

  // Una actualización manual debe descargar una copia completa y coherente
  // de los recursos offline, incluso cuando el service worker no haya cambiado.
  // Las listas personalizadas y los exámenes están en IndexedDB/localStorage,
  // separados de CacheStorage, y no se eliminan.
  const btnUpdate = document.getElementById('btnUpdate');
  const notify = (message, duration) => {
    if (window.M && M.toast) M.toast(message, duration || 5000);
    else console.info(message);
  };

  function untilActivated(worker) {
    if (worker.state === 'activated') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('La nueva versión no pudo activarse.')), 120000);
      const check = () => {
        if (worker.state === 'activated') finish();
        if (worker.state === 'redundant') finish(new Error('Falló la instalación de la nueva versión.'));
      };
      function finish(error) {
        clearTimeout(timer);
        worker.removeEventListener('statechange', check);
        if (error) reject(error); else resolve();
      }
      worker.addEventListener('statechange', check);
      check();
    });
  }

  function refreshOffline(worker) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => finish(new Error('La actualización de los archivos ha agotado el tiempo disponible.')), 150000);
      function finish(error) {
        clearTimeout(timer);
        channel.port1.close();
        channel.port2.close();
        if (error) reject(error); else resolve();
      }
      channel.port1.onmessage = (event) => {
        const result = event.data || {};
        finish(result.ok ? null : new Error(result.error || 'No se pudieron descargar todos los archivos.'));
      };
      try {
        worker.postMessage({ type: 'REFRESH_OFFLINE' }, [channel.port2]);
      } catch (error) {
        finish(error);
      }
    });
  }

  if (btnUpdate) {
    btnUpdate.addEventListener('click', async () => {
      if (btnUpdate.disabled) return;
      if (location.protocol === 'file:' || !('serviceWorker' in navigator)) {
        notify('La actualización automática requiere abrir la webapp desde HTTPS.');
        return;
      }
      if (navigator.onLine === false) {
        notify('Conéctate a internet para descargar una nueva versión. No se ha borrado ningún dato.');
        return;
      }
      const label = btnUpdate.textContent;
      btnUpdate.disabled = true;
      btnUpdate.textContent = 'Actualizando…';
      try {
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
        await registration.update();
        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        if (registration.installing) await untilActivated(registration.installing);
        else if (registration.waiting) await untilActivated(registration.waiting);
        const worker = registration.active || navigator.serviceWorker.controller;
        if (!worker) throw new Error('El servicio offline todavía no está activo.');
        await refreshOffline(worker);

        // Guardado síncrono y comprobable antes de recargar: no confiar aquí
        // en el guardado diferido que usa la edición ordinaria.
        if (window.M && M.S) localStorage.setItem('examinator.current', JSON.stringify(M.S));
        location.reload();
      } catch (error) {
        notify('No se pudo actualizar: ' + (error.message || error) + '. Conservamos la versión y los datos actuales.', 8000);
      } finally {
        btnUpdate.disabled = false;
        btnUpdate.textContent = label;
      }
    });
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('No se pudo preparar Examinator para uso sin conexión:', err);
      });
    });
  }
})();
