-- BraRyd – admin og tilganger
--   • Jørgen er admin (kan alt, og styrer tilgangene til de andre)
--   • per person kan admin slå av/på: sende push, oppgaver, kalender, middag og handleliste
--     (av = kun innsyn i den delen)
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run. Kjøres etter familie2.sql.
-- Kan kjøres flere ganger uten å ødelegge data.

alter table public.medlemmer add column if not exists admin boolean not null default false;
alter table public.medlemmer add column if not exists kan_push boolean not null default true;
alter table public.medlemmer add column if not exists kan_oppgaver boolean not null default true;
alter table public.medlemmer add column if not exists kan_kalender boolean not null default true;
alter table public.medlemmer add column if not exists kan_middag boolean not null default true;
alter table public.medlemmer add column if not exists kan_handle boolean not null default true;

-- Jørgen er admin
update public.medlemmer set admin = true where lower(email) = 'jorgen.rydheim@gmail.com';

create or replace function public.er_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.medlemmer where lower(email) = public.min_epost() and admin);
$$;

-- Har innlogget bruker lov til å endre i en del av appen? ('push', 'oppgaver', 'kalender', 'middag', 'handle')
create or replace function public.har_rett(p_rett text)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select admin or case p_rett
      when 'push' then kan_push
      when 'oppgaver' then kan_oppgaver
      when 'kalender' then kan_kalender
      when 'middag' then kan_middag
      when 'handle' then kan_handle
      else false end
    from public.medlemmer where lower(email) = public.min_epost()
  ), false);
$$;

-- Admin endrer en tilgang for en person
create or replace function public.admin_sett_rett(p_email text, p_rett text, p_verdi boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.er_admin() then raise exception 'Bare admin kan endre tilganger'; end if;
  if p_rett not in ('push', 'oppgaver', 'kalender', 'middag', 'handle') then raise exception 'Ukjent tilgang %', p_rett; end if;
  execute format('update public.medlemmer set %I = $1 where lower(email) = lower($2)', 'kan_' || p_rett) using p_verdi, p_email;
end $$;

grant execute on function public.er_admin() to authenticated;
grant execute on function public.har_rett(text) to authenticated;
grant execute on function public.admin_sett_rett(text, text, boolean) to authenticated;
revoke execute on function public.admin_sett_rett(text, text, boolean) from anon;

-- Medlemmer kan bare endre sitt eget navn – ikke tilganger eller admin
revoke update on public.medlemmer from authenticated;
grant update (navn) on public.medlemmer to authenticated;

-- ---------- Skrivetilgang per del av appen (lesing er fortsatt åpen for hele familien) ----------
do $$
declare r record;
begin
  for r in select * from (values
    ('handleliste', 'handle'), ('lagrede_lister', 'handle'), ('kategori_minne', 'handle'), ('kategorier', 'handle'),
    ('middager', 'middag'), ('middagsplan', 'middag'),
    ('oppgaver', 'oppgaver'), ('hendelser', 'kalender')
  ) as t(tabell, rett) loop
    execute format('drop policy if exists "medlem skriver" on public.%I', r.tabell);
    execute format('drop policy if exists "rett skriver" on public.%I', r.tabell);
    execute format('create policy "rett skriver" on public.%I for all to authenticated using (public.har_rett(%L)) with check (public.har_rett(%L))', r.tabell, r.rett, r.rett);
  end loop;
end $$;

-- Den som bare har innsyn i oppgaver kan fortsatt krysse av oppgaver som er gitt til seg selv
create or replace function public.fullfor_oppgave(p_id bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare o public.oppgaver; ny_id bigint;
begin
  if not public.er_medlem() then raise exception 'Ikke medlem'; end if;
  if not public.har_rett('oppgaver') and not exists (
    select 1 from public.oppgaver where id = p_id and lower(coalesce(tildelt, '')) = public.min_epost()
  ) then raise exception 'Du kan bare krysse av dine egne oppgaver'; end if;
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

create or replace function public.angre_oppgave(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.er_medlem() then raise exception 'Ikke medlem'; end if;
  if not public.har_rett('oppgaver') and not exists (
    select 1 from public.oppgaver where id = p_id and lower(coalesce(tildelt, '')) = public.min_epost()
  ) then raise exception 'Du kan bare endre dine egne oppgaver'; end if;
  delete from public.oppgaver where forrige_id = p_id and not ferdig;
  update public.oppgaver set ferdig = false, ferdig_av = null, ferdig_tid = null where id = p_id;
end $$;

create or replace function public.pause_oppgave(p_id bigint, p_pause boolean, p_til date default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.har_rett('oppgaver') then raise exception 'Du har bare innsyn i oppgaver'; end if;
  if p_pause then
    update public.oppgaver set pauset = true, pauset_til = p_til where id = p_id;
  else
    update public.oppgaver set pauset = false, pauset_til = null,
      frist = case when gjentakelse <> 'ingen' and frist < (now() at time zone 'Europe/Oslo')::date
                   then public.neste_frist(frist, gjentakelse, dager) else frist end
      where id = p_id;
  end if;
end $$;
