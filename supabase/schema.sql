-- BraRyd familieplanlegger – databaseoppsett
-- Lim inn hele filen i Supabase: SQL Editor → New query → Run.
-- Kan kjøres på nytt uten å ødelegge data.

create extension if not exists pgcrypto;

-- ---------- Familiemedlemmer ----------
-- Medlemmer legges inn i en egen spørring etter denne filen (se OPPSETT.md, steg 1),
-- slik at e-postadresser ikke ligger i koden.
create table if not exists public.medlemmer (
  email text primary key,
  navn text not null,
  farge text not null default '#2F5D50'
);

create or replace function public.er_medlem()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.medlemmer
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.min_epost()
returns text language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')); $$;

-- ---------- Siri-nøkler (én per person, brukes av snarveiene) ----------
create table if not exists public.siri_nokler (
  email text primary key references public.medlemmer(email) on delete cascade,
  nokkel uuid not null unique default gen_random_uuid(),
  opprettet timestamptz not null default now()
);

-- Henter (eller lager) min egen Siri-nøkkel.
create or replace function public.min_siri_nokkel()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare k uuid; e text := public.min_epost();
begin
  if not public.er_medlem() then raise exception 'Ikke medlem'; end if;
  select nokkel into k from public.siri_nokler where lower(email) = e;
  if k is null then
    insert into public.siri_nokler (email)
      select email from public.medlemmer where lower(email) = e
      returning nokkel into k;
  end if;
  return k;
end $$;

-- Lager en ny nøkkel (den gamle slutter å virke).
create or replace function public.ny_siri_nokkel()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare k uuid; e text := public.min_epost();
begin
  if not public.er_medlem() then raise exception 'Ikke medlem'; end if;
  delete from public.siri_nokler where lower(email) = e;
  return public.min_siri_nokkel();
end $$;

-- ---------- Kategorier i handlelisten (i den rekkefølgen man går i butikken) ----------
create table if not exists public.kategorier (
  navn text primary key,
  rekkefolge int not null,
  emoji text not null default ''
);

insert into public.kategorier (navn, rekkefolge, emoji) values
  ('Frukt og grønt', 10, '🥦'),
  ('Brød og bakeri', 20, '🍞'),
  ('Kjøtt og kylling', 30, '🥩'),
  ('Fisk og sjømat', 40, '🐟'),
  ('Pålegg', 50, '🧀'),
  ('Meieri og egg', 60, '🥛'),
  ('Ferdigmat og kjøl', 70, '🥡'),
  ('Frysevarer', 80, '🧊'),
  ('Pasta, ris og tørrvarer', 90, '🍝'),
  ('Hermetikk og sauser', 100, '🥫'),
  ('Krydder og baking', 110, '🧂'),
  ('Frokost', 120, '🥣'),
  ('Snacks og godteri', 130, '🍫'),
  ('Drikke', 140, '🧃'),
  ('Husholdning', 150, '🧻'),
  ('Hygiene og helse', 160, '🧴'),
  ('Dyr', 170, '🐕'),
  ('Annet', 999, '🛒')
on conflict (navn) do nothing;

-- Stikkord som gir kategori automatisk (lengste treff vinner).
create table if not exists public.kategori_ord (
  ord text primary key,
  kategori text not null references public.kategorier(navn) on update cascade on delete cascade
);

