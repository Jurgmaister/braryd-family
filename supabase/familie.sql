-- BraRyd – oppgaver, kalender og push-varsler
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run.
-- Kjøres etter schema.sql. Kan kjøres flere ganger uten å ødelegge data.

-- ---------- Oppgaver ----------
create table if not exists public.oppgaver (
  id bigint generated always as identity primary key,
  tittel text not null,
  notat text not null default '',
  tildelt text,                           -- e-post; null = hvem som helst
  frist date,
  gjentakelse text not null default 'ingen'
    check (gjentakelse in ('ingen', 'daglig', 'ukentlig', 'annenhver_uke', 'maanedlig')),
  ferdig boolean not null default false,
  ferdig_av text,
  ferdig_tid timestamptz,
  forrige_id bigint,                      -- oppgaven denne gjentakelsen kom fra
  opprettet_av text default public.min_epost(),
  opprettet timestamptz not null default now()
);
create index if not exists oppgaver_aapne_idx on public.oppgaver (ferdig, frist);

-- Neste frist for en gjentakende oppgave (alltid i dag eller senere)
create or replace function public.neste_frist(p_frist date, p_gjentakelse text)
returns date language plpgsql stable
as $$
declare base date := coalesce(p_frist, current_date); d date; steg interval; n int := 1;
begin
  steg := case p_gjentakelse
    when 'daglig' then interval '1 day'
    when 'ukentlig' then interval '7 days'
    when 'annenhver_uke' then interval '14 days'
    when 'maanedlig' then interval '1 month'
    else null end;
  if steg is null then return null; end if;
  -- Regnes fra opprinnelig frist, så «den 31. hver måned» ikke glir til den 28.
  d := (base + n * steg)::date;
  while d < (now() at time zone 'Europe/Oslo')::date loop n := n + 1; d := (base + n * steg)::date; end loop;
  return d;
end $$;

-- Marker en oppgave som ferdig. Gjentakende oppgaver får en ny utgave med neste frist.
create or replace function public.fullfor_oppgave(p_id bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare o public.oppgaver; ny_id bigint;
begin
  if not public.er_medlem() then raise exception 'Ikke medlem'; end if;
  update public.oppgaver set ferdig = true, ferdig_av = public.min_epost(), ferdig_tid = now()
    where id = p_id and not ferdig returning * into o;
  if o.id is null then return null; end if;
  if o.gjentakelse <> 'ingen' then
    insert into public.oppgaver (tittel, notat, tildelt, frist, gjentakelse, forrige_id, opprettet_av)
      values (o.tittel, o.notat, o.tildelt, public.neste_frist(o.frist, o.gjentakelse), o.gjentakelse, o.id, o.opprettet_av)
      returning id into ny_id;
  end if;
  return ny_id;
end $$;

-- Angre: åpner oppgaven igjen og fjerner den nye utgaven hvis den ikke er påbegynt
create or replace function public.angre_oppgave(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.er_medlem() then raise exception 'Ikke medlem'; end if;
  delete from public.oppgaver where forrige_id = p_id and not ferdig;
  update public.oppgaver set ferdig = false, ferdig_av = null, ferdig_tid = null where id = p_id;
end $$;

-- ---------- Kalender ----------
create table if not exists public.hendelser (
  id bigint generated always as identity primary key,
  tittel text not null,
  type text not null default 'avtale' check (type in ('avtale', 'trening', 'bursdag', 'annet')),
  eier text,                              -- e-post; null = felles familiekalender
  dato date not null,
  tid time,                               -- null = hele dagen
  slutt_tid time,
  sluttdato date,                         -- for flerdagers hendelser
  sted text not null default '',
  notat text not null default '',
  gjentakelse text not null default 'ingen'
    check (gjentakelse in ('ingen', 'ukentlig', 'annenhver_uke', 'maanedlig', 'aarlig')),
  gjentar_til date,
  fodselsar int,                          -- bursdag: for å vise alder
  varsel_min int,                         -- minutter før start (negativt = etter start, f.eks. -480 = kl. 08 samme dag)
  opprettet_av text default public.min_epost(),
  opprettet timestamptz not null default now()
);
create index if not exists hendelser_dato_idx on public.hendelser (dato);

-- ---------- Push ----------
create table if not exists public.push_abonnement (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  email text not null,
  opprettet timestamptz not null default now(),
  oppdatert timestamptz not null default now()
);

create table if not exists public.meldinger (
  id bigint generated always as identity primary key,
  fra text not null,
  til text,                               -- e-post; null = alle
  tittel text not null default '',
  tekst text not null,
  sendt timestamptz not null default now()
);

-- Hvilke automatiske varsler som er sendt (så ingenting sendes to ganger)
create table if not exists public.sendte_varsler (
  nokkel text primary key,
  sendt timestamptz not null default now()
);

-- ---------- Tilgang ----------
alter table public.oppgaver enable row level security;
alter table public.hendelser enable row level security;
alter table public.push_abonnement enable row level security;
alter table public.meldinger enable row level security;
alter table public.sendte_varsler enable row level security;  -- bare serverfunksjonen

do $$
declare t text;
begin
  foreach t in array array['oppgaver', 'hendelser'] loop
    execute format('drop policy if exists "medlem leser" on public.%I', t);
    execute format('create policy "medlem leser" on public.%I for select to authenticated using (public.er_medlem())', t);
    -- Når admin.sql er kjørt, styres skrivetilgang per person der ("rett skriver")
    if to_regprocedure('public.har_rett(text)') is null then
      execute format('drop policy if exists "medlem skriver" on public.%I', t);
      execute format('create policy "medlem skriver" on public.%I for all to authenticated using (public.er_medlem()) with check (public.er_medlem())', t);
    end if;
  end loop;
end $$;

drop policy if exists "medlem leser" on public.meldinger;
create policy "medlem leser" on public.meldinger for select to authenticated using (public.er_medlem());

drop policy if exists "egne enheter" on public.push_abonnement;
create policy "egne enheter" on public.push_abonnement for select to authenticated
  using (lower(email) = public.min_epost());

grant execute on function public.fullfor_oppgave(bigint) to authenticated;
grant execute on function public.angre_oppgave(bigint) to authenticated;
revoke execute on function public.fullfor_oppgave(bigint) from anon;
revoke execute on function public.angre_oppgave(bigint) from anon;

-- ---------- Sanntid ----------
do $$
begin
  begin alter publication supabase_realtime add table public.oppgaver; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hendelser; exception when duplicate_object then null; end;
end $$;
alter table public.oppgaver replica identity full;
alter table public.hendelser replica identity full;
