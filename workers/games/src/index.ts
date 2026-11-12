// Сервер мини-приложения «Игры» бота StarGuardian (страница games/) — Cloudflare Worker + база D1.
// Перенесён с Val Town (scripts/games-val.ts) 2026-11-13: Val Town закрывается 10.01.2027.
// Выкладка: workers/deploy.sh games. Секрет GAMES_KEY — тот же, что в ~/.config/chatguard/games_key на Proxima.
// Таблицы — schema.sql (wrangler d1 execute). Аватарки — в таблице g_avatars (вместо Blob Storage Val Town).
//
// Игроков проверяем по подписи Телеграма (Ed25519, открытый ключ Телеграма) — токен бота здесь не нужен.
// Игрок:  POST /api/me | /api/round | /api/answer | /api/top | /api/link/start | /api/link/remove (заголовок X-Init-Data)
//         GET  /audio/<раунд> | /avatar/<ключ>
// Бот:    GET  /bot/events?after=N | POST /bot/profiles | /bot/link | /bot/forget | /bot/avatar   (заголовок X-Games-Key)

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

let DB: any = null;     // привязка D1 (env.DB)
let ENV: any = {};      // секреты (env.GAMES_KEY)

function rows(r: any): any[][] {
  return (r.rows || []).map((x: any) => Array.isArray(x) ? x : r.columns.map((c: string) => x[c]));
}
const q = async (sql: string, args: any[] = []): Promise<any[][]> => (await DB.prepare(sql).bind(...args).raw()) as any[][];
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

const WORDS = ["ЗВЕЗДА", "КОМЕТА", "ТУМАННОСТЬ", "ОРБИТА", "ПУЛЬСАР", "КВАЗАР", "НЕБУЛА", "СОЗВЕЗДИЕ", "ГАЛАКТИКА", "МЕТЕОР"];

async function linkState(uid: number) {
  if (String(uid) === ((await q("SELECT value FROM g_meta WHERE key = 'owner'"))[0]?.[0] || "")) return null; // хозяин и так виден каналом
  const [l] = await q("SELECT code, expires, title, state FROM g_links WHERE user = ?", [uid]);
  if (!l) return { state: "none" };
  if (l[3] === "linked") return { state: "linked", title: l[2] };
  if (Number(l[1]) < now()) { await q("DELETE FROM g_links WHERE user = ?", [uid]); return { state: "none" }; }
  return { state: "pending", code: l[0], expires: Number(l[1]) };
}

async function linkStart(u: any) {
  const cur = await linkState(u.id);
  if (!cur || cur.state !== "none") return cur || { error: "Ты и так показан каналом" };
  let code = "";
  for (let i = 0; i < 10; i++) {
    code = WORDS[Math.floor(Math.random() * WORDS.length)] + "-" + String(1000 + Math.floor(Math.random() * 9000));
    if (!(await q("SELECT 1 FROM g_links WHERE code = ?", [code])).length) break;
  }
  await q("INSERT OR REPLACE INTO g_links (user, code, expires, title, state) VALUES (?, ?, ?, NULL, 'pending')", [u.id, code, now() + 900]);
  return linkState(u.id);
}

async function linkRemove(u: any) {
  const [l] = await q("SELECT state FROM g_links WHERE user = ?", [u.id]);
  await q("DELETE FROM g_links WHERE user = ?", [u.id]);
  if (l && l[0] === "linked") {
    await q("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, '', 0, 'unlink', ?)", [u.id, now()]);
    await q("DELETE FROM g_profiles WHERE user = ?", [u.id]); // профиль канала больше не его
  }
  return { state: "none" };
}

