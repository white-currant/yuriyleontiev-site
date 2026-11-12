// Сервер мини-приложения «Игры» бота StarGuardian (страница games/) — HTTP val на Val Town.
// Как поставить: val.town → New → HTTP val → вставить этот файл целиком → Save. Адрес вида
// https://<имя>-<val>.web.val.run вписать в games/index.html (var API = "...") и в config.json бота (games_api).
// В настройках val (Environment variables) добавить GAMES_KEY — тот же ключ, что в ~/.config/chatguard/games_key на Proxima.
//
// Игроков проверяем по подписи Телеграма (Ed25519, открытый ключ Телеграма) — токен бота здесь не нужен.
// Очки, заработанные в игре, копятся как события; бот на Proxima раз в минуту забирает их (GET /bot/events),
// начисляет, ставит звания в теги и присылает обратно профили для таблицы лидеров (POST /bot/profiles).
//
// Игрок:  POST /api/me | /api/round | /api/answer | /api/top   (заголовок X-Init-Data — Telegram.WebApp.initData)
//         GET  /audio/<раунд>                                   (отрывок трека, не выдаёт, какой это трек)
// Бот:    GET  /bot/events?after=N | POST /bot/profiles          (заголовок X-Games-Key)
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";

const BOT_ID = 8990614166; // @starguardian_yl_bot
const TG_KEY = "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d"; // открытый ключ Телеграма (production)
const SITE = "https://yuriyleontiev.music";
const ORIGINS = [SITE, "http://127.0.0.1:8047", "http://localhost:8047"];
const SCORED_PER_DAY = 12; // раундов в день, за которые даются очки; дальше — тренировка без очков
const ROUND_SECONDS = 20;
const TZ_SHIFT = 3 * 3600; // «день» считаем по Минску

// [id Apple Music, том, номер, название] — «Мастерская 47», Vol. 1–3
const TRACKS: [string, number, number, string][] = [["1853557590",1,1,"Climb of the Formics"],["1853557803",1,2,"Thoughtform"],["1853557806",1,3,"Can You Be a Hero?"],["1853557810",1,4,"Digital Wind"],["1853557812",1,5,"Garden of Eidos"],["1853557817",1,6,"Tiny Companions"],["1853557823",1,7,"Electric Petal"],["1853557825",1,8,"Under the Living Sky"],["1853557829",1,9,"Voice Above the World"],["1853557831",1,10,"Together Always"],["1853557985",1,11,"Synthetic Flora"],["1853557988",1,12,"Where Life Begins"],["1853557991",1,13,"Subtle Forms"],["1853557994",1,14,"Inside the Stem"],["1853557998",1,15,"Falling Giants"],["1853557999",1,16,"Revelation"],["1853558003",1,17,"The First Danger"],["1853558005",1,18,"The Formics' song"],["1888776832",2,1,"External Control"],["1888776836",2,2,"New Territories"],["1888776837",2,3,"Chuck"],["1888776838",2,4,"Amarin"],["1888776839",2,5,"Mad Organ Grinder"],["1888776840",2,6,"Nothing Is the Same Anymore"],["1888776843",2,7,"Ivett"],["1888776844",2,8,"Cyber Intrusion"],["1888776849",2,9,"Vakhub"],["1888776851",2,10,"Friends"],["1888776852",2,11,"Something Is Wrong"],["1888776949",2,12,"Iliar"],["1888776951",2,13,"Reality Layer Compromised"],["1888776953",2,14,"White Void"],["1888776954",2,15,"Ascension"],["1888776955",2,16,"Wild Barrel Organ Melody"],["6830543169",3,1,"Hidden in the Nuances"],["6830543190",3,2,"Luma (feat. The Veresk)"],["6830543196",3,3,"Neitz Canyon"],["6830543360",3,4,"Canyon Run"],["6830543371",3,5,"The Warmth of a Mother"],["6830543503",3,6,"Cyberattack, Again"],["6830543513",3,7,"Under the Desert Sun"],["6830543747",3,8,"The Dark Forest"],["6830543766",3,9,"The Exalted Kingdom"],["6830543882",3,10,"Still Waters"],["6830543994",3,11,"Glassy Waters"],["6830544006",3,12,"Grevsburg"],["6830544187",3,13,"The Dark Side of the City"],["6830544237",3,14,"In the Shadows"],["6830544247",3,15,"Truth"],["6830544254",3,16,"One Spark"]];
const BY_ID = new Map(TRACKS.map((t) => [t[0], t]));

