import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import { useHendelser, useOppgaver, useMedlemmer, navnFor, fargeFor, lagreHendelse, varslerFor } from '../data.js';
import {
  UKEDAGER, MND, isoDato, iDag, fraIso, mandagI, leggTilDager, forekomster, klokke, GJENTAKELSE_HENDELSE,
} from '../util.js';
import Topbar from '../components/Topbar.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

const MAANEDER = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const TYPER = [
  { id: 'avtale', navn: 'Avtale', ikon: '📅' },
  { id: 'trening', navn: 'Trening', ikon: '⚽' },
  { id: 'bursdag', navn: 'Bursdag', ikon: '🎂' },
  { id: 'annet', navn: 'Annet', ikon: '📌' },
];
const VARSEL_TID = [['0', 'Når det starter'], ['15', '15 min før'], ['30', '30 min før'], ['60', '1 time før'], ['120', '2 timer før'], ['1440', 'Dagen før, samme tid'], ['10080', 'En uke før, samme tid']];
const VARSEL_HELDAG = [['-480', 'Samme dag kl. 08'], ['-720', 'Samme dag kl. 12'], ['-1080', 'Samme dag kl. 18'], ['360', 'Dagen før kl. 18'], ['1800', 'To dager før kl. 18'], ['9600', 'En uke før kl. 08'], ['19680', 'To uker før kl. 08']];
const ikonFor = (type) => TYPER.find((t) => t.id === type)?.ikon || '📅';

// Hendelser for et datointervall, utvidet med gjentakelser og flerdagers hendelser
function utvid(hendelser, fra, til) {
  const ut = [];
  for (const h of hendelser) {
    for (const dato of forekomster(h, fra, til)) {
      if (h.sluttdato && h.gjentakelse === 'ingen') {
        for (let d = fraIso(h.dato); isoDato(d) <= h.sluttdato; d = leggTilDager(d, 1)) {
          const iso = isoDato(d);
          if (iso >= fra && iso <= til) ut.push({ ...h, forekomst: iso });
        }
      } else ut.push({ ...h, forekomst: dato });
    }
  }
  return ut.sort((a, b) => a.forekomst.localeCompare(b.forekomst) || (a.tid ? 1 : 0) - (b.tid ? 1 : 0) || (a.tid || '').localeCompare(b.tid || ''));
}