async function profile(u: any) {
  const g = await player(u);
  const [snap] = await q("SELECT points, karma, place, updated, name, avatar FROM g_profiles WHERE user = ?", [u.id]);
  const consumed = Number((await q("SELECT value FROM g_meta WHERE key = 'consumed'"))[0]?.[0] || 0);
  const pending = Number((await q("SELECT COALESCE(SUM(delta), 0) FROM g_events WHERE user = ? AND id > ?", [u.id, consumed]))[0][0]);
  const points = Number(snap?.[0] || 0) + pending;
  const link = await linkState(u.id);
  // имя — как его показывает бот (хозяин — названием канала, привязавший — каналом); своё фото — только себе
  const name = link?.state === "linked" ? link.title : snap?.[4] || nameOf(u);
  const avatar = snap?.[5] ? `/avatar/${snap[5]}` : (link === null || link?.state === "linked") ? null : (u.photo_url || null);
  return { name, avatar, link,
           points, karma: Number(snap?.[1] || 0), place: snap ? Number(snap[2]) : null, ...rankOf(points),
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

// кого не показывать в «Звёздном зале» (хозяин, анонимные администраторы) — список присылает бот
async function hiddenIds(): Promise<number[]> {
  try { return JSON.parse((await q("SELECT value FROM g_meta WHERE key = 'hidden'"))[0]?.[0] || "[]"); } catch { return []; }
}

async function top() {
  const h = await hiddenIds();
  const not = h.length ? ` AND user NOT IN (${h.map(() => "?").join(",")})` : "";
  const all = await q(`SELECT name, points, title, avatar FROM g_profiles WHERE points > 0${not} ORDER BY points DESC LIMIT 10`, h);
  // имя — как его прислал бот (хозяин — названием канала), а не из Телеграма при входе в игру
  const notU = h.length ? ` AND u.user NOT IN (${h.map(() => "?").join(",")})` : "";
  const day = await q(`SELECT COALESCE(p.name, u.name), u.earned_today, p.avatar, p.title FROM g_users u LEFT JOIN g_profiles p ON p.user = u.user
                       WHERE u.day = ? AND u.earned_today > 0${notU} ORDER BY u.earned_today DESC LIMIT 5`, [today(), ...h]);
  const av = (k: any) => (k ? `/avatar/${k}` : null);
  return { all: all.map(([name, points, title, a]) => ({ name, points: Number(points), title, avatar: av(a) })),
           today: day.map(([name, points, a, title]) => ({ name, points: Number(points), avatar: av(a), title: title || "Ученик звёзд" })) };
}

// ---------- HTTP ----------

export default {
  async fetch(req: Request, env: any): Promise<Response> {
    DB = env.DB; ENV = env;
    return handle(req);
  },
};

async function handle(req: Request): Promise<Response> {
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

  // аватарки — по хешу, без номера аккаунта
  if (req.method === "GET" && url.pathname.startsWith("/avatar/")) {
    const key = url.pathname.slice(8);
    if (!/^[0-9a-f]{16,40}$/.test(key)) return new Response("not found", { status: 404, headers: cors });
    const row = await DB.prepare("SELECT data FROM g_avatars WHERE key = ?").bind(key).first();
    if (!row) return new Response("not found", { status: 404, headers: cors });
    return new Response(new Uint8Array(row.data as ArrayBuffer), { headers: { ...cors, "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
  }

  // бот на Proxima
  if (url.pathname.startsWith("/bot/")) {
    const key = ENV.GAMES_KEY;
    if (!key || req.headers.get("x-games-key") !== key) return json({ error: "key" }, 403);
    if (req.method === "GET" && url.pathname === "/bot/events") {
      const after = Number(url.searchParams.get("after") || 0);
      const ev = await q("SELECT id, user, name, delta, reason FROM g_events WHERE id > ? ORDER BY id LIMIT 500", [after]);
      return json(ev.map(([id, user, name, delta, reason]) => ({ id: Number(id), user: Number(user), name, delta: Number(delta), reason })));
    }
    if (req.method === "POST" && url.pathname === "/bot/profiles") {
      const body = await req.json();
      for (const p of body.profiles || []) {
        await q(`INSERT INTO g_profiles (user, name, points, karma, title, next, place, updated, avatar) VALUES (?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(user) DO UPDATE SET name=excluded.name, points=excluded.points, karma=excluded.karma,
                 title=excluded.title, next=excluded.next, place=excluded.place, updated=excluded.updated, avatar=excluded.avatar`,
                [p.user, p.name, p.points, p.karma, p.title, p.next, p.place, now(), /^[0-9a-f]{16,40}$/.test(p.avatar || "") ? p.avatar : null]);
      }
      if (body.owner) {
        await q("INSERT INTO g_meta (key, value) VALUES ('owner', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(body.owner)]);
      }
      if (Array.isArray(body.hidden)) {
        await q("INSERT INTO g_meta (key, value) VALUES ('hidden', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [JSON.stringify(body.hidden.map(Number).filter(Number.isFinite))]);
      }
      if (body.consumed != null) {
        await q("INSERT INTO g_meta (key, value) VALUES ('consumed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(body.consumed)]);
        await q("DELETE FROM g_events WHERE id <= ? AND at < ?", [Number(body.consumed), now() - 30 * 86400]);
      }
      return json({ ok: true });
    }
    if (req.method === "POST" && url.pathname === "/bot/link") {
      const b = await req.json();
      const [l] = await q("SELECT user FROM g_links WHERE code = ? AND state = 'pending' AND expires >= ?", [String(b.code || ""), now()]);
      if (!l) return json({ error: "нет такого кода" });
      await q("UPDATE g_links SET state = 'linked', code = NULL, expires = NULL, title = ? WHERE user = ?", [String(b.title || "Канал"), l[0]]);
      return json({ user: Number(l[0]) });
    }
    if (req.method === "POST" && url.pathname === "/bot/avatar") {
      const b = await req.json();
      if (!/^[0-9a-f]{16,40}$/.test(b.key || "") || !b.data || b.data.length > 200000) return json({ error: "avatar" }, 400);
      const bytes = Uint8Array.from(atob(b.data), (c) => c.charCodeAt(0));
      await DB.prepare("INSERT OR REPLACE INTO g_avatars (key, data) VALUES (?, ?)").bind(b.key, bytes.buffer).run();
      return json({ ok: true });
    }
    if (req.method === "POST" && url.pathname === "/bot/forget") {
      const uid = Number((await req.json()).user);
      for (const t of ["g_users", "g_profiles", "g_links", "g_events", "g_rounds"]) await q(`DELETE FROM ${t} WHERE user = ?`, [uid]);
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
    case "/api/link/start": return json(await linkStart(user));
    case "/api/link/remove": return json(await linkRemove(user));
  }
  return json({ error: "not found" }, 404);
}
