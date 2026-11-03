import { useCallback, useEffect, useState } from 'react';
import { supabase, callFunction } from './supabase.js';

// ---------- Innlogging ----------
export function useSession() {
  const [session, setSession] = useState(undefined); // undefined = laster
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

// ---------- Enkel felles butikk for data som brukes på flere sider ----------
function lagStore(hent) {
  let data = null;
  let lytt = new Set();
  let laster = null;
  const sett = (d) => { data = d; lytt.forEach((f) => f(d)); };
  const last = async () => {
    if (!laster) laster = hent().then((d) => { sett(d); return d; }).finally(() => { laster = null; });
    return laster;
  };
  return {
    get: () => data,
    set: sett,
    last,
    abonner: (f) => { lytt.add(f); return () => lytt.delete(f); },
  };
}

function useStore(store) {
  const [d, setD] = useState(store.get());
  useEffect(() => {
    const av = store.abonner(setD);
    if (store.get() == null) store.last().catch(() => {});
    return av;
  }, [store]);
  return d;
}

// ---------- Medlemmer ----------
const medlemStore = lagStore(async () => {
  const { data, error } = await supabase.from('medlemmer').select('email, navn, farge').order('navn');
  if (error) throw error;
  return data;
});
export const useMedlemmer = () => useStore(medlemStore) || [];
export const lastMedlemmerPaaNytt = () => medlemStore.last();
export function navnFor(medlemmer, email) {
  if (!email) return '';
  return medlemmer.find((m) => m.email.toLowerCase() === email.toLowerCase())?.navn || email.split('@')[0];
}

// ---------- Kategorier ----------
const kategoriStore = lagStore(async () => {
  const { data, error } = await supabase.from('kategorier').select('*').order('rekkefolge');
  if (error) throw error;
  return data;
});
export const useKategorier = () => useStore(kategoriStore) || [];

// ---------- Handleliste (sanntid) ----------
export function useHandleliste() {
  const [varer, setVarer] = useState(null);
  const [feil, setFeil] = useState('');

  const hent = useCallback(async () => {
    const { data, error } = await supabase.from('handleliste').select('*').order('opprettet');
    if (error) setFeil(error.message); else { setFeil(''); setVarer(data); }
  }, []);

  useEffect(() => {
    hent();
    const kanal = supabase.channel('handleliste')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handleliste' }, (p) => {
        setVarer((liste) => {
          if (!liste) return liste;
          if (p.eventType === 'INSERT') return liste.some((v) => v.id === p.new.id) ? liste : [...liste, p.new];
          if (p.eventType === 'UPDATE') return liste.map((v) => (v.id === p.new.id ? p.new : v));
          if (p.eventType === 'DELETE') return liste.filter((v) => v.id !== p.old.id);
          return liste;
        });
      })
      .subscribe();
    const paaNytt = () => { if (document.visibilityState === 'visible') hent(); };
    document.addEventListener('visibilitychange', paaNytt);
    return () => { supabase.removeChannel(kanal); document.removeEventListener('visibilitychange', paaNytt); };
  }, [hent]);

  return { varer, setVarer, feil, hent };
}

export async function leggTilVarer(varer, kilde = 'app') {
  const rader = varer.filter((v) => v.navn?.trim()).map((v) => ({
    navn: v.navn.trim(), antall: v.antall || '', kategori: v.kategori || null, kilde,
  }));
  if (!rader.length) return [];
  const { data, error } = await supabase.from('handleliste').insert(rader).select();
  if (error) throw error;
  return data;
}

// ---------- Innstillinger ----------
const innstillingStore = lagStore(async () => {
  const { data, error } = await supabase.from('innstillinger').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
});
export const useInnstillinger = () => useStore(innstillingStore);
export const lastInnstillingerPaaNytt = () => innstillingStore.last();

