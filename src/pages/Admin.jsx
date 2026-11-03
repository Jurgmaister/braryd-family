import { useState } from 'react';
import { supabase, callFunction } from '../supabase.js';
import { useMedlemmer, lastMedlemmerPaaNytt, useErAdmin, RETTER, harRett, fargeFor } from '../data.js';
import { initialer as initialerFor } from '../util.js';
import Topbar from '../components/Topbar.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

// Lesbart, tilfeldig passord (uten tegn som er lette å forveksle)
function lagPassord() {
  const tegn = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const tall = crypto.getRandomValues(new Uint32Array(12));
  const s = [...tall].map((n) => tegn[n % tegn.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export default function Admin() {
  const medlemmer = useMedlemmer();
  const erAdmin = useErAdmin();
  const [passordFor, setPassordFor] = useState(null);
  const [lagrer, setLagrer] = useState('');

  if (!erAdmin) {
    return (
      <main className="page">
        <Topbar tittel="Admin" />
        <p className="muted">Bare admin har tilgang til denne siden.</p>
      </main>
    );
  }

  async function veksle(m, rett) {
    const ny = !harRett(m, rett);
    setLagrer(`${m.email}${rett}`);
    const { error } = await supabase.rpc('admin_sett_rett', { p_email: m.email, p_rett: rett, p_verdi: ny });
    await lastMedlemmerPaaNytt();
    setLagrer('');
    if (error) toast(error.message.includes('admin_sett_rett') ? 'Kjør admin.sql i Supabase først' : error.message);
  }

  return (
    <main className="page">
      <a className="lenkeknapp tilbake" href="#/innstillinger"><Icon name="chevronL" size={18} /> Innstillinger</a>
      <Topbar tittel="Admin" under="Tilganger og passord for familien" />

      <p className="muted liten">Slår du av en tilgang, får personen bare innsyn i den delen av appen. Det gjelder også Siri for handlelisten. Oppgaver som er gitt til personen selv kan alltid krysses av.</p>

      {medlemmer.map((m) => (
        <section key={m.email} className="card stack">
          <div className="admin-topp">
            <span className="hvem stor" style={{ background: fargeFor(medlemmer, m.email), color: '#fff' }}>{initialerFor(m.navn)}</span>
            <div className="vokse">
              <p className="lagret-navn">{m.navn}{m.admin ? ' · admin' : ''}</p>
              <p className="muted liten">{m.email}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPassordFor(m)}>Nytt passord</button>
          </div>
          {m.admin ? (
            <p className="muted liten">Admin har alltid alle tilganger.</p>
          ) : (
            <ul className="bryterliste">
              {RETTER.map((r) => {
                const paa = harRett(m, r.id);
                return (
                  <li key={r.id}>
                    <span className="vokse">{r.navn}</span>
                    <span className={paa ? 'bryter-tekst' : 'bryter-tekst av'}>{paa ? 'På' : 'Kun innsyn'}</span>
                    <button type="button" role="switch" aria-checked={paa} aria-label={`${r.navn} for ${m.navn}`}
                      className={paa ? 'bryter bryter-paa' : 'bryter'} disabled={lagrer === `${m.email}${r.id}`}
                      onClick={() => veksle(m, r.id)}><span /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      <PassordSheet medlem={passordFor} onClose={() => setPassordFor(null)} />
    </main>
  );
}

function PassordSheet({ medlem, onClose }) {
  const [passord, setPassord] = useState('');
  const [jobber, setJobber] = useState(false);
  const [ferdig, setFerdig] = useState('');
  if (!medlem) return null;

  function lukk() { setPassord(''); setFerdig(''); onClose(); }

  async function lagre(e) {
    e.preventDefault();
    if (passord.length < 8) { toast('Passordet må ha minst 8 tegn'); return; }
    setJobber(true);
    try {
      const svar = await callFunction('admin-passord', { email: medlem.email, passord });
      setFerdig(svar.opprettet ? 'Innlogging laget' : 'Passordet er endret');
    } catch (err) { toast(err.message); } finally { setJobber(false); }
  }

  async function kopier() {
    try { await navigator.clipboard.writeText(passord); toast('Passordet er kopiert'); } catch { /* vises på skjermen */ }
  }

  return (
    <Sheet open onClose={lukk} tittel={`Nytt passord for ${medlem.navn}`}>
      {ferdig ? (
        <div className="stack">
          <p className="ok-tekst">✔︎ {ferdig}</p>
          <p>Gi {medlem.navn} dette passordet:</p>
          <code className="passordvisning">{passord}</code>
          <div className="knapperad">
            <button type="button" className="btn btn-ghost" onClick={kopier}><Icon name="copy" size={18} /> Kopier</button>
            <button type="button" className="btn btn-primary vokse" onClick={lukk}>Ferdig</button>
          </div>
          <p className="muted liten">{medlem.navn} logger inn med {medlem.email} og dette passordet.</p>
        </div>
      ) : (
        <form className="stack" onSubmit={lagre}>
          <label className="field">Nytt passord
            <div className="inputrad">
              <input value={passord} onChange={(e) => setPassord(e.target.value)} placeholder="Minst 8 tegn" autoComplete="new-password" autoCapitalize="off" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPassord(lagPassord())}>Lag et</button>
            </div>
          </label>
          <p className="muted liten">Det gamle passordet slutter å virke. {medlem.navn} må logge inn på nytt på sine enheter.</p>
          <button type="submit" className="btn btn-primary btn-lg" disabled={jobber || passord.length < 8}>{jobber ? 'Lagrer …' : 'Sett nytt passord'}</button>
        </form>
      )}
    </Sheet>
  );
}