const RANKS: [number, string][] = [[0, "Ученик звёзд"], [30, "Ловец комет"], [100, "Чтец созвездий"], [250, "Заклинатель"],
  [500, "Звездочёт"], [1000, "Маг туманностей"], [2000, "Хранитель сфер"], [4000, "Верховный маг"], [8000, "Звёздный оракул"]];

await sqlite.batch([
  `CREATE TABLE IF NOT EXISTS g_rounds (id TEXT PRIMARY KEY, user INTEGER NOT NULL, track TEXT NOT NULL,
     options TEXT NOT NULL, started INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS g_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user INTEGER NOT NULL, name TEXT,
     delta INTEGER NOT NULL, reason TEXT, at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS g_users (user INTEGER PRIMARY KEY, name TEXT, day TEXT, scored INTEGER DEFAULT 0,
     earned_today INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, best_streak INTEGER DEFAULT 0,
     played INTEGER DEFAULT 0, correct INTEGER DEFAULT 0, recent TEXT DEFAULT '[]')`,
  `CREATE TABLE IF NOT EXISTS g_profiles (user INTEGER PRIMARY KEY, name TEXT, points INTEGER, karma INTEGER,
     title TEXT, next INTEGER, place INTEGER, updated INTEGER)`,
  `CREATE TABLE IF NOT EXISTS g_meta (key TEXT PRIMARY KEY, value TEXT)`,
]);

function rows(r: any): any[][] {
  return (r.rows || []).map((x: any) => Array.isArray(x) ? x : r.columns.map((c: string) => x[c]));
}
const q = async (sql: string, args: any[] = []) => rows(await sqlite.execute({ sql, args }));
const now = () => Math.floor(Date.now() / 1000);
const today = () => new Date((now() + TZ_SHIFT) * 1000).toISOString().slice(0, 10);

function rankOf(points: number) {
  let i = 0;
  RANKS.forEach(([need], j) => { if (points >= need) i = j; });
  return { title: RANKS[i][1], next: i + 1 < RANKS.length ? RANKS[i + 1][0] : null };
}

// ---------- проверка игрока: подпись Телеграма Ed25519 ----------

const hex = (s: string) => new Uint8Array(s.match(/../g)!.map((b) => parseInt(b, 16)));
const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
let tgKey: CryptoKey | null = null;
export const testing = { key: TG_KEY, audioBase: SITE }; // только для проверки у себя: подменить ключ и адрес отрывков

export async function verifyInitData(raw: string, keyHex = testing.key, botId = BOT_ID): Promise<any | null> {
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  const sig = p.get("signature");
  if (!sig) return null;
  const pairs = [...p.entries()].filter(([k]) => k !== "hash" && k !== "signature").sort(([a], [b]) => (a < b ? -1 : 1));
  const check = `${botId}:WebAppData\n` + pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const key = keyHex === TG_KEY && tgKey ? tgKey
    : await crypto.subtle.importKey("raw", hex(keyHex), { name: "Ed25519" }, false, ["verify"]);
  if (keyHex === TG_KEY) tgKey = key;
  let ok = false;
  try { ok = await crypto.subtle.verify("Ed25519", key, b64url(sig), new TextEncoder().encode(check)); } catch { ok = false; }
  if (!ok) return null;
  if (now() - Number(p.get("auth_date") || 0) > 86400) return null; // данные старше суток — открыть приложение заново
  try { return JSON.parse(p.get("user") || "null"); } catch { return null; }
}

const nameOf = (u: any) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "Без имени";

