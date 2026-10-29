// /api/download -> the Rosen Air workbook with button-added airports merged into the
// Airports sheet (sheet1) in date order. Edits the sheet XML directly, so every other
// part of the workbook (Original data, Key, comments, styles) is byte-for-byte unchanged.
import type { Config } from "@netlify/functions";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { listAdded, fd } from "../lib/shared.mjs";

const SHEET = "xl/worksheets/sheet1.xml";
// style ids already defined in the workbook's styles.xml
const S = { date: 6, coord: 7, note: 8, keyYellow: 9, keyRed: 10 };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const str = (ref: string, v: string, s?: number) =>
  `<c r="${ref}"${s ? ` s="${s}"` : ""} t="inlineStr">${v ? `<is><t>${esc(v)}</t></is>` : ""}</c>`;
const num = (ref: string, v: number, s: number) => `<c r="${ref}" s="${s}" t="n"><v>${v}</v></c>`;
const serial = (iso: string) => Math.round((Date.parse(iso + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000);

function rowXml(a: any) {
  const key = a.flags || "";
  const ks = key.includes("C") ? S.keyRed : key ? S.keyYellow : undefined;
  return `<row r="0">` +
    str("A0", a.id) + num("B0", serial(a.date), S.date) + str("C0", a.name) + str("D0", a.city) +
    str("E0", a.st) + str("F0", a.ctry) + str("G0", key, ks) + num("H0", a.lat, S.coord) +
    num("I0", a.lon, S.coord) + str("J0", a.note || "", S.note) + str("K0", `Added via map on ${fd(a.added)}`) +
    `</row>`;
}

export default async (req: Request) => {
  const base = await fetch(new URL("/RosenAir_Airports_Visited.xlsx", req.url));
  if (!base.ok) return new Response("Base workbook missing", { status: 500 });
  const bytes = new Uint8Array(await base.arrayBuffer());
  const added = await listAdded();
  if (!added.length) return send(bytes);

  const files = unzipSync(bytes);
  let xml = strFromU8(files[SHEET]);
  const m = xml.match(/<sheetData>([\s\S]*)<\/sheetData>/);
  if (!m) return new Response("Unexpected workbook layout", { status: 500 });
  const all = m[1].match(/<row [\s\S]*?<\/row>/g) || [];
  const header = all[0];
  const dateOf = (r: string) => +(r.match(/<c r="B\d+"[^>]*><v>(\d+)<\/v>/)?.[1] || 0);
  const rows = [...all.slice(1), ...added.map(rowXml)].sort((p, q) => dateOf(p) - dateOf(q)); // stable sort

  const renum = (r: string, n: number) =>
    r.replace(/<row r="\d+"/, `<row r="${n}"`).replace(/<c r="([A-K])\d+"/g, `<c r="$1${n}"`);
  const body = [header, ...rows.map((r, i) => renum(r, i + 2))].join("");
  const last = rows.length + 1;
  xml = xml.replace(m[1], () => body)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:K${last}"/>`)
    .replace(/<autoFilter ref="[^"]*"\/>/, `<autoFilter ref="A1:K${last}"/>`);
  files[SHEET] = strToU8(xml);
  return send(zipSync(files, { level: 6 }));
};

const send = (b: Uint8Array) =>
  new Response(b, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="RosenAir_Airports_Visited.xlsx"',
      "cache-control": "no-store",
    },
  });

export const config: Config = { path: "/api/download", method: "GET" };
