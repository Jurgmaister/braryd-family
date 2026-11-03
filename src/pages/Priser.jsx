import { useState } from 'react';
import { usePriser, sokPris, treffI, useInnstillinger, leggTilVarer, useRett } from '../data.js';
import { butikk } from '../config.js';
import { kr, tidSiden } from '../util.js';
import Topbar from '../components/Topbar.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

const enhetTekst = (t) => (t.enhetspris && t.enhet ? `${kr(t.enhetspris)}/${t.enhet}` : '');

export default function Priser({ liste }) {
  const aktive = (liste.varer || []).filter((v) => !v.kjopt);
  const navn = aktive.map((v) => v.navn);
  const { pris, laster, feil, oppdater } = usePriser(navn);
  const inn = useInnstillinger();
  const butikker = inn?.butikker;
  const [modus, setModus] = useState('liste');
  const [apen, setApen] = useState(null);

  const perVare = aktive.map((v) => ({ vare: v, data: pris(v.navn), treff: treffI(pris(v.navn), butikker) }));
  const sistHentet = perVare.map((x) => x.data?.hentet).filter(Boolean).sort()[0];

  // Hva koster hele handlelisten i hver kjede?
  const totalt = (() => {
    const sum = new Map();
    for (const { treff } of perVare) {
      for (const t of treff) {
        const s = sum.get(t.kode) || { kode: t.kode, kjede: t.kjede, belop: 0, antall: 0 };
        s.belop += t.pris; s.antall += 1;
        sum.set(t.kode, s);
      }
    }
    const medPris = perVare.filter((x) => x.treff.length).length;
    return { rader: [...sum.values()].sort((a, b) => (b.antall - a.antall) || (a.belop - b.belop)).slice(0, 3), medPris };
  })();

  const prisfall = perVare.flatMap(({ vare, treff }) => treff.filter((t) => t.forpris).map((t) => ({ vare, t })));

  return (
    <main className="page">
      <Topbar tittel="Priser" under={sistHentet ? `Dagens priser fra Kassalapp · oppdatert ${tidSiden(sistHentet)}` : 'Dagens priser fra Kassalapp'}>
        <button type="button" className={`ikonknapp ${laster ? 'snurr' : ''}`} onClick={oppdater} disabled={laster || !aktive.length} aria-label="Hent priser på nytt">
          <Icon name="refresh" />
        </button>
      </Topbar>

      {feil && <p className="feil">Kunne ikke hente priser: {feil}</p>}

      <div className="segment" role="tablist">
        <button type="button" role="tab" aria-selected={modus === 'liste'} className={modus === 'liste' ? 'seg seg-on' : 'seg'} onClick={() => setModus('liste')}>Handlelisten</button>
        <button type="button" role="tab" aria-selected={modus === 'sok'} className={modus === 'sok' ? 'seg seg-on' : 'seg'} onClick={() => setModus('sok')}>Søk</button>
      </div>

      {modus === 'liste' && (
        <>
          {!aktive.length && (
            <div className="tom">
              <p className="stor-tittel">Handlelisten er tom</p>
              <p className="muted">Legg til varer, så ser du her hvor de er billigst. Eller søk etter en vare.</p>
            </div>
          )}

          {totalt.rader.length > 1 && (
            <section className="card stack">
              <h2 className="h2">Hele listen i én butikk</h2>
              <ul className="totalliste">
                {totalt.rader.map((r, i) => (
                  <li key={r.kode}>
                    <Kjedemerke kode={r.kode} navn={r.kjede} />
                    <span className="muted liten vokse">{r.antall} av {totalt.medPris} varer</span>
                    <span className={i === 0 ? 'pris' : 'pris pris-graa'}>{kr(r.belop)}</span>
                  </li>
                ))}
              </ul>
              <p className="muted liten">Summen av billigste treff per vare. Varer uten pris i en kjede er ikke med.</p>
            </section>
          )}

          {prisfall.length > 0 && (
            <section className="gruppe">
              <h2 className="gruppe-tittel"><Icon name="tag" size={16} /> Prisfall på handlelisten</h2>
              <ul className="tilbudliste">
                {prisfall.slice(0, 6).map(({ vare, t }) => <ProduktKort key={`${vare.id}${t.kode}`} t={t} onApne={() => setApen(t)} />)}
              </ul>
            </section>
          )}

          {perVare.map(({ vare, data, treff }) => (
            <section key={vare.id} className="gruppe">
              <h2 className="gruppe-tittel">{vare.navn}</h2>
              {!data && <p className="muted liten innrykk">{vare.navn.trim().length < 3 ? 'For kort navn til å søke' : laster ? 'Henter …' : 'Ikke hentet ennå'}</p>}
              {data && !treff.length && <p className="muted liten innrykk">Fant ingen pris. Prøv et mer vanlig navn, f.eks. «lettmelk» i stedet for «melk lett».</p>}
              {treff.length > 0 && (
                <ul className="card prisrader">
                  {treff.slice(0, 3).map((t, i) => (
                    <li key={t.kode}>
                      <button type="button" className="prisrad" onClick={() => setApen(t)}>
                        <Kjedemerke kode={t.kode} navn={t.kjede} />
                        <span className="prisrad-navn">{t.navn}</span>
                        <span className="prisrad-pris">
                          <span className={i === 0 ? 'pris' : 'pris pris-graa'}>{kr(t.pris)}</span>
                          {t.forpris && <span className="forpris">{kr(t.forpris)}</span>}
                          {enhetTekst(t) && <span className="muted liten">{enhetTekst(t)}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                  {treff.length > 3 && <li className="muted liten flere">+ {treff.length - 3} kjeder til, dyrere</li>}
                </ul>
              )}
            </section>
          ))}
        </>
      )}

      {modus === 'sok' && <Sok butikker={butikker} onApne={setApen} />}

      <ProduktSheet t={apen} onClose={() => setApen(null)} />
    </main>
  );
}

function Sok({ butikker, onApne }) {
  const [q, setQ] = useState('');
  const [svar, setSvar] = useState(null);
  const [laster, setLaster] = useState(false);
  const [feil, setFeil] = useState('');

  async function sok(e) {
    e.preventDefault();
    if (q.trim().length < 3) { setFeil('Skriv minst tre bokstaver'); return; }
    setLaster(true); setFeil('');
    try { setSvar(await sokPris(q.trim())); } catch (err) { setFeil(err.message); } finally { setLaster(false); }
  }

  const valgt = butikker?.length ? new Set(butikker) : null;
  const alle = (svar?.alle || []).filter((t) => !valgt || valgt.has(t.kode));

  return (
    <>
      <form className="leggtil" onSubmit={sok}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk, f.eks. kaffe eller kyllingfilet" enterKeyHint="search" />
        <button type="submit" className="ikonknapp ikonknapp-fylt" aria-label="Søk" disabled={laster}><Icon name="search" /></button>
      </form>
      {feil && <p className="feil">{feil}</p>}
      {laster && <div className="spinner" />}
      {svar && !laster && (
        <>
          <p className="muted liten">{alle.length ? `${alle.length} treff, beste og billigste først` : 'Ingen treff'}</p>
          <ul className="tilbudliste">
            {alle.map((t, i) => <ProduktKort key={`${t.kode}${t.navn}${i}`} t={t} onApne={() => onApne(t)} />)}
          </ul>
        </>
      )}
    </>
  );
}

function Kjedemerke({ kode, navn }) {
  const b = butikk(kode, navn);
  return <span className="kjedemerke" style={{ background: b.farge }}>{b.navn}</span>;
}

function ProduktKort({ t, onApne }) {
  const kanHandle = useRett('handle');
  return (
    <li className={t.forpris ? 'card tilbud tilbud-billigst' : 'card tilbud'}>
      <button type="button" className="tilbud-bilde" onClick={onApne} aria-label={`Vis ${t.navn}`}>
        {t.bilde ? <img src={t.bilde} alt="" loading="lazy" /> : <Icon name="tag" />}
      </button>
      <button type="button" className="tilbud-tekst" onClick={onApne}>
        <Kjedemerke kode={t.kode} navn={t.kjede} />
        <span className="tilbud-tittel">{t.navn}</span>
        {t.merke && <span className="tilbud-beskrivelse">{t.merke}</span>}
        {t.forpris && <span className="prisfall">Prisfall – var {kr(t.forpris)}</span>}
      </button>
      <div className="tilbud-pris">
        <span className="pris">{kr(t.pris)}</span>
        {enhetTekst(t) && <span className="muted liten">{enhetTekst(t)}</span>}
{kanHandle && (
        <button type="button" className="ikonknapp ikonknapp-liten" aria-label={`Legg ${t.navn} på handlelisten`}
          onClick={() => leggTilVarer([{ navn: t.navn }], 'tilbud').then(() => toast(`«${t.navn}» lagt på handlelisten`)).catch((e) => toast(e.message))}>
          <Icon name="plus" size={18} />
        </button>
        )}
      </div>
    </li>
  );
}

function ProduktSheet({ t, onClose }) {
  const kanHandle = useRett('handle');
  if (!t) return null;
  return (
    <Sheet open onClose={onClose} tittel={butikk(t.kode, t.kjede).navn}>
      <div className="stack">
        {t.bilde && <img className="stortbilde" src={t.bilde} alt={t.navn} />}
        <p className="stor-tittel">{t.navn} <span className="pris">{kr(t.pris)}</span></p>
        <p className="muted">
          {t.merke && `${t.merke} · `}{enhetTekst(t) || ''}
          {t.forpris ? ` · var ${kr(t.forpris)} de siste ukene` : ''}
        </p>
        {t.oppdatert && <p className="muted liten">Prisen er fra nettbutikken, sist oppdatert {tidSiden(t.oppdatert)}. Butikken kan ha andre priser.</p>}
        {t.url && <a className="btn btn-ghost" href={t.url} target="_blank" rel="noopener"><Icon name="external" size={18} /> Se i nettbutikken</a>}
{kanHandle && (
        <button type="button" className="btn btn-primary"
          onClick={() => leggTilVarer([{ navn: t.navn }], 'tilbud').then(() => { toast(`«${t.navn}» lagt på handlelisten`); onClose(); }).catch((e) => toast(e.message))}>
          <Icon name="cart" size={18} /> Legg på handlelisten
        </button>
        )}
      </div>
    </Sheet>
  );
}