async function player(u: any) {
  await q("INSERT OR IGNORE INTO g_users (user, name, day) VALUES (?, ?, ?)", [u.id, nameOf(u), today()]);
  await q("UPDATE g_users SET name = ? WHERE user = ?", [nameOf(u), u.id]);
  const [row] = await q("SELECT day, scored, earned_today, streak, best_streak, played, correct, recent FROM g_users WHERE user = ?", [u.id]);
  let [day, scored, earned, streak, best, played, correct, recent] = row;
  if (day !== today()) {
    await q("UPDATE g_users SET day = ?, scored = 0, earned_today = 0 WHERE user = ?", [today(), u.id]);
    scored = 0; earned = 0;
  }
  return { scored: Number(scored), earned: Number(earned), streak: Number(streak), best: Number(best),
           played: Number(played), correct: Number(correct), recent: JSON.parse(recent || "[]") as string[] };
}

async function profile(u: any) {
  const g = await player(u);
  const [snap] = await q("SELECT points, karma, place, updated FROM g_profiles WHERE user = ?", [u.id]);
  const consumed = Number((await q("SELECT value FROM g_meta WHERE key = 'consumed'"))[0]?.[0] || 0);
  const pending = Number((await q("SELECT COALESCE(SUM(delta), 0) FROM g_events WHERE user = ? AND id > ?", [u.id, consumed]))[0][0]);
  const points = Number(snap?.[0] || 0) + pending;
  return { name: nameOf(u), points, karma: Number(snap?.[1] || 0), place: snap ? Number(snap[2]) : null, ...rankOf(points),
           today: { scored: g.scored, max: SCORED_PER_DAY, earned: g.earned }, streak: g.streak, best_streak: g.best,
           played: g.played, correct: g.correct };
}

// ---------- «Угадай трек» ----------

function pick<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

async function newRound(u: any) {
  const g = await player(u);
  const fresh = TRACKS.filter((t) => !g.recent.includes(t[0]));
  const track = pick(fresh.length ? fresh : TRACKS, 1)[0];
  const others = pick(TRACKS.filter((t) => t[0] !== track[0]), 3);
  const options = pick([track, ...others], 4).map((t) => t[0]);
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await q("INSERT INTO g_rounds (id, user, track, options, started) VALUES (?, ?, ?, ?, ?)", [id, u.id, track[0], JSON.stringify(options), now()]);
  await q("UPDATE g_users SET recent = ? WHERE user = ?", [JSON.stringify([track[0], ...g.recent].slice(0, 20)), u.id]);
  await q("DELETE FROM g_rounds WHERE started < ?", [now() - 86400]);
  return { round: id, audio: `/audio/${id}`, seconds: ROUND_SECONDS,
           options: options.map((tid) => ({ id: tid, title: BY_ID.get(tid)![3] })),
           practice: g.scored >= SCORED_PER_DAY };
}

async function answer(u: any, round: string, choice: string) {
  const [r] = await q("SELECT user, track, options, started, done FROM g_rounds WHERE id = ?", [round]);
  if (!r || Number(r[0]) !== u.id) return { error: "Раунд не найден" };
  if (Number(r[4])) return { error: "Уже отвечено" };
  await q("UPDATE g_rounds SET done = 1 WHERE id = ?", [round]);
  const g = await player(u);
  const elapsed = now() - Number(r[3]);
  const right = choice === r[1];
  const late = elapsed > ROUND_SECONDS + 5;
  let points = 0, bonus = 0;
  const streak = right && !late ? g.streak + 1 : 0;
  const scoring = g.scored < SCORED_PER_DAY;
  if (right && !late && scoring) {
    points = elapsed <= 8 ? 10 : elapsed <= 15 ? 7 : 5;
    if (streak % 5 === 0) bonus = 5; // каждые 5 угаданных подряд
  }
  await q(`UPDATE g_users SET streak = ?, best_streak = MAX(best_streak, ?), played = played + 1, correct = correct + ?,
             scored = scored + ?, earned_today = earned_today + ? WHERE user = ?`,
          [streak, streak, right ? 1 : 0, scoring ? 1 : 0, points + bonus, u.id]);
  if (points + bonus > 0) {
    await q("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, ?, ?, ?, ?)",
            [u.id, nameOf(u), points + bonus, "Угадай трек" + (bonus ? ", серия" : ""), now()]);
  }
  const t = BY_ID.get(r[1])!;
  return { right, late, points, bonus, streak, practice: !scoring,
           answer: { id: t[0], title: t[3], vol: t[1], n: t[2] }, me: await profile(u) };
}