// ---------- Priser (Kassalapp) ----------
// Mellomlager i appen: søkeord → { sok, treff, alle, hentet }
const prisCache = new Map();
const prisLytt = new Set();
const prisVarsle = () => prisLytt.forEach((f) => f());
const prisStatus = { laster: 0, feil: '' };
const MAKS_ALDER = 12 * 3600_000;
const sokeord = (navn) => normaliserNavn(navn);
function normaliserNavn(s) { return (s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim(); }

async function hentPriser(navnListe, force = false) {
  const alle = [...new Set(navnListe.map(sokeord).filter((n) => n.length >= 3))];
  if (!alle.length) return;
  prisStatus.laster++; prisStatus.feil = ''; prisVarsle();
  try {
    // 1) Det som allerede ligger i databasen
    const mangler = alle.filter((n) => !prisCache.has(n));
    if (mangler.length && !force) {
      const { data } = await supabase.from('pris_cache').select('sok, data').in('sok', mangler);
      for (const r of data || []) prisCache.set(r.sok, r.data);
      prisVarsle();
    }
    // 2) Det som mangler eller er gammelt hentes fra Kassalapp via serverfunksjonen
    const gamle = alle.filter((n) => force || !prisCache.get(n) || Date.now() - Date.parse(prisCache.get(n).hentet) > MAKS_ALDER);
    for (let i = 0; i < gamle.length; i += 20) {
      const svar = await callFunction('priser', { navn: gamle.slice(i, i + 20), force });
      for (const [k, v] of Object.entries(svar.resultater || {})) prisCache.set(k, v);
      if (svar.feil?.length) prisStatus.feil = svar.feil[0].replace(/^[^:]+:\s*/, '');
      prisVarsle();
    }
  } catch (e) {
    prisStatus.feil = e.message;
  } finally {
    prisStatus.laster--; prisVarsle();
  }
}

export function usePriser(navnListe) {
  const [, tving] = useState(0);
  const nokkel = [...new Set((navnListe || []).map(sokeord))].sort().join('|');
  useEffect(() => {
    const f = () => tving((x) => x + 1);
    prisLytt.add(f);
    return () => prisLytt.delete(f);
  }, []);
  useEffect(() => {
    if (!nokkel) return undefined;
    const t = setTimeout(() => hentPriser(nokkel.split('|')), 500);
    return () => clearTimeout(t);
  }, [nokkel]);
  return {
    pris: (navn) => prisCache.get(sokeord(navn)),
    laster: prisStatus.laster > 0,
    feil: prisStatus.feil,
    oppdater: () => hentPriser(nokkel.split('|').filter(Boolean), true),
  };
}

export async function sokPris(q) {
  const data = await callFunction('sok', { q });
  prisCache.set(sokeord(q), data);
  prisVarsle();
  return data;
}

// Treff filtrert på valgte kjeder, billigst først
export function treffI(data, butikker) {
  if (!data?.treff) return [];
  const valgt = butikker?.length ? new Set(butikker) : null;
  return data.treff.filter((t) => !valgt || valgt.has(t.kode));
}

// ---------- Middager ----------
const middagStore = lagStore(async () => {
  const [{ data: m, error: e1 }, { data: s, error: e2 }] = await Promise.all([
    supabase.from('middager').select('*').order('navn'),
    supabase.from('middag_statistikk').select('*'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const stat = new Map(s.map((r) => [r.id, r]));
  return m.map((x) => ({ ...x, antall: stat.get(x.id)?.antall || 0, sist: stat.get(x.id)?.sist || null, neste: stat.get(x.id)?.neste || null }));
});
export const useMiddager = () => useStore(middagStore);
export const lastMiddagerPaaNytt = () => middagStore.last();

export async function lagreMiddag(m) {
  const rad = {
    navn: m.navn.trim(), oppskrift_url: (m.oppskrift_url || '').trim(), ingredienser: m.ingredienser || '',
    notat: m.notat || '', favoritt: Boolean(m.favoritt),
  };
  const q = m.id ? supabase.from('middager').update(rad).eq('id', m.id) : supabase.from('middager').insert(rad);
  const { data, error } = await q.select().single();
  if (error) {
    if (error.code === '23505') throw new Error('Det finnes allerede en middag med det navnet.');
    throw error;
  }
  await middagStore.last();
  return data;
}

export async function slettMiddag(id) {
  const { error } = await supabase.from('middager').delete().eq('id', id);
  if (error) throw error;
  await middagStore.last();
}

// Finn eller lag en middag ut fra navn
export async function middagFraNavn(navn) {
  const liste = middagStore.get() || (await middagStore.last());
  const finnes = liste.find((m) => m.navn.toLowerCase() === navn.trim().toLowerCase());
  if (finnes) return finnes;
  return lagreMiddag({ navn });
}

export async function hentPlan(fra, til) {
  const { data, error } = await supabase.from('middagsplan').select('*').gte('dato', fra).lte('dato', til);
  if (error) throw error;
  return data;
}

export async function settPlan(dato, felt) {
  const { error } = await supabase.from('middagsplan').upsert({ dato, ...felt, oppdatert: new Date().toISOString() });
  if (error) throw error;
  middagStore.last().catch(() => {});
}

export async function fjernPlan(dato) {
  const { error } = await supabase.from('middagsplan').delete().eq('dato', dato);
  if (error) throw error;
  middagStore.last().catch(() => {});
}
