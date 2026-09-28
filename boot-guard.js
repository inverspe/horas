/* Horas boot guard. Deliberately a CLASSIC script, loaded before the app's modules.
 *
 * If the app's ES modules ever fail to link — e.g. cached files from two different
 * deploys, where app.js imports something charts.js doesn't export — the browser runs
 * none of app.js. Recovery code inside app.js would never execute, so it lives here,
 * where it runs regardless. Sessions are stored in IndexedDB; nothing here touches it.
 */
(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  var sw = navigator.serviceWorker;

  // A new version took control: reload once so the page and its files match.
  var hadController = !!sw.controller;
  var reloading = false;
  sw.addEventListener('controllerchange', function () {
    if (!hadController || reloading) return;   // first install: nothing stale to fix
    reloading = true;
    location.reload();
  });
  sw.register('sw.js').catch(function (err) { console.warn('SW registration failed:', err); });

  // Watchdog. app.js sets window.__horas the moment it runs. If it still hasn't after
  // a few seconds, the modules didn't load: ask the worker for a fresh matching set of
  // files and reload. At most once per launch, so a genuine bug can't cause a loop.
  var KEY = 'horas-repair-attempted';
  setTimeout(function () {
    if (window.__horas) {
      try { sessionStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
      return;
    }
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, '1');
    } catch (e) { /* storage unavailable: still try once */ }

    var done = false;
    var reload = function () { if (!done) { done = true; location.reload(); } };
    sw.addEventListener('message', function (e) { if (e.data === 'repaired') reload(); });
    if (sw.controller) sw.controller.postMessage('repair');
    setTimeout(reload, 10000);   // older workers don't answer 'repair'; reload anyway
  }, 6000);
})();
