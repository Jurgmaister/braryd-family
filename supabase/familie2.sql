-- BraRyd – utvidelser for oppgaver og kalender:
--   • oppgaver som gjentas på bestemte ukedager
--   • valg om push-påminnelse (og klokkeslett) per oppgave
--   • pause på oppgaver (med valgfri dato for når den starter igjen)
--   • flere push-varsler per kalenderhendelse (f.eks. tre for en bursdag)
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run. Kjøres etter familie.sql.
-- Kan kjøres flere ganger uten å ødelegge data.

-- ---------- Oppgaver ----------
alter table public.oppgaver add column if not exists dager int[];                       -- 1 = mandag … 7 = søndag
alter table public.oppgaver add column if not exists varsel boolean not null default true;
alter table public.oppgaver add column if not exists varsel_tid time not null default '07:00';
alter table public.oppgaver add column if not exists pauset boolean not null default false;
alter table public.oppgaver add column if not exists pauset_til date;

alter table public.oppgaver drop constraint if exists oppgaver_gjentakelse_check;
alter table public.oppgaver add constraint oppgaver_gjentakelse_check
  check (gjentakelse in ('ingen', 'daglig', 'ukedager', 'ukentlig', 'annenhver_uke', 'maanedlig'));

-- Neste frist (tidligst i morgen). «ukedager» bruker dager-listen.
create or replace function public.neste_frist(p_frist date, p_gjentakelse text, p_dager int[])
returns date language plpgsql stable
as $$
declare
  idag date := (now() at time zone 'Europe/Oslo')::date;
  base date := coalesce(p_frist, idag);
  d date; steg interval; n int := 1;
begin
  if p_gjentakelse = 'ukedager' then
    if p_dager is null or cardinality(p_dager) = 0 then return null; end if;
    d := greatest(base, idag) + 1;   -- tidligst dagen etter (det som er gjort i dag teller)
    for i in 1..14 loop
      if extract(isodow from d)::int = any (p_dager) then return d; end if;
      d := d + 1;
    end loop;
    return null;
  end if;
  steg := case p_gjentakelse
    when 'daglig' then interval '1 day'
    when 'ukentlig' then interval '7 days'
    when 'annenhver_uke' then interval '14 days'
    when 'maanedlig' then interval '1 month'
    else null end;
  if steg is null then return null; end if;
  d := (base + n * steg)::date;
  while d <= idag loop n := n + 1; d := (base + n * steg)::date; end loop;
  return d;
end $$;

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
    insert into public.oppgaver (tittel, notat, tildelt, frist, gjentakelse, dager, varsel, varsel_tid, forrige_id, opprettet_av)
      values (o.tittel, o.notat, o.tildelt, public.neste_frist(o.frist, o.gjentakelse, o.dager), o.gjentakelse, o.dager,
              o.varsel, o.varsel_tid, o.id, o.opprettet_av)
      returning id into ny_id;
  end if;
  return ny_id;
end $$;

-- Pause / start igjen. Når en fast oppgave startes igjen, flyttes en passert frist til neste gang.
create or replace function public.pause_oppgave(p_id bigint, p_pause boolean, p_til date default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.er_medlem() then raise exception 'Ikke medlem'; end if;
  if p_pause then
    update public.oppgaver set pauset = true, pauset_til = p_til where id = p_id;
  else
    update public.oppgaver set pauset = false, pauset_til = null,
      frist = case when gjentakelse <> 'ingen' and frist < (now() at time zone 'Europe/Oslo')::date
                   then public.neste_frist(frist, gjentakelse, dager) else frist end
      where id = p_id;
  end if;
end $$;

-- Brukes av varseljobben: starter oppgaver igjen når pausen er over
create or replace function public.gjenoppta_pausede()
returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  update public.oppgaver set pauset = false, pauset_til = null,
    frist = case when gjentakelse <> 'ingen' and frist < (now() at time zone 'Europe/Oslo')::date
                 then public.neste_frist(frist, gjentakelse, dager) else frist end
    where pauset and pauset_til is not null and pauset_til <= (now() at time zone 'Europe/Oslo')::date
      and not ferdig;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.pause_oppgave(bigint, boolean, date) to authenticated;
revoke execute on function public.pause_oppgave(bigint, boolean, date) from anon;
revoke execute on function public.gjenoppta_pausede() from anon, authenticated;

-- ---------- Kalender: flere varsler per hendelse ----------
alter table public.hendelser add column if not exists varsler int[];   -- minutter før start, inntil tre
update public.hendelser set varsler = array[varsel_min] where varsler is null and varsel_min is not null;
