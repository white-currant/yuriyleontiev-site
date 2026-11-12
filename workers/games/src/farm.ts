// «Лунная ферма» — вторая игра Звёздной гильдии. Подключается из index.ts (setup + маршруты /api/farm/*).
//
// Рост считается по часам, а не моделируется: на грядке хранится «что и когда посажено», созрело ли — видно по времени.
// Урожай даёт звёздную пыль (валюта фермы) и очки в звание — не больше FARM_POINTS_PER_DAY в день.
// Изредка при сборе выпадает пластинка — один трек Yuriy Leontiev (каталог games/vinyls.json): разной редкости и отделки.
// Дождь звёздной пыли (после нового поста в канале, его включает бот) удваивает урожай.
// Соседи: можно заглянуть на чужой участок и оставить подарок — 5 пыли, одному соседу раз в день, не больше 5 в день.

export const CROPS: Record<string, { name: string; minutes: number; cost: number; dust: number; points: number; vinyl: number; need: number }> = {
  moss:    { name: "Лунный мох",        minutes: 10,  cost: 0,  dust: 4,  points: 1, vinyl: 0.03, need: 0 },
  berry:   { name: "Звёздные ягоды",    minutes: 60,  cost: 6,  dust: 16, points: 3, vinyl: 0.10, need: 0 },
  crystal: { name: "Кометный хрусталь", minutes: 240, cost: 25, dust: 70, points: 6, vinyl: 0.25, need: 0 },
};
export const PLOTS_MAX = 6;
const PLOT_PRICE = [0, 0, 0, 0, 60, 180];   // 5-я и 6-я грядки покупаются
export const FARM_POINTS_PER_DAY = 20;
const GIFT_DUST = 5, GIFTS_PER_DAY = 5;
const SITE = "https://yuriyleontiev.music";

let q: (sql: string, args?: any[]) => Promise<any[][]>;
let DB: any;
let now: () => number, today: () => string, nameOf: (u: any) => string;
export function setup(deps: any) { ({ q, DB, now, today, nameOf } = deps); }

// ---------- пластинки: одна пластинка — один трек (каталог games/vinyls.json сайта, кэш на час) ----------
// Редкость у трека постоянная (её задаёт каталог); отделка выпадает при каждой находке.
const TIER_ODDS: [string, number][] = [["common", 62], ["rare", 25], ["epic", 10], ["legendary", 3]];
const FINISH_ODDS: [string, number][] = [["plain", 85], ["foil", 12], ["star", 3]];
const DUP_DUST: Record<string, number> = { common: 5, rare: 10, epic: 25, legendary: 60 };
let catalog: { id: string; tier: string; date: string }[] = [], catalogAt = 0;
async function catalogList() {
  if (catalog.length && now() - catalogAt < 3600) return catalog;
  try {
    const d: any = await (await fetch(`${SITE}/games/vinyls.json`, { cf: { cacheTtl: 3600 } } as any)).json();
    catalog = d.tracks.map((t: any) => ({ id: String(t.id), tier: t.tier || "common", date: String(t.date || "") }));
    catalogAt = now();
  } catch { /* сайт недоступен — пластинки в этот раз не выпадут */ }
  return catalog;
}
function roll(odds: [string, number][]) {
  let x = Math.random() * odds.reduce((a, o) => a + o[1], 0);
  for (const [name, w] of odds) { x -= w; if (x <= 0) return name; }
  return odds[0][0];
}
async function dropVinyl(user: number, chance: number) {
  if (Math.random() >= chance) return null;
  const list = await catalogList();
  if (!list.length) return null;
  let tier = roll(TIER_ODDS), pool = list.filter((t) => t.tier === tier);
  if (!pool.length) { pool = list; tier = "common"; }
  // треки новых релизов (до 60 дней) выпадают втрое чаще — так продвигаются свежие релизы
  const fresh = (t: any) => (Date.now() - Date.parse(t.date)) / 86400000 < 60;
  const weights = pool.map((t) => (fresh(t) ? 3 : 1));
  let x = Math.random() * weights.reduce((a, b) => a + b, 0), pick = pool[0];
  for (let i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) { pick = pool[i]; break; } }
  const finish = roll(FINISH_ODDS);
  const [row] = await q(`INSERT INTO f_vinyls (user, track, finish, count, first_at) VALUES (?, ?, ?, 1, ?)
                         ON CONFLICT(user, track, finish) DO UPDATE SET count = count + 1 RETURNING count`, [user, pick.id, finish, now()]);
  const dup = Number(row[0]) > 1;
  const bonus = dup ? DUP_DUST[pick.tier] * (finish === "plain" ? 1 : 2) : 0;
  if (bonus) await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [bonus, user]);   // повтор — в пыль
  return { id: pick.id, tier: pick.tier, finish, duplicate: dup, dust: bonus };
}

