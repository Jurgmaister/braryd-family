// ---------- Datoer ----------
export const UKEDAGER = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

export function isoDato(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const fraIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const iDag = () => isoDato(new Date());

export function mandagI(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = mandag
  x.setDate(x.getDate() - dow);
  return x;
}
export function leggTilDager(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export function ukenummer(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dag);
  const aarStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - aarStart) / 86400000 + 1) / 7);
}

export const kortDato = (s) => { const d = typeof s === 'string' ? fraIso(s.slice(0, 10)) : s; return `${d.getDate()}. ${MND[d.getMonth()]}`; };

export function relativDato(s) {
  if (!s) return '';
  const d = fraIso(s.slice(0, 10));
  const dager = Math.round((fraIso(iDag()) - d) / 86400000);
  if (dager === 0) return 'i dag';
  if (dager === 1) return 'i går';
  if (dager > 1 && dager < 7) return `for ${dager} dager siden`;
  if (dager >= 7 && dager < 14) return 'forrige uke';
  if (dager >= 14 && dager < 60) return `for ${Math.round(dager / 7)} uker siden`;
  return kortDato(d) + (d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '');
}

export function tidSiden(ts) {
  if (!ts) return 'aldri';
  const min = Math.round((Date.now() - Date.parse(ts)) / 60000);
  if (min < 1) return 'akkurat nå';
  if (min < 60) return `for ${min} min siden`;
  const t = Math.round(min / 60);
  if (t < 24) return `for ${t} t siden`;
  return `for ${Math.round(t / 24)} d siden`;
}

export function gyldigTekst(fra, til) {
  const naa = Date.now();
  if (fra && Date.parse(fra) > naa) {
    const d = new Date(fra);
    return `fra ${UKEDAGER[d.getDay()]} ${d.getDate()}. ${MND[d.getMonth()]}`;
  }
  if (!til) return '';
  const d = new Date(til);
  return `til ${UKEDAGER[d.getDay()]} ${d.getDate()}. ${MND[d.getMonth()]}`;
}

export const kr = (n) => (n == null ? '' : `${Number(n).toFixed(2).replace('.', ',').replace(',00', ',-')}`);

// ---------- Tekst ----------
export const normaliser = (s) => (s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();

const ENHETER = 'stk|stykk|pk|pakke|pakker|pose|poser|boks|bokser|flaske|flasker|liter|l|dl|kg|kilo|g|gram|hg|brett|kartong|kartonger|glass|beger|bunt|nett';
const TALL_ORD = { en: '1', ett: '1', ei: '1', to: '2', tre: '3', fire: '4', fem: '5', seks: '6', sju: '7', syv: '7', åtte: '8', ni: '9', ti: '10', tolv: '12' };
const ANTALL_RE = new RegExp(`^(\\d+(?:[.,]\\d+)?|${Object.keys(TALL_ORD).join('|')})\\s*(${ENHETER})?\\.?\\s+(.+)$`, 'i');

// «2 liter melk, egg og brød» → [{navn:'Melk', antall:'2 liter'}, {navn:'Egg'}, {navn:'Brød'}]
export function tolkVarer(input) {
  return (input || '')
    .replace(/[.!?]+$/g, '')
    .split(/\s*(?:,|;|\n|\bog\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((del) => {
      let navn = del;
      let antall = '';
      const m = del.match(ANTALL_RE);
      if (m) {
        const tall = TALL_ORD[m[1].toLowerCase()] ?? m[1];
        antall = m[2] ? `${tall} ${m[2].toLowerCase()}` : tall;
        navn = m[3];
      }
      return { navn: navn.charAt(0).toUpperCase() + navn.slice(1), antall };
    });
}

// Én ingrediens per linje; tar bort mengder som «400 g» foran.
export function ingrediensLinjer(tekst) {
  return (tekst || '').split('\n').map((l) => l.replace(/^[-•*\s]+/, '').trim()).filter(Boolean)
    .map((l) => {
      const m = l.match(ANTALL_RE);
      if (!m) return { navn: l.charAt(0).toUpperCase() + l.slice(1), antall: '' };
      const tall = TALL_ORD[m[1].toLowerCase()] ?? m[1];
      return { navn: m[3].charAt(0).toUpperCase() + m[3].slice(1), antall: m[2] ? `${tall} ${m[2].toLowerCase()}` : tall };
    });
}

// ---------- Tilbud mot varer ----------
const BOKSTAV = 'a-z0-9æøåéèäöü';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FYLLORD = new Set(['og', 'med', 'i', 'til', 'av', 'en', 'ett', 'ei', 'for', 'uten', 'fersk', 'ferske', 'stor', 'liten', 'små']);

// Flertall og bestemt form: «agurker» → agurk, «epler» → eple, «bananene» → banan
function varianter(o) {
  const v = new Set([o]);
  if (o.length > 4 && o.endsWith('ene')) { v.add(o.slice(0, -3)); v.add(o.slice(0, -2)); }
  if (o.length > 4 && o.endsWith('er')) { v.add(o.slice(0, -2)); v.add(o.slice(0, -1)); }
  if (o.length > 4 && o.endsWith('en')) v.add(o.slice(0, -2));
  return [...v].filter((x) => x.length >= 2).map(escape).join('|');
}

// Bygger en sjekk for et varenavn og gir poeng for hvor godt et tilbud passer.
// Norske sammensatte ord har hovedordet sist, så korte ord må være hele ord eller stå sist i et ord:
// «melk» treffer «Lettmelk», men ikke «Melkesjokolade»; «ost» treffer «Brunost», men ikke «Toast».
// Lengre ord kan stå hvor som helst («kylling» treffer «Kyllingfilet»).
export function lagTreffer(varenavn) {
  const ord = normaliser(varenavn).split(/[^a-z0-9æøåéèäöü]+/).filter((o) => o.length >= 2 && !FYLLORD.has(o));
  if (!ord.length) return () => 0;
  const reg = ord.map((o) => (o.length >= 5
    ? new RegExp(`(${varianter(o)})`)
    : new RegExp(`(${varianter(o)})(?:er|r|ene|ne|en|e)?(?![${BOKSTAV}])`)));
  const hode = reg[reg.length - 1];
  return (tilbud) => {
    const t = tilbud._sok || (tilbud._sok = normaliser(`${tilbud.tittel} ${tilbud.beskrivelse}`));
    if (!hode.test(t)) return 0; // hovedordet (sist i varenavnet) må alltid treffe
    return reg.filter((r) => r.test(t)).length;
  };
}

export function tilbudFor(varenavn, alle) {
  const poeng = lagTreffer(varenavn);
  return alle.map((t) => [t, poeng(t)]).filter(([, p]) => p > 0)
    .sort((a, b) => (b[1] - a[1]) || ((a[0].pris ?? 1e9) - (b[0].pris ?? 1e9)))
    .map(([t]) => t);
}

export function initialer(navn) {
  return (navn || '?').split(/\s+/).map((d) => d[0]).join('').slice(0, 2).toUpperCase();
}
