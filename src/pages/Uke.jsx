import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import {
  useMiddager, hentPlan, settPlan, fjernPlan, middagFraNavn, leggTilVarer,
} from '../data.js';
import {
  UKEDAGER, MND, isoDato, iDag, mandagI, leggTilDager, ukenummer, fraIso, relativDato, ingrediensLinjer, normaliser,
} from '../util.js';
import Topbar from '../components/Topbar.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

const HURTIGVALG = ['Rester', 'Spiser ute', 'Takeaway', 'Pizzafredag'];

export default function Uke() {
  const [mandag, setMandag] = useState(() => mandagI(new Date()));
  const [plan, setPlan] = useState({});
  const [valgt, setValgt] = useState(null);
  const middager = useMiddager();
  const byId = useMemo(() => new Map((middager || []).map((m) => [m.id, m])), [middager]);

  const dager = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDato(leggTilDager(mandag, i))), [mandag]);
  const idag = iDag();
  const erDenneUka = isoDato(mandagI(new Date())) === dager[0];

  const last = useCallback(async () => {
    const rader = await hentPlan(dager[0], dager[6]);
    setPlan(Object.fromEntries(rader.map((r) => [r.dato, r])));
  }, [dager]);

  useEffect(() => {
    last().catch(() => {});
    const kanal = supabase.channel('middagsplan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'middagsplan' }, () => last().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(kanal); };
  }, [last]);

  const f = fraIso(dager[0]);
  const s = fraIso(dager[6]);
  const periode = f.getMonth() === s.getMonth()
    ? `${f.getDate()}.–${s.getDate()}. ${MND[s.getMonth()]}`
    : `${f.getDate()}. ${MND[f.getMonth()]} – ${s.getDate()}. ${MND[s.getMonth()]}`;

  const kommende = dager.filter((d) => d >= idag && plan[d]?.middag_id && byId.get(plan[d].middag_id)?.ingredienser?.trim());

  async function ukasIngredienser() {
    const { data: paaLista } = await supabase.from('handleliste').select('navn').eq('kjopt', false);
    const finnes = new Set((paaLista || []).map((v) => normaliser(v.navn)));
    const nye = [];
    for (const d of kommende) {
      for (const v of ingrediensLinjer(byId.get(plan[d].middag_id).ingredienser)) {
        const n = normaliser(v.navn);
        if (!finnes.has(n)) { finnes.add(n); nye.push(v); }
      }
    }
    if (!nye.length) { toast('Alt står allerede på handlelisten'); return; }
    await leggTilVarer(nye, 'middag');
    toast(`La til ${nye.length} ${nye.length === 1 ? 'vare' : 'varer'} på handlelisten`);
  }

  return (
    <main className="page">
      <Topbar tittel="Ukeplan" under={`Uke ${ukenummer(f)} · ${periode}`} />

      <div className="ukenav">
        <button type="button" className="ikonknapp" onClick={() => setMandag(leggTilDager(mandag, -7))} aria-label="Forrige uke"><Icon name="chevronL" /></button>
        {erDenneUka
          ? <span className="ukenav-tekst">Denne uken</span>
          : <button type="button" className="lenkeknapp" onClick={() => setMandag(mandagI(new Date()))}>Til denne uken</button>}
        <button type="button" className="ikonknapp" onClick={() => setMandag(leggTilDager(mandag, 7))} aria-label="Neste uke"><Icon name="chevronR" /></button>
      </div>

      <ul className="dager">
        {dager.map((d) => {
          const p = plan[d];
          const m = p?.middag_id ? byId.get(p.middag_id) : null;
          const navn = m?.navn || p?.tekst;
          const dato = fraIso(d);
          const forbi = d < idag;
          return (
            <li key={d}>
              <button type="button" className={`dag ${d === idag ? 'dag-idag' : ''} ${forbi ? 'dag-forbi' : ''}`} onClick={() => setValgt(d)}>
                <span className="dag-dato">
                  <span className="dag-ukedag">{UKEDAGER[dato.getDay()].slice(0, 3)}</span>
                  <span className="dag-tall">{dato.getDate()}</span>
                </span>
                <span className="dag-innhold">
                  {navn
                    ? <><span className="dag-middag">{navn}</span>{p?.notat && <span className="muted liten">{p.notat}</span>}</>
                    : <span className="dag-tom">{forbi ? 'Ingenting registrert' : 'Velg middag'}</span>}
                </span>
                {m?.oppskrift_url && <span className="dag-merke" title="Har oppskrift"><Icon name="link" size={16} /></span>}
                {!navn && !forbi && <Icon name="plus" size={20} />}
              </button>
            </li>
          );
        })}
      </ul>

      {kommende.length > 0 && (
        <button type="button" className="btn btn-ghost" onClick={() => ukasIngredienser().catch((e) => toast(e.message))}>
          <Icon name="cart" size={18} /> Legg ukas ingredienser på handlelisten
        </button>
      )}

      <DagSheet dato={valgt} rad={valgt ? plan[valgt] : null} middager={middager || []} byId={byId}
        onClose={() => setValgt(null)} onEndret={() => last()} />
    </main>
  );
}