// ---------- участок ----------
async function ensureFarm(u: any) {
  const pub = [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await q("INSERT OR IGNORE INTO f_farms (user, pub, created) VALUES (?, ?, ?)", [u.id, pub, now()]);
}
async function rainUntil() {
  return Number((await q("SELECT value FROM g_meta WHERE key = 'rain_until'"))[0]?.[0] || 0);
}
function plotView(p: any[] | undefined, idx: number, unlocked: number) {
  if (idx >= unlocked) return { idx, locked: true, price: PLOT_PRICE[idx] };
  if (!p) return { idx, crop: null };
  const c = CROPS[p[1]], ready = Number(p[2]) + (c?.minutes || 0) * 60;
  return { idx, crop: p[1], planted: Number(p[2]), ready_at: ready, ready: now() >= ready };
}
export async function farmState(u: any) {
  await ensureFarm(u);
  const [[dust, unlocked, pub]] = await q("SELECT dust, unlocked, pub FROM f_farms WHERE user = ?", [u.id]);
  const plots = await q("SELECT idx, crop, planted FROM f_plots WHERE user = ?", [u.id]);
  const by = new Map(plots.map((p) => [Number(p[0]), p]));
  const vinyls = (await q("SELECT track, finish, count FROM f_vinyls WHERE user = ?", [u.id])).map((v) => ({ id: v[0], finish: v[1], count: Number(v[2]) }));
  const gifts = await q("SELECT from_name, dust FROM f_gifts WHERE to_user = ? AND opened = 0 ORDER BY id LIMIT 20", [u.id]);
  const pts = Number((await q("SELECT points FROM f_daily WHERE user = ? AND day = ?", [u.id, today()]))[0]?.[0] || 0);
  return {
    dust: Number(dust), unlocked: Number(unlocked), max: PLOTS_MAX, pub,
    plots: Array.from({ length: PLOTS_MAX }, (_, i) => plotView(by.get(i), i, Number(unlocked))),
    crops: CROPS, rain_until: await rainUntil(), now: now(),
    vinyls, gifts: gifts.map((g) => ({ from: g[0], dust: Number(g[1]) })),
    today_points: pts, points_cap: FARM_POINTS_PER_DAY,
  };
}

export async function plant(u: any, idx: number, crop: string) {
  const c = CROPS[crop];
  if (!c || !(idx >= 0 && idx < PLOTS_MAX)) return { error: "Нет такой грядки или семян" };
  await ensureFarm(u);
  const [[dust, unlocked]] = await q("SELECT dust, unlocked FROM f_farms WHERE user = ?", [u.id]);
  if (idx >= Number(unlocked)) return { error: "Грядка ещё закрыта" };
  if ((await q("SELECT 1 FROM f_plots WHERE user = ? AND idx = ?", [u.id, idx])).length) return { error: "Грядка занята" };
  if (Number(dust) < c.cost) return { error: "Не хватает звёздной пыли" };
  await DB.batch([
    DB.prepare("UPDATE f_farms SET dust = dust - ? WHERE user = ?").bind(c.cost, u.id),
    DB.prepare("INSERT INTO f_plots (user, idx, crop, planted) VALUES (?, ?, ?, ?)").bind(u.id, idx, crop, now()),
  ]);
  return { farm: await farmState(u) };
}

export async function harvest(u: any, idx: number) {
  const [p] = await q("SELECT idx, crop, planted FROM f_plots WHERE user = ? AND idx = ?", [u.id, idx]);
  if (!p) return { error: "Грядка пустая" };
  const c = CROPS[p[1]];
  if (now() < Number(p[2]) + c.minutes * 60) return { error: "Ещё не созрело" };
  const rain = (await rainUntil()) > now();
  const dust = c.dust * (rain ? 2 : 1);
  const before = Number((await q("SELECT points FROM f_daily WHERE user = ? AND day = ?", [u.id, today()]))[0]?.[0] || 0);
  const points = Math.max(0, Math.min(c.points, FARM_POINTS_PER_DAY - before));   // не больше дневного предела
  const writes = [
    DB.prepare(`INSERT INTO f_daily (user, day, points) VALUES (?, ?, ?)
                ON CONFLICT(user, day) DO UPDATE SET points = points + excluded.points`).bind(u.id, today(), points),
    DB.prepare("DELETE FROM f_plots WHERE user = ? AND idx = ?").bind(u.id, idx),
    DB.prepare("UPDATE f_farms SET dust = dust + ? WHERE user = ?").bind(dust, u.id),
  ];
  if (points > 0) writes.push(DB.prepare("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, ?, ?, ?, ?)")
    .bind(u.id, nameOf(u), points, "Лунная ферма", now()));
  await DB.batch(writes);
  const vinyl = await dropVinyl(u.id, c.vinyl);
  return { dust, points, rain, vinyl, farm: await farmState(u) };
}

export async function unlock(u: any) {
  await ensureFarm(u);
  const [[dust, unlocked]] = await q("SELECT dust, unlocked FROM f_farms WHERE user = ?", [u.id]);
  const n = Number(unlocked);
  if (n >= PLOTS_MAX) return { error: "Все грядки открыты" };
  if (Number(dust) < PLOT_PRICE[n]) return { error: "Не хватает звёздной пыли" };
  await q("UPDATE f_farms SET dust = dust - ?, unlocked = unlocked + 1 WHERE user = ?", [PLOT_PRICE[n], u.id]);
  return { farm: await farmState(u) };
}

export async function openGifts(u: any) {
  const [[sum]] = await q("SELECT COALESCE(SUM(dust), 0) FROM f_gifts WHERE to_user = ? AND opened = 0", [u.id]);
  await DB.batch([
    DB.prepare("UPDATE f_gifts SET opened = 1 WHERE to_user = ? AND opened = 0").bind(u.id),
    DB.prepare("UPDATE f_farms SET dust = dust + ? WHERE user = ?").bind(Number(sum), u.id),
  ]);
  return { dust: Number(sum), farm: await farmState(u) };
}

// ---------- соседи ----------
// Соседи видны под тем же именем, что в «Звёздном зале» (как их показывает бот); хозяин и анонимные — скрыты.
// Наружу уходит только случайный номер участка (pub), а не номер аккаунта.
export async function neighbors(u: any, hidden: number[]) {
  const not = hidden.length ? ` AND f.user NOT IN (${hidden.map(() => "?").join(",")})` : "";
  const rows = await q(`SELECT f.pub, p.name, p.title, p.avatar,
                          (SELECT COUNT(*) FROM f_given g WHERE g.from_user = ? AND g.to_user = f.user AND g.day = ?)
                        FROM f_farms f JOIN g_profiles p ON p.user = f.user
                        WHERE f.user != ?${not} ORDER BY p.points DESC LIMIT 30`, [u.id, today(), u.id, ...hidden]);
  return { neighbors: rows.map(([pub, name, title, avatar, given]) => ({ pub, name, title, avatar: avatar ? `/avatar/${avatar}` : null, gifted: Number(given) > 0 })) };
}

export async function visit(u: any, pub: string) {
  const [f] = await q(`SELECT f.user, f.unlocked, p.name, p.title FROM f_farms f LEFT JOIN g_profiles p ON p.user = f.user WHERE f.pub = ?`, [pub]);
  if (!f || Number(f[0]) === u.id) return { error: "Участок не найден" };
  const plots = await q("SELECT idx, crop, planted FROM f_plots WHERE user = ?", [f[0]]);
  const by = new Map(plots.map((p) => [Number(p[0]), p]));
  const vin = Number((await q("SELECT COUNT(DISTINCT track) FROM f_vinyls WHERE user = ?", [f[0]]))[0][0]);
  const given = (await q("SELECT 1 FROM f_given WHERE from_user = ? AND to_user = ? AND day = ?", [u.id, f[0], today()])).length > 0;
  return { pub, name: f[2] || "Сосед", title: f[3] || "Ученик звёзд", unlocked: Number(f[1]), vinyls: vin, gifted: given,
           plots: Array.from({ length: PLOTS_MAX }, (_, i) => plotView(by.get(i), i, Number(f[1]))), now: now(),
           rain_until: await rainUntil() };
}

export async function gift(u: any, pub: string, myName: string) {
  const [f] = await q("SELECT user FROM f_farms WHERE pub = ?", [pub]);
  if (!f || Number(f[0]) === u.id) return { error: "Участок не найден" };
  const [[sent]] = await q("SELECT COUNT(*) FROM f_given WHERE from_user = ? AND day = ?", [u.id, today()]);
  if (Number(sent) >= GIFTS_PER_DAY) return { error: `Сегодня уже ${GIFTS_PER_DAY} подарков — приходи завтра` };
  const ins = await q("INSERT OR IGNORE INTO f_given (from_user, to_user, day) VALUES (?, ?, ?) RETURNING 1", [u.id, f[0], today()]);
  if (!ins.length) return { error: "Сегодня ты уже дарил этому соседу" };
  await q("INSERT INTO f_gifts (to_user, from_name, dust, at) VALUES (?, ?, ?, ?)", [f[0], myName, GIFT_DUST, now()]);
  return { ok: true, dust: GIFT_DUST };
}

export async function setRain(hours: number) {
  const until = now() + Math.max(1, Math.min(72, hours)) * 3600;
  await q("INSERT INTO g_meta (key, value) VALUES ('rain_until', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(until)]);
  return { rain_until: until };
}

export async function forgetFarm(uid: number) {
  for (const sql of ["DELETE FROM f_farms WHERE user = ?", "DELETE FROM f_plots WHERE user = ?", "DELETE FROM f_vinyls WHERE user = ?",
                     "DELETE FROM f_gifts WHERE to_user = ?", "DELETE FROM f_daily WHERE user = ?"]) await q(sql, [uid]);
  await q("DELETE FROM f_given WHERE from_user = ? OR to_user = ?", [uid, uid]);
}
