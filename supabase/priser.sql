-- BraRyd – priser fra Kassalapp (erstatter tilbud fra kundeavisene)
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run. Kan kjøres flere ganger.

-- Mellomlager for priser per søkeord (skrives bare av serverfunksjonen)
create table if not exists public.pris_cache (
  sok text primary key,
  data jsonb not null,
  hentet timestamptz not null default now()
);
alter table public.pris_cache enable row level security;
drop policy if exists "medlem leser" on public.pris_cache;
create policy "medlem leser" on public.pris_cache for select to authenticated using (public.er_medlem());

-- Hvilke kjeder som vises (Kassalapp-koder)
alter table public.innstillinger add column if not exists butikker text[] not null default array[
  'KIWI','REMA_1000','MENY_NO','SPAR_NO','JOKER_NO','COOP_EXTRA','COOP_MEGA','COOP_PRIX','COOP_OBS',
  'COOP_MARKED','BUNNPRIS','NAERBUTIKKEN','ODA_NO'
];

-- Den gamle tilbudstabellen brukes ikke lenger
drop table if exists public.tilbud;
