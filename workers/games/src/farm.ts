// «Лунная ферма» — вторая игра Звёздной гильдии. Подключается из index.ts (setup + маршруты /api/farm/*).
//
// Рост считается по часам, а не моделируется. Растёт растение, только пока полито: на грядке хранится,
// сколько оно уже выросло (grown), и окно полива [wet_from, water_until). Не полил — рост на паузе;
// сухое дольше DRY_LIMIT — засыхает (кроме сортов со свойством «стойкий»). Лейку наполняют в колодце.
// Урожай даёт звёздную пыль и очки в звание (дневного предела нет — решение 2026-11-13).
// Скрещивание: если при сборе рядом (слева/справа/сверху/снизу) созрел другой сорт — иногда выпадает семя-гибрид:
// форма от собираемого, цвет от соседа, свойства — среднее родителей с мутацией, иногда особое свойство.
// Сорта хранятся в f_strains (общие для всех), семена — в инвентаре f_inv; часть можно выставить в свою лавку,
// соседи покупают их за пыль по цене, которую считает игра по свойствам (решение пользователя: цена фиксированная).
// Изредка при сборе выпадает пластинка — один трек Yuriy Leontiev; редкость и отделка — у находки.
// Дождь звёздной пыли (после нового поста в канале, его включает бот) удваивает урожай.
// Соседи: можно заглянуть на чужой участок, оставить подарок (5 пыли, раз в день) и купить семена в его лавке.

type Strain = { id: string; name: string; shape: string; color: string; minutes: number; dust: number; vinyl: number;
                thirst: number; points: number; bonus: string | null; gen: number; cost?: number; base?: boolean; price?: number; tier?: string };
// базовые сорта: семена покупаются в «Семенной лавке станции» (cost — цена одного), дальше возвращаются с урожаем;
// thirst — на сколько минут хватает одного полива
export const CROPS: Record<string, Strain> = {
  moss:    { id: "moss",    name: "Лунный мох",        shape: "moss",    color: "moss",    minutes: 10,  dust: 4,  vinyl: 0.03, thirst: 15, points: 1, bonus: null, gen: 0, cost: 2,  base: true },
  berry:   { id: "berry",   name: "Звёздные ягоды",    shape: "berry",   color: "berry",   minutes: 60,  dust: 16, vinyl: 0.10, thirst: 30, points: 3, bonus: null, gen: 0, cost: 6,  base: true },
  crystal: { id: "crystal", name: "Кометный хрусталь", shape: "crystal", color: "crystal", minutes: 240, dust: 70, vinyl: 0.25, thirst: 90, points: 6, bonus: null, gen: 0, cost: 25, base: true },
};
export const BONUSES: Record<string, string> = {
  rain: "в дождь звёздной пыли урожай ×3, а не ×2",
  lucky: "пластинки выпадают вдвое чаще",
  hardy: "не засыхает без воды",
  rich: "иногда урожай двойной — в среднем каждый четвёртый",
  seedy: "при сборе даёт больше семян",
};
export const PLOTS_MAX = 6;
const PLOT_PRICE = [0, 0, 0, 30, 90, 200];  // на старте открыты 3 грядки, 4–6-я покупаются
const STARTER: [string, number][] = [["moss", 5], ["berry", 2]];   // стартовый мешок семян
const GIFT_DUST = 5, GIFTS_PER_DAY = 5;
const CAN_MAX = 5;                           // лейка: поливов до следующего похода к колодцу
const DRY_LIMIT = 8 * 3600;                  // столько сухое растение ждёт полива, потом засыхает
const CROSS_CHANCE = 0.4;                    // шанс семени-гибрида, если рядом созрел другой сорт
const SITE = "https://yuriyleontiev.music";

let q: (sql: string, args?: any[]) => Promise<any[][]>;
let DB: any;
let now: () => number, today: () => string, nameOf: (u: any) => string;
export function setup(deps: any) { ({ q, DB, now, today, nameOf } = deps); }

