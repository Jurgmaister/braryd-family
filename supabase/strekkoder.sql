-- BraRyd – skanning av varer til handlelisten
--   • strekkoder: husker hvilket navn og hvilken kategori familien bruker for en strekkode
--   • handleliste.ean: skannede varer får pris for akkurat den varen
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run. Kjøres etter admin.sql. Kan kjøres flere ganger.

create table if not exists public.strekkoder (
  ean text primary key,
  navn text not null,
  kategori text references public.kategorier(navn) on update cascade on delete set null,
  produktnavn text not null default '',      -- navnet fra produktdatabasen
  oppdatert timestamptz not null default now()
);
alter table public.strekkoder enable row level security;
drop policy if exists "medlem leser" on public.strekkoder;
create policy "medlem leser" on public.strekkoder for select to authenticated using (public.er_medlem());
drop policy if exists "rett skriver" on public.strekkoder;
create policy "rett skriver" on public.strekkoder for all to authenticated
  using (public.har_rett('handle')) with check (public.har_rett('handle'));

alter table public.handleliste add column if not exists ean text;

-- «skann» som kilde for varer på handlelisten
alter table public.handleliste drop constraint if exists handleliste_kilde_check;
alter table public.handleliste add constraint handleliste_kilde_check
  check (kilde in ('app', 'siri', 'middag', 'tilbud', 'lagret', 'skann'));
