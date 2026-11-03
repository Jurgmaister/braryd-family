import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import { useKategorier, useMedlemmer, navnFor, usePriser, treffI, useInnstillinger, leggTilVarer } from '../data.js';
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
  const butikker = useInnstillinger()?.butikker;
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
  }

  return (
    <main className="page">
      <Topbar tittel="Handleliste" under={varer ? (aktive.length ? `${aktive.length} ${aktive.length === 1 ? 'vare' : 'varer'}` : 'Alt er handlet') : ''}>
        <button type="button" className="ikonknapp" onClick={() => setListerApen(true)} aria-label="Lagrede lister"><Icon name="list" /></button>
        <button type="button" className="ikonknapp" onClick={() => setLagreApen(true)} aria-label="Lagre listen" disabled={!aktive.length}><Icon name="save" /></button>
      </Topbar>

      <form className="leggtil" onSubmit={leggTil}>
        <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Legg til vare (flere: skill med ;)"
          enterKeyHint="done" autoComplete="off" />
        <button type="submit" className="ikonknapp ikonknapp-fylt" aria-label="Legg til"><Icon name="plus" /></button>
      </form>

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
                onVeksle={() => veksle(v)} onApne={() => setRedigerer(v)} />
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
                {kurv.map((v) => <VareRad key={v.id} v={v} tilbud={[]} medlemmer={medlemmer} onVeksle={() => veksle(v)} onApne={() => setRedigerer(v)} />)}
              </ul>
              <button type="button" className="btn btn-ghost" onClick={tomKurv}><Icon name="trash" size={18} /> Fjern alt i kurven</button>
            </>
          )}
        </section>
      )}

      <VareSkjema vare={redigerer} kategorier={kategorier} tilbud={redigerer ? prisFor(redigerer) : []}
        onClose={() => setRedigerer(null)} setVarer={setVarer} medlemmer={medlemmer} />
      <LagreListe open={lagreApen} onClose={() => setLagreApen(false)} varer={aktive} />
      <LagredeLister open={listerApen} onClose={() => setListerApen(false)} aktive={aktive} setVarer={setVarer} />
    </main>
  );
}

function VareRad({ v, tilbud, medlemmer, onVeksle, onApne }) {
  const topp = tilbud.slice(0, 3);
  const prisfall = topp.some((t) => t.forpris);
  const hvem = navnFor(medlemmer, v.lagt_til_av);
  return (
    <li className={v.kjopt ? 'vare vare-kjopt' : 'vare'}>
      <button type="button" className="hake" onClick={onVeksle} aria-label={v.kjopt ? `Angre ${v.navn}` : `Kjøpt ${v.navn}`} aria-pressed={v.kjopt}>
        {v.kjopt && <Icon name="check" size={16} strokeWidth={2.6} />}
      </button>
      <button type="button" className="vare-tekst" onClick={onApne}>
        <span className="vare-navn">{v.antall && <span className="vare-antall">{v.antall}</span>}{v.navn}</span>
        {topp.length > 0 && !v.kjopt && (
          <span className="prisrekke">
            <Icon name="tag" size={12} />
            {topp.map((t, i) => (
              <span key={t.kode} className={t.forpris ? 'prisbit prisbit-fall' : i === 0 ? 'prisbit prisbit-best' : 'prisbit'}>
                {butikk(t.kode, t.kjede).navn} {kr(t.pris)}
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

function VareSkjema({ vare, kategorier, tilbud, onClose, setVarer, medlemmer }) {
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
    <Sheet open onClose={onClose} tittel="Vare"
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
          </div>
        )}
        {hvem && <p className="muted liten">Lagt til av {hvem}{vare.kilde === 'siri' ? ' med Siri' : vare.kilde === 'middag' ? ' fra en middag' : ''}.</p>}
      </div>
    </Sheet>
  );
}

function LagreListe({ open, onClose, varer }) {
  const [navn, setNavn] = useState('');
  useEffect(() => { if (open) setNavn(''); }, [open]);
  async function lagre(e) {
    e.preventDefault();
    if (!navn.trim()) return;
    const { error } = await supabase.from('lagrede_lister').insert({
      navn: navn.trim(), varer: varer.map((v) => ({ navn: v.navn, antall: v.antall, kategori: v.kategori })),
    });
    if (error) { toast(error.message); return; }
    toast(`«${navn.trim()}» er lagret`);
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} tittel="Lagre listen">
      <form className="stack" onSubmit={lagre}>
        <p className="muted">Lagrer de {varer.length} varene som står på listen nå, så dere kan hente dem fram igjen senere.</p>
        <label className="field">Navn på listen
          <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="F.eks. «Hyttetur» eller «Fast ukehandel»" />
        </label>
        <button type="submit" className="btn btn-primary btn-lg">Lagre</button>
      </form>
    </Sheet>
  );
}

function LagredeLister({ open, onClose, aktive, setVarer }) {
  const [lister, setLister] = useState(null);
  useEffect(() => {
    if (!open) return;
    supabase.from('lagrede_lister').select('*').order('opprettet', { ascending: false })
      .then(({ data, error }) => { if (error) toast(error.message); else setLister(data); });
  }, [open]);

  async function bruk(l) {
    const finnes = new Set(aktive.map((v) => normaliser(v.navn)));
    const nye = (l.varer || []).filter((v) => !finnes.has(normaliser(v.navn)));
    if (!nye.length) { toast('Alt står allerede på listen'); return; }
    try {
      const rader = await leggTilVarer(nye, 'lagret');
      setVarer((x) => [...(x || []), ...rader.filter((r) => !(x || []).some((y) => y.id === r.id))]);
      toast(`La til ${nye.length} varer fra «${l.navn}»`);
      onClose();
    } catch (e) { toast(e.message); }
  }

  async function slett(l) {
    if (!window.confirm(`Slette den lagrede listen «${l.navn}»?`)) return;
    await supabase.from('lagrede_lister').delete().eq('id', l.id);
    setLister((x) => x.filter((y) => y.id !== l.id));
  }

  return (
    <Sheet open={open} onClose={onClose} tittel="Lagrede lister">
      {lister == null && <div className="spinner" />}
      {lister && !lister.length && <p className="muted">Ingen lagrede lister ennå. Trykk på lagre-knappen øverst for å lagre listen dere har nå.</p>}
      <ul className="lagrede">
        {(lister || []).map((l) => (
          <li key={l.id} className="card innfelt">
            <div className="vokse">
              <p className="lagret-navn">{l.navn}</p>
              <p className="muted liten">{(l.varer || []).length} varer: {(l.varer || []).slice(0, 6).map((v) => v.navn).join(', ')}{(l.varer || []).length > 6 ? ' …' : ''}</p>
            </div>
            <div className="knapperad">
              <button type="button" className="ikonknapp" onClick={() => slett(l)} aria-label="Slett"><Icon name="trash" size={18} /></button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => bruk(l)}>Legg til</button>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
