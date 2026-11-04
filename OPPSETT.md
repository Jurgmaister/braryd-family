# Oppsett av BraRyd familieplanlegger

Ukeplan for middager med minne over hva dere har spist, middagsbibliotek med oppskriftslenker og ingredienser, felles handleliste med kategorier (oppdateres live hos alle), lagrede lister, Siri/HomePod-snarveier og dagens priser per kjede fra Kassalapp.

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
2. Åpne funksjonen → **Details/Settings** og slå **av** «Verify JWT» / «Enforce JWT verification». Lagre.
   - Merk: å endre navnet senere endrer ikke adressen. Har funksjonen fått en annen adresse (slug), legg den inn som `VITE_FUNCTION_NAME` i `.env.production`.
   - Funksjonen sjekker selv Siri-nøkkelen og om du er i familien.

3. **Kassalapp-nøkkel (for priser):** lag en gratis API-nøkkel på **kassal.app/api**. I Supabase: **Edge Functions → Secrets → Add new secret**, navn `KASSALAPP_API_KEY`, verdi = nøkkelen. Nøkkelen er hemmelig og skal bare ligge her, ikke i koden.

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


## 6. På telefonene

1. Åpne adressen i **Safari** → **Del → Legg til på Hjem-skjerm**. Åpne appen derfra og logg inn.
2. **Innstillinger** (tannhjulet): sjekk navnet ditt, og velg under **Priser** hvilke kjeder dere handler i.

---

## 7. Siri og HomePod

Hver person lager to snarveier på sin egen iPhone. Siri-nøkkelen og adressen finner du i appen under **Innstillinger → Siri og HomePod** (knappene **Kopier nøkkel** og **Kopier adresse**).

### Snarvei 1 – «Handleliste» (legge til varer)

Åpne **Snarveier**-appen → **+** → gi snarveien navnet **Handleliste**.

1. **Spør etter inndata** (Ask for Input) – type Tekst, spørsmål: «Hva skal på listen?»
2. **Hent innhold fra URL** (Get Contents of URL)
   - URL: adressen fra appen (slutter på `/functions/v1/` og navnet på funksjonen)
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

**Handleliste.** Én vare om gangen – komma kan brukes i navnet («Ost, revet»). Flere på en gang skilles med semikolon: «melk; 2 agurk; brød». Varene sorteres i kategorier i den rekkefølgen man går i butikken. Endrer du kategori på en vare, husker appen det neste gang. Trykk på sirkelen når varen er i kurven. Liste-knappen øverst henter fram lagrede lister (f.eks. «Fast ukehandel»), og appen husker da hvilken liste dere jobber i. Lagre-knappen har en meny: oppdater den listen dere er i, en annen lagret liste, eller lagre som ny liste. Alt som står på listen lagres, også det som ligger i kurven. Hver vare viser de tre billigste kjedene i dag, med rødt ved prisfall.

**Priser.** Dagens priser fra Kassalapp (nettbutikkenes priser). «Handlelisten» viser hva hele listen koster i hver kjede, varer med prisfall de siste ukene, og de billigste kjedene per vare (sammenlignet på kilo- eller literpris når den finnes). «Søk» finner en vare på tvers av kjedene. Prisene mellomlagres i 12 timer, og oppdater-knappen henter på nytt. Ukens kundeaviser er ikke med.

Kategoriene og stikkordene ligger i tabellene `kategorier` og `kategori_ord` i Supabase og kan endres der.

---

## Bytte fra tilbud (Tjek) til priser (Kassalapp)

Gjelder hvis du satte opp appen før priser kom inn:

1. **SQL Editor → New query**: lim inn hele `supabase/priser.sql` og **Run**.
2. **Edge Functions → Secrets**: legg til `KASSALAPP_API_KEY` med nøkkelen fra kassal.app/api.
3. **Edge Functions → braryd → Code**: erstatt koden med hele `supabase/functions/braryd/index.ts` og trykk **Deploy**. «Verify JWT» skal fortsatt være av.

## Lagre som (oppdatere lagrede lister)

Kjør `supabase/lagrede_lister.sql` én gang i **SQL Editor → New query → Run**. Da husker appen for hele familien hvilken lagret liste dere jobber i. Uten den virker «lagre som» likevel, men hver telefon husker det for seg.

