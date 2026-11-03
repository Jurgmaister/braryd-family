export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
// Navnet (slug) på serverfunksjonen i Supabase. Standard er «braryd».
export const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/${import.meta.env.VITE_FUNCTION_NAME || 'braryd'}`;

// Kjedene i Kassalapp (kode → navn og farge)
export const BUTIKKER = [
  { kode: 'KIWI', navn: 'KIWI', farge: '#2E7D32' },
  { kode: 'REMA_1000', navn: 'REMA 1000', farge: '#1F3A8A' },
  { kode: 'MENY_NO', navn: 'MENY', farge: '#C62828' },
  { kode: 'SPAR_NO', navn: 'SPAR', farge: '#B71C1C' },
  { kode: 'JOKER_NO', navn: 'Joker', farge: '#E08E00' },
  { kode: 'COOP_EXTRA', navn: 'Extra', farge: '#D84315' },
  { kode: 'COOP_MEGA', navn: 'Coop Mega', farge: '#1B5E20' },
  { kode: 'COOP_PRIX', navn: 'Coop Prix', farge: '#C99700' },
  { kode: 'COOP_OBS', navn: 'Obs', farge: '#0D47A1' },
  { kode: 'COOP_MARKED', navn: 'Coop Marked', farge: '#00796B' },
  { kode: 'COOP_NO', navn: 'Coop', farge: '#00695C' },
  { kode: 'BUNNPRIS', navn: 'Bunnpris', farge: '#6A1B9A' },
  { kode: 'NAERBUTIKKEN', navn: 'Nærbutikken', farge: '#4E342E' },
  { kode: 'MATKROKEN', navn: 'Matkroken', farge: '#8E1B1B' },
  { kode: 'ODA_NO', navn: 'Oda', farge: '#37474F' },
  { kode: 'EUROPRIS_NO', navn: 'Europris', farge: '#283593' },
];
export const butikk = (kode, reserve = '') => BUTIKKER.find((b) => b.kode === kode) || { kode, navn: reserve || kode, farge: '#6A716B' };

// Farger for personer i kalender og oppgaver (i rekkefølge etter navn)
export const PERSONFARGER = ['#3D6FB6', '#C8613F', '#8E5BB5', '#C99700', '#2A8C8C', '#B5487A', '#5B7F2A'];
export const FAMILIEFARGE = '#2F5D50';
