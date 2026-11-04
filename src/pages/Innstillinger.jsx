import { useEffect, useState } from 'react';
import { pushStottes, maaInstalleres, aktivtAbonnement, slaaPaaPush, slaaAvPush } from '../push.js';
import { callFunction } from '../supabase.js';
import { supabase } from '../supabase.js';
import { FUNCTION_URL, BUTIKKER } from '../config.js';
import { useMedlemmer, lastMedlemmerPaaNytt, useInnstillinger, lastInnstillingerPaaNytt, useErAdmin } from '../data.js';
import Topbar from '../components/Topbar.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

async function kopier(tekst, hva) {
  try { await navigator.clipboard.writeText(tekst); toast(`${hva} er kopiert`); } catch { window.prompt('Kopier denne:', tekst); }
}

export default function Innstillinger({ email }) {
  const medlemmer = useMedlemmer();
  const meg = medlemmer.find((m) => m.email.toLowerCase() === email.toLowerCase());
  const erAdmin = useErAdmin();
  const [navn, setNavn] = useState('');
  useEffect(() => { if (meg) setNavn(meg.navn); }, [meg]);

  async function lagreNavn() {
    if (!navn.trim() || navn.trim() === meg?.navn) return;
    const { error } = await supabase.from('medlemmer').update({ navn: navn.trim() }).eq('email', meg.email);
    if (error) toast(error.message); else { await lastMedlemmerPaaNytt(); toast('Navnet er lagret'); }
  }

  return (
    <main className="page">
      <Topbar tittel="Innstillinger" />

      <section className="card stack">
        <h2 className="h2">Deg</h2>
        <label className="field">Navnet ditt i appen
          <input value={navn} onChange={(e) => setNavn(e.target.value)} onBlur={lagreNavn} />
        </label>
        <p className="muted liten">Innlogget som {email}</p>
        <p className="muted liten">Familien: {medlemmer.map((m) => m.navn).join(', ')}</p>
      </section>

      {erAdmin && (
        <a className="card card-link" href="#/admin">
          <Icon name="lock" />
          <span className="vokse"><b>Admin</b><br /><span className="muted liten">Tilganger og passord for familien</span></span>
          <Icon name="chevronR" />
        </a>
      )}
      <Varsler />
      <Siri />
      <TilbudInnstillinger />

      <button type="button" className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
        <Icon name="logout" size={18} /> Logg ut
      </button>
      <p className="muted liten sentrert">BraRyd familieplanlegger</p>
    </main>
  );
}

function Siri() {
  const [nokkel, setNokkel] = useState('');
  const [vis, setVis] = useState(false);
  useEffect(() => {
    supabase.rpc('min_siri_nokkel').then(({ data, error }) => { if (!error) setNokkel(data); });
  }, []);

  async function ny() {
    if (!window.confirm('Lage ny nøkkel? Snarveiene dine må da oppdateres med den nye nøkkelen.')) return;
    const { data, error } = await supabase.rpc('ny_siri_nokkel');
    if (error) toast(error.message); else { setNokkel(data); toast('Ny nøkkel laget'); }
  }

  return (
    <section className="card stack">
      <h2 className="h2"><Icon name="mic" size={20} /> Siri og HomePod</h2>
      <p className="muted">Med to snarveier på iPhone kan du si <b>«Hei Siri, handleliste»</b> for å legge til varer, og <b>«Hei Siri, hva skal vi handle»</b> for å høre listen. Det virker også på HomePod.</p>

      <div className="nokkelboks">
        <span className="feltnavn">Din Siri-nøkkel</span>
        <code>{nokkel || '…'}</code>
        <div className="knapperad">
          <button type="button" className="btn btn-sm btn-primary" disabled={!nokkel} onClick={() => kopier(nokkel, 'Nøkkelen')}><Icon name="copy" size={16} /> Kopier nøkkel</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => kopier(FUNCTION_URL, 'Adressen')}><Icon name="copy" size={16} /> Kopier adresse</button>
        </div>
        <p className="muted liten">Nøkkelen er personlig. Del den ikke utenfor familien. Lag en ny hvis den har kommet på avveie.</p>
      </div>

      <button type="button" className="lenkeknapp" onClick={() => setVis(!vis)}>{vis ? 'Skjul' : 'Vis'} hvordan du lager snarveiene</button>
      {vis && (
        <div className="veiledning">
          <p className="feltnavn">Snarvei 1: «Handleliste» (legge til)</p>
          <ol>
            <li>Åpne <b>Snarveier</b> → <b>+</b>. Gi den navnet <b>Handleliste</b>.</li>
            <li>Legg til <b>Spør etter inndata</b> (Ask for Input) med teksten «Hva skal på listen?».</li>
            <li>Legg til <b>Hent innhold fra URL</b> (Get Contents of URL):
              <ul>
                <li>URL: adressen du kopierte over</li>
                <li>Metode: <b>POST</b>, Forespørselsinnhold: <b>JSON</b></li>
                <li>Felt: <code>action</code> = <code>siri-legg-til</code>, <code>nokkel</code> = nøkkelen din, <code>tekst</code> = <i>Gitt inndata</i></li>
              </ul>
            </li>
            <li>Legg til <b>Les tekst</b> (Speak Text) med <i>Innhold fra URL</i>.</li>
          </ol>
          <p className="feltnavn">Snarvei 2: «Hva skal vi handle» (lese opp)</p>
          <ol>
            <li>Ny snarvei med navnet <b>Hva skal vi handle</b>.</li>
            <li><b>Hent innhold fra URL</b>: samme adresse, POST, JSON med <code>action</code> = <code>siri-les</code> og <code>nokkel</code> = nøkkelen din.</li>
            <li><b>Les tekst</b> med <i>Innhold fra URL</i>.</li>
          </ol>
          <p className="muted liten">Si flere varer med «og» mellom: «melk og egg og to agurker». HomePod: slå på <b>Personlige forespørsler</b> i Hjem-appen for HomePod-en.</p>
        </div>
      )}
      <button type="button" className="lenkeknapp muted" onClick={ny}>Lag ny nøkkel</button>
    </section>
  );
}

