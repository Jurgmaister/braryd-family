-- BraRyd – butikker i nærheten og valgte kjeder
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run. Kan kjøres flere ganger.

alter table public.innstillinger add column if not exists lat double precision not null default 60.3913;
alter table public.innstillinger add column if not exists lng double precision not null default 5.3221;
alter table public.innstillinger add column if not exists radius_km int not null default 15;
alter table public.innstillinger add column if not exists butikker_naer jsonb;      -- kjeder med butikk innenfor radius
alter table public.innstillinger add column if not exists naer_hentet timestamptz;

-- Kjedene dere handler i (KIWI, REMA 1000, Obs og MENY)
update public.innstillinger set butikker = array['KIWI', 'REMA_1000', 'COOP_OBS', 'MENY_NO'] where id = 1;
