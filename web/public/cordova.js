/**
 * Stub cordova.js for local development (ng serve / npm start).
 *
 * The real Cordova platform injects its own cordova.js into
 * platforms/browser/www/ during `cordova run/build/prepare`.
 */
(function () {
  function fireDeviceReady() {
    document.dispatchEvent(new CustomEvent('deviceready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fireDeviceReady);
  } else {
    setTimeout(fireDeviceReady, 0);
  }
})();