export default function Kalender({ email }) {
  const { rader, feil } = useHendelser();
  const { rader: oppgaver } = useOppgaver();
  const medlemmer = useMedlemmer();
  const idag = iDag();
  const [maaned, setMaaned] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [valgt, setValgt] = useState(idag);
  const [filter, setFilter] = useState('alle');
  const [apen, setApen] = useState(null);

  const forste = mandagI(maaned);
  const dager = Array.from({ length: 42 }, (_, i) => isoDato(leggTilDager(forste, i)));
  const sisteUke = dager.slice(35).every((d) => fraIso(d).getMonth() !== maaned.getMonth()) ? 35 : 42;
  const synligeDager = dager.slice(0, sisteUke);

  const filtrert = (rader || []).filter((h) => {
    if (filter === 'alle') return true;
    if (filter === 'familie') return !h.eier;
    return (h.eier || '').toLowerCase() === filter || (!h.eier && filter !== 'familie' && h.type === 'bursdag');
  });
  const iMaaned = useMemo(() => utvid(filtrert, synligeDager[0], synligeDager[synligeDager.length - 1]),
    [filtrert, synligeDager[0], sisteUke]); // eslint-disable-line react-hooks/exhaustive-deps
  const perDag = useMemo(() => {
    const m = new Map();
    for (const h of iMaaned) { if (!m.has(h.forekomst)) m.set(h.forekomst, []); m.get(h.forekomst).push(h); }
    return m;
  }, [iMaaned]);

  const dagensHendelser = utvid(filtrert, valgt, valgt);
  const dagensOppgaver = (oppgaver || []).filter((o) => !o.ferdig && o.frist === valgt
    && (filter === 'alle' || filter === 'familie' || (o.tildelt || '').toLowerCase() === filter));
  const kommende = utvid(filtrert, leggTil(idag, 1), leggTil(idag, 14)).filter((h) => h.forekomst > valgt || valgt < idag).slice(0, 6);

  const flytt = (n) => setMaaned(new Date(maaned.getFullYear(), maaned.getMonth() + n, 1));
  const tilIdag = () => { const d = new Date(); setMaaned(new Date(d.getFullYear(), d.getMonth(), 1)); setValgt(idag); };
  const vd = fraIso(valgt);

  return (
    <main className="page">
      <Topbar tittel="Kalender" under={`${MAANEDER[maaned.getMonth()][0].toUpperCase()}${MAANEDER[maaned.getMonth()].slice(1)} ${maaned.getFullYear()}`}>
        <button type="button" className="ikonknapp ikonknapp-fylt" onClick={() => setApen({ dato: valgt })} aria-label="Ny hendelse"><Icon name="plus" /></button>
      </Topbar>

      <div className="chips scroll">
        <button type="button" className={filter === 'alle' ? 'chip chip-on' : 'chip'} onClick={() => setFilter('alle')}>Alle</button>
        <button type="button" className={filter === 'familie' ? 'chip chip-on' : 'chip'} onClick={() => setFilter('familie')}>
          <span className="prikk" style={{ background: fargeFor(medlemmer, null) }} /> Familie
        </button>
        {medlemmer.map((m) => (
          <button key={m.email} type="button" className={filter === m.email.toLowerCase() ? 'chip chip-on' : 'chip'} onClick={() => setFilter(m.email.toLowerCase())}>
            <span className="prikk" style={{ background: fargeFor(medlemmer, m.email) }} /> {m.navn}
          </button>
        ))}
      </div>

      {feil && <p className="feil">{feil}</p>}

      <section className="card kal">
        <div className="kal-topp">
          <button type="button" className="ikonknapp" onClick={() => flytt(-1)} aria-label="Forrige måned"><Icon name="chevronL" /></button>
          <button type="button" className="lenkeknapp" onClick={tilIdag}>I dag</button>
          <button type="button" className="ikonknapp" onClick={() => flytt(1)} aria-label="Neste måned"><Icon name="chevronR" /></button>
        </div>
        <div className="kal-grid">
          {['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'].map((d) => <span key={d} className="kal-ukedag">{d}</span>)}
          {synligeDager.map((d) => {
            const dt = fraIso(d);
            const liste = perDag.get(d) || [];
            const annen = dt.getMonth() !== maaned.getMonth();
            return (
              <button key={d} type="button" onClick={() => setValgt(d)}
                className={`kal-dag ${annen ? 'kal-annen' : ''} ${d === idag ? 'kal-idag' : ''} ${d === valgt ? 'kal-valgt' : ''}`}>
                <span className="kal-tall">{dt.getDate()}</span>
                <span className="kal-prikker">
                  {liste.slice(0, 3).map((h) => (h.type === 'bursdag'
                    ? <span key={`${h.id}${d}`} className="kal-kake">🎂</span>
                    : <span key={`${h.id}${d}`} className="prikk" style={{ background: fargeFor(medlemmer, h.eier) }} />))}
                  {liste.length > 3 && <span className="kal-pluss">+</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="gruppe">
        <h2 className="gruppe-tittel">{valgt === idag ? 'I dag' : `${UKEDAGER[vd.getDay()][0].toUpperCase()}${UKEDAGER[vd.getDay()].slice(1)} ${vd.getDate()}. ${MND[vd.getMonth()]}`}</h2>
        {!dagensHendelser.length && !dagensOppgaver.length && (
          <button type="button" className="card tomdag" onClick={() => setApen({ dato: valgt })}>
            <span className="muted">Ingenting i kalenderen</span><Icon name="plus" size={18} />
          </button>
        )}
        {dagensHendelser.length > 0 && (
          <ul className="card hendelser">
            {dagensHendelser.map((h) => <HendelseRad key={`${h.id}${h.forekomst}`} h={h} medlemmer={medlemmer} onApne={() => setApen(h)} />)}
          </ul>
        )}
        {dagensOppgaver.length > 0 && (
          <a className="card oppgavehint" href="#/oppgaver">
            <Icon name="check" size={18} />
            <span className="vokse">{dagensOppgaver.length === 1 ? `Oppgave med frist: ${dagensOppgaver[0].tittel}` : `${dagensOppgaver.length} oppgaver med frist`}</span>
            <Icon name="chevronR" size={18} />
          </a>
        )}
      </section>

      {kommende.length > 0 && valgt === idag && (
        <section className="gruppe">
          <h2 className="gruppe-tittel">Neste to uker</h2>
          <ul className="card hendelser">
            {kommende.map((h) => <HendelseRad key={`${h.id}${h.forekomst}`} h={h} medlemmer={medlemmer} visDato onApne={() => setApen(h)} />)}
          </ul>
        </section>
      )}

      <HendelseSkjema hendelse={apen} medlemmer={medlemmer} meg={email.toLowerCase()} onClose={() => setApen(null)} />
    </main>
  );
}

function leggTil(iso, n) { return isoDato(leggTilDager(fraIso(iso), n)); }

function HendelseRad({ h, medlemmer, visDato, onApne }) {
  const d = fraIso(h.forekomst);
  const alder = h.type === 'bursdag' && h.fodselsar ? d.getFullYear() - h.fodselsar : null;
  const hvem = h.eier ? navnFor(medlemmer, h.eier) : 'Familie';
  return (
    <li>
      <button type="button" className="hendelse" onClick={onApne}>
        <span className="hendelse-strek" style={{ background: fargeFor(medlemmer, h.eier) }} />
        <span className="hendelse-tid">
          {visDato && <span className="hendelse-dato">{UKEDAGER[d.getDay()].slice(0, 3)} {d.getDate()}.</span>}
          {h.tid ? klokke(h.tid) : 'Hele dagen'}
          {h.slutt_tid && <span className="muted liten">{klokke(h.slutt_tid)}</span>}
        </span>
        <span className="hendelse-tekst">
          <span className="hendelse-tittel">{ikonFor(h.type)} {h.type === 'bursdag' ? `${h.tittel} har bursdag` : h.tittel}{alder ? ` (${alder})` : ''}</span>
          <span className="muted liten">
            {hvem}{h.sted ? ` · ${h.sted}` : ''}
            {h.gjentakelse !== 'ingen' && h.type !== 'bursdag' ? ' · gjentas' : ''}
            {varslerFor(h).length ? ` · ${'🔔'.repeat(varslerFor(h).length)}` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

function HendelseSkjema({ hendelse, medlemmer, meg, onClose }) {
  const [f, setF] = useState({});
  const [jobber, setJobber] = useState(false);
  useEffect(() => {
    if (!hendelse) return;
    if (hendelse.id) {
      setF({
        ...hendelse, heldag: !hendelse.tid, tid: klokke(hendelse.tid), slutt_tid: klokke(hendelse.slutt_tid),
        varsler: varslerFor(hendelse).map(String),
        sluttdato: hendelse.sluttdato || '', gjentar_til: hendelse.gjentar_til || '', fodselsar: hendelse.fodselsar || '',
      });
    } else {
      setF({ type: 'avtale', eier: null, dato: hendelse.dato || iDag(), heldag: false, tid: '17:00', slutt_tid: '', gjentakelse: 'ingen', varsler: ['60'], sted: '', notat: '', sluttdato: '', gjentar_til: '', fodselsar: '' });
    }
  }, [hendelse]);
  if (!hendelse) return null;
  const ny = !hendelse.id;
  const sett = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function velgType(type) {
    if (type === 'bursdag') setF({ ...f, type, heldag: true, gjentakelse: 'aarlig', varsler: f.type === 'bursdag' ? f.varsler : ['-480', '360', '9600'], eier: null });
    else if (type === 'trening') setF({ ...f, type, heldag: false, gjentakelse: f.gjentakelse === 'aarlig' || f.gjentakelse === 'ingen' ? 'ukentlig' : f.gjentakelse, varsler: tilpass(f.varsler, false) });
    else setF({ ...f, type, gjentakelse: f.type === 'bursdag' ? 'ingen' : f.gjentakelse });
  }
  // Beholder varsler som finnes for valgt type (heldag/klokkeslett), ellers et fornuftig standardvalg
  function tilpass(varsler, heldag) {
    const lov = (heldag ? VARSEL_HELDAG : VARSEL_TID).map(([k]) => k);
    const beholdt = (varsler || []).filter((v) => lov.includes(v));
    return beholdt.length || !(varsler || []).length ? beholdt : [heldag ? '-480' : '60'];
  }
  function settHeldag(heldag) { setF({ ...f, heldag, varsler: tilpass(f.varsler, heldag) }); }
  const valg = f.heldag || f.type === 'bursdag' ? VARSEL_HELDAG : VARSEL_TID;
  const varsler = f.varsler || [];
  const settVarsel = (i, v) => setF({ ...f, varsler: varsler.map((x, j) => (j === i ? v : x)) });
  const fjernVarsel = (i) => setF({ ...f, varsler: varsler.filter((_, j) => j !== i) });
  const nyttVarsel = () => setF({ ...f, varsler: [...varsler, valg.map(([k]) => k).find((k) => !varsler.includes(k)) || valg[0][0]] });

  async function lagre() {
    if (!f.tittel?.trim()) { toast(f.type === 'bursdag' ? 'Skriv hvem som har bursdag' : 'Gi hendelsen et navn'); return; }
    if (!f.dato) { toast('Velg dato'); return; }
    if (!f.heldag && !f.tid) { toast('Velg klokkeslett eller hele dagen'); return; }
    setJobber(true);
    try { await lagreHendelse(f); toast('Lagret'); onClose(); } catch (e) { toast(e.message); } finally { setJobber(false); }
  }
  async function slett() {
    if (!window.confirm(hendelse.gjentakelse !== 'ingen' ? `Slette «${hendelse.tittel}» og alle gjentakelsene?` : `Slette «${hendelse.tittel}»?`)) return;
    const { error } = await supabase.from('hendelser').delete().eq('id', hendelse.id);
    if (error) toast(error.message); else onClose();
  }

  const bursdag = f.type === 'bursdag';
  return (
    <Sheet open onClose={onClose} tittel={ny ? (bursdag ? 'Ny bursdag' : 'Ny hendelse') : (bursdag ? 'Bursdag' : 'Hendelse')}
      footer={(
        <div className="knapperad">
          {!ny && <button type="button" className="btn btn-ghost fare" onClick={slett} disabled={jobber}><Icon name="trash" size={18} /></button>}
          <button type="button" className="btn btn-primary vokse" onClick={lagre} disabled={jobber}>Lagre</button>
        </div>
      )}>
      <div className="stack">
        <div className="chips">
          {TYPER.map((t) => <button key={t.id} type="button" className={f.type === t.id ? 'chip chip-on' : 'chip'} onClick={() => velgType(t.id)}>{t.ikon} {t.navn}</button>)}
        </div>
        <label className="field">{bursdag ? 'Hvem har bursdag?' : 'Hva'}
          <input value={f.tittel || ''} onChange={sett('tittel')} autoFocus={ny} placeholder={bursdag ? 'F.eks. Bestemor' : f.type === 'trening' ? 'F.eks. Fotballtrening' : 'F.eks. Tannlege'} />
        </label>
        {!bursdag && (
          <div>
            <p className="feltnavn">Kalender</p>
            <div className="chips">
              <button type="button" className={!f.eier ? 'chip chip-on' : 'chip'} onClick={() => setF({ ...f, eier: null })}>
                <span className="prikk" style={{ background: fargeFor(medlemmer, null) }} /> Familie
              </button>
              {medlemmer.map((m) => (
                <button key={m.email} type="button" className={(f.eier || '').toLowerCase() === m.email.toLowerCase() ? 'chip chip-on' : 'chip'} onClick={() => setF({ ...f, eier: m.email })}>
                  <span className="prikk" style={{ background: fargeFor(medlemmer, m.email) }} /> {m.email.toLowerCase() === meg ? `${m.navn} (meg)` : m.navn}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="inputrad">
          <label className="field vokse">{bursdag ? 'Fødselsdag' : 'Dato'}<input type="date" value={f.dato || ''} onChange={sett('dato')} /></label>
          {bursdag && <label className="field smal">Født år<input inputMode="numeric" value={f.fodselsar || ''} onChange={sett('fodselsar')} placeholder="1980" /></label>}
        </div>
        {!bursdag && (
          <>
            <label className="sjekk"><input type="checkbox" checked={Boolean(f.heldag)} onChange={(e) => settHeldag(e.target.checked)} /> Hele dagen</label>
            {f.heldag ? (
              <label className="field">Til og med (valgfritt, for flere dager)<input type="date" value={f.sluttdato || ''} min={f.dato} onChange={sett('sluttdato')} /></label>
            ) : (
              <div className="inputrad">
                <label className="field vokse">Fra<input type="time" value={f.tid || ''} onChange={sett('tid')} /></label>
                <label className="field vokse">Til<input type="time" value={f.slutt_tid || ''} onChange={sett('slutt_tid')} /></label>
              </div>
            )}
            <label className="field">Sted<input value={f.sted || ''} onChange={sett('sted')} placeholder="Valgfritt" /></label>
            <label className="field">Gjentakelse
              <select value={f.gjentakelse} onChange={sett('gjentakelse')}>
                {GJENTAKELSE_HENDELSE.map((g) => <option key={g.id} value={g.id}>{g.navn}</option>)}
              </select>
            </label>
            {f.gjentakelse !== 'ingen' && (
              <label className="field">Gjentas til og med (valgfritt)<input type="date" value={f.gjentar_til || ''} min={f.dato} onChange={sett('gjentar_til')} /></label>
            )}
          </>
        )}
        <div>
          <p className="feltnavn">Push-varsel {varsler.length ? `(${varsler.length} av 3)` : ''}</p>
          <div className="stack-liten">
            {varsler.map((v, i) => (
              <div key={i} className="inputrad">
                <span className="varselikon"><Icon name="bell" size={16} /></span>
                <select className="vokse velger" value={v} onChange={(e) => settVarsel(i, e.target.value)}>
                  {valg.map(([k, navn]) => <option key={k} value={k} disabled={k !== v && varsler.includes(k)}>{navn}</option>)}
                </select>
                <button type="button" className="ikonknapp" onClick={() => fjernVarsel(i)} aria-label="Fjern varsel"><Icon name="close" size={18} /></button>
              </div>
            ))}
            {varsler.length < 3 && (
              <button type="button" className="lenkeknapp" onClick={nyttVarsel}><Icon name="plus" size={16} /> {varsler.length ? 'Legg til et varsel til' : 'Legg til varsel'}</button>
            )}
          </div>
        </div>
        <p className="muted liten">
          {bursdag ? 'Bursdager varsles til hele familien.' : f.eier ? `Varselet går til ${navnFor(medlemmer, f.eier)}.` : 'Varselet går til hele familien.'}
          {!bursdag && f.gjentakelse !== 'ingen' ? ' Endringer gjelder alle gjentakelsene.' : ''}
        </p>
        <label className="field">Notat<textarea rows={2} value={f.notat || ''} onChange={sett('notat')} placeholder="Valgfritt" /></label>
      </div>
    </Sheet>
  );
}
