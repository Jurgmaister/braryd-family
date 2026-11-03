import { useEffect, useMemo, useState } from 'react';
import { useMiddager, lagreMiddag, slettMiddag, settPlan, leggTilVarer } from '../data.js';
import { relativDato, normaliser, ingrediensLinjer, iDag } from '../util.js';
import Topbar from '../components/Topbar.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

const SORTERING = [
  { id: 'mest', label: 'Mest spist' },
  { id: 'sist', label: 'Sist spist' },
  { id: 'lengesiden', label: 'Lenge siden' },
  { id: 'navn', label: 'A–Å' },
  { id: 'favoritt', label: 'Favoritter' },
];

export default function Middager() {
  const middager = useMiddager();
  const [sok, setSok] = useState('');
  const [sort, setSort] = useState('mest');
  const [apen, setApen] = useState(null); // middag-objekt, eller {} for ny

  const liste = useMemo(() => {
    const q = normaliser(sok);
    let l = (middager || []).filter((m) => !q || normaliser(`${m.navn} ${m.ingredienser} ${m.notat}`).includes(q));
    if (sort === 'favoritt') l = l.filter((m) => m.favoritt);
    const navn = (a, b) => a.navn.localeCompare(b.navn, 'nb');
    const sorter = {
      mest: (a, b) => (b.antall - a.antall) || navn(a, b),
      sist: (a, b) => (b.sist || '').localeCompare(a.sist || '') || navn(a, b),
      lengesiden: (a, b) => (a.sist || '9999').localeCompare(b.sist || '9999') || navn(a, b),
      navn,
      favoritt: navn,
    }[sort];
    return [...l].sort(sorter);
  }, [middager, sok, sort]);

  return (
    <main className="page">
      <Topbar tittel="Middager" under={middager ? `${middager.length} lagret` : ''}>
        <button type="button" className="ikonknapp ikonknapp-fylt" onClick={() => setApen({})} aria-label="Ny middag"><Icon name="plus" /></button>
      </Topbar>

      <div className="sokefelt">
        <Icon name="search" size={18} />
        <input placeholder="Søk i middager og ingredienser" value={sok} onChange={(e) => setSok(e.target.value)} />
      </div>
      <div className="chips scroll">
        {SORTERING.map((s) => (
          <button key={s.id} type="button" className={sort === s.id ? 'chip chip-on' : 'chip'} onClick={() => setSort(s.id)}>{s.label}</button>
        ))}
      </div>

      {middager == null && <div className="spinner" />}
      {middager && !middager.length && (
        <div className="tom">
          <p className="stor-tittel">Ingen middager ennå</p>
          <p className="muted">Middager du velger i ukeplanen lagres her automatisk. Du kan også legge dem inn selv, med lenke til oppskriften.</p>
          <button type="button" className="btn btn-primary" onClick={() => setApen({})}>Legg inn første middag</button>
        </div>
      )}

      <ul className="kortliste">
        {liste.map((m) => (
          <li key={m.id}>
            <button type="button" className="card middagkort" onClick={() => setApen(m)}>
              <span className="middagkort-tekst">
                <span className="middagkort-navn">{m.favoritt && <Icon name="star" size={15} fill="currentColor" />} {m.navn}</span>
                <span className="muted liten">
                  {m.antall ? `Spist ${m.antall} ${m.antall === 1 ? 'gang' : 'ganger'} · sist ${relativDato(m.sist)}` : 'Ikke spist ennå'}
                </span>
              </span>
              {m.oppskrift_url && <span className="merke"><Icon name="link" size={14} /> Oppskrift</span>}
            </button>
          </li>
        ))}
      </ul>

      <MiddagSkjema middag={apen} onClose={() => setApen(null)} />
    </main>
  );
}

