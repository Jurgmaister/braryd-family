// Holder appen på hjemskjermen oppdatert: sjekker etter ny versjon ved oppstart,
// når appen kommer frem igjen, og hvert 30. minutt.
const CURRENT = __BUILD_ID__;
const TRIED_KEY = 'braryd.reloadedFor';
let checking = false;

async function check() {
  if (checking || !navigator.onLine) return;
  checking = true;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = await res.json();
    if (!build || build === CURRENT) return;
    let tried = null;
    try { tried = sessionStorage.getItem(TRIED_KEY); } catch { /* ignorer */ }
    if (tried === build) return;
    try { sessionStorage.setItem(TRIED_KEY, build); } catch { /* ignorer */ }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update().catch(() => {});
    }
    window.location.reload();
  } catch {
    // offline eller midlertidig feil
  } finally {
    checking = false;
  }
}

export function startUpdateChecks() {
  if (!import.meta.env.PROD) return;
  check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 30 * 60 * 1000);
}