function TilbudInnstillinger() {
  const inn = useInnstillinger();
  const [valgt, setValgt] = useState(null);
  const [km, setKm] = useState(15);
  const [pos, setPos] = useState(null);
  const [naer, setNaer] = useState(null);
  const [sjekker, setSjekker] = useState(false);
  useEffect(() => {
    if (!inn) return;
    setValgt(inn.butikker || []);
    if (inn.radius_km != null) setKm(inn.radius_km);
    if (inn.lat != null) setPos({ lat: inn.lat, lng: inn.lng });
    setNaer(inn.butikker_naer || null);
  }, [inn]);
  if (!valgt) return null;

  const veksle = (k) => setValgt(valgt.includes(k) ? valgt.filter((x) => x !== k) : [...valgt, k]);

  async function sjekkNaer(nyPos = pos, nyKm = km) {
    if (!nyPos) { toast('Trykk «Bruk min posisjon» først'); return; }
    setSjekker(true);
    try {
      const svar = await callFunction('butikker-naer', { lat: nyPos.lat, lng: nyPos.lng, km: nyKm });
      setNaer(svar.naer);
      await lastInnstillingerPaaNytt();
    } catch (e) { toast(e.message); } finally { setSjekker(false); }
  }

  function minPosisjon() {
    if (!navigator.geolocation) { toast('Telefonen deler ikke posisjon'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const ny = { lat: Number(p.coords.latitude.toFixed(4)), lng: Number(p.coords.longitude.toFixed(4)) }; setPos(ny); sjekkNaer(ny, km); },
      () => toast('Fikk ikke tilgang til posisjonen'),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  async function lagre() {
    const { error } = await supabase.from('innstillinger').update({ butikker: valgt }).eq('id', 1);
    if (error) { toast(error.message); return; }
    await lastInnstillingerPaaNytt();
    toast('Lagret');
  }

  const info = (k) => naer?.[k];
  return (
    <section className="card stack">
      <h2 className="h2"><Icon name="tag" size={20} /> Priser og butikker</h2>
      <p className="muted">Prisene kommer fra Kassalapp (kjedenes nettpriser). Velg kjedene dere handler i, og hvor langt unna butikken kan ligge.</p>

      <div className="stack-liten">
        <div className="inputrad">
          <span className="vokse muted liten"><Icon name="pin" size={14} /> {pos ? `${pos.lat.toFixed(3)}, ${pos.lng.toFixed(3)}` : 'Ingen posisjon'}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={minPosisjon}>Bruk min posisjon</button>
        </div>
        <label className="field">Avstand til butikk: <b>{km} km</b>
          <input type="range" className="glider" min="0" max="50" step="1" value={km}
            onChange={(e) => setKm(Number(e.target.value))}
            onPointerUp={() => sjekkNaer(pos, km)} onKeyUp={() => sjekkNaer(pos, km)} onTouchEnd={() => sjekkNaer(pos, km)} />
        </label>
        <div className="glider-skala"><span>0</span><span>25</span><span>50 km</span></div>
        {sjekker && <p className="fremdrift"><span className="spinner-liten" /> Finner butikker innen {km} km …</p>}
      </div>

      <div>
        <p className="feltnavn">Kjeder {naer ? `(innen ${km} km)` : ''}</p>
        <div className="chips">
          {BUTIKKER.filter((b) => b.kode !== 'COOP_NO' && b.kode !== 'ODA_NO').map((b) => {
            const i = info(b.kode);
            const utenfor = naer && !i;
            return (
              <button key={b.kode} type="button" className={`${valgt.includes(b.kode) ? 'chip chip-on' : 'chip'} ${utenfor ? 'chip-utenfor' : ''}`} onClick={() => veksle(b.kode)}
                title={i ? `${i.antall} butikker, nærmest ${i.naermest.navn}` : utenfor ? `Ingen innen ${km} km` : ''}>
                {b.navn}{i?.naermest?.km != null ? ` · ${i.naermest.km.toFixed(1)} km` : ''}
              </button>
            );
          })}
        </div>
        {naer && valgt.some((k) => !naer[k]) && (
          <p className="muted liten" style={{ marginTop: 6 }}>Valgte kjeder uten butikk innen {km} km vises ikke: {valgt.filter((k) => !naer[k]).map((k) => BUTIKKER.find((b) => b.kode === k)?.navn || k).join(', ')}.</p>
        )}
      </div>
      <button type="button" className="btn btn-primary" onClick={lagre}>Lagre kjeder</button>
      <p className="muted liten">Obs, Extra og Mega bruker Coops nettpris når Kassalapp ikke har egen pris for kjeden.</p>
    </section>
  );
}

function Varsler() {
  const [status, setStatus] = useState('sjekker');
  const [jobber, setJobber] = useState(false);

  async function sjekk() {
    if (!pushStottes()) { setStatus(maaInstalleres() ? 'installer' : 'ikke-stottet'); return; }
    if (maaInstalleres()) { setStatus('installer'); return; }
    const sub = await aktivtAbonnement().catch(() => null);
    setStatus(sub && Notification.permission === 'granted' ? 'paa' : Notification.permission === 'denied' ? 'blokkert' : 'av');
  }
  useEffect(() => { sjekk(); }, []);

  async function gjor(fn, melding) {
    setJobber(true);
    try { await fn(); if (melding) toast(melding); } catch (e) { toast(e.message); } finally { setJobber(false); sjekk(); }
  }

  return (
    <section className="card stack">
      <h2 className="h2"><Icon name="bell" size={20} /> Varsler på denne telefonen</h2>
      <p className="muted">Få push-varsel når du får en oppgave, når fristen går ut, før avtaler, på bursdager og når noen sender en melding.</p>
      {status === 'installer' && (
        <p className="infoboks">På iPhone må appen ligge på Hjem-skjermen for å få varsler: åpne siden i Safari → <b>Del</b> → <b>Legg til på Hjem-skjerm</b>, og åpne BraRyd derfra.</p>
      )}
      {status === 'ikke-stottet' && <p className="infoboks">Denne nettleseren støtter ikke varsler.</p>}
      {status === 'blokkert' && <p className="infoboks">Varsler er blokkert. Slå dem på i telefonens innstillinger (Varslinger → BraRyd), og prøv igjen.</p>}
      {(status === 'av' || status === 'blokkert') && (
        <button type="button" className="btn btn-primary" disabled={jobber} onClick={() => gjor(slaaPaaPush, 'Varsler er slått på')}>Slå på varsler</button>
      )}
      {status === 'paa' && (
        <>
          <p className="ok-tekst">✔︎ Varsler er på</p>
          <div className="knapperad">
            <button type="button" className="btn btn-ghost btn-sm" disabled={jobber}
              onClick={() => gjor(async () => { const r = await callFunction('push-test'); if (!r.sendt) throw new Error('Fikk ikke sendt. Slå varsler av og på igjen.'); }, 'Testvarsel sendt')}>Send testvarsel</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={jobber} onClick={() => gjor(slaaAvPush, 'Varsler er slått av')}>Slå av</button>
          </div>
        </>
      )}
    </section>
  );
}
