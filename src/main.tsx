import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
// The lyrics' font comes with the app, not from Google: no other server holds up the first screen.
import '@fontsource/figtree/700.css';
import '@fontsource/figtree/800.css';
import './base.css';
import {App} from './App';
import {installHaptics} from './haptic';

installHaptics();

// HK keeps itself on this device with a service worker (sw/sw.js), so it opens at once. Not in
// development, where a kept app would hide the changes being made. A new deploy installs in the
// background, then takes over: the page reloads into it at once while nothing was tapped yet, else
// when it next comes back to the front (checked at most once a minute).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const RELOADED_AT_KEY = 'reloaded-for-deploy-at';
  const reloadForDeploy = () => {
    try {
      if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0) < 10_000) return;
      sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  };
  let tapped = false;
  let outdated = false;
  let checkedAt = 0;
  window.addEventListener('pointerdown', () => (tapped = true), {capture: true, once: true});
  // The first install takes over a page that is already the live one.
  let controlled = null !== navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    if (tapped) outdated = true;
    else reloadForDeploy();
  });
  document.addEventListener('visibilitychange', async () => {
    if ('visible' !== document.visibilityState) return;
    if (outdated) return reloadForDeploy();
    if (Date.now() - checkedAt < 60_000) return;
    checkedAt = Date.now();
    try {
      await (await navigator.serviceWorker.getRegistration())?.update();
    } catch {
      // Offline: the next return to the front tries again.
    }
  });
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch {
      // No service worker: the app still works, it needs the network to open.
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
