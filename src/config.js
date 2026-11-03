export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/braryd`;

// Kjeder som kan velges for tilbud (navn slik de står i kundeavisene)
export const ALLE_KJEDER = [
  'REMA 1000', 'KIWI', 'MENY', 'Extra', 'Coop Prix', 'Coop Mega', 'Obs', 'Coop Marked', 'Coop',
  'SPAR', 'Eurospar', 'Joker', 'Bunnpris', 'Nærbutikken', 'Matkroken', 'Europris', 'Gigaboks',
];

// Farger på kjedemerkene i tilbudslisten
export const KJEDE_FARGE = {
  'REMA 1000': '#1F3A8A', KIWI: '#2E7D32', MENY: '#C62828', Extra: '#D84315', 'Coop Prix': '#E0A100',
  'Coop Mega': '#1B5E20', Obs: '#0D47A1', 'Coop Marked': '#00796B', Coop: '#00695C', SPAR: '#C62828',
  Eurospar: '#AD1457', Joker: '#F57F17', Bunnpris: '#6A1B9A', Nærbutikken: '#4E342E', Matkroken: '#B71C1C',
  Europris: '#283593', Gigaboks: '#37474F',
};