insert into public.kategori_ord (ord, kategori) values
  -- Frukt og grønt
  ('eple','Frukt og grønt'),('epler','Frukt og grønt'),('banan','Frukt og grønt'),('pære','Frukt og grønt'),('appelsin','Frukt og grønt'),
  ('klementin','Frukt og grønt'),('sitron','Frukt og grønt'),('lime','Frukt og grønt'),('drue','Frukt og grønt'),('jordbær','Frukt og grønt'),
  ('blåbær','Frukt og grønt'),('bringebær','Frukt og grønt'),('melon','Frukt og grønt'),('ananas','Frukt og grønt'),('mango','Frukt og grønt'),
  ('kiwi','Frukt og grønt'),('avokado','Frukt og grønt'),('tomat','Frukt og grønt'),('agurk','Frukt og grønt'),('paprika','Frukt og grønt'),
  ('salat','Frukt og grønt'),('isberg','Frukt og grønt'),('spinat','Frukt og grønt'),('ruccola','Frukt og grønt'),('løk','Frukt og grønt'),
  ('rødløk','Frukt og grønt'),('vårløk','Frukt og grønt'),('purre','Frukt og grønt'),('hvitløk','Frukt og grønt'),('gulrot','Frukt og grønt'),
  ('gulrøtter','Frukt og grønt'),('potet','Frukt og grønt'),('poteter','Frukt og grønt'),('søtpotet','Frukt og grønt'),('brokkoli','Frukt og grønt'),
  ('blomkål','Frukt og grønt'),('kål','Frukt og grønt'),('squash','Frukt og grønt'),('aubergine','Frukt og grønt'),('sopp','Frukt og grønt'),
  ('champignon','Frukt og grønt'),('mais','Frukt og grønt'),('sukkererter','Frukt og grønt'),('selleri','Frukt og grønt'),('kålrot','Frukt og grønt'),
  ('ingefær','Frukt og grønt'),('chili','Frukt og grønt'),('basilikum','Frukt og grønt'),('persille','Frukt og grønt'),('koriander','Frukt og grønt'),
  ('gressløk','Frukt og grønt'),('dill','Frukt og grønt'),('urter','Frukt og grønt'),('frukt','Frukt og grønt'),('grønnsaker','Frukt og grønt'),
  -- Brød og bakeri
  ('brød','Brød og bakeri'),('loff','Brød og bakeri'),('rundstykker','Brød og bakeri'),('baguett','Brød og bakeri'),('ciabatta','Brød og bakeri'),
  ('lomper','Brød og bakeri'),('lefse','Brød og bakeri'),('tortilla','Brød og bakeri'),('wraps','Brød og bakeri'),('pølsebrød','Brød og bakeri'),
  ('hamburgerbrød','Brød og bakeri'),('knekkebrød','Brød og bakeri'),('flatbrød','Brød og bakeri'),('pita','Brød og bakeri'),('naan','Brød og bakeri'),
  ('boller','Brød og bakeri'),('skillingsbolle','Brød og bakeri'),('kake','Brød og bakeri'),('rundstykke','Brød og bakeri'),('polarbrød','Brød og bakeri'),
  -- Kjøtt og kylling
  ('kjøttdeig','Kjøtt og kylling'),('karbonadedeig','Kjøtt og kylling'),('kylling','Kjøtt og kylling'),('kyllingfilet','Kjøtt og kylling'),
  ('kyllinglår','Kjøtt og kylling'),('svinekjøtt','Kjøtt og kylling'),('koteletter','Kjøtt og kylling'),('svinefilet','Kjøtt og kylling'),
  ('indrefilet','Kjøtt og kylling'),('entrecote','Kjøtt og kylling'),('biff','Kjøtt og kylling'),('ytrefilet','Kjøtt og kylling'),
  ('pølser','Kjøtt og kylling'),('pølse','Kjøtt og kylling'),('grillpølser','Kjøtt og kylling'),('wienerpølser','Kjøtt og kylling'),
  ('bacon','Kjøtt og kylling'),('kjøttboller','Kjøtt og kylling'),('kjøttkaker','Kjøtt og kylling'),('karbonader','Kjøtt og kylling'),
  ('hamburger','Kjøtt og kylling'),('lam','Kjøtt og kylling'),('lammekjøtt','Kjøtt og kylling'),('ribbe','Kjøtt og kylling'),
  ('pinnekjøtt','Kjøtt og kylling'),('svinenakke','Kjøtt og kylling'),('kalkun','Kjøtt og kylling'),('strimlet','Kjøtt og kylling'),
  ('kjøtt','Kjøtt og kylling'),('kebab','Kjøtt og kylling'),('chorizo','Kjøtt og kylling'),('pulled pork','Kjøtt og kylling'),
  -- Fisk og sjømat
  ('laks','Fisk og sjømat'),('ørret','Fisk og sjømat'),('torsk','Fisk og sjømat'),('sei','Fisk og sjømat'),('hyse','Fisk og sjømat'),
  ('fiskekaker','Fisk og sjømat'),('fiskeboller','Fisk og sjømat'),('fiskepinner','Fisk og sjømat'),('fiskegrateng','Fisk og sjømat'),
  ('reker','Fisk og sjømat'),('scampi','Fisk og sjømat'),('tunfisk','Fisk og sjømat'),('makrell','Fisk og sjømat'),('sild','Fisk og sjømat'),
  ('fisk','Fisk og sjømat'),('skrei','Fisk og sjømat'),('kveite','Fisk og sjømat'),('blåskjell','Fisk og sjømat'),('krabbe','Fisk og sjømat'),
  ('røkelaks','Fisk og sjømat'),('fiskeburger','Fisk og sjømat'),
  -- Pålegg
  ('pålegg','Pålegg'),('skinke','Pålegg'),('salami','Pålegg'),('servelat','Pålegg'),('kalkunpålegg','Pålegg'),('leverpostei','Pålegg'),
  ('postei','Pålegg'),('makrell i tomat','Pålegg'),('kaviar','Pålegg'),('syltetøy','Pålegg'),('nugatti','Pålegg'),('peanøttsmør','Pålegg'),
  ('brunost','Pålegg'),('gulost','Pålegg'),('hvitost','Pålegg'),('norvegia','Pålegg'),('jarlsberg','Pålegg'),('smøreost','Pålegg'),
  ('ost','Pålegg'),('mozzarella','Pålegg'),('parmesan','Pålegg'),('fetaost','Pålegg'),('revet ost','Pålegg'),('honning','Pålegg'),('hummus','Pålegg'),
  -- Meieri og egg
  ('melk','Meieri og egg'),('lettmelk','Meieri og egg'),('helmelk','Meieri og egg'),('skummet','Meieri og egg'),('havremelk','Meieri og egg'),
  ('fløte','Meieri og egg'),('matfløte','Meieri og egg'),('kremfløte','Meieri og egg'),('rømme','Meieri og egg'),('lettrømme','Meieri og egg'),
  ('crème fraîche','Meieri og egg'),('creme fraiche','Meieri og egg'),('yoghurt','Meieri og egg'),('kesam','Meieri og egg'),('kefir','Meieri og egg'),
  ('cottage cheese','Meieri og egg'),('kulturmelk','Meieri og egg'),('smør','Meieri og egg'),('margarin','Meieri og egg'),('bremykt','Meieri og egg'),
  ('egg','Meieri og egg'),('skyr','Meieri og egg'),('biola','Meieri og egg'),('go morgen','Meieri og egg'),
  -- Ferdigmat og kjøl
  ('ferdigmat','Ferdigmat og kjøl'),('pizza','Ferdigmat og kjøl'),('lasagne','Ferdigmat og kjøl'),('pastasalat','Ferdigmat og kjøl'),
  ('potetsalat','Ferdigmat og kjøl'),('ferdigdeig','Ferdigmat og kjøl'),('pizzadeig','Ferdigmat og kjøl'),('tofu','Ferdigmat og kjøl'),
  ('sushi','Ferdigmat og kjøl'),('grandiosa','Ferdigmat og kjøl'),('fersk pasta','Ferdigmat og kjøl'),('dressing','Ferdigmat og kjøl'),
  -- Frysevarer
  ('frossen','Frysevarer'),('frosne','Frysevarer'),('frys','Frysevarer'),('is','Frysevarer'),('iskrem','Frysevarer'),('pommes frites','Frysevarer'),
  ('pommes','Frysevarer'),('wok','Frysevarer'),('frosne grønnsaker','Frysevarer'),('frosne bær','Frysevarer'),
  -- Pasta, ris og tørrvarer
  ('pasta','Pasta, ris og tørrvarer'),('spagetti','Pasta, ris og tørrvarer'),('spaghetti','Pasta, ris og tørrvarer'),('makaroni','Pasta, ris og tørrvarer'),
  ('penne','Pasta, ris og tørrvarer'),('fusilli','Pasta, ris og tørrvarer'),('lasagneplater','Pasta, ris og tørrvarer'),('nudler','Pasta, ris og tørrvarer'),
  ('ris','Pasta, ris og tørrvarer'),('jasminris','Pasta, ris og tørrvarer'),('basmatiris','Pasta, ris og tørrvarer'),('couscous','Pasta, ris og tørrvarer'),
  ('bulgur','Pasta, ris og tørrvarer'),('linser','Pasta, ris og tørrvarer'),('taco','Pasta, ris og tørrvarer'),('tacoskjell','Pasta, ris og tørrvarer'),
  ('tacokrydder','Pasta, ris og tørrvarer'),('nachos','Pasta, ris og tørrvarer'),('tortillachips','Pasta, ris og tørrvarer'),('potetmos','Pasta, ris og tørrvarer'),
  ('nøtter','Pasta, ris og tørrvarer'),('rosiner','Pasta, ris og tørrvarer'),('posesuppe','Pasta, ris og tørrvarer'),('suppe','Pasta, ris og tørrvarer'),
  -- Hermetikk og sauser
  ('hermetikk','Hermetikk og sauser'),('hakkede tomater','Hermetikk og sauser'),('tomatpuré','Hermetikk og sauser'),('passata','Hermetikk og sauser'),
  ('bønner','Hermetikk og sauser'),('kikerter','Hermetikk og sauser'),('kokosmelk','Hermetikk og sauser'),('ketchup','Hermetikk og sauser'),
  ('sennep','Hermetikk og sauser'),('majones','Hermetikk og sauser'),('mayo','Hermetikk og sauser'),('remulade','Hermetikk og sauser'),
  ('salsa','Hermetikk og sauser'),('tacosaus','Hermetikk og sauser'),('soyasaus','Hermetikk og sauser'),('pesto','Hermetikk og sauser'),
  ('pastasaus','Hermetikk og sauser'),('saus','Hermetikk og sauser'),('buljong','Hermetikk og sauser'),('kraft','Hermetikk og sauser'),
  ('sweet chili','Hermetikk og sauser'),('oliven','Hermetikk og sauser'),('mais på boks','Hermetikk og sauser'),('olje','Hermetikk og sauser'),
  ('olivenolje','Hermetikk og sauser'),('rapsolje','Hermetikk og sauser'),('eddik','Hermetikk og sauser'),('brun saus','Hermetikk og sauser'),
  -- Krydder og baking
  ('salt','Krydder og baking'),('pepper','Krydder og baking'),('krydder','Krydder og baking'),('paprikapulver','Krydder og baking'),('karri','Krydder og baking'),
  ('kanel','Krydder og baking'),('oregano','Krydder og baking'),('timian','Krydder og baking'),('mel','Krydder og baking'),('hvetemel','Krydder og baking'),
  ('sukker','Krydder og baking'),('melis','Krydder og baking'),('gjær','Krydder og baking'),('bakepulver','Krydder og baking'),('natron','Krydder og baking'),
  ('vaniljesukker','Krydder og baking'),('kakao','Krydder og baking'),('kokesjokolade','Krydder og baking'),('sirup','Krydder og baking'),('maizena','Krydder og baking'),
  -- Frokost
  ('havregryn','Frokost'),('frokostblanding','Frokost'),('müsli','Frokost'),('musli','Frokost'),('granola','Frokost'),('cornflakes','Frokost'),
  ('cheerios','Frokost'),('kaffe','Frokost'),('te','Frokost'),('kakaopulver','Frokost'),('o''boy','Frokost'),('havrefras','Frokost'),
  -- Snacks og godteri
  ('chips','Snacks og godteri'),('potetgull','Snacks og godteri'),('sjokolade','Snacks og godteri'),('godteri','Snacks og godteri'),('godis','Snacks og godteri'),
  ('smågodt','Snacks og godteri'),('kjeks','Snacks og godteri'),('popcorn','Snacks og godteri'),('dip','Snacks og godteri'),('saltstenger','Snacks og godteri'),
  ('snacks','Snacks og godteri'),('seigmenn','Snacks og godteri'),('twist','Snacks og godteri'),('pastiller','Snacks og godteri'),('tyggegummi','Snacks og godteri'),('kvikk lunsj','Snacks og godteri'),
  -- Drikke
  ('juice','Drikke'),('appelsinjuice','Drikke'),('eplejuice','Drikke'),('saft','Drikke'),('brus','Drikke'),('cola','Drikke'),('pepsi','Drikke'),
  ('solo','Drikke'),('farris','Drikke'),('mineralvann','Drikke'),('vann','Drikke'),('øl','Drikke'),('alkoholfri','Drikke'),('energidrikk','Drikke'),
  ('smoothie','Drikke'),('iste','Drikke'),('sportsdrikk','Drikke'),
  -- Husholdning
  ('dopapir','Husholdning'),('toalettpapir','Husholdning'),('tørkerull','Husholdning'),('kjøkkenrull','Husholdning'),('servietter','Husholdning'),
  ('oppvaskmiddel','Husholdning'),('oppvasktabletter','Husholdning'),('maskinoppvask','Husholdning'),('vaskemiddel','Husholdning'),('tøymykner','Husholdning'),
  ('søppelposer','Husholdning'),('søppelsekker','Husholdning'),('bæreposer','Husholdning'),('plastfolie','Husholdning'),('aluminiumsfolie','Husholdning'),
  ('bakepapir','Husholdning'),('fryseposer','Husholdning'),('zip','Husholdning'),('svamp','Husholdning'),('klut','Husholdning'),('batterier','Husholdning'),
  ('lyspærer','Husholdning'),('stearinlys','Husholdning'),('telys','Husholdning'),('grillkull','Husholdning'),('rengjøring','Husholdning'),('zalo','Husholdning'),
  -- Hygiene og helse
  ('tannkrem','Hygiene og helse'),('tannbørste','Hygiene og helse'),('sjampo','Hygiene og helse'),('shampoo','Hygiene og helse'),('balsam','Hygiene og helse'),
  ('såpe','Hygiene og helse'),('dusjsåpe','Hygiene og helse'),('deodorant','Hygiene og helse'),('deo','Hygiene og helse'),('barberblad','Hygiene og helse'),
  ('bind','Hygiene og helse'),('tamponger','Hygiene og helse'),('plaster','Hygiene og helse'),('paracet','Hygiene og helse'),('ibux','Hygiene og helse'),
  ('solkrem','Hygiene og helse'),('bomullspads','Hygiene og helse'),('q-tips','Hygiene og helse'),('vitaminer','Hygiene og helse'),('tran','Hygiene og helse'),
  ('bleier','Hygiene og helse'),('våtservietter','Hygiene og helse'),
  -- Dyr
  ('hundemat','Dyr'),('hundefôr','Dyr'),('tørrfôr','Dyr'),('fôr','Dyr'),('hundegodbit','Dyr'),('godbiter','Dyr'),('tyggeben','Dyr'),('bæsjeposer','Dyr'),('kattemat','Dyr')
