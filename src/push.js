import { VAPID_PUBLIC_KEY } from './config.js';
import { callFunction } from './supabase.js';

export const pushStottes = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const erIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const erInstallert = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iPhone kan bare få push når appen er lagt til på Hjem-skjermen.
export const maaInstalleres = () => erIos() && !erInstallert();

function tilBytes(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function aktivtAbonnement() {
  if (!pushStottes()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function slaaPaaPush() {
  if (!pushStottes()) throw new Error('Denne nettleseren støtter ikke varsler.');
  if (!VAPID_PUBLIC_KEY) throw new Error('Varsler er ikke satt opp ennå.');
  const tillatelse = await Notification.requestPermission();
  if (tillatelse !== 'granted') throw new Error('Varsler er ikke tillatt. Slå det på i innstillingene på telefonen (Varslinger → BraRyd).');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: tilBytes(VAPID_PUBLIC_KEY) });
  await callFunction('push-abonner', { subscription: sub.toJSON() });
  return sub;
}

export async function slaaAvPush() {
  const sub = await aktivtAbonnement();
  if (!sub) return;
  await callFunction('push-avslutt', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

// Holder abonnementet oppdatert på serveren (f.eks. etter at nettleseren har fornyet det)
export async function fornyAbonnement() {
  try {
    const sub = await aktivtAbonnement();
    if (sub && Notification.permission === 'granted') await callFunction('push-abonner', { subscription: sub.toJSON() });
  } catch { /* prøver igjen neste gang */ }
}