// ---------- пластинки: одна пластинка — один трек (каталог games/vinyls.json сайта, кэш на час) ----------
// У любого трека есть все варианты: редкость и отделка выпадают при каждой находке, а не закреплены за треком.
// Находки лежат в общей таблице предметов g_items (game = farm, kind = vinyl) — их показывает и профиль гильдии.
const TIER_ODDS: [string, number][] = [["common", 62], ["rare", 25], ["epic", 10], ["legendary", 3]];
const FINISH_ODDS: [string, number][] = [["plain", 85], ["foil", 12], ["star", 3]];
const DUP_DUST: Record<string, number> = { common: 5, rare: 10, epic: 25, legendary: 60 };
let catalog: { id: string; date: string }[] = [], catalogAt = 0;
async function catalogList() {
  if (catalog.length && now() - catalogAt < 3600) return catalog;
  try {
    const d: any = await (await fetch(`${SITE}/games/vinyls.json`, { cf: { cacheTtl: 3600 } } as any)).json();
    catalog = d.tracks.map((t: any) => ({ id: String(t.id), date: String(t.date || "") }));
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
  // треки новых релизов (до 60 дней) выпадают втрое чаще — так продвигаются свежие релизы
  const fresh = (t: any) => (Date.now() - Date.parse(t.date)) / 86400000 < 60;
  const weights = list.map((t) => (fresh(t) ? 3 : 1));
  let x = Math.random() * weights.reduce((a, b) => a + b, 0), pick = list[0];
  for (let i = 0; i < list.length; i++) { x -= weights[i]; if (x <= 0) { pick = list[i]; break; } }
  const tier = roll(TIER_ODDS), finish = roll(FINISH_ODDS);
  const [row] = await q(`INSERT INTO g_items (user, game, kind, item, tier, finish, count, first_at) VALUES (?, 'farm', 'vinyl', ?, ?, ?, 1, ?)
                         ON CONFLICT(user, game, kind, item, tier, finish) DO UPDATE SET count = count + 1 RETURNING count`,
                        [user, pick.id, tier, finish, now()]);
  const dup = Number(row[0]) > 1;
  const bonus = dup ? DUP_DUST[tier] * (finish === "plain" ? 1 : 2) : 0;
  if (bonus) await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [bonus, user]);   // точный повтор — в пыль
  return { id: pick.id, tier, finish, duplicate: dup, dust: bonus };
}

// ---------- сорта ----------
// Цена в лавке и «редкость» сорта считаются по свойствам: урожай, шанс пластинки, особое свойство, поколение.
function priceOf(s: Strain) { return Math.max(3, Math.round(s.dust * 0.5 + s.vinyl * 120 + (s.bonus ? 15 : 0) + s.gen * 2)); }
function tierOf(p: number) { return p >= 70 ? "legendary" : p >= 40 ? "epic" : p >= 20 ? "rare" : "common"; }
function view(s: Strain): Strain { const price = priceOf(s); return { ...s, price, tier: tierOf(price) }; }
// формы растений и раскраски. Базовые — у сортов станции; остальные появляются только мутацией при скрещивании.
// Прилагательные: [мужской, множественное, женский]; у существительного — какая форма ему нужна.
const ADJ: Record<string, [string, string, string]> = {
  moss: ["Лунный", "Лунные", "Лунная"], berry: ["Звёздный", "Звёздные", "Звёздная"], crystal: ["Кометный", "Кометные", "Кометная"],
  sun: ["Солнечный", "Солнечные", "Солнечная"], nebula: ["Туманный", "Туманные", "Туманная"], ember: ["Огненный", "Огненные", "Огненная"],
  frost: ["Ледяной", "Ледяные", "Ледяная"], night: ["Полуночный", "Полуночные", "Полуночная"], aurora: ["Сияющий", "Сияющие", "Сияющая"],
};
const BADJ: Record<string, [string, string, string]> = { rain: ["Дождевой", "Дождевые", "Дождевая"], lucky: ["Счастливый", "Счастливые", "Счастливая"],
  hardy: ["Стойкий", "Стойкие", "Стойкая"], rich: ["Щедрый", "Щедрые", "Щедрая"], seedy: ["Плодовитый", "Плодовитые", "Плодовитая"] };
const NOUN: Record<string, [string, number]> = { moss: ["мох", 0], berry: ["ягоды", 1], crystal: ["хрусталь", 0],
  flower: ["звездоцвет", 0], mushroom: ["грибы", 1], pumpkin: ["тыква", 2], cactus: ["кактус", 0] };
