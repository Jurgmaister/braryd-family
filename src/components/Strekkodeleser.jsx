import { useEffect, useRef, useState } from 'react';

// Leser strekkoder med kameraet (virker også på iPhone via zxing-wasm, samme løsning som i Alvøen-appen).
// Har i tillegg et felt for å skrive inn koden.
const FORMATER = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'];

let detektorLover;
async function hentDetektor() {
  if (!detektorLover) {
    detektorLover = (async () => {
      const mod = await import('barcode-detector/ponyfill');
      // Egen kopi av wasm-filen (ingen henting fra tredjepart)
      mod.setZXingModuleOverrides({ locateFile: (sti, prefiks) => (sti.endsWith('.wasm') ? `${import.meta.env.BASE_URL}zxing_reader.wasm` : prefiks + sti) });
      return new mod.BarcodeDetector({ formats: FORMATER });
    })();
  }
  return detektorLover;
}

// hoppOver: koden til varen som nettopp ble lagt til – ses bort fra de første sekundene,
// så samme vare ikke leses inn igjen mens den fortsatt er foran kameraet.
export default function Strekkodeleser({ onKode, hoppOver }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('Starter kamera …');
  const [manuell, setManuell] = useState('');
  const ferdig = useRef(false);

  useEffect(() => {
    let strom; let timer; let avbrutt = false;
    (async () => {
      try {
        strom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (avbrutt) return;
        const v = videoRef.current;
        v.srcObject = strom;
        await v.play();
        const detektor = await hentDetektor();
        setStatus('Hold strekkoden inne i rammen');
        const start = Date.now();
        const tikk = async () => {
          if (avbrutt || ferdig.current) return;
          try {
            if (v.readyState >= 2) {
              const funnet = await detektor.detect(v);
              const kode = funnet.find((b) => b.rawValue)?.rawValue;
              const sammeSomSist = kode && hoppOver && kode.trim() === hoppOver && Date.now() - start < 3000;
              if (kode && !ferdig.current && !sammeSomSist) {
                ferdig.current = true;
                navigator.vibrate?.(60);
                onKode(kode.trim());
                return;
              }
            }
          } catch { /* prøv igjen */ }
          timer = setTimeout(tikk, 200);
        };
        tikk();
      } catch (e) {
        setStatus(e?.name === 'NotAllowedError'
          ? 'Kameraet er ikke tillatt. Gi BraRyd tilgang til kamera, eller skriv inn koden under.'
          : 'Fant ikke kamera. Skriv inn koden under.');
      }
    })();
    return () => { avbrutt = true; clearTimeout(timer); strom?.getTracks().forEach((t) => t.stop()); };
  }, [onKode, hoppOver]);

  const send = (e) => {
    e.preventDefault();
    const k = manuell.trim();
    if (k) { ferdig.current = true; onKode(k); }
  };

  return (
    <div className="skann">
      <div className="skann-bilde">
        <video ref={videoRef} playsInline muted />
        <div className="skann-ramme" />
      </div>
      <p className="muted liten">{status}</p>
      <form className="inputrad" onSubmit={send}>
        <input inputMode="numeric" placeholder="Eller skriv inn strekkoden" value={manuell} onChange={(e) => setManuell(e.target.value)} />
        <button type="submit" className="btn btn-ghost btn-sm">OK</button>
      </form>
    </div>
  );
}
