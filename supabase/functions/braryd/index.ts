// BraRyd familieplanlegger – serverfunksjon (Supabase Edge Function, navn: "braryd")
//
// Handlinger:
//   siri-legg-til  – legger varer på handlelisten fra Siri-snarveien. Krever Siri-nøkkel.
//                    POST {"action":"siri-legg-til","nokkel":"…","tekst":"melk, egg og brød"}
//                    (eller GET ?action=siri-legg-til&nokkel=…&tekst=…)
//   siri-les       – leser opp det som står igjen på handlelisten. Krever Siri-nøkkel.
//   priser         – dagens priser per kjede for en liste varenavn (fra Kassalapp), med 12 timers mellomlager.
//                    POST {"action":"priser","navn":["Melk","Kjøttdeig"],"force":false}. Kun familiemedlemmer.
//   sok            – søk etter en vare på tvers av kjedene (fra Kassalapp). Kun familiemedlemmer.
//   push-abonner   – lagrer push-abonnementet for denne telefonen (familiemedlem).
//   push-avslutt   – fjerner et push-abonnement.
//   push-test      – sender et testvarsel til egne enheter.
//   send-melding   – push-melding til hele familien eller én person {til, tittel, tekst}.
//   hendelse-tildelt– varsler dem som er lagt til en kalenderaktivitet {id, nye?: [e-post]}.
//   oppgave-tildelt– varsler dem som har fått en oppgave {id, nye?: [e-post]} (nye = bare de som er lagt til nå).
//   admin-passord  – admin setter nytt passord for et familiemedlem {email, passord}. Kun admin.
//   varsle         – automatiske varsler: oppgaver med frist i dag / over fristen, kalenderhendelser
//                    og bursdager. Kalles hvert kvarter av GitHub Actions. Åpen, men sender aldri dobbelt.
//
// Hemmeligheter (Edge Functions → Secrets): KASSALAPP_API_KEY (fra kassal.app/api),
// VAPID_PUBLIC_KEY og VAPID_PRIVATE_KEY (push-nøklene).
//
// Siri-handlingene svarer med vanlig tekst, slik at snarveien kan lese svaret høyt.
// SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY settes automatisk av Supabase.
// «Verify JWT» må være AV for denne funksjonen (den sjekker tilgang selv).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const KASSAL = "https://kassal.app/api/v1";
const MAKS_ALDER = 12 * 3600_000; // priser i mellomlageret regnes som ferske i 12 timer

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function text(body: string, status = 200) {
  return new Response(body, { status, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
}

// ---------- Tekst fra Siri → varer ----------
const ENHETER = "stk|stykk|pk|pakke|pakker|pose|poser|boks|bokser|flaske|flasker|liter|l|dl|kg|kilo|g|gram|hg|brett|kartong|kartonger|glass|beger|bunt|nett";
const TALL_ORD: Record<string, string> = { en: "1", ett: "1", ei: "1", to: "2", tre: "3", fire: "4", fem: "5", seks: "6", sju: "7", syv: "7", åtte: "8", ni: "9", ti: "10", tolv: "12" };

export function tolkVarer(input: string): { navn: string; antall: string }[] {
  return input
    .replace(/[.!?]+$/g, "")
    .split(/\s*(?:,|;|\n|\bog\b|\bpluss\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((del) => {
      let navn = del;
      let antall = "";
      const m = del.match(new RegExp(`^(\\d+(?:[.,]\\d+)?|${Object.keys(TALL_ORD).join("|")})\\s*(${ENHETER})?\\.?\\s+(.+)$`, "i"));
      if (m) {
        const tall = TALL_ORD[m[1].toLowerCase()] ?? m[1];
        antall = m[2] ? `${tall} ${m[2].toLowerCase()}` : tall;
        navn = m[3];
      }
      navn = navn.charAt(0).toUpperCase() + navn.slice(1);
      return { navn, antall };
    });
}

function liste(ord: string[]) {
  if (ord.length <= 1) return ord.join("");
  return `${ord.slice(0, -1).join(", ")} og ${ord[ord.length - 1]}`;
}

async function medlemFraNokkel(nokkel: string | null) {
  if (!nokkel || !/^[0-9a-f-]{36}$/i.test(nokkel.trim())) return null;
  const { data } = await admin.from("siri_nokler").select("email").eq("nokkel", nokkel.trim()).maybeSingle();
  return data?.email ?? null;
}

async function siriLeggTil(nokkel: string | null, tekst: string) {
  const email = await medlemFraNokkel(nokkel);
  if (!email) return text("Siri-nøkkelen virker ikke. Hent en ny i BraRyd under Innstillinger.", 401);
  if (!(await harRett(email, "handle"))) return text("Du har bare innsyn i handlelisten. Spør Jørgen om tilgang.");
  const varer = tolkVarer(tekst || "");
  if (!varer.length) return text("Jeg fikk ikke med meg noen varer. Prøv igjen.");

  // Unngå dobbelt opp: øk ikke, bare hopp over varer som allerede står på listen (ikke kjøpt).
  const { data: finnes } = await admin.from("handleliste").select("navn").eq("kjopt", false);
  const eksisterer = new Set((finnes ?? []).map((v) => v.navn.toLowerCase()));
  const nye = varer.filter((v) => !eksisterer.has(v.navn.toLowerCase()));
  const sto = varer.filter((v) => eksisterer.has(v.navn.toLowerCase()));

  if (nye.length) {
    const { error } = await admin.from("handleliste").insert(
      nye.map((v) => ({ navn: v.navn, antall: v.antall, kilde: "siri", lagt_til_av: email })),
    );
    if (error) return text("Noe gikk galt. Varene ble ikke lagt til.", 500);
  }
  const deler: string[] = [];
  if (nye.length) deler.push(`La til ${liste(nye.map((v) => v.navn.toLowerCase()))}.`);
  if (sto.length) deler.push(`${liste(sto.map((v) => v.navn))} sto allerede på listen.`);
  return text(deler.join(" "));
}

async function siriLes(nokkel: string | null) {
  const email = await medlemFraNokkel(nokkel);
  if (!email) return text("Siri-nøkkelen virker ikke. Hent en ny i BraRyd under Innstillinger.", 401);
  const { data } = await admin.from("handleliste").select("navn, antall").eq("kjopt", false).order("kategori").order("opprettet");
  const varer = data ?? [];
  if (!varer.length) return text("Handlelisten er tom.");
  const navn = varer.map((v) => (v.antall ? `${v.antall} ${v.navn.toLowerCase()}` : v.navn.toLowerCase()));
  return text(`${varer.length === 1 ? "Det står én ting" : `Det står ${varer.length} ting`} på handlelisten: ${liste(navn)}.`);
}

// ---------- Tilgang ----------
async function medlemEpost(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return null; // publiserbar nøkkel ≠ innlogget bruker
  const { data, error } = await admin.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  const { data: m } = await admin.from("medlemmer").select("email").ilike("email", email).maybeSingle();
  return m ? m.email.toLowerCase() : null;
}

// Tilgang per person (admin.sql). Mangler kolonnene, har alle tilgang.
async function harRett(email: string, rett: "push" | "handle" | "oppgaver" | "kalender" | "middag") {
  const { data } = await admin.from("medlemmer").select("*").ilike("email", email).maybeSingle();
  if (!data) return false;
  if (data.admin) return true;
  const v = data[`kan_${rett}`];
  return v === undefined ? true : Boolean(v);
}

// ---------- Treff mellom varenavn og produktnavn ----------
const BOKSTAV = "a-z0-9æøåéèäöü";
const FYLLORD = new Set(["og", "med", "i", "til", "av", "en", "ett", "ei", "for", "uten", "fersk", "ferske", "stor", "liten", "små"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const normaliser = (s: string) => (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();


// ---------- Relevans: finne riktig vare, ikke bare billigste ----------
// Norske sammensatte ord har hovedordet sist. Søkeordet passer derfor best som eget ord («Fløte»)
// eller sist i et ord («Kremfløte»), og dårligst først i et ord («Fløtesaus», «Melkesjokolade»).
const BOYNING = "(?:er|r|ene|ne|en|e|et|a)?";
const TREFF_HEL = 3, TREFF_SIST = 2, TREFF_FORST = 1;

// Ord som betyr at produktet er noe annet enn råvaren (med mindre søket selv inneholder ordet)
const STOY = [
  "saus", "sauce", "pudding", "dressing", "dip", "chips", "smoothie", "suppe", "gryte", "pålegg", "snacks",
  "kake", "kaker", "mix", "miks", "krydder", "krydderblanding", "marinade", "mysost", "prim", "topping", "pulver",
  "drikk", "juice", "nektar", "sjokolade", "godteri", "yoghurt", "is", "iskrem", "kjeks", "bar", "barer", "puré",
  "barnemat", "grøt", "måneder", "mnd", "hund", "hunde", "katt", "katte", "valp", "dyrefôr", "fôr", "godbit", "godbiter",
  "shampoo", "såpe", "lotion", "krem", "deodorant", "vaskemiddel", "duft", "lys", "te",
];
const BABYMERKER = ["ella", "ellas", "småfolk", "hipp", "semper", "holle", "nestle", "piccolo", "organix"];

// Vanlige varer der det generelle ordet ofte står først i andre produkter. Søker også på disse.
const UTVID: Record<string, string[]> = {
  "fløte": ["kremfløte", "matfløte"],
  "melk": ["lettmelk", "helmelk"],
  "rømme": ["lettrømme", "seterrømme"],
  "ost": ["norvegia", "jarlsberg", "hvitost"],
  "smør": ["meierismør"],
  "brød": ["grovbrød"],
  "potet": ["poteter"],
  "poteter": ["potet"],
  "løk": ["gul løk"],
  "kylling": ["kyllingfilet"],
  "tomat": ["tomater"],
  "tomater": ["tomat"],
  "egg": ["frittgående egg"],
};

const ordI = (s: string) => normaliser(s).split(/[^a-z0-9æøåéèäöü]+/).filter(Boolean);

function variantRegex(o: string) {
  const v = new Set([o]);
  if (o.length > 4 && o.endsWith("ene")) { v.add(o.slice(0, -3)); v.add(o.slice(0, -2)); }
  if (o.length > 4 && o.endsWith("er")) { v.add(o.slice(0, -2)); v.add(o.slice(0, -1)); }
  if (o.length > 4 && o.endsWith("en")) v.add(o.slice(0, -2));
  return [...v].filter((x) => x.length >= 2).map(escape).join("|");
}

// Hvor godt ett søkeord passer ett ord i produktnavnet (0–3)
function ordTreff(sokeord: string) {
  const v = variantRegex(sokeord);
  const hel = new RegExp(`^(?:${v})${BOYNING}$`);
  const sist = new RegExp(`^[${BOKSTAV}]{2,}(?:${v})${BOYNING}$`);
  const inni = new RegExp(`(?:${v})`);
  return (ord: string) => {
    if (hel.test(ord)) return TREFF_HEL;
    if (sist.test(ord)) return TREFF_SIST;
    if (sokeord.length >= 4 && inni.test(ord)) return TREFF_FORST;
    return 0;
  };
}

type Vurdering = { poeng: number; hode: number; stoy: boolean };

// Lager en vurdering av et produkt for ett eller flere søk (varenavn + utvidelser)
export function lagVurdering(soker: string[]) {
  const sett = soker.map((s) => ordI(s).filter((o) => o.length >= 2 && !FYLLORD.has(o))).filter((o) => o.length);
  const iSok = new Set(sett.flat());
  const regler = sett.map((ord) => ({ ord, test: ord.map(ordTreff) }));
  return (navn: string): Vurdering => {
    const tokens = ordI(navn);
    let best: Vurdering = { poeng: 0, hode: 0, stoy: false };
    for (const r of regler) {
      const per = r.test.map((t) => Math.max(0, ...tokens.map(t)));
      const hode = per[per.length - 1];
      const andre = per.slice(0, -1);
      // Godta når hovedordet treffer, eller når alle de andre ordene treffer («Norvegia ost» → «Norvegia 26 % 1 kg»)
      if (!hode && !(andre.length && andre.every((x) => x >= TREFF_SIST))) continue;
      const ekstra = Math.max(0, tokens.filter((t) => !/^\d/.test(t)).length - r.ord.length);
      const start = tokens.length && r.test[r.test.length - 1](tokens[0]) === TREFF_HEL ? 1 : 0;
      const poeng = hode * 10 + andre.reduce((s, x) => s + x * 3, 0) + start - Math.min(ekstra, 6) * 0.4;
      if (poeng > best.poeng) best = { poeng, hode, stoy: false };
    }
    if (best.poeng > 0) {
      const baby = /\b\d+\s*(?:mnd|måneder|mån)\b/.test(normaliser(navn)) || tokens.some((t) => BABYMERKER.includes(t));
      const stoy = tokens.some((t) => !iSok.has(t) && STOY.some((n) => t === n || (t.length > n.length + 2 && t.endsWith(n) && !iSok.has(n))));
      best.stoy = baby || stoy;
    }
    return best;
  };
}

// Kategorinavnene et produkt ligger i (Kassalapp: liste med {name, depth})
function kategorier(p: any): string[] {
  const k = Array.isArray(p.category) ? p.category : p.category ? [p.category] : [];
  return k.map((c: any) => (typeof c === "string" ? c : c?.name)).filter(Boolean).map((n: string) => n.toLowerCase());
}

// ---------- Kassalapp ----------
// Kassalapp gratis: 60 forespørsler i minuttet. Vi holder oss på 50 og stopper i stedet for å vente,
// så appen kan hente resten litt senere.
const GRENSE_PER_MIN = 50;
const kallTider: number[] = [];
class ForMangeKall extends Error {}

async function kassal(path: string, params: Record<string, string | number | boolean>) {
  const key = Deno.env.get("KASSALAPP_API_KEY");
  if (!key) throw new Error("KASSALAPP_API_KEY mangler i Supabase (Edge Functions → Secrets)");
  const naa = Date.now();
  while (kallTider.length && naa - kallTider[0] > 60_000) kallTider.shift();
  if (kallTider.length >= GRENSE_PER_MIN) throw new ForMangeKall("Grensen per minutt er nådd");
  kallTider.push(naa);
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${KASSAL}${path}?${qs}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  if (res.status === 429) throw new ForMangeKall("Kassalapp: for mange forespørsler");
  if (res.status === 401) throw new Error("Kassalapp godtok ikke API-nøkkelen (401)");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Kassalapp svarte ${res.status}`);
  return await res.json();
}

const ENHET: Record<string, string> = { g: "kg", kg: "kg", hg: "kg", ml: "l", cl: "l", dl: "l", l: "l", stk: "stk" };

function tilTreff(p: any, v: Vurdering) {
  const pris = Number(p.current_price);
  const historikk = (p.price_history || [])
    .filter((h: any) => h?.price && h?.date && Date.now() - Date.parse(h.date) < 35 * 86400_000)
    .map((h: any) => Number(h.price));
  const hoyest = historikk.length ? Math.max(...historikk) : null;
  return {
    kode: p.store?.code || "",
    kjede: p.store?.name || "",
    logo: p.store?.logo || "",
    navn: p.name || "",
    merke: p.brand || "",
    pris,
    enhetspris: p.current_unit_price != null ? Number(p.current_unit_price) : null,
    enhet: ENHET[(p.weight_unit || "").toLowerCase()] || "",
    ean: p.ean ? String(p.ean) : null,
    mengde: p.weight != null ? Number(p.weight) : null,
    mengdeEnhet: (p.weight_unit || "").toLowerCase(),
    forpris: hoyest && hoyest > pris * 1.05 ? hoyest : null, // prisfall siste 5 uker
    bilde: p.image || "",
    url: p.url || "",
    oppdatert: p.updated_at || null,
    poeng: Math.round(v.poeng * 10) / 10,
    _kat: kategorier(p),
    _hode: v.hode,
    _stoy: v.stoy,
    _id: p.id ?? `${p.ean}-${p.store?.code}`,
  };
}

// Sammenlign på pris per kg/l når begge har det, ellers på pris.
function billigere(a: any, b: any) {
  if (a.enhetspris && b.enhetspris && a.enhet && a.enhet === b.enhet) return a.enhetspris - b.enhetspris;
  return a.pris - b.pris;
}

export function velgTreff(sok: string, produkter: any[]) {
  const vurder = lagVurdering([sok, ...(UTVID[normaliser(sok)] || [])]);
  let kand = produkter
    .filter((p: any) => p.current_price != null && p.store?.code)
    .map((p: any) => tilTreff(p, vurder(`${p.name} ${p.brand || ""}`)))
    .filter((t: any) => t.poeng > 0);

  // 1) Fjern «noe annet» (saus, babymat, dyremat …) når det finnes vanlige varer
  if (kand.some((t) => !t._stoy)) kand = kand.filter((t) => !t._stoy);
  // 2) Når ordet finnes som eget ord / sist i ord, dropp treff der det bare står først («Fløtesaus»)
  if (kand.filter((t) => t._hode >= TREFF_SIST).length >= 2) kand = kand.filter((t) => t._hode !== TREFF_FORST);
  // 3) Samme kategori som flertallet av de beste treffene (f.eks. «Frukt» for bananer, ikke «Barnemat»)
  const topp = Math.max(0, ...kand.map((t) => t.poeng));
  const beste = kand.filter((t) => t.poeng >= topp - 3);
  const telling = new Map<string, number>();
  for (const t of beste) for (const k of new Set(t._kat as string[])) telling.set(k, (telling.get(k) || 0) + 1);
  const dominerende = [...telling.entries()].filter(([, n]) => beste.length >= 3 && n / beste.length >= 0.6).sort((a, b) => b[1] - a[1]);
  if (dominerende.length) {
    // Den mest spesifikke kategorien som flertallet deler
    const k = dominerende[dominerende.length - 1][0];
    const filtrert = kand.filter((t) => !t._kat.length || t._kat.includes(k));
    if (new Set(filtrert.map((t) => t.kode)).size >= 2) kand = filtrert;
  }

  // Beste treff per kjede: høyest poeng (riktigst vare), deretter billigst
  const perKjede = new Map<string, any>();
  for (const t of kand) {
    const f = perKjede.get(t.kode);
    if (!f || t.poeng > f.poeng + 1 || (Math.abs(t.poeng - f.poeng) <= 1 && billigere(t, f) < 0)) perKjede.set(t.kode, t);
  }
  const rens = ({ _kat, _hode, _stoy, _id, ...t }: any) => t;
  const treff = [...perKjede.values()].sort(billigere).map(rens);
  // Sammenlign på kilo-/literpris bare når pakningene er ulike (ellers på hyllepris)
  const mengder = treff.map((t) => t.mengde).filter((m) => m);
  const ulik = mengder.length >= 2 && Math.max(...mengder) / Math.min(...mengder) > 1.25;
  const sammeEnhet = treff.every((t) => t.enhetspris && t.enhet && t.enhet === treff[0].enhet);
  const basis = ulik && sammeEnhet ? "enhet" : "pris";
  if (basis === "pris") treff.sort((a, b) => a.pris - b.pris);
  const alle = kand.sort((a: any, b: any) => (b.poeng - a.poeng) || billigere(a, b)).slice(0, 60).map(rens);
  return { treff, alle, basis };
}

const PRIS_VERSJON = 3; // øk når utvelgelsen endres, så gamle resultater hentes på nytt

// Velger «referansevaren»: samme vare (EAN) som finnes i flest kjeder blant de mest relevante treffene.
// Da sammenlignes like varer, ikke en liten pakke i én butikk mot en storpakke i en annen.
function velgReferanse(alle: any[]) {
  if (!alle.length) return null;
  const topp = Math.max(...alle.map((t) => t.poeng));
  const grupper = new Map<string, any[]>();
  for (const t of alle) {
    if (!t.ean || t.poeng < topp - 2) continue;
    if (!grupper.has(t.ean)) grupper.set(t.ean, []);
    grupper.get(t.ean)!.push(t);
  }
  const rangert = [...grupper.entries()]
    .map(([ean, l]) => ({ ean, kjeder: new Set(l.map((t) => t.kode)).size, poeng: Math.max(...l.map((t) => t.poeng)), navn: l[0].navn }))
    .sort((a, b) => (b.kjeder - a.kjeder) || (b.poeng - a.poeng));
  return rangert[0] || null;
}

// Kassalapp: samme EAN i alle kjeder
async function prisPerKjede(ean: string, sok: string) {
  const svar = await kassal(`/products/ean/${encodeURIComponent(ean)}`, {});
  const vurder = lagVurdering([sok, ...(UTVID[normaliser(sok)] || [])]);
  const ut: any[] = [];
  for (const p of svar?.data?.products || []) {
    const cp = Array.isArray(p.current_price) ? p.current_price[0] : p.current_price;
    const pris = typeof cp === "number" ? cp : cp?.price;
    if (pris == null || !p.store?.code) continue;
    const t = tilTreff({ ...p, ean, current_price: pris, current_unit_price: typeof cp === "object" ? cp?.unit_price : p.current_unit_price }, vurder(`${p.name} ${p.brand || ""}`));
    const { _kat, _hode, _stoy, _id, ...ren } = t;
    ut.push({ ...ren, samme: true });
  }
  // Én pris per kjede (billigste hvis kjeden har flere)
  const perKjede = new Map<string, any>();
  for (const t of ut) if (!perKjede.has(t.kode) || t.pris < perKjede.get(t.kode).pris) perKjede.set(t.kode, t);
  return [...perKjede.values()].sort((a, b) => a.pris - b.pris);
}

async function hentPris(sok: string) {
  const produkter = new Map<string, any>();
  const leggTilSok = async (q: string) => {
    const svar = await kassal("/products", { search: q, size: 100 });
    for (const p of svar?.data || []) produkter.set(String(p.id ?? `${p.ean}-${p.store?.code}-${p.name}`), p);
  };
  await leggTilSok(sok);
  let valgt = velgTreff(sok, [...produkter.values()]);
  // Søk bredere (f.eks. fløte → kremfløte/matfløte) bare når første søk ga for få gode treff
  const utvid = UTVID[normaliser(sok)] || [];
  if (utvid.length && valgt.treff.length < 4) {
    for (const q of utvid) await leggTilSok(q);
    valgt = velgTreff(sok, [...produkter.values()]);
  }
  let { treff, basis } = valgt;

  // Samme vare (EAN) i flere kjeder? Sammenlign akkurat den.
  const ref = velgReferanse(valgt.alle);
  if (ref && ref.kjeder >= 2) {
    try {
      // Bruk søkeresultatene når de allerede dekker mange kjeder; ellers ett ekstra oppslag
      let like: any[];
      if (ref.kjeder >= 5) {
        const perKjede = new Map<string, any>();
        for (const t of valgt.alle) if (t.ean === ref.ean && (!perKjede.has(t.kode) || t.pris < perKjede.get(t.kode).pris)) perKjede.set(t.kode, { ...t, samme: true });
        like = [...perKjede.values()].sort((a, b) => a.pris - b.pris);
      } else {
        like = await prisPerKjede(ref.ean, sok);
      }
      if (like.length >= 3) {
        const har = new Set(like.map((t) => t.kode));
        const andre = treff.filter((t: any) => !har.has(t.kode)).map((t: any) => ({ ...t, samme: false }));
        return { sok, treff: like, andre, alle: valgt.alle, basis: "pris", referanse: { ean: ref.ean, navn: like[0].navn }, v: PRIS_VERSJON, hentet: new Date().toISOString() };
      }
    } catch (e) {
      if (e instanceof ForMangeKall) throw e;
      /* ellers: bruk vanlig sammenligning */
    }
  }
  return { sok, treff, andre: [], alle: valgt.alle, basis, referanse: null, v: PRIS_VERSJON, hentet: new Date().toISOString() };
}

async function priser(navnListe: string[], force: boolean) {
  const sokeord = [...new Set((navnListe || []).map(normaliser).filter((n) => n.length >= 3))].slice(0, 40);
  if (!sokeord.length) return json({ resultater: {} });
  const { data: lagret } = await admin.from("pris_cache").select("sok, data, hentet").in("sok", sokeord);
  const resultater: Record<string, any> = {};
  for (const r of lagret ?? []) resultater[r.sok] = r.data;
  const gamle = sokeord.filter((s) => force || !resultater[s] || (resultater[s].v || 0) < PRIS_VERSJON
    || Date.now() - Date.parse(resultater[s].hentet) > MAKS_ALDER);

  // Én og én vare, til grensen per minutt er nådd eller det har gått 60 sekunder. Resten hentes senere.
  const feil: string[] = [];
  const gjenstaar: string[] = [];
  const start = Date.now();
  for (let i = 0; i < gamle.length; i++) {
    const s = gamle[i];
    if (Date.now() - start > 60_000) { gjenstaar.push(...gamle.slice(i)); break; }
    try {
      const data = await hentPris(s);
      resultater[s] = data;
      await admin.from("pris_cache").upsert({ sok: s, data, hentet: data.hentet });
    } catch (e) {
      if (e instanceof ForMangeKall) { gjenstaar.push(...gamle.slice(i)); break; }
      feil.push(`${s}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return json({ resultater, feil, gjenstaar });
}

async function sok(q: string) {
  const s = normaliser(q || "");
  if (s.length < 3) return json({ error: "Skriv minst tre bokstaver" }, 400);
  let data;
  try { data = await hentPris(s); } catch (e) {
    if (e instanceof ForMangeKall) return json({ error: "Mange prisoppslag akkurat nå – prøv igjen om et minutt" }, 429);
    throw e;
  }
  await admin.from("pris_cache").upsert({ sok: s, data, hentet: data.hentet });
  return json(data);
}

// ---------- Hjelpere ----------
const enc = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

// Tåler at verdien er limt inn med anførselstegn, mellomrom eller «NAVN=» foran.
function secret(name: string): string {
  const unquote = (s: string) => s.trim().replace(/^["']+|["']+$/g, "").trim();
  let v = unquote(Deno.env.get(name) ?? "");
  if (v.toUpperCase().startsWith(name + "=")) v = unquote(v.slice(name.length + 1));
  return v;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// ---------- VAPID (RFC 8292) ----------
type Vapid = { publicKey: string; signingKey: CryptoKey; subject: string };
let vapidCache: Vapid | null = null;

async function getVapid(): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  const publicKey = secret("VAPID_PUBLIC_KEY");
  const privateKey = secret("VAPID_PRIVATE_KEY");
  let subject = secret("VAPID_SUBJECT") || "mailto:jorgen.rydheim@gmail.com";
  if (!publicKey || !privateKey) {
    throw new Error("Push-nøklene mangler. Legg inn VAPID_PUBLIC_KEY og VAPID_PRIVATE_KEY under Edge Functions → Secrets.");
  }
  if (!/^(mailto:|https:)/.test(subject)) subject = `mailto:${subject}`;
  let pub: Uint8Array, d: Uint8Array;
  try {
    pub = b64urlToBytes(publicKey);
    d = b64urlToBytes(privateKey);
  } catch {
    throw new Error("Push-nøklene har feil format. Kopier dem på nytt fra nøkkelfilen.");
  }
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY er feil. Kopier den på nytt fra nøkkelfilen.");
  if (d.length !== 32) throw new Error("VAPID_PRIVATE_KEY er feil. Kopier den på nytt fra nøkkelfilen.");
  const jwk = {
    kty: "EC", crv: "P-256", ext: true,
    x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), d: bytesToB64url(d),
  };
  let signingKey: CryptoKey;
  try {
    signingKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  } catch {
    throw new Error("Push-nøklene hører ikke sammen. Kopier begge på nytt fra samme nøkkelfil.");
  }
  vapidCache = { publicKey: bytesToB64url(pub), signingKey, subject };
  return vapidCache;
}

async function vapidHeader(endpoint: string, vapid: Vapid): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(enc.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject,
  })));
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapid.signingKey, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${bytesToB64url(sig)}, k=${vapid.publicKey}`;
}

// ---------- Kryptering av innholdet (RFC 8291, aes128gcm) ----------
async function encryptPayload(payload: Uint8Array, p256dh: string, auth: string): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dh);
  const authSecret = b64urlToBytes(auth);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(payload, new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: string, vapid: Vapid) {
  const body = await encryptPayload(enc.encode(payload), sub.p256dh, sub.auth);
  return fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(60 * 60 * 24),
      Urgency: "normal",
    },
    body,
  });
}



// ---------- Sende push til familien ----------
type Varsel = { title: string; body: string; url?: string; tag?: string };

// mottakere: liste med e-poster, eller null = alle
async function pushTil(mottakere: string[] | null, varsel: Varsel) {
  let q = admin.from("push_abonnement").select("endpoint, p256dh, auth, email");
  if (mottakere) {
    if (!mottakere.length) return 0;
    q = q.in("email", mottakere.map((e) => e.toLowerCase()));
  }
  const { data: subs } = await q;
  if (!subs?.length) return 0;
  const vapid = await getVapid();
  const payload = JSON.stringify(varsel);
  const borte: string[] = [];
  let sendt = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const res = await sendPush(s, payload, vapid);
      if (res.ok) sendt++;
      else if (res.status === 404 || res.status === 410) borte.push(s.endpoint);
    } catch { /* én enhet som feiler stopper ikke resten */ }
  }));
  if (borte.length) await admin.from("push_abonnement").delete().in("endpoint", borte);
  return sendt;
}

async function navnPaa(email: string | null) {
  if (!email) return "";
  const { data } = await admin.from("medlemmer").select("navn").ilike("email", email).maybeSingle();
  return data?.navn || email.split("@")[0];
}

// Alle som har en oppgave (flere personer mulig; eldre oppgaver har bare «tildelt»)
const tildelteFor = (t: any): string[] =>
  (Array.isArray(t.tildelte) && t.tildelte.length ? t.tildelte : t.tildelt ? [t.tildelt] : []).map((e: string) => e.toLowerCase());

// Personene en kalenderaktivitet gjelder (tom liste = hele familien)
const eiereFor = (h: any): string[] =>
  (Array.isArray(h.eiere) && h.eiere.length ? h.eiere : h.eier ? [h.eier] : []).map((e: string) => e.toLowerCase());

// ---------- Norsk tid ----------
const OSLO = "Europe/Oslo";
function osloDeler(t: number) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: OSLO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const d = Object.fromEntries(f.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return { dato: `${d.year}-${d.month}-${d.day}`, time: Number(d.hour), minutt: Number(d.minute) };
}
// Klokkeslett i Oslo → tidspunkt (ms)
function osloTil(dato: string, hhmm = "00:00") {
  const [y, m, d] = dato.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const gjett = Date.UTC(y, m - 1, d, h, mi);
  const avvik = (t: number) => {
    const o = osloDeler(t);
    const [oy, om, od] = o.dato.split("-").map(Number);
    return Date.UTC(oy, om - 1, od, o.time, o.minutt) - t;
  };
  return gjett - avvik(gjett - avvik(gjett));
}
const leggTil = (dato: string, dager: number) => {
  const [y, m, d] = dato.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dager)).toISOString().slice(0, 10);
};
const UKEDAG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MND = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const pentDato = (dato: string) => {
  const [y, m, d] = dato.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${UKEDAG[w]} ${d}. ${MND[m - 1]}`;
};

// Datoene en hendelse skjer innenfor [fra, til]
function forekomster(h: any, fra: string, til: string): string[] {
  const ut: string[] = [];
  const start = h.dato as string;
  const slutt = h.gjentar_til && h.gjentar_til < til ? h.gjentar_til : til;
  if (h.gjentakelse === "ingen") return start >= fra && start <= til ? [start] : [];
  const [sy, sm, sd] = start.split("-").map(Number);
  for (let n = 0; n < 2000; n++) {
    let d: string;
    if (h.gjentakelse === "ukentlig") d = leggTil(start, 7 * n);
    else if (h.gjentakelse === "annenhver_uke") d = leggTil(start, 14 * n);
    else if (h.gjentakelse === "maanedlig") {
      const t = new Date(Date.UTC(sy, sm - 1 + n, 1));
      const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
      d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(sd, dim))).toISOString().slice(0, 10);
    } else { // aarlig (29. feb → 28. feb i vanlige år)
      const y = sy + n;
      const dim = new Date(Date.UTC(y, sm, 0)).getUTCDate();
      d = new Date(Date.UTC(y, sm - 1, Math.min(sd, dim))).toISOString().slice(0, 10);
    }
    if (d > slutt) break;
    if (d >= fra) ut.push(d);
  }
  return ut;
}

// Reserverer en varselnøkkel; true bare første gang (så ingenting sendes dobbelt)
async function forsteGang(nokkel: string) {
  const { data } = await admin.from("sendte_varsler").upsert({ nokkel }, { onConflict: "nokkel", ignoreDuplicates: true }).select("nokkel");
  return Boolean(data?.length);
}

async function varsle() {
  const naa = Date.now();
  const o = osloDeler(naa);
  const idag = o.dato;
  const sendt: string[] = [];

  // 1) Oppgaver: start pausede oppgaver igjen når pausen er over (krever familie2.sql)
  await admin.rpc("gjenoppta_pausede").then(() => {}, () => {});
  const { data: oppgaver } = await admin.from("oppgaver").select("*")
    .eq("ferdig", false).not("frist", "is", null).gte("frist", leggTil(idag, -7)).lte("frist", idag);
  const naaMin = o.time * 60 + o.minutt;
  for (const t of oppgaver ?? []) {
    if (t.varsel === false || t.pauset) continue;           // påminnelse av, eller på pause
    const [vt, vm] = String(t.varsel_tid || "07:00").split(":").map(Number);
    if (naaMin < vt * 60 + vm) continue;                     // ikke klokkeslettet ennå i dag
    const personer = tildelteFor(t);
    const til = personer.length ? personer : null;
    if (t.frist === idag && await forsteGang(`oppgave-idag:${t.id}`)) {
      await pushTil(til, { title: `I dag: ${t.tittel}`, body: !personer.length ? "Frist i dag – hvem tar den?" : personer.length > 1 ? "Påminnelse – frist i dag. Dere er flere på denne." : "Påminnelse – frist i dag.", url: "#/oppgaver", tag: `oppgave-${t.id}` });
      sendt.push(`idag ${t.tittel}`);
    }
    if (t.frist < idag && await forsteGang(`oppgave-forfalt:${t.id}`)) {
      await pushTil(til, { title: `Over fristen: ${t.tittel}`, body: `Fristen var ${pentDato(t.frist)}.`, url: "#/oppgaver", tag: `oppgave-${t.id}` });
      sendt.push(`forfalt ${t.tittel}`);
    }
  }

  // 2) Kalender: hendelser og bursdager med ett eller flere varsler
  const { data: hendelser } = await admin.from("hendelser").select("*").lte("dato", leggTil(idag, 15));
  for (const h of hendelser ?? []) {
    const varsler: number[] = Array.isArray(h.varsler) && h.varsler.length ? h.varsler : (h.varsel_min != null ? [h.varsel_min] : []);
    if (!varsler.length) continue;
    for (const dato of forekomster(h, leggTil(idag, -1), leggTil(idag, 15))) {
      const start = osloTil(dato, h.tid ? String(h.tid).slice(0, 5) : "00:00");
      for (const min of varsler) {
        const sendes = start - min * 60_000;
        if (naa < sendes || naa > sendes + 6 * 3600_000) continue; // ikke ennå, eller for gammelt
        if (!(await forsteGang(`hendelse:${h.id}:${dato}:${min}`))) continue;
        const naar = dato === idag ? "i dag" : dato === leggTil(idag, 1) ? "i morgen" : pentDato(dato);
        let varsel: Varsel;
        if (h.type === "bursdag") {
          const alder = h.fodselsar ? Number(dato.slice(0, 4)) - h.fodselsar : null;
          varsel = { title: `🎂 ${h.tittel} har bursdag ${naar}`, body: alder ? `Fyller ${alder} år.` : "Husk gratulasjonen!", url: "#/", tag: `hendelse-${h.id}-${min}` };
        } else {
          const kl = h.tid ? ` kl. ${String(h.tid).slice(0, 5)}` : "";
          varsel = { title: h.tittel, body: `${naar[0].toUpperCase()}${naar.slice(1)}${kl}${h.sted ? ` · ${h.sted}` : ""}`, url: "#/", tag: `hendelse-${h.id}-${min}` };
        }
        const personer = eiereFor(h);
        await pushTil(personer.length && h.type !== "bursdag" ? personer : null, varsel);
        sendt.push(`hendelse ${h.tittel} ${dato} (${min})`);
      }
    }
  }

  // Rydd gamle nøkler
  await admin.from("sendte_varsler").delete().lt("sendt", new Date(naa - 60 * 86400_000).toISOString());
  return json({ ok: true, tid: `${idag} ${o.time}:${String(o.minutt).padStart(2, "0")}`, sendt });
}

// ---------- Ruting ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  let body: Record<string, any> = {};
  if (req.method === "POST") {
    const raw = await req.text();
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { tekst: raw }; }
  }
  const p = (k: string) => body[k] ?? url.searchParams.get(k);
  const action = p("action");

  try {
    if (action === "siri-legg-til") return await siriLeggTil(p("nokkel"), p("tekst") || "");
    if (action === "siri-les") return await siriLes(p("nokkel"));
    if (action === "varsle") return await varsle();
    if (action === "push-avslutt") {
      if (p("endpoint")) await admin.from("push_abonnement").delete().eq("endpoint", p("endpoint"));
      return json({ ok: true });
    }

    const meg = await medlemEpost(req);
    if (!meg) return json({ error: "Logg inn på nytt" }, 401);

    if (action === "priser") return await priser(Array.isArray(body.navn) ? body.navn : [], Boolean(body.force));
    if (action === "sok") return await sok(p("q"));

    if (action === "push-abonner") {
      const sub = body.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json({ error: "Ugyldig abonnement" }, 400);
      const { error } = await admin.from("push_abonnement").upsert({
        endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, email: meg, oppdatert: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    if (action === "push-test") {
      const n = await pushTil([meg], { title: "BraRyd", body: "Varsler virker på denne telefonen 👍", url: "#/innstillinger" });
      return json({ ok: true, sendt: n });
    }
    if (action === "send-melding") {
      if (!(await harRett(meg, "push"))) return json({ error: "Du har ikke tilgang til å sende meldinger" }, 403);
      const tekst = String(body.tekst || "").trim().slice(0, 500);
      if (!tekst) return json({ error: "Skriv en melding" }, 400);
      const til = body.til ? String(body.til).toLowerCase() : null;
      const fra = await navnPaa(meg);
      await admin.from("meldinger").insert({ fra: meg, til, tittel: String(body.tittel || ""), tekst });
      let mottakere: string[] | null = til ? [til] : null;
      if (!til) {
        const { data } = await admin.from("medlemmer").select("email");
        mottakere = (data ?? []).map((m) => m.email.toLowerCase()).filter((e) => e !== meg);
      }
      const n = await pushTil(mottakere, { title: body.tittel ? `${fra}: ${body.tittel}` : `Melding fra ${fra}`, body: tekst, url: "#/" });
      return json({ ok: true, sendt: n });
    }
    if (action === "admin-passord") {
      const { data: jeg } = await admin.from("medlemmer").select("*").ilike("email", meg).maybeSingle();
      if (!jeg?.admin) return json({ error: "Bare admin kan endre passord" }, 403);
      const email = String(body.email || "").toLowerCase().trim();
      const passord = String(body.passord || "");
      if (passord.length < 8) return json({ error: "Passordet må ha minst 8 tegn" }, 400);
      const { data: m } = await admin.from("medlemmer").select("email").ilike("email", email).maybeSingle();
      if (!m) return json({ error: "Finner ikke familiemedlemmet" }, 404);
      // Finn brukeren i Supabase Auth
      let brukerId: string | null = null;
      for (let side = 1; side <= 20 && !brukerId; side++) {
        const { data, error } = await admin.auth.admin.listUsers({ page: side, perPage: 200 });
        if (error) return json({ error: error.message }, 500);
        brukerId = data.users.find((u) => (u.email || "").toLowerCase() === email)?.id ?? null;
        if (data.users.length < 200) break;
      }
      if (!brukerId) {
        // Ingen innlogging ennå: lag den, ferdig bekreftet
        const { error } = await admin.auth.admin.createUser({ email, password: passord, email_confirm: true });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, opprettet: true });
      }
      const { error } = await admin.auth.admin.updateUserById(brukerId, { password: passord });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    if (action === "hendelse-tildelt") {
      const { data: h } = await admin.from("hendelser").select("*").eq("id", Number(p("id"))).maybeSingle();
      if (!h) return json({ ok: true, sendt: 0 });
      const alle = eiereFor(h);
      const nye = Array.isArray(body.nye) ? body.nye.map((e: string) => String(e).toLowerCase()) : alle;
      const mottakere = alle.filter((e) => nye.includes(e) && e !== meg);
      if (!mottakere.length) return json({ ok: true, sendt: 0 });
      const fra = await navnPaa(meg);
      const kl = h.tid ? ` kl. ${String(h.tid).slice(0, 5)}` : "";
      const n = await pushTil(mottakere, {
        title: `Ny i kalenderen: ${h.tittel}`, body: `${pentDato(h.dato)}${kl}${h.sted ? ` · ${h.sted}` : ""} · lagt inn av ${fra}`, url: "#/",
      });
      return json({ ok: true, sendt: n });
    }
    if (action === "oppgave-tildelt") {
      const { data: t } = await admin.from("oppgaver").select("*").eq("id", Number(p("id"))).maybeSingle();
      if (!t) return json({ ok: true, sendt: 0 });
      const alle = tildelteFor(t);
      const nye = Array.isArray(body.nye) ? body.nye.map((e: string) => String(e).toLowerCase()) : alle;
      const mottakere = alle.filter((e) => nye.includes(e) && e !== meg);
      if (!mottakere.length) return json({ ok: true, sendt: 0 });
      const fra = await navnPaa(meg);
      const andre = alle.length > 1 ? ` · sammen med ${alle.length - 1} ${alle.length === 2 ? "annen" : "andre"}` : "";
      const n = await pushTil(mottakere, {
        title: `Ny oppgave: ${t.tittel}`, body: `Fra ${fra}${t.frist ? ` · frist ${pentDato(t.frist)}` : ""}${andre}`, url: "#/oppgaver",
      });
      return json({ ok: true, sendt: n, mottakere: mottakere.length });
    }
    return json({ error: "Ukjent handling" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