on conflict (ord) do nothing;

-- Det familien selv har valgt for en vare (lærer av endringer i appen).
create table if not exists public.kategori_minne (
  navn text primary key,            -- normalisert (små bokstaver, trimmet)
  kategori text not null references public.kategorier(navn) on update cascade on delete cascade,
  oppdatert timestamptz not null default now()
);

create or replace function public.gjett_kategori(p_navn text)
returns text
language sql stable security definer set search_path = public
as $$
  with n as (select lower(trim(regexp_replace(coalesce(p_navn, ''), '\s+', ' ', 'g'))) as v)
  select coalesce(
    (select kategori from public.kategori_minne, n where navn = n.v),
    (select k.kategori from public.kategori_ord k, n
       where (' ' || n.v || ' ') like ('% ' || k.ord || '%')   -- ordet starter et ord i varenavnet
          or (length(k.ord) >= 5 and n.v like ('%' || k.ord || '%'))  -- lengre ord: også inni sammensatte ord
       order by length(k.ord) desc limit 1),
    'Annet'
  );
$$;

-- ---------- Handleliste ----------
create table if not exists public.handleliste (
  id bigint generated always as identity primary key,
  navn text not null,
  antall text not null default '',
  kategori text references public.kategorier(navn) on update cascade on delete set null,
  kjopt boolean not null default false,
  kjopt_tid timestamptz,
  lagt_til_av text,                 -- e-post
  kilde text not null default 'app' check (kilde in ('app', 'siri', 'middag', 'tilbud', 'lagret')),
  opprettet timestamptz not null default now()
);
create index if not exists handleliste_kjopt_idx on public.handleliste (kjopt, kategori);

