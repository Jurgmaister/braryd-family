-- BraRyd – «lagre som» for handlelister: husker hvilken lagret liste dere jobber i.
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run. Kan kjøres flere ganger.

alter table public.lagrede_lister add column if not exists oppdatert timestamptz not null default now();
alter table public.innstillinger add column if not exists aktiv_liste_id bigint
  references public.lagrede_lister(id) on delete set null;
