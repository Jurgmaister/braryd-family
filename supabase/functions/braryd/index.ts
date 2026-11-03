// BraRyd familieplanlegger – serverfunksjon (Supabase Edge Function, navn: "braryd")
//
// Handlinger:
//   siri-legg-til  – legger varer på handlelisten fra Siri-snarveien. Krever Siri-nøkkel.
//                    POST {"action":"siri-legg-til","nokkel":"…","tekst":"melk, egg og brød"}
//                    (eller GET ?action=siri-legg-til&nokkel=…&tekst=…)
//   siri-les       – leser opp det som står igjen på handlelisten. Krever Siri-nøkkel.
//   tilbud-sync    – henter ukens tilbud fra matkjedene (via Tjek/eTilbudsavis) og lagrer dem.
//                    Åpen, men hoppes over hvis det ble hentet for under 2 timer siden.
//                    Et innlogget familiemedlem kan tvinge ny henting (maks hvert 10. minutt).
//
// Siri-handlingene svarer med vanlig tekst, slik at snarveien kan lese svaret høyt.
// SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY settes automatisk av Supabase.
// «Verify JWT» må være AV for denne funksjonen (den sjekker tilgang selv).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TJEK_BASES = ["https://api.etilbudsavis.dk/v2", "https://squid-api.tjek.com/v2"];

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

// ---------- Tilbud ----------
// «Coop Extra» og «Extra», «Coop Mega» og «Mega» regnes som samme kjede
const norm = (s: string) => {
  const n = s.toLowerCase().replace(/[^a-z0-9æøå]/g, "");
  return n.replace(/^coop/, "") || n;
};
const isoTid = (s?: string) => (s ? s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2") : null);

async function tjek(path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  let siste: unknown = null;
  for (const base of TJEK_BASES) {
    try {
      const res = await fetch(`${base}${path}?${qs}`, { headers: { Accept: "application/json" } });
      if (res.ok) return await res.json();
      siste = `${res.status}`;
    } catch (e) {
      siste = e;
    }
  }
  throw new Error(`Tilbudskilden svarte ikke (${siste})`);
}

function enhetspris(o: any): string {
  const p = o.pricing?.price;
  const q = o.quantity;
  const si = q?.unit?.si;
  const size = q?.size?.from;
  const pieces = q?.pieces?.from || 1;
  if (p && si?.factor && size && ["kg", "l"].includes(si.symbol)) {
    const mengde = size * pieces * si.factor;
    if (mengde > 0) return `${(p / mengde).toFixed(2).replace(".", ",")} kr/${si.symbol}`;
  }
  const m = (o.description || "").match(/(\d+[.,]\d+)\s*(?:kr\.?\s*)?pr\.?\s*(kg|l|liter|stk)/i);
  return m ? `${m[1]} kr/${m[2].toLowerCase()}` : "";
}

async function tilbudSync(req: Request, force: boolean) {
  const { data: inn } = await admin.from("innstillinger").select("*").eq("id", 1).single();
  if (!inn) return json({ error: "Innstillinger mangler. Kjør schema.sql." }, 500);

  const sist = inn.tilbud_hentet ? Date.parse(inn.tilbud_hentet) : 0;
  let erMedlem = false;
  if (force) {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (token) {
      const brukerKlient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
      });
      const { data } = await brukerKlient.rpc("er_medlem");
      erMedlem = data === true;
    }
  }
  const minAlder = erMedlem ? 10 * 60_000 : 2 * 3600_000;
  if (Date.now() - sist < minAlder) {
    return json({ ok: true, hoppet_over: true, hentet: inn.tilbud_hentet });
  }

  const start = new Date().toISOString();
  const onsket = new Set((inn.kjeder as string[]).map(norm));
  const felles = { r_lat: inn.lat, r_lng: inn.lng, r_radius: Math.round(inn.radius_km * 1000), r_locale: "nb_NO" };

  try {
    // 1) Kundeaviser i nærheten fra kjedene vi følger
    const kataloger: any[] = [];
    for (const type of ["paged", "incito"]) {
      try {
        for (let side = 0; side < 5; side++) {
          const batch = await tjek("/catalogs", { ...felles, types: type, limit: 100, offset: side * 100 });
          if (!Array.isArray(batch)) break;
          kataloger.push(...batch);
          if (batch.length < 100) break;
        }
      } catch (e) {
        if (type === "paged") throw e; // digitale kundeaviser er en bonus; papirutgavene må virke
      }
    }
    const naa = Date.now();
    const valgte = kataloger.filter((c) =>
      onsket.has(norm(c.branding?.name || "")) && (!c.run_till || Date.parse(isoTid(c.run_till)!) > naa)
    );
    const unike = [...new Map(valgte.map((c) => [c.id, c])).values()];

    // 2) Tilbudene i hver kundeavis
    const rader: any[] = [];
    for (const k of unike) {
      for (let offset = 0; offset < 1500; offset += 100) {
        const batch = await tjek("/offers", { catalog_id: k.id, r_locale: "nb_NO", limit: 100, offset });
        if (!Array.isArray(batch) || !batch.length) break;
        for (const o of batch) {
          if (!o?.id || !o.heading) continue;
          rader.push({
            id: o.id,
            kjede: o.branding?.name || k.branding?.name || "",
            tittel: String(o.heading).trim(),
            beskrivelse: String(o.description || "").trim(),
            pris: o.pricing?.price ?? null,
            forpris: o.pricing?.pre_price ?? null,
            enhetspris: enhetspris(o),
            bilde: o.images?.thumb || "",
            bilde_stor: o.images?.zoom || o.images?.view || "",
            gyldig_fra: isoTid(o.run_from),
            gyldig_til: isoTid(o.run_till),
            katalog_id: k.id,
            katalog_side: o.catalog_page ?? null,
            hentet: start,
          });
        }
        if (batch.length < 100) break;
      }
    }

    const unikeRader = [...new Map(rader.map((r) => [r.id, r])).values()];
    for (let i = 0; i < unikeRader.length; i += 500) {
      const { error } = await admin.from("tilbud").upsert(unikeRader.slice(i, i + 500), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    // Fjern utgåtte og de som ikke lenger finnes
    if (unikeRader.length) await admin.from("tilbud").delete().lt("hentet", start);
    await admin.from("tilbud").delete().lt("gyldig_til", new Date().toISOString());

    const kjeder = [...new Set(unikeRader.map((r) => r.kjede))].sort();
    const status = `${unikeRader.length} tilbud fra ${kjeder.length} kjeder`;
    await admin.from("innstillinger").update({ tilbud_hentet: start, tilbud_status: status }).eq("id", 1);
    return json({ ok: true, antall: unikeRader.length, kjeder, hentet: start });
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e);
    await admin.from("innstillinger").update({ tilbud_status: `Feil: ${melding}` }).eq("id", 1);
    return json({ error: melding }, 502);
  }
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
    if (action === "tilbud-sync") return await tilbudSync(req, Boolean(p("force")));
    return json({ error: "Ukjent handling" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
