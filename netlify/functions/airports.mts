// /api/airports
//   GET                               -> { added: [...] }   (public; the map merges these on load)
//   POST {action:"lookup", id, pin}   -> { airport }        (resolve ID via OurAirports, no save)
//   POST {action:"add", id, date, pin}-> { airport }        (resolve + save)
//   POST {action:"remove", id, pin}   -> { removed: id }    (only button-added airports)
import type { Config } from "@netlify/functions";
import { BASE_IDS, store, listAdded, lookup, pinOk, validDate, json, fd } from "../lib/shared.mjs";

async function handle(req: Request) {
  if (req.method === "GET") return json({ added: await listAdded() });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (!pinOk(body.pin)) return json({ error: "Wrong PIN.", pin: false }, 401);

  const action = body.action;
  if (action === "remove") {
    const id = String(body.id || "").trim().toUpperCase();
    if (BASE_IDS[id]) return json({ error: `${id} is in the original log and can't be removed here.` }, 400);
    const s = store();
    if (!(await s.get(id))) return json({ error: `${id} isn't an added airport.` }, 404);
    await s.delete(id);
    return json({ removed: id });
  }

  if (action !== "lookup" && action !== "add") return json({ error: "Unknown action." }, 400);
  if (action === "add" && !validDate(body.date)) return json({ error: "Enter a valid date first visited (1980 or later, not in the future)." }, 400);

  let res;
  try { res = await lookup(body.id); } catch (e: any) { return json({ error: "Airport lookup failed: " + e.message }, 502); }
  if (res.error) return json({ error: res.error }, 404);
  const ap = res.airport;

  if (BASE_IDS[ap.id]) return json({ error: `${ap.id} is already in the log (first visited ${fd(BASE_IDS[ap.id])}).` }, 409);
  const s = store();
  const existing: any = await s.get(ap.id, { type: "json" });
  if (existing) return json({ error: `${ap.id} was already added (first visited ${fd(existing.date)}).` }, 409);

  if (action === "lookup") return json({ airport: ap });

  const rec = { ...ap, date: body.date, note: "", added: new Date().toISOString().slice(0, 10) };
  const r = await s.setJSON(ap.id, rec, { onlyIfNew: true });
  if (r && r.modified === false) return json({ error: `${ap.id} was already added.` }, 409);
  return json({ airport: rec });
}

// Any unexpected failure comes back as a readable JSON error (shown in the popup) instead of a bare 502.
export default async (req: Request) => {
  try { return await handle(req); }
  catch (e: any) { console.error(e); return json({ error: "Server problem: " + (e?.message || e) }, 500); }
};

export const config: Config = {
  path: "/api/airports",
  method: ["GET", "POST"],
  // slows PIN guessing: 30 requests/minute per IP
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