const SHAPES = Object.keys(NOUN), COLORS = Object.keys(ADJ);
const MUTATE_SHAPE = 0.12, MUTATE_COLOR = 0.12;      // шанс, что гибрид получит новую форму / новый цвет, которых нет у родителей
function nameFor(g: any) {
  const [noun, form] = NOUN[g.shape];
  const words = [...(g.bonus ? [BADJ[g.bonus][form]] : []), ADJ[g.color][form], noun];
  const t = words.join(" ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
async function hashId(g: any) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(g))));
  return "h" + [...d.slice(0, 5)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function strains(ids: string[]): Promise<Record<string, Strain>> {
  const out: Record<string, Strain> = {};
  for (const k in CROPS) out[k] = view(CROPS[k]);
  const need = [...new Set(ids.filter((i) => i && !CROPS[i]))];
  if (need.length) {
    const rows = await q(`SELECT id, name, genes FROM f_strains WHERE id IN (${need.map(() => "?").join(",")})`, need);
    for (const [id, name, genes] of rows) out[id] = view({ id, name, ...JSON.parse(genes) });
  }
  return out;
}
// гибрид: форма — от собираемого растения, цвет — от соседа; свойства — среднее родителей ± мутация
async function breed(a: Strain, b: Strain): Promise<Strain> {
  const r = Math.random, avg = (k: keyof Strain) => ((a[k] as number) + (b[k] as number)) / 2, mut = () => 0.85 + r() * 0.4;
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const pick = (list: string[], not: string[]) => { const l = list.filter((x) => !not.includes(x)); return l[Math.floor(r() * l.length)]; };
  let mutation: string | null = null, shape = a.shape, color = b.color;
  if (r() < MUTATE_SHAPE) { shape = pick(SHAPES, [a.shape, b.shape]); mutation = "shape"; }
  if (r() < MUTATE_COLOR) { color = pick(COLORS, [a.color, b.color]); mutation = mutation ? "both" : "color"; }
  const g: any = {
    shape, color,
    minutes: Math.round(clamp(avg("minutes") * mut(), 5, 480) / 5) * 5,
    dust: Math.round(clamp(avg("dust") * mut(), 1, 400)),
    vinyl: Math.round(clamp(avg("vinyl") * mut(), 0.01, 0.5) * 100) / 100,
    thirst: Math.round(clamp(avg("thirst") * mut(), 10, 240) / 5) * 5,
    bonus: null as string | null, gen: Math.max(a.gen, b.gen) + 1,
  };
  if (r() < 0.1) {                                       // скачок: одно свойство заметно лучше
    const k = ["dust", "minutes", "vinyl", "thirst"][Math.floor(r() * 4)];
    if (k === "dust") g.dust = Math.min(400, Math.round(g.dust * 1.5));
    if (k === "minutes") g.minutes = Math.max(5, Math.round(g.minutes * 0.7 / 5) * 5);
    if (k === "vinyl") g.vinyl = Math.min(0.5, Math.round(g.vinyl * 150) / 100);
    if (k === "thirst") g.thirst = Math.min(240, Math.round(g.thirst * 1.5 / 5) * 5);
  }
  const inherited = [a.bonus, b.bonus].filter(Boolean) as string[];
  if (inherited.length && r() < 0.6) g.bonus = inherited[Math.floor(r() * inherited.length)];
  else if (r() < 0.15) { const all = Object.keys(BONUSES); g.bonus = all[Math.floor(r() * all.length)]; }
  g.points = Math.max(1, Math.round(g.minutes / 40));
  const id = await hashId(g), name = nameFor(g);
  await q("INSERT OR IGNORE INTO f_strains (id, name, genes, created) VALUES (?, ?, ?, ?)", [id, name, JSON.stringify(g), now()]);
  return { ...view({ id, name, ...g }), mutation };
}

// ---------- рост и полив ----------
// p = [idx, crop, planted, grown, wet_from, water_until]
function growth(p: any[], t: number) { return Number(p[3]) + Math.max(0, Math.min(t, Number(p[5])) - Number(p[4])); }
function stateOf(p: any[], s: Strain, t: number) {
  const ripe = growth(p, t) >= s.minutes * 60;
  const dryFor = t - Math.max(Number(p[5]), Number(p[2]));
  return { ripe, dead: !ripe && s.bonus !== "hardy" && dryFor > DRY_LIMIT };
}
const PLOT_COLS = "idx, crop, planted, grown, wet_from, water_until";

// ---------- участок ----------
async function ensureFarm(u: any) {
  const pub = [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const fresh = await q("INSERT OR IGNORE INTO f_farms (user, pub, created, unlocked) VALUES (?, ?, ?, 3) RETURNING 1", [u.id, pub, now()]);
  if (fresh.length) await DB.batch(STARTER.map(([k, n]) =>                 // новичку — стартовый мешок семян
    DB.prepare("INSERT OR IGNORE INTO f_inv (user, strain, count, listed) VALUES (?, ?, ?, 0)").bind(u.id, k, n)));
}
async function rainUntil() {
  return Number((await q("SELECT value FROM g_meta WHERE key = 'rain_until'"))[0]?.[0] || 0);
}
function plotView(p: any[] | undefined, idx: number, unlocked: number) {
  if (idx >= unlocked) return { idx, locked: true, price: PLOT_PRICE[idx] };
  if (!p) return { idx, crop: null };
  return { idx, crop: p[1], planted: Number(p[2]), grown: Number(p[3]), wet_from: Number(p[4]), water_until: Number(p[5]) };
}
export async function farmState(u: any) {
  await ensureFarm(u);
  const [[dust, unlocked, pub, water]] = await q("SELECT dust, unlocked, pub, water FROM f_farms WHERE user = ?", [u.id]);
  const plots = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [u.id]);
  const by = new Map(plots.map((p) => [Number(p[0]), p]));
  const vinyls = (await q("SELECT item, tier, finish, count FROM g_items WHERE user = ? AND game = 'farm' AND kind = 'vinyl'", [u.id]))
    .map((v) => ({ id: v[0], tier: v[1], finish: v[2], count: Number(v[3]) }));
  const inv = (await q("SELECT strain, count, listed FROM f_inv WHERE user = ? AND count > 0", [u.id]))
    .map(([strain, count, listed]) => ({ strain, count: Number(count), listed: Number(listed) }));
  const gifts = await q("SELECT from_name, dust FROM f_gifts WHERE to_user = ? AND opened = 0 ORDER BY id LIMIT 20", [u.id]);
  const sales = await q("SELECT buyer_name, strain, price FROM f_sales WHERE seller = ? AND seen = 0 ORDER BY id LIMIT 20", [u.id]);
  return {
    dust: Number(dust), unlocked: Number(unlocked), max: PLOTS_MAX, pub, water: Number(water), can_max: CAN_MAX, dry_limit: DRY_LIMIT,
    plots: Array.from({ length: PLOTS_MAX }, (_, i) => plotView(by.get(i), i, Number(unlocked))),
    strains: await strains([...plots.map((p) => p[1]), ...inv.map((i) => i.strain), ...sales.map((x) => x[1])]),
    bonuses: BONUSES, rain_until: await rainUntil(), now: now(),
    vinyls, inv, gifts: gifts.map((g) => ({ from: g[0], dust: Number(g[1]) })),
    sales: sales.map(([buyer, strain, price]) => ({ buyer, strain, price: Number(price) })),
  };
}

export async function plant(u: any, idx: number, crop: string) {
  if (!(idx >= 0 && idx < PLOTS_MAX) || !crop) return { error: "Нет такой грядки или семян" };
  await ensureFarm(u);
  const [[unlocked]] = await q("SELECT unlocked FROM f_farms WHERE user = ?", [u.id]);
  if (idx >= Number(unlocked)) return { error: "Грядка ещё закрыта" };
  if ((await q("SELECT 1 FROM f_plots WHERE user = ? AND idx = ?", [u.id, idx])).length) return { error: "Грядка занята" };
  const t = now();
  // сажаем всегда из мешка; выставленные в лавку не трогаем
  const ok = await q("UPDATE f_inv SET count = count - 1 WHERE user = ? AND strain = ? AND count - listed > 0 RETURNING 1", [u.id, crop]);
  if (!ok.length) return { error: "Таких семян у тебя нет" };
  // посадили сухим — сразу после посадки нужно полить
  await q(`INSERT INTO f_plots (user, ${PLOT_COLS}) VALUES (?, ?, ?, ?, 0, ?, ?)`, [u.id, idx, crop, t, t, t]);
  return { farm: await farmState(u) };
}

// «Семенная лавка станции»: базовые семена в мешок за пыль
export async function buySeeds(u: any, crop: string, n: number) {
  const c = CROPS[crop], k = Math.max(1, Math.min(20, Math.round(n) || 1));
  if (!c) return { error: "Таких семян в лавке станции нет" };
  await ensureFarm(u);
  const cost = (c.cost || 0) * k;
  if (!(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [cost, u.id, cost])).length)
    return { error: "Не хватает звёздной пыли" };
  await q(`INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, ?, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count`, [u.id, crop, k]);
  return { bought: k, farm: await farmState(u) };
}

