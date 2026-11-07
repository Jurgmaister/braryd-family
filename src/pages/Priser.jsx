import { useState } from 'react';
import { usePriser, sokPris, treffI, useInnstillinger, leggTilVarer, useRett, aktiveButikker, anbefaling, prisNokkel } from '../data.js';
import { butikk } from '../config.js';
import { kr, tidSiden } from '../util.js';
import Topbar from '../components/Topbar.jsx';
import { Fremdrift } from './Handleliste.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

const enhetTekst = (t) => (t.enhetspris && t.enhet ? `${kr(t.enhetspris)}/${t.enhet}` : '');

export default function Priser({ liste }) {
  const aktive = (liste.varer || []).filter((v) => !v.kjopt);
  const navn = aktive.map(prisNokkel);
  const { pris, laster, feil, oppdater, fremdrift } = usePriser(navn);
  const inn = useInnstillinger();
  const butikker = aktiveButikker(inn);
  const [modus, setModus] = useState('liste');
  const [apen, setApen] = useState(null);

  const perVare = aktive.map((v) => ({ vare: v, data: pris(prisNokkel(v)), treff: treffI(pris(prisNokkel(v)), butikker) }));
  const sistHentet = perVare.map((x) => x.data?.hentet).filter(Boolean).sort()[0];

  const forslag = anbefaling(perVare);

  const prisfall = perVare.flatMap(({ vare, treff }) => treff.filter((t) => t.forpris).map((t) => ({ vare, t })));

  return (
    <main className="page">
      <Topbar tittel="Priser" under={sistHentet ? `Dagens priser fra Kassalapp · oppdatert ${tidSiden(sistHentet)}` : 'Dagens priser fra Kassalapp'}>
        <button type="button" className={`ikonknapp ${laster ? 'snurr' : ''}`} onClick={oppdater} disabled={laster || !aktive.length} aria-label="Hent priser på nytt">
          <Icon name="refresh" />
        </button>
      </Topbar>

      {fremdrift && <Fremdrift f={fremdrift} />}
      {feil && !fremdrift && <p className="feil">Kunne ikke hente priser: {feil}</p>}

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

          {forslag?.en?.length > 1 && (
            <section className="card stack">
              <h2 className="h2">Hele listen i én butikk</h2>
              <ul className="totalliste">
                {forslag.en.map((r, i) => (
                  <li key={r.sett[0]}>
                    <Kjedemerke kode={r.sett[0]} navn={forslag.navn[r.sett[0]]} />
                    <span className={`muted liten vokse ${r.dekket < Math.ceil(forslag.antall * 0.7) ? 'fare-tekst' : ''}`}>{r.dekket === forslag.antall ? `alle ${forslag.antall} varer` : `${r.dekket} av ${forslag.antall} varer`}</span>
                    <span className={i === 0 ? 'pris' : 'pris pris-graa'}>{Math.round(r.sum)} kr</span>
                  </li>
                ))}
              </ul>
              <p className="muted liten">Varer kjeden ikke har, er regnet med vanlig pris (median) i de andre kjedene, så summene kan sammenlignes. Kjeder som mangler mange varer står nederst.</p>
            </section>
          )}

          {forslag?.parListe?.length > 0 && (
            <section className="card stack">
              <h2 className="h2">Billigst i to butikker</h2>
              <ul className="parliste">
                {forslag.parListe.map((p, i) => <ParRad key={p.sett.join('+')} p={p} forste={i === 0} beste={forslag.beste} navn={forslag.navn} />)}
              </ul>
              <p className="muted liten">Hver vare kjøpes der den er billigst av de to. Sparing er mot å handle alt i {forslag.navn[forslag.beste.sett[0]] ? <Kjedenavn kode={forslag.beste.sett[0]} navn={forslag.navn[forslag.beste.sett[0]]} /> : 'billigste butikk'} (ca. {Math.round(forslag.beste.sum)} kr).</p>
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
              <h2 className="gruppe-tittel">{vare.navn}{data?.referanse && <span className="muted liten sammenligner-kort"> · samme vare: {data.referanse.navn}</span>}</h2>
              {!data && <p className="muted liten innrykk">{vare.navn.trim().length < 3 ? 'For kort navn til å søke' : laster ? 'Henter …' : 'Ikke hentet ennå'}</p>}
              {data && !treff.length && <p className="muted liten innrykk">Fant ingen pris. Prøv et mer vanlig navn, f.eks. «lettmelk» i stedet for «melk lett».</p>}
              {treff.length > 0 && (
                <ul className="card prisrader">
                  {treff.map((t, i) => (
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

function Kjedenavn({ kode, navn }) { return butikk(kode, navn).navn; }

function ParRad({ p, forste, beste, navn }) {
  const [apen, setApen] = useState(false);
  const spart = Math.round(beste.sum - p.sum);
  return (
    <li>
      <button type="button" className="parrad" onClick={() => setApen(!apen)} aria-expanded={apen}>
        <span className="vokse parrad-kjeder">
          {p.sett.map((k) => <Kjedemerke key={k} kode={k} navn={navn[k]} />)}
        </span>
        <span className="parrad-tall">
          <span className={forste ? 'pris' : 'pris pris-graa'}>{Math.round(p.sum)} kr</span>
          {spart > 0 && <span className="muted liten">sparer {spart} kr</span>}
        </span>
        <span className={apen ? 'roter' : ''}><Icon name="chevronD" size={16} /></span>
      </button>
      {apen && (
        <div className="pardetalj">
          {p.sett.map((k) => (
            <p key={k} className="liten"><b>{butikk(k, navn[k]).navn} ({p.fordeling[k].length}):</b> {p.fordeling[k].map((x) => x.vare.navn).join(', ') || '–'}</p>
          ))}
          {p.andre.length > 0 && <p className="liten muted">Ingen av dem: {p.andre.map((x) => x.vare.navn).join(', ')}</p>}
        </div>
      )}
    </li>
  );
}
