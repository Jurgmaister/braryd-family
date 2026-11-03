# BraRyd familieplanlegger

Familiens app for middager, handleliste og ukens tilbud.

- **Ukeplan** – middag per dag, med minne over hva vi har spist
- **Middager** – biblioteket vårt med oppskriftslenker og ingredienser
- **Handleliste** – felles og live, med kategorier, lagrede lister og Siri/HomePod
- **Priser** – dagens priser per kjede fra Kassalapp, matchet mot handlelisten

Teknikk: Vite + React, Supabase (database, innlogging, sanntid og serverfunksjon), GitHub Pages.
Oppsett: se [OPPSETT.md](OPPSETT.md).

```
supabase/schema.sql                 databasen (kjøres i SQL Editor)
supabase/functions/braryd/index.ts  serverfunksjon: Siri-snarveier og priser fra Kassalapp
src/pages/                          skjermene i appen
.github/workflows/                  publisering
```
