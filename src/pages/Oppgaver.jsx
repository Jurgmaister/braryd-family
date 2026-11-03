import { useEffect, useMemo, useState } from 'react';
import { supabase, callFunction } from '../supabase.js';
import { useOppgaver, useMedlemmer, navnFor, fargeFor, lagreOppgave } from '../data.js';
import {
  iDag, isoDato, fraIso, leggTilDager, fristTekst, GJENTAKELSE_OPPGAVE, initialer, relativDato,
} from '../util.js';
import Topbar from '../components/Topbar.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

const FORSLAG = ['Støvsuge', 'Vaske matboks', 'Tømme søppel', 'Tømme oppvaskmaskinen', 'Rydde rommet', 'Bære ut papp og plast', 'Vaske badet', 'Re opp senga'];
const gjentakNavn = (id) => GJENTAKELSE_OPPGAVE.find((g) => g.id === id)?.navn || '';

export default function Oppgaver({ email }) {
  const { rader, setRader, feil } = useOppgaver();
  const medlemmer = useMedlemmer();
  const [filter, setFilter] = useState('alle');
  const [apen, setApen] = useState(null);
  const [visFerdige, setVisFerdige] = useState(false);
  const meg = email.toLowerCase();
  const idag = iDag();
  const ukeslutt = isoDato(leggTilDager(fraIso(idag), 7 - ((fraIso(idag).getDay() + 6) % 7) - 1));

  const synlige = (rader || []).filter((o) => {
    if (filter === 'alle') return true;
    if (filter === 'mine') return (o.tildelt || '').toLowerCase() === meg;
    if (filter === 'ingen') return !o.tildelt;
    return (o.tildelt || '').toLowerCase() === filter;
  });
  const aapne = synlige.filter((o) => !o.ferdig);
  const ferdige = synlige.filter((o) => o.ferdig).sort((a, b) => (b.ferdig_tid || '').localeCompare(a.ferdig_tid || ''));

  const grupper = useMemo(() => {
    const g = { over: [], idag: [], uke: [], senere: [], uten: [] };
    for (const o of aapne) {
      if (!o.frist) g.uten.push(o);
      else if (o.frist < idag) g.over.push(o);
      else if (o.frist === idag) g.idag.push(o);
      else if (o.frist <= ukeslutt) g.uke.push(o);
      else g.senere.push(o);
    }
    return [
      ['over', 'Over fristen', g.over], ['idag', 'I dag', g.idag], ['uke', 'Resten av uken', g.uke],
      ['senere', 'Senere', g.senere], ['uten', 'Uten frist', g.uten],
    ].filter(([, , l]) => l.length);
  }, [aapne, idag, ukeslutt]);

  const mineAntall = (rader || []).filter((o) => !o.ferdig && (o.tildelt || '').toLowerCase() === meg).length;

  async function fullfor(o) {
    setRader((l) => l.map((x) => (x.id === o.id ? { ...x, ferdig: true, ferdig_av: meg, ferdig_tid: new Date().toISOString() } : x)));
    const { error } = await supabase.rpc('fullfor_oppgave', { p_id: o.id });
    if (error) toast(error.message);
    else toast(o.gjentakelse !== 'ingen' ? `Bra! Neste gang: ${gjentakNavn(o.gjentakelse).toLowerCase()}` : 'Bra jobba! ✔︎');
  }
  async function angre(o) {
    const { error } = await supabase.rpc('angre_oppgave', { p_id: o.id });
    if (error) toast(error.message);
  }

  return (
    <main className="page">
      <Topbar tittel="Oppgaver" under={rader ? `${aapne.length} åpne${mineAntall ? ` · ${mineAntall} på deg` : ''}` : ''}>
        <button type="button" className="ikonknapp ikonknapp-fylt" onClick={() => setApen({})} aria-label="Ny oppgave"><Icon name="plus" /></button>
      </Topbar>

      <div className="chips scroll">
        {[['alle', 'Alle'], ['mine', 'Mine'], ...medlemmer.filter((m) => m.email.toLowerCase() !== meg).map((m) => [m.email.toLowerCase(), m.navn]), ['ingen', 'Uten ansvarlig']]
          .map(([id, navn]) => (
            <button key={id} type="button" className={filter === id ? 'chip chip-on' : 'chip'} onClick={() => setFilter(id)}>{navn}</button>
          ))}
      </div>

      {feil && <p className="feil">{feil}</p>}
      {rader == null && <div className="spinner" />}
      {rader && !aapne.length && (
        <div className="tom">
          <p className="stor-tittel">{filter === 'alle' ? 'Ingen oppgaver' : 'Ingenting her'} 🎉</p>
          <p className="muted">Lag en oppgave, gi den til noen i familien og sett en frist. Faste oppgaver kommer tilbake av seg selv.</p>
          <button type="button" className="btn btn-primary" onClick={() => setApen({})}>Ny oppgave</button>
        </div>
      )}

      {grupper.map(([id, tittel, liste]) => (
        <section key={id} className="gruppe">
          <h2 className={`gruppe-tittel ${id === 'over' ? 'fare-tekst' : ''}`}>{tittel} ({liste.length})</h2>
          <ul className="card varer">
            {liste.map((o) => (
              <OppgaveRad key={o.id} o={o} medlemmer={medlemmer} idag={idag} onFullfor={() => fullfor(o)} onApne={() => setApen(o)} />
            ))}
          </ul>
        </section>
      ))}

      {ferdige.length > 0 && (
        <section className="gruppe">
          <button type="button" className="gruppe-tittel kurv-knapp" onClick={() => setVisFerdige(!visFerdige)}>
            ✔︎ Ferdig siste to uker ({ferdige.length})
            <span className={visFerdige ? 'roter' : ''}><Icon name="chevronD" size={18} /></span>
          </button>
          {visFerdige && (
            <ul className="card varer">
              {ferdige.map((o) => (
                <li key={o.id} className="vare vare-kjopt">
                  <button type="button" className="hake" onClick={() => angre(o)} aria-label={`Angre ${o.tittel}`} aria-pressed="true">
                    <Icon name="check" size={16} strokeWidth={2.6} />
                  </button>
                  <span className="vare-tekst">
                    <span className="vare-navn">{o.tittel}</span>
                    <span className="muted liten">{navnFor(medlemmer, o.ferdig_av)} · {relativDato(o.ferdig_tid)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <OppgaveSkjema oppgave={apen} medlemmer={medlemmer} meg={meg} onClose={() => setApen(null)} />
    </main>
  );
}

function OppgaveRad({ o, medlemmer, idag, onFullfor, onApne }) {
  const over = o.frist && o.frist < idag;
  const hvem = o.tildelt ? navnFor(medlemmer, o.tildelt) : '';
  return (
    <li className="vare">
      <button type="button" className="hake" onClick={onFullfor} aria-label={`Ferdig: ${o.tittel}`} />
      <button type="button" className="vare-tekst" onClick={onApne}>
        <span className="vare-navn">{o.tittel}</span>
        <span className="oppgave-info">
          {o.frist && <span className={over ? 'frist frist-over' : o.frist === idag ? 'frist frist-idag' : 'frist'}>{fristTekst(o.frist)}</span>}
          {o.gjentakelse !== 'ingen' && <span className="muted liten"><Icon name="refresh" size={12} /> {gjentakNavn(o.gjentakelse).toLowerCase()}</span>}
        </span>
      </button>
      {hvem
        ? <span className="hvem" style={{ background: fargeFor(medlemmer, o.tildelt), color: '#fff' }} title={hvem}>{initialer(hvem)}</span>
        : <span className="hvem hvem-tom" title="Hvem som helst">?</span>}
    </li>
  );
}

function OppgaveSkjema({ oppgave, medlemmer, meg, onClose }) {
  const [f, setF] = useState({});
  const [jobber, setJobber] = useState(false);
  useEffect(() => {
    setF(oppgave ? { gjentakelse: 'ingen', tildelt: null, frist: '', ...oppgave, frist: oppgave.frist || '' } : {});
  }, [oppgave]);
  if (!oppgave) return null;
  const ny = !oppgave.id;
  const idag = fraIso(iDag());
  const lordag = leggTilDager(idag, (6 - idag.getDay() + 7) % 7 || 7);
  const hurtig = [['I dag', isoDato(idag)], ['I morgen', isoDato(leggTilDager(idag, 1))], ['Lørdag', isoDato(lordag)], ['Om en uke', isoDato(leggTilDager(idag, 7))]];

  async function lagre() {
    if (!f.tittel?.trim()) { toast('Skriv hva som skal gjøres'); return; }
    setJobber(true);
    try {
      const lagret = await lagreOppgave(f);
      const nyAnsvarlig = lagret.tildelt && lagret.tildelt.toLowerCase() !== meg
        && (ny || (oppgave.tildelt || '').toLowerCase() !== lagret.tildelt.toLowerCase());
      if (nyAnsvarlig) {
        const svar = await callFunction('oppgave-tildelt', { id: lagret.id }).catch(() => null);
        toast(svar?.sendt ? `Lagret – ${navnFor(medlemmer, lagret.tildelt)} har fått varsel` : 'Lagret');
      } else toast('Lagret');
      onClose();
    } catch (e) { toast(e.message); } finally { setJobber(false); }
  }

  async function slett() {
    if (!window.confirm(`Slette «${oppgave.tittel}»?`)) return;
    const { error } = await supabase.from('oppgaver').delete().eq('id', oppgave.id);
    if (error) toast(error.message); else onClose();
  }

  return (
    <Sheet open onClose={onClose} tittel={ny ? 'Ny oppgave' : 'Oppgave'}
      footer={(
        <div className="knapperad">
          {!ny && <button type="button" className="btn btn-ghost fare" onClick={slett} disabled={jobber}><Icon name="trash" size={18} /></button>}
          <button type="button" className="btn btn-primary vokse" onClick={lagre} disabled={jobber}>{ny ? 'Lag oppgave' : 'Lagre'}</button>
        </div>
      )}>
      <div className="stack">
        <label className="field">Hva skal gjøres?
          <input value={f.tittel || ''} onChange={(e) => setF({ ...f, tittel: e.target.value })} placeholder="F.eks. Støvsuge stua" autoFocus={ny} />
        </label>
        {ny && !f.tittel && (
          <div className="chips">
            {FORSLAG.map((t) => <button key={t} type="button" className="chip" onClick={() => setF({ ...f, tittel: t })}>{t}</button>)}
          </div>
        )}
        <div>
          <p className="feltnavn">Hvem</p>
          <div className="chips">
            <button type="button" className={!f.tildelt ? 'chip chip-on' : 'chip'} onClick={() => setF({ ...f, tildelt: null })}>Hvem som helst</button>
            {medlemmer.map((m) => (
              <button key={m.email} type="button" className={(f.tildelt || '').toLowerCase() === m.email.toLowerCase() ? 'chip chip-on' : 'chip'}
                onClick={() => setF({ ...f, tildelt: m.email })}>
                <span className="prikk" style={{ background: fargeFor(medlemmer, m.email) }} /> {m.email.toLowerCase() === meg ? `${m.navn} (meg)` : m.navn}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="feltnavn">Frist</p>
          <div className="chips">
            {hurtig.map(([navn, dato]) => (
              <button key={navn} type="button" className={f.frist === dato ? 'chip chip-on' : 'chip'} onClick={() => setF({ ...f, frist: dato })}>{navn}</button>
            ))}
            <button type="button" className={!f.frist ? 'chip chip-on' : 'chip'} onClick={() => setF({ ...f, frist: '' })}>Ingen frist</button>
          </div>
          <div className="inputrad" style={{ marginTop: 8 }}>
            <input type="date" value={f.frist || ''} onChange={(e) => setF({ ...f, frist: e.target.value })} />
          </div>
        </div>
        <label className="field">Gjentakelse
          <select value={f.gjentakelse || 'ingen'} onChange={(e) => setF({ ...f, gjentakelse: e.target.value, frist: f.frist || (e.target.value !== 'ingen' ? iDag() : '') })}>
            {GJENTAKELSE_OPPGAVE.map((g) => <option key={g.id} value={g.id}>{g.navn}</option>)}
          </select>
        </label>
        {f.gjentakelse !== 'ingen' && <p className="muted liten">Når den krysses av, kommer den tilbake med ny frist ({gjentakNavn(f.gjentakelse).toLowerCase()}).</p>}
        <label className="field">Notat
          <textarea rows={2} value={f.notat || ''} onChange={(e) => setF({ ...f, notat: e.target.value })} placeholder="Valgfritt" />
        </label>
        {!ny && oppgave.opprettet_av && <p className="muted liten">Laget av {navnFor(medlemmer, oppgave.opprettet_av)}.</p>}
      </div>
    </Sheet>
  );
}
