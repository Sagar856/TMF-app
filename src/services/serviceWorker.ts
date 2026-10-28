import { Capacitor } from '@capacitor/core';

/**
 * Registers the offline app-shell service worker on the web build only.
 * Inside the Capacitor WebView the native shell already provides offline
 * startup, and in dev HMR would fight the cache.
 */
export function registerServiceWorker(onUpdateReady?: () => void): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  if (Capacitor.isNativePlatform()) return;

  const swUrl = `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(__APP_VERSION__)}`;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady?.();
          });
        });
      })
      .catch((error) => console.warn('Service worker registration failed:', error));
  });
}
