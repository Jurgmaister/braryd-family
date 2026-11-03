-- BraRyd – kalenderaktiviteter kan gjelde flere personer.
-- Ingen personer = felles familiekalender. Alle personene får varslene.
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run. Kjøres etter familie3.sql.
-- Kan kjøres flere ganger uten å ødelegge data.

alter table public.hendelser add column if not exists eiere text[];
update public.hendelser set eiere = array[lower(eier)]
  where eier is not null and (eiere is null or cardinality(eiere) = 0);
