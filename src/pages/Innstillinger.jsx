import { useEffect, useState } from 'react';
import { supabase, callFunction } from '../supabase.js';
import { FUNCTION_URL, ALLE_KJEDER } from '../config.js';
import { useMedlemmer, lastMedlemmerPaaNytt, useInnstillinger, lastInnstillingerPaaNytt } from '../data.js';
import Topbar from '../components/Topbar.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

async function kopier(tekst, hva) {
  try { await navigator.clipboard.writeText(tekst); toast(`${hva} er kopiert`); } catch { window.prompt('Kopier denne:', tekst); }
}

export default function Innstillinger({ email }) {
  const medlemmer = useMedlemmer();
  const meg = medlemmer.find((m) => m.email.toLowerCase() === email.toLowerCase());
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
  const [f, setF] = useState(null);
  const [henter, setHenter] = useState(false);
  useEffect(() => { if (inn) setF({ lat: inn.lat, lng: inn.lng, radius_km: inn.radius_km, kjeder: inn.kjeder }); }, [inn]);
  if (!f) return null;

  function posisjon() {
    if (!navigator.geolocation) { toast('Telefonen deler ikke posisjon'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setF({ ...f, lat: Number(p.coords.latitude.toFixed(4)), lng: Number(p.coords.longitude.toFixed(4)) }); toast('Posisjon hentet – trykk Lagre'); },
      () => toast('Fikk ikke tilgang til posisjonen'),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  const veksle = (k) => setF({ ...f, kjeder: f.kjeder.includes(k) ? f.kjeder.filter((x) => x !== k) : [...f.kjeder, k] });

  async function lagre() {
    setHenter(true);
    const { error } = await supabase.from('innstillinger').update({ lat: f.lat, lng: f.lng, radius_km: f.radius_km, kjeder: f.kjeder }).eq('id', 1);
    if (error) { toast(error.message); setHenter(false); return; }
    try {
      const svar = await callFunction('tilbud-sync', { force: true });
      toast(svar.hoppet_over ? 'Lagret. Tilbudene hentes snart på nytt.' : `Lagret – hentet ${svar.antall} tilbud`);
    } catch (e) { toast(`Lagret, men henting feilet: ${e.message}`); }
    await lastInnstillingerPaaNytt();
    setHenter(false);
  }

  return (
    <section className="card stack">
      <h2 className="h2"><Icon name="tag" size={20} /> Tilbud</h2>
      <p className="muted">Tilbudene hentes fra kundeavisene til butikkene i nærheten av dette punktet.</p>
      <div className="inputrad">
        <span className="vokse muted liten"><Icon name="pin" size={14} /> {f.lat.toFixed(3)}, {f.lng.toFixed(3)}</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={posisjon}>Bruk min posisjon</button>
      </div>
      <label className="field">Avstand
        <select value={f.radius_km} onChange={(e) => setF({ ...f, radius_km: Number(e.target.value) })}>
          {[5, 10, 15, 25, 40, 60].map((r) => <option key={r} value={r}>{r} km</option>)}
        </select>
      </label>
      <div>
        <p className="feltnavn">Kjeder</p>
        <div className="chips">
          {ALLE_KJEDER.map((k) => (
            <button key={k} type="button" className={f.kjeder.includes(k) ? 'chip chip-on' : 'chip'} onClick={() => veksle(k)}>{k}</button>
          ))}
        </div>
      </div>
      <button type="button" className="btn btn-primary" onClick={lagre} disabled={henter}>{henter ? 'Henter tilbud …' : 'Lagre og hent tilbud'}</button>
      {inn?.tilbud_status && <p className="muted liten">Siste henting: {inn.tilbud_status}</p>}
    </section>
  );
}