export async function fill(u: any) {
  await ensureFarm(u);
  await q("UPDATE f_farms SET water = ? WHERE user = ?", [CAN_MAX, u.id]);
  return { farm: await farmState(u) };
}

export async function water(u: any, idx: number) {
  const [p] = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ? AND idx = ?`, [u.id, idx]);
  if (!p) return { error: "Грядка пустая" };
  const s = (await strains([p[1]]))[p[1]], t = now(), st = stateOf(p, s, t);
  if (st.dead) return { error: "Растение засохло — его можно только убрать" };
  if (st.ripe) return { error: "Уже созрело — собирай" };
  if (!(await q("UPDATE f_farms SET water = water - 1 WHERE user = ? AND water > 0 RETURNING 1", [u.id])).length)
    return { error: "Лейка пуста — набери воды в колодце" };
  // накопленный рост фиксируем и открываем новое окно полива
  await q("UPDATE f_plots SET grown = ?, wet_from = ?, water_until = ? WHERE user = ? AND idx = ?",
          [growth(p, t), t, t + s.thirst * 60, u.id, idx]);
  return { farm: await farmState(u) };
}

export async function harvest(u: any, idx: number) {
  const [p] = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ? AND idx = ?`, [u.id, idx]);
  if (!p) return { error: "Грядка пустая" };
  const t = now(), all = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [u.id]);
  const ss = await strains(all.map((x) => x[1])), s = ss[p[1]], st = stateOf(p, s, t);
  if (!st.ripe && !st.dead) return { error: "Ещё не созрело" };
  // грядку забирает ровно один запрос: повторное нажатие не заплатит дважды
  if (!(await q("DELETE FROM f_plots WHERE user = ? AND idx = ? AND planted = ? RETURNING 1", [u.id, idx, p[2]])).length) return { error: "Уже собрано" };
  if (st.dead) return { withered: true, farm: await farmState(u) };       // засохшее — просто убрали
  const rain = (await rainUntil()) > t;
  const double = s.bonus === "rich" && Math.random() < 0.25;
  const dust = s.dust * (rain ? (s.bonus === "rain" ? 3 : 2) : 1) * (double ? 2 : 1);
  const points = s.points;
  const writes = [DB.prepare("UPDATE f_farms SET dust = dust + ? WHERE user = ?").bind(dust, u.id)];
  if (points > 0) writes.push(DB.prepare("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, ?, ?, ?, ?)")
    .bind(u.id, nameOf(u), points, "Лунная ферма", t));
  // с урожаем возвращаются семена той же культуры (в среднем чуть больше одного) — хозяйство себя воспроизводит,
  // а удачный гибрид можно размножить и продать
  const seeds = (Math.random() < 0.75 ? 1 : 0) + (Math.random() < 0.35 ? 1 : 0) + (s.bonus === "seedy" ? 1 : 0);
  if (seeds) writes.push(DB.prepare(`INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, ?, 0)
                                     ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count`).bind(u.id, s.id, seeds));
  await DB.batch(writes);
  // скрещивание с созревшим соседом другого сорта
  let hybrid: any = null;
  const r0 = Math.floor(idx / 3), c0 = idx % 3;
  const near = all.filter((x) => {
    const i = Number(x[0]), r = Math.floor(i / 3), c = i % 3;
    return i !== idx && Math.abs(r - r0) + Math.abs(c - c0) === 1 && x[1] !== p[1] && ss[x[1]] && stateOf(x, ss[x[1]], t).ripe;
  });
  if (near.length && Math.random() < CROSS_CHANCE) {
    const other = ss[near[Math.floor(Math.random() * near.length)][1]];
    const h = await breed(s, other);
    const [[had]] = await q("SELECT COUNT(*) FROM f_inv WHERE user = ? AND strain = ?", [u.id, h.id]);
    await q(`INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, 1, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1`, [u.id, h.id]);
    hybrid = { ...h, parents: [s.name, other.name], fresh: !Number(had) };
  }
  const vinyl = await dropVinyl(u.id, s.vinyl * (s.bonus === "lucky" ? 2 : 1));
  return { dust, points, rain, double, seeds, hybrid, vinyl, farm: await farmState(u) };
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
  const plots = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [f[0]]);
  const by = new Map(plots.map((p) => [Number(p[0]), p]));
  const vin = Number((await q("SELECT COUNT(DISTINCT item) FROM g_items WHERE user = ? AND game = 'farm' ", [f[0]]))[0][0]);
  const given = (await q("SELECT 1 FROM f_given WHERE from_user = ? AND to_user = ? AND day = ?", [u.id, f[0], today()])).length > 0;
  const shop = await q("SELECT strain, listed FROM f_inv WHERE user = ? AND listed > 0", [f[0]]);
  return { pub, name: f[2] || "Сосед", title: f[3] || "Ученик звёзд", unlocked: Number(f[1]), vinyls: vin, gifted: given,
           plots: Array.from({ length: PLOTS_MAX }, (_, i) => plotView(by.get(i), i, Number(f[1]))), now: now(),
           rain_until: await rainUntil(), dry_limit: DRY_LIMIT,
           shop: shop.map(([strain, n]) => ({ strain, count: Number(n) })),
           strains: await strains([...plots.map((p) => p[1]), ...shop.map((x) => x[0])]), bonuses: BONUSES };
}