---

## Oppgaver, kalender og push-varsler

1. **SQL Editor → New query**: lim inn hele `supabase/familie.sql` og **Run**.
2. **Edge Functions → Secrets**: legg inn `VAPID_PUBLIC_KEY` og `VAPID_PRIVATE_KEY` fra nøkkelfilen (BraRyd-push-nokler-HEMMELIG.txt). Filen skal ikke i GitHub.
3. **Edge Functions → braryd → Code**: erstatt koden med hele `supabase/functions/braryd/index.ts` og **Deploy**. «Verify JWT» skal fortsatt være av.
4. På hver telefon: åpne BraRyd fra Hjem-skjermen → **Innstillinger → Varsler på denne telefonen → Slå på varsler** → **Send testvarsel**.

Arbeidsflyten **Send varsler** på GitHub kaller funksjonen hvert kvarter. GitHub kan forsinke den med 5–20 minutter, så varsler kommer omtrent til tiden.

**Oppgaver.** Gi en oppgave til en person eller «hvem som helst», med frist og gjentakelse (engangs, hver dag, hver uke, annenhver uke, hver måned). Når en fast oppgave krysses av, kommer den tilbake med ny frist. Den som får en oppgave av noen andre får push. Kl. 07 får den ansvarlige varsel om oppgaver med frist i dag, og kl. 08 dagen etter fristen kommer varsel hvis den ikke er gjort (oppgaver uten ansvarlig varsler alle).

**Kalender.** Felles familiekalender og én per person, med filter øverst. Avtaler, treninger (gjerne ukentlig), bursdager (årlig, viser alder hvis fødselsår er lagt inn) og flerdagers hendelser. Push-varsel før start, eller for heldagshendelser og bursdager kl. 08 samme dag / kl. 18 dagen før / en uke før. Bursdager varsles til hele familien, personlige hendelser til den det gjelder.

**Melding.** Bjella øverst sender en push-melding til hele familien eller én person.

---

## Ukedager, påminnelser, pause og flere varsler

Kjør `supabase/familie2.sql` i **SQL Editor → New query → Run**, og oppdater funksjonen (**Edge Functions → braryd → Code**, lim inn `supabase/functions/braryd/index.ts`, **Deploy**).

- **Oppgaver på bestemte ukedager:** velg «Bestemte ukedager» og trykk dagene (eller «Hverdager»/«Helg»). Neste frist blir neste valgte dag.
- **Push-påminnelse:** slå av/på per oppgave og velg klokkeslett. Varsel kommer på fristdagen, og igjen dagen etter hvis den ikke er gjort.
- **Pause:** åpne oppgaven → «Sett på pause», eventuelt til en dato. Oppgaven flyttes til «På pause» og sender ingen varsler. Starter den igjen (selv eller på datoen), flyttes en passert frist til neste gang.
- **Flere varsler i kalenderen:** inntil tre push-varsler per hendelse. Bursdager får som standard samme dag kl. 08, dagen før kl. 18 og en uke før kl. 08.

---

## Admin og tilganger

Kjør `supabase/admin.sql` i **SQL Editor → New query → Run** (etter `familie2.sql`), og oppdater funksjonen (**Edge Functions → braryd → Code**, lim inn `supabase/functions/braryd/index.ts`, **Deploy**).

`admin.sql` gjør `jorgen.rydheim@gmail.com` til admin. Admin finner **Admin** under **Innstillinger**:

- **Tilganger per person:** sende push-meldinger, endre oppgaver, kalender, middager og handleliste. Av = kun innsyn i den delen. Tilgangen sjekkes i databasen, så den gjelder uansett hvordan man prøver å endre (også Siri for handlelisten). Oppgaver som er gitt til personen selv kan alltid krysses av.
- **Nytt passord:** sett et nytt passord for en person (eller trykk «Lag et»). Har personen ikke innlogging ennå, blir den laget.

Nye familiemedlemmer legges fortsatt inn i `medlemmer`-tabellen (steg 1). De får alle tilganger til admin skrur av.

---

## Flere personer på én oppgave