function DagSheet({ dato, rad, middager, byId, onClose, onEndret }) {
  const [velger, setVelger] = useState(false);
  const [sok, setSok] = useState('');
  const [notat, setNotat] = useState('');
  const [jobber, setJobber] = useState(false);

  useEffect(() => {
    setSok(''); setNotat(rad?.notat || '');
    setVelger(!rad?.middag_id && !rad?.tekst);
  }, [dato, rad]);

  if (!dato) return null;
  const m = rad?.middag_id ? byId.get(rad.middag_id) : null;
  const d = fraIso(dato);
  const tittel = `${UKEDAGER[d.getDay()][0].toUpperCase()}${UKEDAGER[d.getDay()].slice(1)} ${d.getDate()}. ${MND[d.getMonth()]}`;

  async function gjor(fn, melding) {
    setJobber(true);
    try { await fn(); await onEndret(); if (melding) toast(melding); } catch (e) { toast(e.message); } finally { setJobber(false); }
  }

  const velgMiddag = (mid) => gjor(async () => { await settPlan(dato, { middag_id: mid, tekst: '', notat }); setVelger(false); });
  const velgTekst = (t) => gjor(async () => { await settPlan(dato, { middag_id: null, tekst: t, notat }); setVelger(false); });
  const nyMiddag = (navn) => gjor(async () => { const ny = await middagFraNavn(navn); await settPlan(dato, { middag_id: ny.id, tekst: '', notat }); setVelger(false); }, `«${navn}» er lagret i middagene`);

  if (velger) {
    const q = normaliser(sok);
    const treff = middager
      .filter((x) => !q || normaliser(x.navn).includes(q))
      .sort((a, b) => (b.favoritt - a.favoritt) || (b.antall - a.antall) || a.navn.localeCompare(b.navn, 'nb'))
      .slice(0, 40);
    const eksakt = middager.some((x) => normaliser(x.navn) === q);
    const lengeSiden = !q ? middager
      .filter((x) => x.antall >= 2 && x.sist && (Date.now() - fraIso(x.sist)) > 28 * 86400000 && !x.neste)
      .sort((a, b) => b.antall - a.antall).slice(0, 3) : [];

    return (
      <Sheet open onClose={onClose} tittel={tittel}>
        <div className="sokefelt">
          <Icon name="search" size={18} />
          <input autoFocus placeholder="Søk eller skriv ny middag" value={sok} onChange={(e) => setSok(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && sok.trim()) { const f = treff[0]; if (f && normaliser(f.navn) === q) velgMiddag(f.id); else nyMiddag(sok.trim()); } }} />
        </div>
        {sok.trim() && !eksakt && (
          <button type="button" className="velgrad velgrad-ny" disabled={jobber} onClick={() => nyMiddag(sok.trim())}>
            <Icon name="plus" size={18} /> Lag «{sok.trim()}» som ny middag
          </button>
        )}
        {!q && (
          <div className="chips">
            {HURTIGVALG.map((t) => <button key={t} type="button" className="chip" onClick={() => velgTekst(t)}>{t}</button>)}
          </div>
        )}
        {lengeSiden.length > 0 && (
          <>
            <p className="seksjonstittel">Lenge siden sist</p>
            {lengeSiden.map((x) => <MiddagValg key={`l${x.id}`} m={x} onClick={() => velgMiddag(x.id)} />)}
            <p className="seksjonstittel">Alle middager</p>
          </>
        )}
        {treff.map((x) => <MiddagValg key={x.id} m={x} onClick={() => velgMiddag(x.id)} />)}
        {!middager.length && !sok && <p className="muted">Ingen middager lagret ennå. Skriv navnet på en middag for å lagre den.</p>}
      </Sheet>
    );
  }

  const ingredienser = m ? ingrediensLinjer(m.ingredienser) : [];
  return (
    <Sheet open onClose={onClose} tittel={tittel}
      footer={(
        <div className="knapperad">
          <button type="button" className="btn btn-ghost" disabled={jobber} onClick={() => setVelger(true)}>Bytt</button>
          <button type="button" className="btn btn-ghost fare" disabled={jobber} onClick={() => gjor(async () => { await fjernPlan(dato); onClose(); })}>Fjern</button>
        </div>
      )}>
      <div className="stack">
        <div>
          <p className="stor-tittel">{m?.navn || rad?.tekst}</p>
          {m && <p className="muted liten">{m.antall ? `Spist ${m.antall} ${m.antall === 1 ? 'gang' : 'ganger'}` : 'Første gang'}{m.sist ? ` · sist ${relativDato(m.sist)}` : ''}</p>}
        </div>
        {m?.oppskrift_url && (
          <a className="btn btn-primary" href={m.oppskrift_url} target="_blank" rel="noopener">
            <Icon name="external" size={18} /> Åpne oppskriften
          </a>
        )}
        {ingredienser.length > 0 && (
          <button type="button" className="btn btn-ghost" disabled={jobber}
            onClick={() => gjor(() => leggTilVarer(ingredienser, 'middag'), `La til ${ingredienser.length} varer på handlelisten`)}>
            <Icon name="cart" size={18} /> Legg {ingredienser.length} ingredienser på handlelisten
          </button>
        )}
        {m && !m.oppskrift_url && !ingredienser.length && (
          <a className="muted liten" href="#/middager">Legg til oppskriftslenke og ingredienser under Middager</a>
        )}
        <label className="field">Notat for dagen
          <input value={notat} placeholder="F.eks. «Trening til 18» eller «Bestemor kommer»" onChange={(e) => setNotat(e.target.value)}
            onBlur={() => { if ((rad?.notat || '') !== notat) gjor(() => settPlan(dato, { middag_id: rad?.middag_id ?? null, tekst: rad?.tekst || '', notat })); }} />
        </label>
      </div>
    </Sheet>
  );
}

function MiddagValg({ m, onClick }) {
  return (
    <button type="button" className="velgrad" onClick={onClick}>
      <span className="velgrad-tekst">
        <span className="velgrad-navn">{m.favoritt && <Icon name="star" size={14} fill="currentColor" />} {m.navn}</span>
        <span className="muted liten">
          {m.antall ? `${m.antall}× · sist ${relativDato(m.sist)}` : 'Ikke spist ennå'}
          {m.neste ? ` · planlagt ${relativDatoFrem(m.neste)}` : ''}
        </span>
      </span>
      {m.oppskrift_url && <Icon name="link" size={16} />}
    </button>
  );
}

function relativDatoFrem(s) {
  const d = fraIso(s);
  return `${UKEDAGER[d.getDay()]} ${d.getDate()}. ${MND[d.getMonth()]}`;
}