create or replace function public.handleliste_for_lagring()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.navn := trim(new.navn);
  if new.kategori is null or new.kategori = '' then
    new.kategori := public.gjett_kategori(new.navn);
  end if;
  if tg_op = 'INSERT' and new.lagt_til_av is null then
    new.lagt_til_av := nullif(public.min_epost(), '');
  end if;
  if new.kjopt and (tg_op = 'INSERT' or not old.kjopt) then new.kjopt_tid := now(); end if;
  if not new.kjopt then new.kjopt_tid := null; end if;
  return new;
end $$;

drop trigger if exists handleliste_for_lagring on public.handleliste;
create trigger handleliste_for_lagring before insert or update on public.handleliste
  for each row execute function public.handleliste_for_lagring();

-- Lagrede handlelister (maler som «Fredagstaco» eller «Hytteturen»)
create table if not exists public.lagrede_lister (
  id bigint generated always as identity primary key,
  navn text not null,
  varer jsonb not null default '[]'::jsonb,   -- [{navn, antall, kategori}]
  opprettet_av text default public.min_epost(),
  opprettet timestamptz not null default now()
);

-- ---------- Middager ----------
create table if not exists public.middager (
  id bigint generated always as identity primary key,
  navn text not null,
  oppskrift_url text not null default '',
  ingredienser text not null default '',      -- én vare per linje
  notat text not null default '',
  favoritt boolean not null default false,
  opprettet_av text default public.min_epost(),
  opprettet timestamptz not null default now()
);
create unique index if not exists middager_navn_idx on public.middager (lower(navn));

