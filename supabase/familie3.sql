-- BraRyd – oppgaver kan gis til flere personer.
-- Alle som har oppgaven får påminnelsene, og hvem som helst av dem kan krysse den av.
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run. Kjøres etter admin.sql.
-- Kan kjøres flere ganger uten å ødelegge data.

alter table public.oppgaver add column if not exists tildelte text[];
-- Flytt eksisterende tildelinger over (én person → liste med én person)
update public.oppgaver set tildelte = array[lower(tildelt)]
  where tildelt is not null and (tildelte is null or cardinality(tildelte) = 0);

-- Er innlogget bruker en av dem som har oppgaven?
create or replace function public.har_oppgaven(p_id bigint)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.oppgaver
    where id = p_id and (
      public.min_epost() = any (select lower(x) from unnest(coalesce(tildelte, '{}')) x)
      or lower(coalesce(tildelt, '')) = public.min_epost()
    )
  );
$$;

create or replace function public.fullfor_oppgave(p_id bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare o public.oppgaver; ny_id bigint;
begin
  if not public.er_medlem() then raise exception 'Ikke medlem'; end if;
  if not public.har_rett('oppgaver') and not public.har_oppgaven(p_id) then
    raise exception 'Du kan bare krysse av dine egne oppgaver';
  end if;
  update public.oppgaver set ferdig = true, ferdig_av = public.min_epost(), ferdig_tid = now()
    where id = p_id and not ferdig returning * into o;
  if o.id is null then return null; end if;
  if o.gjentakelse <> 'ingen' then
    insert into public.oppgaver (tittel, notat, tildelt, tildelte, frist, gjentakelse, dager, varsel, varsel_tid, forrige_id, opprettet_av)
      values (o.tittel, o.notat, o.tildelt, o.tildelte, public.neste_frist(o.frist, o.gjentakelse, o.dager), o.gjentakelse, o.dager,
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
  if not public.har_rett('oppgaver') and not public.har_oppgaven(p_id) then
    raise exception 'Du kan bare endre dine egne oppgaver';
  end if;
  delete from public.oppgaver where forrige_id = p_id and not ferdig;
  update public.oppgaver set ferdig = false, ferdig_av = null, ferdig_tid = null where id = p_id;
end $$;

grant execute on function public.har_oppgaven(bigint) to authenticated;