Kjør `supabase/familie3.sql` i **SQL Editor → New query → Run** (etter `admin.sql`), og oppdater funksjonen (**Edge Functions → braryd → Code**, lim inn `supabase/functions/braryd/index.ts`, **Deploy**).

Under «Hvem» kan du nå velge flere. Alle får varsel når de får oppgaven, og alle får påminnelsene. Når én av dem krysser av, er oppgaven gjort for alle (og faste oppgaver kommer tilbake til de samme personene). Eksisterende oppgaver beholder personen de hadde.

---

## Flere personer på én kalenderaktivitet

Kjør `supabase/familie4.sql` i **SQL Editor → New query → Run** (etter `familie3.sql`), og oppdater funksjonen (**Edge Functions → braryd → Code**, lim inn `supabase/functions/braryd/index.ts`, **Deploy**).

Under «Hvem gjelder det» kan du velge flere personer, eller «Hele familien». De som legges til får push med en gang, og alle får påminnelsene. Aktiviteten vises i kalenderen til hver av dem (filteret øverst), med en fargestrek per person.

---

## Riktigere varer og anbefalt butikk

Oppdater funksjonen (**Edge Functions → braryd → Code**, lim inn `supabase/functions/braryd/index.ts`, **Deploy**). Ingen SQL denne gangen. Prisene hentes på nytt automatisk første gang.

- **Riktig vare før billigste:** søkeordet må stå som eget ord eller sist i et ord («Kremfløte» for fløte), ikke først («Fløtesaus»). Babymat, sauser, snacks, dyremat og lignende tas bort når det finnes vanlige varer, og varer i en annen kategori enn flertallet (f.eks. «Barnemat» når du søker bananer) filtreres bort. Noen vanlige ord søkes bredere (fløte → kremfløte/matfløte, melk → lett-/helmelk, ost → Norvegia/Jarlsberg/hvitost).
- **Rettferdig sammenligning:** når pakningene er ulike store, sammenlignes og vises kilo-/literpris (f.eks. «KIWI 98,75/kg»), ellers hyllepris.
- **Anbefalt butikk** øverst i handlelisten: billigste butikk for hele listen, eller to butikker hvis det sparer minst 15 kr / 5 %. Trykk på kortet for å se hvilke varer som kjøpes hvor.
- **Samme vare i alle kjeder:** finnes den mest relevante varen (samme strekkode/EAN) i minst tre kjeder, sammenlignes akkurat den, så prisnivået blir rettferdig (f.eks. Gilde Kjøttdeig 400 g i alle). Kjeder som ikke har varen vises som «har ikke akkurat denne varen» med sitt nærmeste alternativ.
- **Grense hos Kassalapp:** gratisnivået tillater 60 oppslag i minuttet. Funksjonen holder seg på 50 og henter store lister i omganger (appen viser «Henter priser 12 av 35 …» og fortsetter av seg selv). Utvidede søk og ekstra oppslag brukes bare når det trengs.

---

## Butikker i nærheten og to-butikk-forslag

Kjør `supabase/priser2.sql` i **SQL Editor → New query → Run**, og oppdater funksjonen (**Edge Functions → braryd → Code**, lim inn `supabase/functions/braryd/index.ts`, **Deploy**). SQL-filen velger KIWI, REMA 1000, Obs og MENY som kjeder.

- **Innstillinger → Priser og butikker:** «Bruk min posisjon» og en glider for avstand (0–50 km). Appen slår opp butikkene i nærheten hos Kassalapp og viser avstand til nærmeste butikk per kjede. Valgte kjeder uten butikk innenfor avstanden tas ikke med.
- **Alle valgte kjeder vises** på hver vare (ikke bare de tre billigste). «≈» betyr at kjeden ikke har akkurat samme vare, og prisen er for nærmeste alternativ.
- **Obs/Extra/Mega:** har ikke Kassalapp egen pris for kjeden, brukes Coops nettpris.
- **Priser-fanen:** «Hele listen i én butikk» for alle valgte kjeder, og «Billigst i to butikker» med de tre beste kombinasjonene og hva som kjøpes hvor. Varer en kjede mangler regnes med vanlig pris (median) i de andre, så summene kan sammenlignes.
