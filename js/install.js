// Installing Well Played as an app, and keeping an installed app up to date.
// - Registers the service worker (offline play).
// - Captures Chrome/Android's install prompt; on iPhone, explains Share → Add to Home Screen.
// - Shows an "Update ready" banner when a new version is waiting, and checks for one whenever
//   the app comes back to the foreground (installed apps can stay open for days).
(function () {
  const { h } = WH;
  let deferred = null;           // Chrome's beforeinstallprompt event
  const listeners = new Set();   // UI that wants to know when installability changes

  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) {} });

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; WH.store.data.installed = true; WH.store.save(); WH.toast('Installed! Find Well Played on your home screen.', 3200); notify(); });

  function help() {
    const steps = isIOS
      ? (isIOSSafari
        ? [['1', h('span', null, 'Tap the ', h('b', null, 'Share'), ' button (the square with an arrow) in Safari’s toolbar.')],
           ['2', h('span', null, 'Scroll down and tap ', h('b', null, 'Add to Home Screen'), '.')],
           ['3', h('span', null, 'Tap ', h('b', null, 'Add'), '. Well Played opens full-screen from its own icon.')]]
        : [['1', h('span', null, 'Open ', h('b', null, 'well-played.win'), ' in ', h('b', null, 'Safari'), '. On iPhone, only Safari can add apps to the home screen.')],
           ['2', h('span', null, 'Tap Share, then ', h('b', null, 'Add to Home Screen'), '.')]])
      : [['1', h('span', null, 'Open your browser menu (⋮ or ⋯).')],
         ['2', h('span', null, 'Choose ', h('b', null, 'Install app'), ' or ', h('b', null, 'Add to Home screen'), '.')]];
    WH.modal({
      title: 'Install Well Played',
      body: h('div', { class: 'install-help' },
        h('p', { class: 'muted' }, 'Play from your home screen, full-screen and offline.'),
        h('ol', { class: 'install-steps' }, steps.map(([n, t]) => h('li', null, h('span', { class: 'step-n' }, n), t))),
        h('p', { class: 'small muted' }, isIOS
          ? 'On iPhone, the installed app keeps its own storage, separate from Safari. Play online with a username (or use your recovery code) and your streak and stats come with you.'
          : 'Your progress carries over automatically.')),
    });
  }

  async function prompt() {
    if (!deferred) return help();
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    deferred = null; notify();
    return choice && choice.outcome === 'accepted';
  }

  // ---- Service worker + updates ----
  function showUpdate(worker) {
    if (document.querySelector('.update-bar')) return;
    const bar = h('div', { class: 'update-bar', role: 'status' },
      h('span', null, 'A new version of Well Played is ready.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { bar.querySelector('button').textContent = 'Updating…'; worker.postMessage('skipWaiting'); } }, 'Update'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Later', onclick: () => bar.remove(), html: WH.icons.x }));
    document.body.append(bar);
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // Reload only when an update replaces an existing worker, never on a first visit.
    const controlledAtLoad = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (controlledAtLoad && !reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const hadController = !!navigator.serviceWorker.controller;
      if (reg.waiting && hadController) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
        });
      });
      let last = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - last > 15 * 60 * 1000) { last = Date.now(); reg.update().catch(() => {}); }
      });
    }).catch(() => {});
  }

  WH.install = {
    isStandalone, isIOS,
    canInstall: () => !isStandalone() && (!!deferred || isIOS),
    hasNativePrompt: () => !!deferred,
    prompt, help,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