create table if not exists public.middagsplan (
  dato date primary key,
  middag_id bigint references public.middager(id) on delete set null,
  tekst text not null default '',             -- brukes hvis det ikke er en lagret middag (f.eks. «Rester»)
  notat text not null default '',
  lagt_inn_av text default public.min_epost(),
  oppdatert timestamptz not null default now()
);
create index if not exists middagsplan_middag_idx on public.middagsplan (middag_id);

-- Hvor ofte og når vi sist hadde hver middag
create or replace view public.middag_statistikk
with (security_invoker = true)
as
  select m.id,
         count(p.dato) filter (where p.dato <= current_date) as antall,
         max(p.dato) filter (where p.dato <= current_date) as sist,
         min(p.dato) filter (where p.dato > current_date) as neste
  from public.middager m
  left join public.middagsplan p on p.middag_id = m.id
  group by m.id;

-- ---------- Tilbud (fylles av funksjonen «braryd») ----------
create table if not exists public.tilbud (
  id text primary key,
  kjede text not null,
  tittel text not null,
  beskrivelse text not null default '',
  pris numeric,
  forpris numeric,
  enhetspris text not null default '',
  bilde text not null default '',
  bilde_stor text not null default '',
  gyldig_fra timestamptz,
  gyldig_til timestamptz,
  katalog_id text,
  katalog_side int,
  hentet timestamptz not null default now()
);
create index if not exists tilbud_kjede_idx on public.tilbud (kjede);

