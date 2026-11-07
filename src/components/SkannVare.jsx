import { useCallback, useState } from 'react';
import { supabase, callFunction } from '../supabase.js';
import { leggTilVarer } from '../data.js';
import { normaliser } from '../util.js';
import Sheet from './Sheet.jsx';
import Strekkodeleser from './Strekkodeleser.jsx';
import { toast } from './Toast.jsx';

// Reserve når Kassalapp ikke kjenner varen: Open Food Facts (åpen produktdatabase)
async function openFoodFacts(kode) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(kode)}.json?fields=product_name,product_name_no,product_name_nb,brands,quantity,image_front_small_url`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const p = (await r.json())?.product;
    const navn = (p?.product_name_nb || p?.product_name_no || p?.product_name || '').trim();
    if (!navn) return null;
    const merke = (p.brands || '').split(',')[0].trim();
    return { navn: [merke && !navn.toLowerCase().includes(merke.toLowerCase()) ? merke : '', navn, p.quantity || ''].filter(Boolean).join(' '), bilde: p.image_front_small_url || '' };
  } catch { return null; }
}

// Skann varer rett inn i handlelisten. Etter hver vare er skanneren klar for neste.
export default function SkannVare({ open, onClose, aktive, setVarer }) {
  const [steg, setSteg] = useState({ type: 'skann', nr: 0 });
  const [f, setF] = useState({});
  const [jobber, setJobber] = useState(false);

  const neste = (sist) => setSteg((s) => ({ type: 'skann', nr: s.nr + 1, sist }));
  const lukk = () => { setSteg({ type: 'skann', nr: 0 }); onClose(); };

  const paaKode = useCallback(async (kode) => {
    const ean = kode.replace(/\D/g, '');
    setSteg((s) => ({ ...s, type: 'slaar-opp', kode: ean }));
    // 1) Har familien skannet denne før?
    const { data: kjent } = await supabase.from('strekkoder').select('*').eq('ean', ean).maybeSingle().then((r) => r, () => ({ data: null }));
    if (kjent) {
      setF({ ean, navn: kjent.navn, produkt: kjent.produktnavn, kategori: kjent.kategori, antall: '', husk: true, kjent: true });
      setSteg((s) => ({ ...s, type: 'vare' }));
      callFunction('ean-oppslag', { ean }).then((r) => r.bilde && setF((x) => ({ ...x, bilde: r.bilde }))).catch(() => {});
      return;
    }
    // 2) Kassalapp (norske varenavn og priser), ellers Open Food Facts
    let svar = null;
    try { svar = await callFunction('ean-oppslag', { ean }); } catch { /* prøv reserve */ }
    let produkt = svar?.funnet ? { navn: svar.fulltNavn || svar.navn, bilde: svar.bilde } : null;
    if (!produkt) produkt = await openFoodFacts(ean);
    setF({ ean, navn: produkt?.navn || '', produkt: produkt?.navn || '', bilde: produkt?.bilde || '', antall: '', husk: true, kjent: false, funnet: Boolean(produkt) });
    setSteg((s) => ({ ...s, type: 'vare' }));
  }, []);

  const finnes = steg.type === 'vare' && aktive.find((v) => (f.ean && v.ean === f.ean) || normaliser(v.navn) === normaliser(f.navn));

  async function leggTil(e) {
    e?.preventDefault();
    if (!f.navn?.trim()) { toast('Skriv hva varen skal hete på listen'); return; }
    setJobber(true);
    try {
      const rader = await leggTilVarer([{ navn: f.navn.trim(), antall: f.antall, kategori: f.kategori || null, ean: f.ean }], 'skann');
      setVarer((l) => [...(l || []), ...rader.filter((r) => !(l || []).some((x) => x.id === r.id))]);
      if (f.husk && f.ean) {
        await supabase.from('strekkoder').upsert({
          ean: f.ean, navn: f.navn.trim(), produktnavn: f.produkt || '', kategori: rader[0]?.kategori || f.kategori || null, oppdatert: new Date().toISOString(),
        }).then(() => {}, () => {});
      }
      toast(`Lagt til: ${f.navn.trim()}`);
      neste(f.ean);
    } catch (err) { toast(err.message); } finally { setJobber(false); }
  }

  return (
    <Sheet open={open} onClose={lukk} tittel="Skann vare"
      footer={<button type="button" className="btn btn-ghost btn-lg" onClick={lukk}>Ferdig</button>}>
      {steg.type === 'skann' && <Strekkodeleser key={steg.nr} onKode={paaKode} hoppOver={steg.sist} />}
      {steg.type === 'slaar-opp' && (
        <div className="tom"><div className="spinner" /><p className="muted">Slår opp {steg.kode} …</p></div>
      )}
      {steg.type === 'vare' && (
        <form className="stack" onSubmit={leggTil}>
          <div className="skann-treff">
            {f.bilde ? <img src={f.bilde} alt="" /> : <span className="skann-ikon">🏷️</span>}
            <span className="vokse">
              <b>{f.kjent ? 'Kjent vare' : f.funnet ? 'Funnet' : 'Ukjent strekkode'}</b>
              <span className="muted liten">{f.produkt || 'Fant ikke varen automatisk – skriv navnet selv.'}</span>
              <span className="muted liten">{f.ean}</span>
            </span>
          </div>
          <div className="inputrad">
            <label className="field vokse">Navn på listen
              <input value={f.navn} onChange={(e) => setF({ ...f, navn: e.target.value })} autoFocus={!f.navn} placeholder="F.eks. Lettmelk" />
            </label>
            <label className="field smal">Antall
              <input value={f.antall} onChange={(e) => setF({ ...f, antall: e.target.value })} placeholder="1" inputMode="numeric" />
            </label>
          </div>
          <label className="sjekk liten">
            <input type="checkbox" checked={f.husk} onChange={(e) => setF({ ...f, husk: e.target.checked })} />
            Husk navnet for denne strekkoden
          </label>
          {finnes && <p className="infoboks">«{finnes.navn}» står allerede på listen{finnes.antall ? ` (${finnes.antall})` : ''}.</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={jobber}>{finnes ? 'Legg til likevel' : 'Legg på handlelisten'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => neste(f.ean)}>Skann en annen</button>
          <p className="muted liten">Skannede varer får pris for akkurat denne varen i hver kjede.</p>
        </form>
      )}
    </Sheet>
  );
}