function MiddagSkjema({ middag, onClose }) {
  const [f, setF] = useState({});
  const [jobber, setJobber] = useState(false);
  const [dato, setDato] = useState(iDag());
  useEffect(() => { setF(middag ? { ...middag } : {}); setDato(iDag()); }, [middag]);
  if (!middag) return null;
  const ny = !middag.id;
  const sett = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function lagre(lukk = true) {
    if (!f.navn?.trim()) { toast('Middagen må ha et navn'); return null; }
    if (f.oppskrift_url && !/^https?:\/\//i.test(f.oppskrift_url.trim())) f.oppskrift_url = `https://${f.oppskrift_url.trim()}`;
    setJobber(true);
    try {
      const lagret = await lagreMiddag(f);
      if (lukk) { toast('Lagret'); onClose(); }
      return lagret;
    } catch (e) { toast(e.message); return null; } finally { setJobber(false); }
  }

  async function planlegg() {
    const m = await lagre(false);
    if (!m) return;
    await settPlan(dato, { middag_id: m.id, tekst: '' });
    toast('Lagt inn i ukeplanen');
    onClose();
  }

  async function slett() {
    if (!window.confirm(`Slette «${middag.navn}»? Den forsvinner også fra tidligere dager i planen.`)) return;
    await slettMiddag(middag.id).catch((e) => toast(e.message));
    onClose();
  }

  const ingredienser = ingrediensLinjer(f.ingredienser);
  return (
    <Sheet open onClose={onClose} tittel={ny ? 'Ny middag' : 'Middag'}
      footer={(
        <div className="knapperad">
          {!ny && <button type="button" className="btn btn-ghost fare" onClick={slett} disabled={jobber}><Icon name="trash" size={18} /></button>}
          <button type="button" className="btn btn-primary vokse" onClick={() => lagre()} disabled={jobber}>Lagre</button>
        </div>
      )}>
      <div className="stack">
        <label className="field">Navn
          <input value={f.navn || ''} onChange={sett('navn')} placeholder="F.eks. Tacofredag" autoFocus={ny} />
        </label>
        <label className="field">Lenke til oppskrift
          <div className="inputrad">
            <input type="url" inputMode="url" value={f.oppskrift_url || ''} onChange={sett('oppskrift_url')} placeholder="https://www.matprat.no/…" />
            {f.oppskrift_url && <a className="ikonknapp" href={f.oppskrift_url} target="_blank" rel="noopener" aria-label="Åpne oppskrift"><Icon name="external" size={18} /></a>}
          </div>
        </label>
        <label className="field">Ingredienser <span className="muted feltinfo">én per linje – kan legges rett på handlelisten</span>
          <textarea rows={6} value={f.ingredienser || ''} onChange={sett('ingredienser')} placeholder={'400 g kjøttdeig\nTacoskjell\nRømme\nSalat'} />
        </label>
        <label className="field">Notat
          <textarea rows={2} value={f.notat || ''} onChange={sett('notat')} placeholder="F.eks. «Dobbel porsjon» eller «Barna liker uten chili»" />
        </label>
        <label className="sjekk">
          <input type="checkbox" checked={Boolean(f.favoritt)} onChange={sett('favoritt')} /> Favoritt
        </label>

        {!ny && (
          <div className="card innfelt stack">
            <p className="seksjonstittel">Planlegg</p>
            <div className="inputrad">
              <input type="date" value={dato} onChange={(e) => setDato(e.target.value)} />
              <button type="button" className="btn btn-ghost" onClick={planlegg} disabled={jobber}>Legg i ukeplanen</button>
            </div>
            {ingredienser.length > 0 && (
              <button type="button" className="btn btn-ghost" disabled={jobber}
                onClick={() => leggTilVarer(ingredienser, 'middag').then(() => toast(`La til ${ingredienser.length} varer`)).catch((e) => toast(e.message))}>
                <Icon name="cart" size={18} /> Legg ingrediensene på handlelisten
              </button>
            )}
            {middag.antall > 0 && <p className="muted liten">Spist {middag.antall} {middag.antall === 1 ? 'gang' : 'ganger'}, sist {relativDato(middag.sist)}.</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
