import { useCallback, useEffect, useRef, useState } from 'react';
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

// ---------- Tilbud ----------
const tilbudStore = lagStore(async () => {
  const naa = new Date().toISOString();
  const alle = [];
  for (let fra = 0; ; fra += 1000) {
    const { data, error } = await supabase.from('tilbud').select('*')
      .or(`gyldig_til.is.null,gyldig_til.gte.${naa}`)
      .order('kjede').order('tittel').range(fra, fra + 999);
    if (error) throw error;
    alle.push(...data);
    if (data.length < 1000) break;
  }
  return alle;
});

const innstillingStore = lagStore(async () => {
  const { data, error } = await supabase.from('innstillinger').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
});
export const useInnstillinger = () => useStore(innstillingStore);
export const lastInnstillingerPaaNytt = () => innstillingStore.last();

let autoSjekket = false;
export function useTilbud() {
  const tilbud = useStore(tilbudStore);
  const inn = useInnstillinger();
  const [henter, setHenter] = useState(false);
  const [feil, setFeil] = useState('');
  const kjorer = useRef(false);

  const oppdater = useCallback(async (force = true) => {
    if (kjorer.current) return;
    kjorer.current = true;
    setHenter(true); setFeil('');
    try {
      await callFunction('tilbud-sync', { force });
      await Promise.all([tilbudStore.last(), innstillingStore.last()]);
    } catch (e) {
      setFeil(e.message);
      innstillingStore.last().catch(() => {});
    } finally {
      kjorer.current = false;
      setHenter(false);
    }
  }, []);

  // Hent automatisk hvis tilbudene er eldre enn 12 timer
  useEffect(() => {
    if (!inn || autoSjekket) return;
    autoSjekket = true;
    const alder = inn.tilbud_hentet ? Date.now() - Date.parse(inn.tilbud_hentet) : Infinity;
    if (alder > 12 * 3600_000) oppdater(false);
  }, [inn, oppdater]);

  return { tilbud: tilbud || [], lastet: tilbud != null, inn, henter, feil, oppdater };
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