async function top() {
  const all = await q("SELECT name, points, title FROM g_profiles WHERE points > 0 ORDER BY points DESC LIMIT 10");
  const day = await q("SELECT name, earned_today FROM g_users WHERE day = ? AND earned_today > 0 ORDER BY earned_today DESC LIMIT 5", [today()]);
  return { all: all.map(([name, points, title]) => ({ name, points: Number(points), title })),
           today: day.map(([name, points]) => ({ name, points: Number(points) })) };
}

// ---------- HTTP ----------

export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get("origin") || "";
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Init-Data",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // отрывок для раунда — по номеру раунда, имя файла наружу не уходит
  if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
    const [r] = await q("SELECT track FROM g_rounds WHERE id = ?", [url.pathname.slice(7)]);
    const t = r && BY_ID.get(r[0]);
    if (!t) return new Response("not found", { status: 404, headers: cors });
    const file = `${testing.audioBase}/rating/previews/v${t[1]}-${String(t[2]).padStart(2, "0")}.m4a`;
    const res = await fetch(file);
    return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "audio/mp4", "Cache-Control": "private, max-age=600" } });
  }

  // бот на Proxima
  if (url.pathname.startsWith("/bot/")) {
    const key = Deno.env.get("GAMES_KEY");
    if (!key || req.headers.get("x-games-key") !== key) return json({ error: "key" }, 403);
    if (req.method === "GET" && url.pathname === "/bot/events") {
      const after = Number(url.searchParams.get("after") || 0);
      const ev = await q("SELECT id, user, name, delta, reason FROM g_events WHERE id > ? ORDER BY id LIMIT 500", [after]);
      return json(ev.map(([id, user, name, delta, reason]) => ({ id: Number(id), user: Number(user), name, delta: Number(delta), reason })));
    }
    if (req.method === "POST" && url.pathname === "/bot/profiles") {
      const body = await req.json();
      for (const p of body.profiles || []) {
        await q(`INSERT INTO g_profiles (user, name, points, karma, title, next, place, updated) VALUES (?,?,?,?,?,?,?,?)
                 ON CONFLICT(user) DO UPDATE SET name=excluded.name, points=excluded.points, karma=excluded.karma,
                 title=excluded.title, next=excluded.next, place=excluded.place, updated=excluded.updated`,
                [p.user, p.name, p.points, p.karma, p.title, p.next, p.place, now()]);
      }
      if (body.consumed != null) {
        await q("INSERT INTO g_meta (key, value) VALUES ('consumed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(body.consumed)]);
        await q("DELETE FROM g_events WHERE id <= ? AND at < ?", [Number(body.consumed), now() - 30 * 86400]);
      }
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  // игрок
  if (req.method !== "POST" || !url.pathname.startsWith("/api/")) return json({ error: "method" }, 405);
  if (origin && !ORIGINS.includes(origin)) return json({ error: "origin" }, 403);
  const user = await verifyInitData(req.headers.get("x-init-data") || "");
  if (!user?.id) return json({ error: "Открой игру из Телеграма" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { /* пустое тело */ }
  switch (url.pathname) {
    case "/api/me": return json(await profile(user));
    case "/api/round": return json(await newRound(user));
    case "/api/answer": return json(await answer(user, String(body.round || ""), String(body.choice || "")));
    case "/api/top": return json(await top());
  }
  return json({ error: "not found" }, 404);
}