-- ---------- Innstillinger ----------
create table if not exists public.innstillinger (
  id int primary key default 1 check (id = 1),
  lat double precision not null default 60.3913,     -- Bergen sentrum; endres i appen
  lng double precision not null default 5.3221,
  radius_km int not null default 15,
  kjeder text[] not null default array[
    'REMA 1000','KIWI','MENY','Extra','Coop Prix','Coop Mega','Obs','Coop Marked',
    'SPAR','Eurospar','Joker','Bunnpris','Nærbutikken','Matkroken','Coop'
  ],
  tilbud_hentet timestamptz,
  tilbud_status text not null default ''
);
insert into public.innstillinger (id) values (1) on conflict do nothing;

-- ---------- Tilgang (RLS): bare familiemedlemmer ----------
alter table public.medlemmer enable row level security;
alter table public.siri_nokler enable row level security;
alter table public.kategorier enable row level security;
alter table public.kategori_ord enable row level security;
alter table public.kategori_minne enable row level security;
alter table public.handleliste enable row level security;
alter table public.lagrede_lister enable row level security;
alter table public.middager enable row level security;
alter table public.middagsplan enable row level security;
alter table public.tilbud enable row level security;
alter table public.innstillinger enable row level security;

do $$
declare t text;
begin
  -- Lesing for alle medlemmer
  foreach t in array array['medlemmer','kategorier','kategori_ord','kategori_minne','handleliste','lagrede_lister','middager','middagsplan','tilbud','innstillinger'] loop
    execute format('drop policy if exists "medlem leser" on public.%I', t);
    execute format('create policy "medlem leser" on public.%I for select to authenticated using (public.er_medlem())', t);
  end loop;
  -- Skriving for alle medlemmer (tilbud skrives bare av funksjonen)
  foreach t in array array['kategori_minne','handleliste','lagrede_lister','middager','middagsplan','kategorier'] loop
    execute format('drop policy if exists "medlem skriver" on public.%I', t);
    execute format('create policy "medlem skriver" on public.%I for all to authenticated using (public.er_medlem()) with check (public.er_medlem())', t);
  end loop;
end $$;

drop policy if exists "medlem endrer innstillinger" on public.innstillinger;
create policy "medlem endrer innstillinger" on public.innstillinger
  for update to authenticated using (public.er_medlem()) with check (public.er_medlem());

drop policy if exists "medlem endrer eget navn" on public.medlemmer;
create policy "medlem endrer eget navn" on public.medlemmer
  for update to authenticated using (lower(email) = public.min_epost()) with check (lower(email) = public.min_epost());

grant execute on function public.min_siri_nokkel() to authenticated;
grant execute on function public.ny_siri_nokkel() to authenticated;
grant execute on function public.gjett_kategori(text) to authenticated;
revoke execute on function public.min_siri_nokkel() from anon;
revoke execute on function public.ny_siri_nokkel() from anon;

-- ---------- Sanntid: endringer i handlelisten og middagsplanen vises med en gang hos alle ----------
do $$
begin
  begin alter publication supabase_realtime add table public.handleliste; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.middagsplan; exception when duplicate_object then null; end;
end $$;
alter table public.handleliste replica identity full;
