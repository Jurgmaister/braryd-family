import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTION_URL, isConfigured } from './config.js';

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : null;

// Kaller serverfunksjonen «braryd» med innloggingen.
export async function callFunction(action, body = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || SUPABASE_ANON_KEY;
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Feil fra server (${res.status})`);
  return out;
}
