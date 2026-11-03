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
//
// Hemmelighet (Edge Functions → Secrets): KASSALAPP_API_KEY (fra kassal.app/api).
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
async function erMedlem(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return false; // publiserbar nøkkel ≠ innlogget bruker
  const { data, error } = await admin.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return false;
  const { data: m } = await admin.from("medlemmer").select("email").ilike("email", email).maybeSingle();
  return Boolean(m);
}

// ---------- Treff mellom varenavn og produktnavn ----------
const BOKSTAV = "a-z0-9æøåéèäöü";
const FYLLORD = new Set(["og", "med", "i", "til", "av", "en", "ett", "ei", "for", "uten", "fersk", "ferske", "stor", "liten", "små"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const normaliser = (s: string) => (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

function varianter(o: string) {
  const v = new Set([o]);
  if (o.length > 4 && o.endsWith("ene")) { v.add(o.slice(0, -3)); v.add(o.slice(0, -2)); }
  if (o.length > 4 && o.endsWith("er")) { v.add(o.slice(0, -2)); v.add(o.slice(0, -1)); }
  if (o.length > 4 && o.endsWith("en")) v.add(o.slice(0, -2));
  return [...v].filter((x) => x.length >= 2).map(escape).join("|");
}

// Gir poeng for hvor godt et produktnavn passer et varenavn (0 = ikke treff).
// Norske sammensatte ord har hovedordet sist: «melk» treffer «Lettmelk», ikke «Melkesjokolade».
export function lagTreffer(varenavn: string) {
  const ord = normaliser(varenavn).split(/[^a-z0-9æøåéèäöü]+/).filter((o) => o.length >= 2 && !FYLLORD.has(o));
  if (!ord.length) return () => 0;
  const reg = ord.map((o) => (o.length >= 5
    ? new RegExp(`(${varianter(o)})`)
    : new RegExp(`(${varianter(o)})(?:er|r|ene|ne|en|e)?(?![${BOKSTAV}])`)));
  const hode = reg[reg.length - 1];
  const start = new RegExp(`^(${varianter(ord[ord.length - 1])})`);
  return (produktnavn: string) => {
    const t = normaliser(produktnavn);
    const treff = reg.filter((r) => r.test(t)).length;
    const hodeTreff = hode.test(t);
    // Godta når hovedordet treffer, eller når alle de andre ordene treffer («Norvegia ost» → «Norvegia 26 % 1 kg»)
    if (!hodeTreff && !(reg.length > 1 && treff === reg.length - 1)) return 0;
    return treff + (start.test(t) ? 0.5 : 0);
  };
}

// ---------- Kassalapp ----------
async function kassal(path: string, params: Record<string, string | number | boolean>) {
  const key = Deno.env.get("KASSALAPP_API_KEY");
  if (!key) throw new Error("KASSALAPP_API_KEY mangler i Supabase (Edge Functions → Secrets)");
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  for (let forsok = 0; forsok < 3; forsok++) {
    const res = await fetch(`${KASSAL}${path}?${qs}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
    if (res.status === 429) {
      const vent = Math.min(Number(res.headers.get("retry-after")) || 5, 20);
      await new Promise((r) => setTimeout(r, vent * 1000));
      continue;
    }
    if (res.status === 401) throw new Error("Kassalapp godtok ikke API-nøkkelen (401)");
    if (!res.ok) throw new Error(`Kassalapp svarte ${res.status}`);
    return await res.json();
  }
  throw new Error("Kassalapp: for mange forespørsler, prøv igjen om litt");
}

const ENHET: Record<string, string> = { g: "kg", kg: "kg", hg: "kg", ml: "l", cl: "l", dl: "l", l: "l", stk: "stk" };

function tilTreff(p: any, poeng: number) {
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
    forpris: hoyest && hoyest > pris * 1.05 ? hoyest : null, // prisfall siste 5 uker
    bilde: p.image || "",
    url: p.url || "",
    oppdatert: p.updated_at || null,
    poeng,
  };
}

// Sammenlign på pris per kg/l når begge har det, ellers på pris.
function billigere(a: any, b: any) {
  if (a.enhetspris && b.enhetspris && a.enhet && a.enhet === b.enhet) return a.enhetspris - b.enhetspris;
  return a.pris - b.pris;
}

async function hentPris(sok: string) {
  const svar = await kassal("/products", { search: sok, size: 100 });
  const poeng = lagTreffer(sok);
  const relevante = (svar.data || [])
    .filter((p: any) => p.current_price != null && p.store?.code)
    .map((p: any) => tilTreff(p, poeng(`${p.name} ${p.brand || ""}`)))
    .filter((t: any) => t.poeng > 0);
  // Beste treff per kjede: høyest poeng, deretter billigst
  const perKjede = new Map<string, any>();
  for (const t of relevante) {
    const f = perKjede.get(t.kode);
    if (!f || t.poeng > f.poeng || (t.poeng === f.poeng && billigere(t, f) < 0)) perKjede.set(t.kode, t);
  }
  const treff = [...perKjede.values()].sort(billigere);
  const alle = relevante.sort((a: any, b: any) => (b.poeng - a.poeng) || billigere(a, b)).slice(0, 60);
  return { sok, treff, alle, hentet: new Date().toISOString() };
}

async function priser(navnListe: string[], force: boolean) {
  const sokeord = [...new Set((navnListe || []).map(normaliser).filter((n) => n.length >= 3))].slice(0, 40);
  if (!sokeord.length) return json({ resultater: {} });
  const { data: lagret } = await admin.from("pris_cache").select("sok, data, hentet").in("sok", sokeord);
  const resultater: Record<string, any> = {};
  for (const r of lagret ?? []) resultater[r.sok] = r.data;
  const gamle = sokeord.filter((s) => force || !resultater[s] || Date.now() - Date.parse(resultater[s].hentet) > MAKS_ALDER);

  const feil: string[] = [];
  let i = 0;
  const arbeider = async () => {
    while (i < gamle.length) {
      const s = gamle[i++];
      try {
        const data = await hentPris(s);
        resultater[s] = data;
        await admin.from("pris_cache").upsert({ sok: s, data, hentet: data.hentet });
      } catch (e) {
        feil.push(`${s}: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all([arbeider(), arbeider(), arbeider()]);
  return json({ resultater, feil });
}

async function sok(q: string) {
  const s = normaliser(q || "");
  if (s.length < 3) return json({ error: "Skriv minst tre bokstaver" }, 400);
  const data = await hentPris(s);
  await admin.from("pris_cache").upsert({ sok: s, data, hentet: data.hentet });
  return json(data);
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
    if (action === "priser" || action === "sok") {
      if (!(await erMedlem(req))) return json({ error: "Logg inn på nytt" }, 401);
      if (action === "priser") return await priser(Array.isArray(body.navn) ? body.navn : [], Boolean(body.force));
      return await sok(p("q"));
    }
    return json({ error: "Ukjent handling" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
