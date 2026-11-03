import { useMemo, useState } from 'react';
import { useTilbud, leggTilVarer } from '../data.js';
import { KJEDE_FARGE } from '../config.js';
import { kr, tidSiden, gyldigTekst, normaliser, tilbudFor } from '../util.js';
import Topbar from '../components/Topbar.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

const SIDE = 60;

// «FULL PAKKE» → «Full pakke»
const pent = (s) => (s && s === s.toUpperCase() && /[A-ZÆØÅ]{3}/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s);

export default function Tilbud({ liste }) {
  const { tilbud, lastet, inn, henter, feil, oppdater } = useTilbud();
  const aktive = (liste.varer || []).filter((v) => !v.kjopt);
  const [modus, setModus] = useState('liste');
  const [sok, setSok] = useState('');
  const [kjeder, setKjeder] = useState([]);
  const [antall, setAntall] = useState(SIDE);
  const [stort, setStort] = useState(null);

  const alleKjeder = useMemo(() => [...new Set(tilbud.map((t) => t.kjede))].sort((a, b) => a.localeCompare(b, 'nb')), [tilbud]);
  const iKjeder = (t) => !kjeder.length || kjeder.includes(t.kjede);

  const treffListe = useMemo(() => aktive
    .map((v) => ({ vare: v, treff: tilbudFor(v.navn, tilbud).filter(iKjeder) }))
    .filter((x) => x.treff.length), [aktive, tilbud, kjeder]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrert = useMemo(() => {
    const q = normaliser(sok);
    const base = tilbud.filter(iKjeder);
    if (!q) return base;
    return tilbudFor(q, base);
  }, [tilbud, sok, kjeder]); // eslint-disable-line react-hooks/exhaustive-deps

  async function leggPaa(t) {
    try {
      await leggTilVarer([{ navn: pent(t.tittel) }], 'tilbud');
      toast(`«${pent(t.tittel)}» lagt på handlelisten`);
    } catch (e) { toast(e.message); }
  }

  const veksleKjede = (k) => { setKjeder((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k])); setAntall(SIDE); };

  return (
    <main className="page">
      <Topbar tittel="Tilbud" under={inn ? `${tilbud.length} tilbud · oppdatert ${tidSiden(inn.tilbud_hentet)}` : ''}>
        <button type="button" className={`ikonknapp ${henter ? 'snurr' : ''}`} onClick={() => oppdater(true)} disabled={henter} aria-label="Hent tilbud på nytt">
          <Icon name="refresh" />
        </button>
      </Topbar>

      {(feil || inn?.tilbud_status?.startsWith('Feil')) && <p className="feil">Kunne ikke hente tilbud: {feil || inn.tilbud_status.replace(/^Feil:\s*/, '')}</p>}

      <div className="segment" role="tablist">
        <button type="button" role="tab" aria-selected={modus === 'liste'} className={modus === 'liste' ? 'seg seg-on' : 'seg'} onClick={() => setModus('liste')}>
          På handlelisten{treffListe.length ? ` (${treffListe.length})` : ''}
        </button>
        <button type="button" role="tab" aria-selected={modus === 'alle'} className={modus === 'alle' ? 'seg seg-on' : 'seg'} onClick={() => setModus('alle')}>
          Alle tilbud
        </button>
      </div>

      {modus === 'alle' && (
        <div className="sokefelt">
          <Icon name="search" size={18} />
          <input placeholder="Søk, f.eks. kaffe eller kylling" value={sok} onChange={(e) => { setSok(e.target.value); setAntall(SIDE); }} />
        </div>
      )}
      {alleKjeder.length > 1 && (
        <div className="chips scroll">
          {alleKjeder.map((k) => (
            <button key={k} type="button" className={kjeder.includes(k) ? 'chip chip-on' : 'chip'} onClick={() => veksleKjede(k)}>
              <span className="prikk" style={{ background: KJEDE_FARGE[k] || 'var(--muted)' }} /> {k}
            </button>
          ))}
        </div>
      )}

      {(!lastet || (henter && !tilbud.length)) && <div className="spinner" />}
      {lastet && !tilbud.length && !henter && (
        <div className="tom">
          <p className="stor-tittel">Ingen tilbud hentet ennå</p>
          <p className="muted">Trykk på oppdater-knappen øverst. Det tar noen sekunder.</p>
        </div>
      )}

      {modus === 'liste' && lastet && tilbud.length > 0 && (
        treffListe.length ? treffListe.map(({ vare, treff }) => (
          <section key={vare.id} className="gruppe">
            <h2 className="gruppe-tittel">{vare.navn} <span className="muted">· {treff.length} {treff.length === 1 ? 'tilbud' : 'tilbud'}</span></h2>
            <ul className="tilbudliste">
              {treff.slice(0, 4).map((t, i) => <TilbudKort key={t.id} t={t} billigst={i === 0 && treff.length > 1} onBilde={() => setStort(t)} />)}
            </ul>
            {treff.length > 4 && (
              <button type="button" className="lenkeknapp" onClick={() => { setModus('alle'); setSok(vare.navn); }}>Se alle {treff.length} tilbud på {vare.navn.toLowerCase()}</button>
            )}
          </section>
        )) : (
          <div className="tom">
            <p className="stor-tittel">Ingen treff</p>
            <p className="muted">{aktive.length ? 'Ingen av varene på handlelisten er på tilbud nå.' : 'Handlelisten er tom.'} Se «Alle tilbud» for ukens kundeaviser.</p>
          </div>
        )
      )}

      {modus === 'alle' && lastet && tilbud.length > 0 && (
        <>
          {sok && <p className="muted liten">{filtrert.length} treff, billigst først</p>}
          <ul className="tilbudliste">
            {filtrert.slice(0, antall).map((t) => <TilbudKort key={t.id} t={t} onLeggTil={() => leggPaa(t)} onBilde={() => setStort(t)} />)}
          </ul>
          {filtrert.length > antall && (
            <button type="button" className="btn btn-ghost" onClick={() => setAntall(antall + SIDE)}>Vis flere ({filtrert.length - antall} igjen)</button>
          )}
        </>
      )}

      <Sheet open={Boolean(stort)} onClose={() => setStort(null)} tittel={stort ? stort.kjede : ''}>
        {stort && (
          <div className="stack">
            {(stort.bilde_stor || stort.bilde) && <img className="stortbilde" src={stort.bilde_stor || stort.bilde} alt={stort.tittel} />}
            <p className="stor-tittel">{pent(stort.tittel)} <span className="pris">{kr(stort.pris)}</span></p>
            <p className="muted">{stort.beskrivelse}</p>
            <p className="muted liten">Gjelder {gyldigTekst(stort.gyldig_fra, stort.gyldig_til)}{stort.katalog_side ? ` · side ${stort.katalog_side} i kundeavisen` : ''}</p>
            <button type="button" className="btn btn-primary" onClick={() => { leggPaa(stort); setStort(null); }}>
              <Icon name="cart" size={18} /> Legg på handlelisten
            </button>
          </div>
        )}
      </Sheet>
    </main>
  );
}

