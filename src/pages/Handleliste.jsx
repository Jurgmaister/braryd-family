import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import {
  useKategorier, useMedlemmer, navnFor, usePriser, treffI, useInnstillinger, leggTilVarer,
  useLagredeLister, lastListerPaaNytt, aktivListeId, settAktivListe, useRett, visPris, anbefaling,
} from '../data.js';
import KunInnsyn from '../components/KunInnsyn.jsx';
import { butikk } from '../config.js';
import { tolkVarer, normaliser, kr, initialer } from '../util.js';
import Topbar from '../components/Topbar.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';

export default function Handleliste({ liste }) {
  const { varer, setVarer, feil } = liste;
  const kategorier = useKategorier();
  const medlemmer = useMedlemmer();
  const [tekst, setTekst] = useState('');
  const [redigerer, setRedigerer] = useState(null);
  const [visKurv, setVisKurv] = useState(false);
  const [lagreApen, setLagreApen] = useState(false);
  const [listerApen, setListerApen] = useState(false);

  const aktive = (varer || []).filter((v) => !v.kjopt);
  const kurv = (varer || []).filter((v) => v.kjopt).sort((a, b) => (b.kjopt_tid || '').localeCompare(a.kjopt_tid || ''));

  const grupper = useMemo(() => {
    const rekke = new Map(kategorier.map((k) => [k.navn, k]));
    const g = new Map();
    for (const v of aktive) {
      const k = v.kategori || 'Annet';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(v);
    }
    return [...g.entries()]
      .map(([navn, liste]) => ({ navn, emoji: rekke.get(navn)?.emoji || '🛒', rekkefolge: rekke.get(navn)?.rekkefolge ?? 998, liste }))
      .sort((a, b) => a.rekkefolge - b.rekkefolge);
  }, [aktive, kategorier]);

  const { pris } = usePriser(aktive.map((v) => v.navn));
  const inn = useInnstillinger();
  const kan = useRett('handle');
  const butikker = inn?.butikker;
  const lagrede = useLagredeLister();
  const aktivId = aktivListeId(inn);
  const aktivListe = (lagrede || []).find((l) => l.id === aktivId) || null;
  const prisFor = (v) => treffI(pris(v.navn), butikker);

  async function leggTil(e) {
    e.preventDefault();
    const nye = tolkVarer(tekst);
    if (!nye.length) return;
    const finnes = new Set(aktive.map((v) => normaliser(v.navn)));
    const unike = nye.filter((v) => !finnes.has(normaliser(v.navn)));
    setTekst('');
    if (!unike.length) { toast('Står allerede på listen'); return; }
    try {
      const rader = await leggTilVarer(unike);
      setVarer((l) => [...(l || []), ...rader.filter((r) => !(l || []).some((x) => x.id === r.id))]);
    } catch (err) { toast(err.message); setTekst(tekst); }
  }

  async function veksle(v) {
    const kjopt = !v.kjopt;
    setVarer((l) => l.map((x) => (x.id === v.id ? { ...x, kjopt, kjopt_tid: kjopt ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.from('handleliste').update({ kjopt }).eq('id', v.id);
    if (error) toast(error.message);
  }

  async function tomKurv() {
    const ids = kurv.map((v) => v.id);
    setVarer((l) => l.filter((x) => !x.kjopt));
    const { error } = await supabase.from('handleliste').delete().in('id', ids);
    if (error) toast(error.message);
    if (!aktive.length && aktivId) settAktivListe(null); // ferdig handlet: ikke lenger i en lagret liste
  }

  return (
    <main className="page">
      <Topbar tittel="Handleliste" under={varer ? (aktive.length ? `${aktive.length} ${aktive.length === 1 ? 'vare' : 'varer'}` : 'Alt er handlet') : ''}>
        {kan && <button type="button" className="ikonknapp" onClick={() => setListerApen(true)} aria-label="Lagrede lister"><Icon name="list" /></button>}
        {kan && <button type="button" className="ikonknapp" onClick={() => setLagreApen(true)} aria-label="Lagre listen" disabled={!(varer || []).length}><Icon name="save" /></button>}
      </Topbar>

      {aktivListe && (
        <div className="aktivliste">
          <Icon name="list" size={16} />
          <span className="vokse">Fra lagret liste: <b>{aktivListe.navn}</b></span>
          {kan && <button type="button" className="lenkeknapp" onClick={() => setLagreApen(true)}>Lagre endringer</button>}
          {kan && <button type="button" className="ikonknapp ikonknapp-liten-graa" onClick={() => settAktivListe(null)} aria-label="Ikke koble til listen"><Icon name="close" size={16} /></button>}
        </div>
      )}

      {!kan && <KunInnsyn hva="handlelisten" />}
      {kan && (
      <form className="leggtil" onSubmit={leggTil}>
        <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Legg til vare (flere: skill med ;)"
          enterKeyHint="done" autoComplete="off" />
        <button type="submit" className="ikonknapp ikonknapp-fylt" aria-label="Legg til"><Icon name="plus" /></button>
      </form>
      )}

      <Anbefaling varer={aktive.map((v) => ({ vare: v, treff: prisFor(v) }))} />

      {feil && <p className="feil">{feil}</p>}
      {varer == null && <div className="spinner" />}
      {varer && !aktive.length && (
        <div className="tom">
          <p className="stor-tittel">Tom liste 🎉</p>
          <p className="muted">Skriv inn varer over, si «Hei Siri, handleliste», eller hent en lagret liste.</p>
        </div>
      )}

      {grupper.map((g) => (
        <section key={g.navn} className="gruppe">
          <h2 className="gruppe-tittel"><span aria-hidden="true">{g.emoji}</span> {g.navn}</h2>
          <ul className="card varer">
            {g.liste.map((v) => (
              <VareRad key={v.id} v={v} tilbud={prisFor(v)} medlemmer={medlemmer}
                kan={kan} onVeksle={() => veksle(v)} onApne={() => setRedigerer(v)} />
            ))}
          </ul>
        </section>
      ))}

      {kurv.length > 0 && (
        <section className="gruppe">
          <button type="button" className="gruppe-tittel kurv-knapp" onClick={() => setVisKurv(!visKurv)}>
            <span aria-hidden="true">🧺</span> I kurven ({kurv.length})
            <span className={visKurv ? 'roter' : ''}><Icon name="chevronD" size={18} /></span>
          </button>
          {visKurv && (
            <>
              <ul className="card varer">
                {kurv.map((v) => <VareRad key={v.id} v={v} tilbud={[]} medlemmer={medlemmer} kan={kan} onVeksle={() => veksle(v)} onApne={() => setRedigerer(v)} />)}
              </ul>
              {kan && <button type="button" className="btn btn-ghost" onClick={tomKurv}><Icon name="trash" size={18} /> Fjern alt i kurven</button>}
            </>
          )}
        </section>
      )}

      <VareSkjema kan={kan} vare={redigerer} kategorier={kategorier} tilbud={redigerer ? prisFor(redigerer) : []} prisData={redigerer ? pris(redigerer.navn) : null}
        onClose={() => setRedigerer(null)} setVarer={setVarer} medlemmer={medlemmer} />
      <LagreListe open={lagreApen} onClose={() => setLagreApen(false)} varer={varer || []} lagrede={lagrede || []} aktivId={aktivListe?.id || null} />
      <LagredeLister open={listerApen} onClose={() => setListerApen(false)} aktive={aktive} setVarer={setVarer} lagrede={lagrede} />
    </main>
  );
}

function VareRad({ v, tilbud, medlemmer, kan = true, onVeksle, onApne }) {
  const topp = tilbud.slice(0, 3);
  const prisfall = topp.some((t) => t.forpris);
  const hvem = navnFor(medlemmer, v.lagt_til_av);
  return (
    <li className={v.kjopt ? 'vare vare-kjopt' : 'vare'}>
      <button type="button" className="hake" disabled={!kan} onClick={onVeksle} aria-label={v.kjopt ? `Angre ${v.navn}` : `Kjøpt ${v.navn}`} aria-pressed={v.kjopt}>
        {v.kjopt && <Icon name="check" size={16} strokeWidth={2.6} />}
      </button>
      <button type="button" className="vare-tekst" onClick={onApne}>
        <span className="vare-navn">{v.antall && <span className="vare-antall">{v.antall}</span>}{v.navn}</span>
        {topp.length > 0 && !v.kjopt && (
          <span className="prisrekke">
            <Icon name="tag" size={12} />
            {topp.map((t, i) => (
              <span key={t.kode} className={t.forpris ? 'prisbit prisbit-fall' : i === 0 ? 'prisbit prisbit-best' : 'prisbit'}>
                {butikk(t.kode, t.kjede).navn} {kr(visPris(t).verdi)}{visPris(t).enhet ? `/${visPris(t).enhet}` : ''}
              </span>
            ))}
            {prisfall && <span className="prisbit-fall-tekst">prisfall</span>}
          </span>
        )}
      </button>
      {hvem && (
        <span className="hvem" title={`Lagt til av ${hvem}${v.kilde === 'siri' ? ' med Siri' : ''}`}>
          {v.kilde === 'siri' ? <Icon name="mic" size={12} /> : initialer(hvem)}
        </span>
      )}
    </li>
  );
}

function VareSkjema({ kan, vare, kategorier, tilbud, prisData, onClose, setVarer, medlemmer }) {
  const [f, setF] = useState({});
  useEffect(() => { setF(vare ? { navn: vare.navn, antall: vare.antall, kategori: vare.kategori } : {}); }, [vare]);
  if (!vare) return null;

  async function lagre() {
    if (!f.navn?.trim()) return;
    const endring = { navn: f.navn.trim(), antall: f.antall || '', kategori: f.kategori };
    setVarer((l) => l.map((x) => (x.id === vare.id ? { ...x, ...endring } : x)));
    onClose();
    const { error } = await supabase.from('handleliste').update(endring).eq('id', vare.id);
    if (error) { toast(error.message); return; }
    if (f.kategori !== vare.kategori) {
      // Husk valget, så varen havner riktig neste gang
      await supabase.from('kategori_minne').upsert({ navn: normaliser(endring.navn), kategori: f.kategori, oppdatert: new Date().toISOString() });
    }
  }

  async function slett() {
    setVarer((l) => l.filter((x) => x.id !== vare.id));
    onClose();
    const { error } = await supabase.from('handleliste').delete().eq('id', vare.id);
    if (error) toast(error.message);
  }

  const hvem = navnFor(medlemmer, vare.lagt_til_av);
  return (
    <Sheet open onClose={onClose} lesemodus={!kan} tittel="Vare"
      footer={(
        <div className="knapperad">
          <button type="button" className="btn btn-ghost fare" onClick={slett}><Icon name="trash" size={18} /></button>
          <button type="button" className="btn btn-primary vokse" onClick={lagre}>Lagre</button>
        </div>
      )}>
      <div className="stack">
        <div className="inputrad">
          <label className="field vokse">Vare<input value={f.navn || ''} onChange={(e) => setF({ ...f, navn: e.target.value })} /></label>
          <label className="field smal">Antall<input value={f.antall || ''} placeholder="2 stk" onChange={(e) => setF({ ...f, antall: e.target.value })} /></label>
        </div>
        <div>
          <p className="feltnavn">Kategori</p>
          <div className="chips">
            {kategorier.map((k) => (
              <button key={k.navn} type="button" className={f.kategori === k.navn ? 'chip chip-on' : 'chip'} onClick={() => setF({ ...f, kategori: k.navn })}>
                {k.emoji} {k.navn}
              </button>
            ))}
          </div>
        </div>
        {tilbud.length > 0 && (
          <div>
            <p className="feltnavn">Pris i dag</p>
            {prisData?.referanse && <p className="muted liten sammenligner">Sammenligner samme vare i alle kjedene: <b>{prisData.referanse.navn}</b></p>}
            <ul className="minitilbud">
              {tilbud.slice(0, 8).map((t) => (
                <li key={t.kode}>
                  {t.bilde && <img src={t.bilde} alt="" loading="lazy" />}
                  <span className="vokse">
                    <span className="minitilbud-tittel">{t.navn}</span>
                    <span className="muted liten">{butikk(t.kode, t.kjede).navn}{t.forpris ? ` · prisfall, var ${kr(t.forpris)}` : ''}</span>
                  </span>
                  <span className="pris">{kr(t.pris)}</span>
                </li>
              ))}
            </ul>
            {prisData?.andre?.length > 0 && (
              <p className="muted liten">Har ikke akkurat denne varen: {prisData.andre.map((t) => `${butikk(t.kode, t.kjede).navn} (${t.navn}, ${kr(t.pris)})`).join(' · ')}</p>
            )}
          </div>
        )}
        {hvem && <p className="muted liten">Lagt til av {hvem}{vare.kilde === 'siri' ? ' med Siri' : vare.kilde === 'middag' ? ' fra en middag' : ''}.</p>}
      </div>
    </Sheet>
  );
}

const tilLagret = (varer) => varer.map((v) => ({ navn: v.navn, antall: v.antall || '', kategori: v.kategori }));

function LagreListe({ open, onClose, varer, lagrede, aktivId }) {
  const [mal, setMal] = useState('ny');
  const [navn, setNavn] = useState('');
  const [jobber, setJobber] = useState(false);
  useEffect(() => {
    if (open) { setMal(aktivId ? String(aktivId) : 'ny'); setNavn(''); }
  }, [open, aktivId]);

  const eksisterende = mal === 'ny' ? null : lagrede.find((l) => String(l.id) === mal);
  const iKurven = varer.filter((v) => v.kjopt).length;

  async function lagre(e) {
    e.preventDefault();
    if (!varer.length) return;
    setJobber(true);
    try {
      if (eksisterende) {
        const { error } = await supabase.from('lagrede_lister')
          .update({ varer: tilLagret(varer), oppdatert: new Date().toISOString() }).eq('id', eksisterende.id);
        if (error) {
          // oppdatert-kolonnen finnes ikke før lagrede_lister.sql er kjørt
          const { error: e2 } = await supabase.from('lagrede_lister').update({ varer: tilLagret(varer) }).eq('id', eksisterende.id);
          if (e2) throw e2;
        }
        await settAktivListe(eksisterende.id);
        toast(`«${eksisterende.navn}» er oppdatert`);
      } else {
        if (!navn.trim()) { toast('Gi listen et navn'); setJobber(false); return; }
        if (lagrede.some((l) => l.navn.toLowerCase() === navn.trim().toLowerCase())) {
          toast('Det finnes allerede en liste med det navnet – velg den i menyen for å oppdatere');
          setJobber(false); return;
        }
        const { data, error } = await supabase.from('lagrede_lister').insert({ navn: navn.trim(), varer: tilLagret(varer) }).select().single();
        if (error) throw error;
        await settAktivListe(data.id);
        toast(`«${navn.trim()}» er lagret`);
      }
      await lastListerPaaNytt();
      onClose();
    } catch (err) { toast(err.message); } finally { setJobber(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} tittel="Lagre listen">
      <form className="stack" onSubmit={lagre}>
        <label className="field">Lagre som
          <select value={mal} onChange={(e) => setMal(e.target.value)}>
            <option value="ny">Ny liste …</option>
            {lagrede.map((l) => <option key={l.id} value={String(l.id)}>Oppdater «{l.navn}»</option>)}
          </select>
        </label>
        {!eksisterende && (
          <label className="field">Navn på ny liste
            <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="F.eks. «Hyttetur» eller «Fast ukehandel»" />
          </label>
        )}
        <p className="muted liten">
          {eksisterende
            ? `Erstatter innholdet i «${eksisterende.navn}» (${(eksisterende.varer || []).length} varer) med de ${varer.length} varene på listen nå.`
            : `Lagrer de ${varer.length} varene på listen nå.`}
          {iKurven > 0 ? ` ${iKurven} av dem ligger i kurven og er tatt med.` : ''}
        </p>
        <button type="submit" className="btn btn-primary btn-lg" disabled={jobber || !varer.length}>
          {eksisterende ? `Oppdater «${eksisterende.navn}»` : 'Lagre ny liste'}
        </button>
      </form>
    </Sheet>
  );
}

function LagredeLister({ open, onClose, aktive, setVarer, lagrede }) {
  useEffect(() => { if (open) lastListerPaaNytt().catch((e) => toast(e.message)); }, [open]);

  async function bruk(l) {
    const finnes = new Set(aktive.map((v) => normaliser(v.navn)));
    const nye = (l.varer || []).filter((v) => !finnes.has(normaliser(v.navn)));
    try {
      if (nye.length) {
        const rader = await leggTilVarer(nye, 'lagret');
        setVarer((x) => [...(x || []), ...rader.filter((r) => !(x || []).some((y) => y.id === r.id))]);
      }
      await settAktivListe(l.id);
      toast(nye.length ? `La til ${nye.length} varer fra «${l.navn}»` : `Alt fra «${l.navn}» står allerede på listen`);
      onClose();
    } catch (e) { toast(e.message); }
  }

  async function slett(l) {
    if (!window.confirm(`Slette den lagrede listen «${l.navn}»?`)) return;
    const { error } = await supabase.from('lagrede_lister').delete().eq('id', l.id);
    if (error) { toast(error.message); return; }
    lastListerPaaNytt();
  }

  return (
    <Sheet open={open} onClose={onClose} tittel="Lagrede lister">
      {lagrede == null && <div className="spinner" />}
      {lagrede && !lagrede.length && <p className="muted">Ingen lagrede lister ennå. Trykk på lagre-knappen øverst for å lagre listen dere har nå.</p>}
      <ul className="lagrede">
        {(lagrede || []).map((l) => (
          <li key={l.id} className="card innfelt">
            <div className="vokse">
              <p className="lagret-navn">{l.navn}</p>
              <p className="muted liten">{(l.varer || []).length} varer: {(l.varer || []).slice(0, 6).map((v) => v.navn).join(', ')}{(l.varer || []).length > 6 ? ' …' : ''}</p>
            </div>
            <div className="knapperad">
              <button type="button" className="ikonknapp" onClick={() => slett(l)} aria-label="Slett"><Icon name="trash" size={18} /></button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => bruk(l)}>Bruk</button>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

// Anbefalt butikk øverst i handlelisten: én butikk, eller to hvis det sparer noe
function Anbefaling({ varer }) {
  const [apen, setApen] = useState(false);
  const a = useMemo(() => anbefaling(varer), [varer]);
  if (!a) return null;
  const n = (k) => butikk(k, a.navn[k]).navn;
  const { beste, to } = a;
  const liste = (l) => l.map((x) => x.vare.navn).join(', ');
  return (
    <section className="card anbefaling">
      <button type="button" className="anbefaling-topp" onClick={() => setApen(!apen)} aria-expanded={apen}>
        <span className="anbefaling-ikon">🏪</span>
        <span className="vokse">
          <span className="anbefaling-tittel">
            {to ? <>Billigst: <b>{n(to.sett[0])}</b> + <b>{n(to.sett[1])}</b></> : <>Billigst: <b>{n(beste.sett[0])}</b></>}
          </span>
          <span className="muted liten">
            {to
              ? `ca. ${Math.round(to.sum)} kr · sparer ca. ${Math.round(a.spart)} kr mot bare ${n(beste.sett[0])}`
              : `ca. ${Math.round(beste.sum)} kr · ${beste.dekket} av ${a.antall} varer der`}
          </span>
        </span>
        <span className={apen ? 'roter' : ''}><Icon name="chevronD" size={18} /></span>
      </button>
      {apen && (
        <div className="anbefaling-detaljer">
          {(to ? to.sett : beste.sett).map((k) => {
            const l = (to || beste).fordeling[k];
            return (
              <p key={k}>
                <span className="kjedemerke" style={{ background: butikk(k).farge }}>{n(k)}</span>{' '}
                <span className="muted liten">{l.length} varer · ca. {Math.round(l.reduce((s, x) => s + Math.min(...x.treff.filter((t) => t.kode === k).map((t) => t.pris)), 0))} kr</span><br />
                <span className="liten">{liste(l)}</span>
              </p>
            );
          })}
          {(to || beste).andre.length > 0 && (
            <p><span className="muted liten">Finnes ikke der ({(to || beste).andre.length}):</span> <span className="liten">{liste((to || beste).andre)}</span></p>
          )}
          {to && <p className="muted liten">Alt i {n(beste.sett[0])}: ca. {Math.round(beste.sum)} kr ({beste.dekket} av {a.antall} varer).</p>}
          {a.utenPris > 0 && <p className="muted liten">{a.utenPris} {a.utenPris === 1 ? 'vare' : 'varer'} uten pris er ikke med.</p>}
          <p className="muted liten">Basert på dagens priser i nettbutikkene. Butikken kan ha andre priser og tilbud.</p>
        </div>
      )}
    </section>
  );
}