// ---------- лавка ----------
// delta > 0 — выставить столько семян, < 0 — снять с продажи. Выставить можно не больше, чем есть.
export async function list(u: any, strain: string, delta: number) {
  if (CROPS[strain]) return { error: "Семена станции не продаются — только выведенные сорта" };
  const d = Math.max(-1000, Math.min(1000, Math.round(delta) || 0));
  await q("UPDATE f_inv SET listed = MAX(0, MIN(count, listed + ?)) WHERE user = ? AND strain = ?", [d, u.id, strain]);
  return { farm: await farmState(u) };
}

export async function buy(u: any, pub: string, strain: string, myName: string) {
  const [f] = await q("SELECT user FROM f_farms WHERE pub = ?", [pub]);
  if (!f || Number(f[0]) === u.id) return { error: "Лавка не найдена" };
  if (CROPS[strain]) return { error: "Такого товара нет" };
  const s = (await strains([strain]))[strain];
  if (!s) return { error: "Такого товара нет" };
  await ensureFarm(u);
  const price = s.price!;
  if (!(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [price, u.id, price])).length)
    return { error: "Не хватает звёздной пыли" };
  // товар забирает ровно один покупатель; не вышло — пыль возвращаем
  if (!(await q("UPDATE f_inv SET count = count - 1, listed = listed - 1 WHERE user = ? AND strain = ? AND listed > 0 RETURNING 1", [f[0], strain])).length) {
    await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [price, u.id]);
    return { error: "Уже раскупили" };
  }
  await DB.batch([
    DB.prepare("UPDATE f_farms SET dust = dust + ? WHERE user = ?").bind(price, f[0]),
    DB.prepare(`INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, 1, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1`).bind(u.id, strain),
    DB.prepare("INSERT INTO f_sales (seller, buyer_name, strain, price, at) VALUES (?, ?, ?, ?, ?)").bind(f[0], myName, strain, price, now()),
  ]);
  return { ok: true, price, ...(await visit(u, pub)), farm: await farmState(u) };
}

