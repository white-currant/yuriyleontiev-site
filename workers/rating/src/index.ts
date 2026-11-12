// Сервер голосов для страницы рейтинга (rating/) — Cloudflare Worker + база D1.
// Перенесён с Val Town (scripts/rating-val.ts) 2026-11-13: Val Town закрывается 10.01.2027.
// Выкладка: workers/deploy.sh rating. Секрет RATING_SALT — соль для отпечатков адресов.
//
// GET  → { "<id трека>": [число голосов, сумма оценок], ... }
// POST { id, v, voter } → то же для этого трека. Один браузер (voter) — один голос за трек; новый голос заменяет старый.
// Адреса посетителей не хранятся — только их отпечаток с солью, чтобы ограничивать накрутку.

const ORIGINS = ["https://yuriyleontiev.music", "http://127.0.0.1:8047", "http://localhost:8047"];

// треки «Мастерской 47», Vol. 1–3 (id из Apple Music) — голоса за что-то другое не принимаются
const TRACKS = new Set(
  "1853557590,1853557803,1853557806,1853557810,1853557812,1853557817,1853557823,1853557825,1853557829,1853557831,1853557985,1853557988,1853557991,1853557994,1853557998,1853557999,1853558003,1853558005,1888776832,1888776836,1888776837,1888776838,1888776839,1888776840,1888776843,1888776844,1888776849,1888776851,1888776852,1888776949,1888776951,1888776953,1888776954,1888776955,6830543169,6830543190,6830543196,6830543360,6830543371,6830543503,6830543513,6830543747,6830543766,6830543882,6830543994,6830544006,6830544187,6830544237,6830544247,6830544254"
    .split(","),
);
const PER_MINUTE = 40; // голосов с одного адреса в минуту — больше похоже на скрипт
const PER_TRACK = 6; // разных браузеров с одного адреса за один трек (семья, общий Wi-Fi, мобильный оператор)

let DB: any = null;
let ENV: any = {};

function rows(r: any): any[][] {
  return (r.rows || []).map((x: any) => Array.isArray(x) ? x : r.columns.map((c: string) => x[c]));
}

async function hash(s: string) {
  const salt = ENV.RATING_SALT || "w47";
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + s));
  return [...new Uint8Array(b)].slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function totals(track?: string) {
  const r = track
    ? await DB.prepare("SELECT track, COUNT(*), SUM(v) FROM w47_votes WHERE track = ? GROUP BY track").bind(track).raw()
    : await DB.prepare("SELECT track, COUNT(*), SUM(v) FROM w47_votes GROUP BY track").raw();
  const out: Record<string, [number, number]> = {};
  for (const [t, n, s] of r as any[][]) out[t] = [Number(n), Number(s)];
  return out;
}

export default {
  async fetch(req: Request, env: any): Promise<Response> {
    DB = env.DB; ENV = env;
    return handle(req);
  },
};

async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin") || "";
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET") return json(await totals(), 200, { "Cache-Control": "public, max-age=15" });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (origin && !ORIGINS.includes(origin)) return json({ error: "origin" }, 403);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "json" }, 400); }
  const id = String(b?.id || ""), v = Number(b?.v), voter = String(b?.voter || "");
  if (!TRACKS.has(id) || !Number.isInteger(v) || v < 1 || v > 12 || !/^[a-z0-9]{8,40}$/.test(voter)) {
    return json({ error: "bad vote" }, 400);
  }

  const ip = await hash(req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown");
  const now = Date.now();
  const recent = (await DB.prepare("SELECT COUNT(*) FROM w47_votes WHERE ip = ? AND at > ?").bind(ip, now - 60_000).raw())[0][0];
  if (Number(recent) >= PER_MINUTE) return json({ error: "slow down" }, 429);
  const known = (await DB.prepare("SELECT COUNT(*) FROM w47_votes WHERE track = ? AND voter = ?").bind(id, voter).raw())[0][0];
  if (!Number(known)) {
    const same = (await DB.prepare("SELECT COUNT(*) FROM w47_votes WHERE track = ? AND ip = ?").bind(id, ip).raw())[0][0];
    if (Number(same) >= PER_TRACK) return json({ error: "too many" }, 429);
  }

  await DB.prepare(`INSERT INTO w47_votes (track, voter, v, ip, at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (track, voter) DO UPDATE SET v = excluded.v, ip = excluded.ip, at = excluded.at`).bind(id, voter, v, ip, now).run();
  return json(await totals(id));
}
