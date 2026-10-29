// Shared helpers for the Add airport functions.
import { getStore } from "@netlify/blobs";
import BASE from "./base-ids.json" with { type: "json" };

export const BASE_IDS = BASE; // { ID: "YYYY-MM-DD" } for the 219 airports in the original log

// One blob per added airport (key = ID) — no read-modify-write on a shared key.
export const store = () => getStore({ name: "added-airports", consistency: "strong" });

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const fd = (s) => { const [y, m, d] = s.split("-"); return `${d}-${MON[+m - 1]}-${y}`; };

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function pinOk(pin) {
  const want = Netlify.env.get("AIRPORT_PIN");
  // case-insensitive so "513r" works on a phone keyboard
  return !!want && String(pin || "").trim().toUpperCase() === want.trim().toUpperCase();
}

export async function listAdded() {
  const s = store();
  const { blobs } = await s.list();
  const rows = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return rows.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// ---- OurAirports lookup (fetched at runtime, cached while the function stays warm) ----
const SRC = "https://davidmegginson.github.io/ourairports-data/";
let cache = null;

function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...data] = rows;
  return data.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
}

async function load() {
  if (cache) return cache;
  const [ap, co] = await Promise.all(
    ["airports.csv", "countries.csv"].map(async (f) => {
      const r = await fetch(SRC + f);
      if (!r.ok) throw new Error(`OurAirports ${f}: HTTP ${r.status}`);
      return parseCSV(await r.text());
    })
  );
  const countries = Object.fromEntries(co.map((c) => [c.code, c.name]));
  cache = { airports: ap, countries };
  return cache;
}

const isICAO = (s) => /^[A-Z]{4}$/.test(s || "");

export async function lookup(raw) {
  const q = String(raw || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,7}$/.test(q)) return { error: "Enter an airport ID like KSBA, SBA, L88 or MMLT." };
  const { airports, countries } = await load();
  const tiers = [
    (a) => a.ident === q || a.icao_code === q,
    (a) => a.gps_code === q,
    (a) => /^[A-Z]{3}$/.test(q) && a.ident === "K" + q,
    (a) => a.iso_country === "US" && a.local_code === q,
    (a) => a.iata_code === q,
  ];
  let hit = null;
  for (const t of tiers) {
    const m = airports.filter(t);
    if (m.length) { hit = m.find((a) => a.type !== "closed") || m[0]; break; }
  }
  if (!hit) return { error: `No airport found for ${q} in the OurAirports database.` };

  const icao = [hit.icao_code, hit.gps_code, hit.ident].find(isICAO) || "";
  const id = icao || hit.local_code || hit.ident;
  const flags = (hit.type === "closed" ? "C" : "") + (icao ? "" : "F");
  const region = hit.iso_region.includes("-") ? hit.iso_region.split("-")[1] : hit.iso_region;
  return {
    airport: {
      id,
      name: hit.name,
      city: hit.municipality,
      st: region,
      ctry: countries[hit.iso_country] || hit.iso_country,
      flags,
      lat: Math.round(+hit.latitude_deg * 1e5) / 1e5,
      lon: Math.round(+hit.longitude_deg * 1e5) / 1e5,
      typed: q,
    },
  };
}

export function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s && s >= "1980-01-01" && d.getTime() <= Date.now() + 86400000;
}