// рынок: все семена, выставленные игроками (кроме своих). Наружу — публичное имя продавца и номер участка (pub), не аккаунт.
export async function market(u: any, hidden: number[]) {
  const rows = await q(`SELECT i.user, f.pub, i.strain, i.listed, p.name FROM f_inv i JOIN f_farms f ON f.user = i.user
                        LEFT JOIN g_profiles p ON p.user = i.user WHERE i.listed > 0 AND i.user != ? LIMIT 200`, [u.id]);
  const ss = await strains(rows.map((r) => r[2]));
  const offers = rows.map(([uid, pub, strain, n, name]) => ({ pub, strain, count: Number(n),
                                                               seller: hidden.includes(Number(uid)) ? "Сосед" : name || "Сосед" }))
    .filter((o) => ss[o.strain]).sort((a, b) => (ss[b.strain].price || 0) - (ss[a.strain].price || 0));
  return { offers, strains: ss, bonuses: BONUSES };
}

export async function salesSeen(u: any) {
  await q("UPDATE f_sales SET seen = 1 WHERE seller = ? AND seen = 0", [u.id]);
  return { farm: await farmState(u) };
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
  for (const sql of ["DELETE FROM f_farms WHERE user = ?", "DELETE FROM f_plots WHERE user = ?", "DELETE FROM g_items WHERE user = ? AND game = 'farm'",
                     "DELETE FROM f_gifts WHERE to_user = ?", "DELETE FROM f_daily WHERE user = ?", "DELETE FROM f_inv WHERE user = ?",
                     "DELETE FROM f_sales WHERE seller = ?"]) await q(sql, [uid]);
  await q("DELETE FROM f_given WHERE from_user = ? OR to_user = ?", [uid, uid]);
}