function TilbudKort({ t, billigst, onLeggTil, onBilde }) {
  return (
    <li className={billigst ? 'card tilbud tilbud-billigst' : 'card tilbud'}>
      <button type="button" className="tilbud-bilde" onClick={onBilde} aria-label={`Vis ${t.tittel}`}>
        {t.bilde ? <img src={t.bilde} alt="" loading="lazy" /> : <Icon name="tag" />}
      </button>
      <div className="tilbud-tekst">
        <span className="kjedemerke" style={{ background: KJEDE_FARGE[t.kjede] || 'var(--muted)' }}>{t.kjede}</span>
        <span className="tilbud-tittel">{pent(t.tittel)}</span>
        {t.beskrivelse && <span className="tilbud-beskrivelse">{t.beskrivelse}</span>}
        <span className="muted liten">{gyldigTekst(t.gyldig_fra, t.gyldig_til)}{billigst ? ' · billigst' : ''}</span>
      </div>
      <div className="tilbud-pris">
        <span className="pris">{kr(t.pris)}</span>
        {t.forpris && <span className="forpris">{kr(t.forpris)}</span>}
        {t.enhetspris && <span className="muted liten">{t.enhetspris}</span>}
        {onLeggTil && (
          <button type="button" className="ikonknapp ikonknapp-liten" onClick={onLeggTil} aria-label={`Legg ${t.tittel} på handlelisten`}>
            <Icon name="plus" size={18} />
          </button>
        )}
      </div>
    </li>
  );
}
