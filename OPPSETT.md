# Oppsett av BraRyd familieplanlegger

Første utgave: ukeplan for middager med minne over hva dere har spist, middagsbibliotek med oppskriftslenker og ingredienser, felles handleliste med kategorier (oppdateres live hos alle), lagrede lister, Siri/HomePod-snarveier og ukens tilbud fra matkjedene.

Samme oppskrift som Alvøen-appen: Supabase (database) + GitHub Pages (nettsiden). Regn med ca. 40 minutter. Ingen programmering trengs.

---

## 1. Databasen (Supabase)

Lag et **eget prosjekt** for familien – ikke bruk Alvøen-prosjektet. Gratisplanen har plass til to prosjekter.

1. **supabase.com → New project**
   - Navn: `braryd`
   - Region: **Stockholm (eu-north-1)**
   - Lagre databasepassordet et trygt sted.
2. **SQL Editor → New query**: lim inn hele `supabase/schema.sql` og trykk **Run**. Du skal få «Success».
3. Ny spørring med familiemedlemmene (e-post og navnet som skal vises i appen), og **Run**:

   ```sql
   insert into public.medlemmer (email, navn) values
     ('jorgen.rydheim@gmail.com', 'Jørgen'),
     ('epost@til.kona', 'Navn'),
     ('epost@til.barna', 'Navn')
   on conflict do nothing;
   ```

## 2. Innlogging for hver person

1. **Authentication → Users → Add user → Create new user**
   - E-post og et passord, huk av **Auto Confirm User**
   - Gjør det for hver i familien (samme e-post som i steg 1).
2. **Authentication → Sign In / Providers** → slå av **Allow new users to sign up**.

Glemt passord: **Authentication → Users** → trykk på personen → sett nytt passord.

## 3. Serverfunksjonen (Siri og tilbud)

1. **Edge Functions → Deploy a new function → Via Editor**
   - Navn: `braryd` (nøyaktig dette)
   - Slett eksempelkoden, lim inn hele `supabase/functions/braryd/index.ts` og trykk **Deploy**.
2. Åpne funksjonen → **Details/Settings** og slå **av** «Enforce JWT verification». Lagre.
   - Funksjonen sjekker selv Siri-nøkkelen og om du er i familien.

Ingen hemmeligheter trengs. Tilbudene hentes fra Tjek (samme kilde som Mattilbud og eTilbudsavis), som ikke krever nøkkel.

## 4. Send meg to verdier

**Project Settings → API Keys**. Send meg:
- **Project URL** (`https://abcdefgh.supabase.co`)
- **Publishable key** (eller **anon public key**)

Begge er offentlige. **Ikke** send `service_role`/secret key. Jeg legger dem i `.env.production`.

## 5. GitHub og nettsiden

Koden ligger i GitHub-prosjektet `Jurgmaister/braryd-family`. Hver gang koden endres, bygges og publiseres appen automatisk.

1. På GitHub: åpne prosjektet → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Appen blir liggende på `https://jurgmaister.github.io/braryd-family/`.
   (Vil du heller ha eget domene, f.eks. `app.braryd.no`, legger vi inn en CNAME-fil og en DNS-peker som for Alvøen.)

Arbeidsflyten **Hent ukens tilbud** kjører hver morgen og fyller på tilbudene. Appen henter også selv hvis de er eldre enn 12 timer.

## 6. På telefonene

1. Åpne adressen i **Safari** → **Del → Legg til på Hjem-skjerm**. Åpne appen derfra og logg inn.
2. **Innstillinger** (tannhjulet): sjekk navnet ditt, og under **Tilbud** trykk **Bruk min posisjon** → velg avstand og kjeder → **Lagre og hent tilbud**. Standard er Bergen sentrum, 15 km.

---

## 7. Siri og HomePod

Hver person lager to snarveier på sin egen iPhone. Siri-nøkkelen og adressen finner du i appen under **Innstillinger → Siri og HomePod** (knappene **Kopier nøkkel** og **Kopier adresse**).

### Snarvei 1 – «Handleliste» (legge til varer)

Åpne **Snarveier**-appen → **+** → gi snarveien navnet **Handleliste**.

1. **Spør etter inndata** (Ask for Input) – type Tekst, spørsmål: «Hva skal på listen?»
2. **Hent innhold fra URL** (Get Contents of URL)
   - URL: adressen fra appen (slutter på `/functions/v1/braryd`)
   - Trykk pila → **Metode: POST**, **Forespørselsinnhold: JSON**
   - Legg til tre tekstfelt:
     - `action` = `siri-legg-til`
     - `nokkel` = nøkkelen din
     - `tekst` = variabelen **Gitt inndata** (Provided Input)
3. **Les tekst** (Speak Text) → **Innhold fra URL**

Bruk: «Hei Siri, handleliste» → «Melk og egg og to agurker». Siri svarer «La til melk, egg og agurker.» Varene får kategori automatisk.

### Snarvei 2 – «Hva skal vi handle» (lese opp listen)

1. **Hent innhold fra URL**: samme adresse, POST, JSON med `action` = `siri-les` og `nokkel` = nøkkelen din
2. **Les tekst** → **Innhold fra URL**

### HomePod

Snarveiene virker på HomePod når **Personlige forespørsler** er slått på: **Hjem-appen → HomePod-en → Innstillinger → Personlige forespørsler**, og telefonen er i nærheten på samme nett.

### Tips

- Si «og» mellom varene. Siri setter sjelden inn komma.
- Har dere en liste i Påminnelser som heter «Handleliste», kan Siri velge den i stedet. Gi i så fall snarveien et annet navn, f.eks. «BraRyd».
- Nøkkelen er personlig. Lag en ny under Innstillinger hvis en telefon blir borte, og oppdater snarveien.

---

## Slik virker det

**Ukeplan.** Trykk på en dag for å velge middag. Skriver du et nytt navn, lagres middagen i biblioteket. Hurtigvalg: Rester, Spiser ute, Takeaway, Pizzafredag. «Lenge siden sist» foreslår middager dere har hatt flere ganger, men ikke den siste måneden. Knappen nederst legger ingrediensene for resten av uka på handlelisten (hopper over det som allerede står der).

**Middager.** Alt dere har spist, med antall ganger og når sist. Hver middag kan ha lenke til oppskrift, ingredienser (én per linje), notat og favorittstjerne. Sorter på mest spist, sist spist, lenge siden, A–Å eller favoritter.

**Handleliste.** Skriv flere varer på en gang: «melk, 2 agurk og brød». Varene sorteres i kategorier i den rekkefølgen man går i butikken. Endrer du kategori på en vare, husker appen det neste gang. Trykk på sirkelen når varen er i kurven. Lagre-knappen øverst lagrer listen (f.eks. «Hyttetur»), og liste-knappen henter lagrede lister fram igjen. Varer som er på tilbud får et merke med laveste pris og kjede.

**Tilbud.** «På handlelisten» viser tilbud på varene dere skal kjøpe, billigst først. «Alle tilbud» lar deg søke og filtrere på kjede i alle kundeavisene i nærheten. Trykk på bildet for større visning, og på **+** for å legge varen på listen.

Kategoriene og stikkordene ligger i tabellene `kategorier` og `kategori_ord` i Supabase og kan endres der.
