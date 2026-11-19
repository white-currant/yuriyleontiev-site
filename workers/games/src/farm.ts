// «Лунная ферма» — вторая игра Звёздной гильдии. Подключается из index.ts (setup + маршруты /api/farm/*).
//
// Рост считается по часам, а не моделируется. Растёт растение, только пока полито: на грядке хранится,
// сколько оно уже выросло (grown), и окно полива [wet_from, water_until). Не полил — рост на паузе;
// сухое дольше DRY_LIMIT — засыхает (кроме сортов со свойством «стойкий»). Лейку наполняют в колодце.
// Очки в звание: за посадку и за полив — по 1, за урожай — по культуре (дневного предела нет — решение 2026-11-13).
// Скрещивание: если при сборе рядом (слева/справа/сверху/снизу) созрел другой сорт — иногда выпадает семя-гибрид:
// форма от собираемого, цвет от соседа, свойства — среднее родителей с мутацией, иногда особое свойство.
// Урожай кладётся в амбар (f_barn): превратить в звёздную пыль или (дальше) пустить на кухню.
// Сорта хранятся в f_strains (общие для всех), семена — в инвентаре f_inv; часть можно выставить в свою лавку,
// соседи покупают их за пыль по цене, которую считает игра по свойствам (решение пользователя: цена фиксированная).
// Изредка при сборе выпадает пластинка — один трек Yuriy Leontiev; редкость и отделка — у находки.
// Погода — событие дня (weatherOn): звёздный дождь, лунный ливень, засуха, солнечный ветер, полнолуние или ясно.
// Соседи: можно заглянуть на чужой участок, оставить подарок (5 пыли, раз в день) и купить семена в его лавке.

type Strain = { id: string; name: string; shape: string; color: string; minutes: number; dust: number; vinyl: number;
                thirst: number; points: number; bonus: string | null; gen: number; cost?: number; base?: boolean; hidden?: boolean; odd?: boolean; price?: number; tier?: string; myth?: boolean; nonce?: string };
// базовые сорта: семена покупаются в «Семенной лавке станции» (cost — цена одного), дальше возвращаются с урожаем;
// thirst — на сколько минут хватает одного полива
// Баланс (его правка 2026-11-15, жалоба Evilin «у мха 24 пыли в час — где баланс»): разные стратегии, не к среднему.
// Мох — для активной игры (больше пыли и очков в час), долгие — за заход (у хрусталя в 8 раз больше очков за сбор).
// Было: мох 2 очка, ягоды 16 пыли / 4 очка, хрусталь 70 пыли / 8 очков.
export const CROPS: Record<string, Strain> = {
  moss:    { id: "moss",    name: "Лунный мох",        shape: "moss",    color: "moss",    minutes: 10,  dust: 4,  vinyl: 0.03, thirst: 15, points: 1, bonus: null, gen: 0, cost: 2,  base: true },
  berry:   { id: "berry",   name: "Звёздные ягоды",    shape: "berry",   color: "berry",   minutes: 60,  dust: 18, vinyl: 0.10, thirst: 30, points: 6, bonus: null, gen: 0, cost: 6,  base: true },
  crystal: { id: "crystal", name: "Кометный хрусталь", shape: "crystal", color: "crystal", minutes: 240, dust: 90, vinyl: 0.25, thirst: 90, points: 16, bonus: null, gen: 0, cost: 25, base: true },
  // зерно (2026-11-14): само по себе дешёвое, нужно ради муки на мельнице. У станции один вид — пшеница;
  // другие колосья открываются скрещиванием и мутациями, как у остальных растений (его правка 2026-11-14).
  wheat:   { id: "wheat",   name: "Солнечные колосья", shape: "grain",   color: "sun",     minutes: 20,  dust: 5,  vinyl: 0.04, thirst: 25, points: 2, bonus: null,    gen: 0, cost: 3,  base: true },
  // сняты с продажи в тот же день (ни у кого не было) — оставлены скрытыми, чтобы старые ссылки не ломались
  millet:  { hidden: true, id: "millet",  name: "Огненные колосья",  shape: "grain",   color: "ember",   minutes: 45,  dust: 9,  vinyl: 0.06, thirst: 20, points: 2, bonus: "seedy", gen: 0, cost: 5,  base: true },
  rye:     { hidden: true, id: "rye",     name: "Туманные колосья",  shape: "grain",   color: "nebula",  minutes: 120, dust: 26, vinyl: 0.12, thirst: 60, points: 4, bonus: "hardy", gen: 0, cost: 10, base: true },
  // ночная аномалия (его идея 2026-11-18): странное семя изредка ночью лежит в общей лавке среди семян игроков, продавец — неразборчивые
  // символы; кто заметит и успеет — тот купит. Растёт двое суток (полив раз в сутки; луч солнца и лунная пыль его не торопят), урожай — глаза (ингредиент чёрной «Странной похлёбки»), семя — одно (двойное убрано его решением 2026-11-18, чтобы не расходилось по игрокам).
  // Не вид (в справочник не идёт). Скрещивается редко (вчетверо реже), гибриды — «Странные …», тоже не виды. Продаётся и распыляется.
  anomaly: { hidden: true, odd: true, id: "anomaly", name: "Странное семя", shape: "anomaly", color: "anomaly", minutes: 2880, dust: 60, vinyl: 0, thirst: 1440, points: 0, bonus: null, gen: 0, cost: 30, base: true },
};
export const BONUSES: Record<string, string> = {
  rain: "в звёздный дождь урожай ×3, а не ×2",
  lucky: "артефакты выпадают вдвое чаще",
  hardy: "полива хватает вдвое дольше, а без воды не погибнет — просто ждёт",   // его правка 2026-11-16: было «не засыхает без воды» — читалось как «поливать не нужно»
  rich: "иногда урожай двойной — в среднем каждый четвёртый",
  seedy: "при сборе даёт больше семян",
};
export const PLOTS_MAX = 9;                  // двор 3×3
// на старте открыты 3 грядки, 4–9-я покупаются; цена растёт круто (в 2,5–3 раза за шаг), чтобы при постоянной игре
// новая грядка оставалась целью на дни, а не на часы (правка 2026-11-13: было 30 / 90 / 200 / 400 / 700 / 1200)
const PLOT_PRICE = [0, 0, 0, 60, 200, 600, 1500, 4000, 10000];
const STARTER: [string, number][] = [["moss", 5], ["berry", 2]];   // стартовый мешок семян
const GIFT_DUST = 5, GIFTS_PER_DAY = 5;
const CAN_MAX = 5;                           // лейка: поливов до следующего похода к колодцу
const DRY_LIMIT = 48 * 3600;                 // столько сухое растение ждёт полива, потом засыхает: двое суток, чтобы не сохло за ночь (его правка 2026-11-14, было 8 ч)
const POINTS_HARVEST_MIN = 2;                // сбор — всегда больше, чем действие
// «умное регулирование» странных семян (его схема 2026-11-18): семена лежат вечно, но во всей игре их (в мешках, сундуках и на грядках)
// не больше ODD_SHARE от активных за неделю игроков (не меньше ODD_MIN). Пока лимит занят, собранное странное растение семени не оставляет —
// кроме растения из «свежего» семени (куплено или найдено в тайнике), если у игрока других странных семян нет: новичка лимит не трогает.
const ODD_SHARE = 0.15, ODD_MIN = 2;
async function oddCap() {
  const [[n]] = await q("SELECT COUNT(DISTINCT user) FROM g_events WHERE reason = 'Лунная ферма' AND at > ?", [now() - 7 * DAY]);
  return Math.max(ODD_MIN, Math.round(Number(n) * ODD_SHARE));
}
async function oddInGame() {
  const [[n]] = await q(`SELECT COALESCE((SELECT SUM(count) FROM f_inv WHERE strain = 'anomaly'), 0) + COALESCE((SELECT SUM(count) FROM f_chest WHERE strain = 'anomaly'), 0)
                              + (SELECT COUNT(*) FROM f_plots WHERE crop = 'anomaly')`);
  return Number(n);
}
// у одного игрока — не больше двух странных семян: в мешке, в сундуке и уже посаженных (его решение 2026-11-19)
// Третье купить можно, но тогда одно семя из мешка (или сундука) пропадает (его решение 2026-11-19); посаженные не трогаем —
// если оба уже растут, вытеснять нечего и купить нельзя.
const ODD_PER_USER = 2, ODD_FULL = "Оба странных растения уже растут — третьему места нет";
async function oddEvictable(uid: number) {
  const [[n]] = await q(`SELECT COALESCE((SELECT count FROM f_inv WHERE user = ? AND strain = 'anomaly'), 0) + COALESCE((SELECT count FROM f_chest WHERE user = ? AND strain = 'anomaly'), 0)`, [uid, uid]);
  return Number(n);
}
async function oddEvict(uid: number) {                                   // одно семя пропадает: сначала из мешка, потом из сундука; на его месте — скорлупа
  const gone = (await q("UPDATE f_inv SET count = count - 1, listed = MIN(listed, count - 1) WHERE user = ? AND strain = 'anomaly' AND count > 0 RETURNING 1", [uid])).length > 0
            || (await q("UPDATE f_chest SET count = count - 1 WHERE user = ? AND strain = 'anomaly' AND count > 0 RETURNING 1", [uid])).length > 0;
  if (gone) await q("INSERT INTO f_shell (user, count) VALUES (?, 1) ON CONFLICT(user) DO UPDATE SET count = count + 1", [uid]);
  return gone;
}
export const SHELL_DUST = 1;
export async function dustShell(u: any) {                                // распылить скорлупу — ✦1
  if (!(await q("UPDATE f_shell SET count = count - 1 WHERE user = ? AND count > 0 RETURNING 1", [u.id])).length) return { error: "Скорлупы нет" };
  await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [SHELL_DUST, u.id]);
  return { dust: SHELL_DUST, farm: await farmState(u) };
}
async function oddHeld(uid: number) {
  const [[n]] = await q(`SELECT COALESCE((SELECT count FROM f_inv WHERE user = ? AND strain = 'anomaly'), 0) + COALESCE((SELECT count FROM f_chest WHERE user = ? AND strain = 'anomaly'), 0)
                              + (SELECT COUNT(*) FROM f_plots WHERE user = ? AND crop = 'anomaly')`, [uid, uid, uid]);
  return Number(n);
}
async function oddFresh(uid: number) { await q("INSERT INTO f_evlog (user, kind, at) VALUES (?, 'odd:fresh', ?)", [uid, now()]); }   // купил или нашёл — «свежее» семя
const POINTS_PLANT = 1, POINTS_WATER = 1;    // очки в звание за посадку и за полив сухой грядки (награда за саму игру, решение 2026-11-13)
const SEEDS_MIN = 2, SEEDS_EXTRA = 0.35;     // семян с урожая: 2, с шансом 35% — 3
const CROSS_CHANCE = 0.4;                    // шанс семени-гибрида, если рядом созрел другой сорт
const ODD_CROSS = 0.25;                      // со странным растением или «странным» гибридом — вчетверо реже
const ODD_PASS = 0.25;                       // «странный» гибрид передаёт странность потомку в четверти случаев
const SITE = "https://yuriyleontiev.music";

let q: (sql: string, args?: any[]) => Promise<any[][]>;
let DB: any;
let now: () => number, today: () => string, nameOf: (u: any) => string;
let prefetch: (list: [string, any[]][]) => Promise<any[][][]>, preClear: () => void;
export function setup(deps: any) { ({ q, DB, now, today, nameOf, prefetch, preClear } = deps); }

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
// за сбор всегда больше, чем за действие (посадка, полив — по 1): не меньше POINTS_HARVEST_MIN, в т.ч. у старых сортов
// очки за сбор (его решение 2026-11-17, после вопроса Глеба «нищий мох даёт столько же, сколько легендарная тыква»):
// у каждого растения своё число — от времени роста, а сорт задаёт ставку «очков в час» (вместе с посадкой и поливом,
// если сажать сразу после сбора): обычный 24, хороший 30, редкий 36, легендарный 48. Лучший сорт всегда приносит больше
// и за сбор, и в час. Время сверх часа считается за половину: долгое растение растёт, пока игрока нет, — иначе оно обгоняло бы игру.
const TIER_RATE: Record<string, number> = { common: 24, rare: 30, epic: 36, legendary: 48 };
function harvestPoints(minutes: number, tier: string) {
  const eff = minutes <= 60 ? minutes : 60 + (minutes - 60) / 2;
  return Math.max(POINTS_HARVEST_MIN, Math.round((TIER_RATE[tier] || 24) * eff / 60 - POINTS_PLANT - POINTS_WATER));
}
function view(s: Strain): Strain { const price = priceOf(s), tier = tierOf(price); return { ...s, points: s.odd ? 20 : harvestPoints(s.minutes, tier), price, tier }; }   // странное: двое суток роста — не повод для сотен очков
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
  flower: ["звездоцвет", 0], mushroom: ["грибы", 1], pumpkin: ["тыква", 2], cactus: ["кактус", 0], grain: ["колосья", 1] };
const SHAPES = Object.keys(NOUN), COLORS = Object.keys(ADJ);
export const SPECIES_TOTAL = SHAPES.length * COLORS.length;          // всего видов (форма × расцветка) — как в справочнике
const MYTH_ADJ: [string, string, string] = ["Мифический", "Мифические", "Мифическая"];
// расцветка «странная» — не в COLORS: мутацией не выпадает и в справочнике видов не считается
const ODD_ADJ: [string, string, string] = ["Странный", "Странные", "Странная"];
const oddish = (g: any) => !!g && (g.odd || g.color === "anomaly");
const MUTATE_SHAPE = 0.12, MUTATE_COLOR = 0.12;      // шанс, что гибрид получит новую форму / новый цвет, которых нет у родителей
function nameFor(g: any) {
  const [noun, form] = NOUN[g.shape];
  const words = [...(g.bonus ? [BADJ[g.bonus][form]] : []), g.myth ? MYTH_ADJ[form] : (ADJ[g.color] || ODD_ADJ)[form], noun];
  const t = words.join(" ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
let MERGED = false;
async function sortByName(name: string): Promise<Strain | null> {
  for (const k in CROPS) if (!CROPS[k].hidden && CROPS[k].name === name) return view(CROPS[k]);
  const [r] = await q("SELECT id, name, genes FROM f_strains WHERE name = ? ORDER BY created, id LIMIT 1", [name]);
  return r ? view({ id: String(r[0]), name: String(r[1]), ...JSON.parse(String(r[2])) }) : null;
}
// ОТЛОЖЕНО (его решение 2026-11-14: сначала понятно показать и дать сравнить гибриды) — не вызывается.
// Разовое объединение одноимённых сортов (2026-11-14): свойства — среднее всех вариантов, все запасы игроков
// (инвентарь, сундук, грядки, амбар, прилавок, задания кухни, история продаж) переходят на один сорт; количество суммируется.
// Свои цены на старые варианты сбрасываются к цене игры. Повторно не запускается (g_meta farm_merge_v1).
export async function mergeSortsOnce() {
  STRAIN_MEM.clear();                                           // объединение меняет записи сортов — память сбрасываем
  if (!(await q("INSERT OR IGNORE INTO g_meta (key, value) VALUES ('farm_merge_v1', ?) RETURNING 1", [String(now())])).length) return null;
  const rows = await q("SELECT id, name, genes FROM f_strains ORDER BY created, id");
  const by: Record<string, { id: string; g: any }[]> = {};
  for (const [id, name, genes] of rows) (by[String(name)] = by[String(name)] || []).push({ id: String(id), g: JSON.parse(String(genes)) });
  const report: string[] = [];
  for (const name of Object.keys(by)) {
    const list = by[name];
    let base: string | null = null;
    for (const k in CROPS) if (!CROPS[k].hidden && CROPS[k].name === name) base = k;
    if (list.length < 2 && !base) continue;
    const keep = base || list[0].id, olds = list.map((x) => x.id).filter((id) => id !== keep);
    if (!base) {                                                     // среднее по всем вариантам
      const avg = (k: string) => list.reduce((a, x) => a + Number(x.g[k] || 0), 0) / list.length, g = { ...list[0].g };
      g.minutes = Math.max(5, Math.round(avg("minutes") / 5) * 5); g.dust = Math.max(1, Math.round(avg("dust")));
      g.vinyl = Math.round(avg("vinyl") * 100) / 100; g.thirst = Math.max(10, Math.round(avg("thirst") / 5) * 5);
      g.points = Math.max(POINTS_HARVEST_MIN, Math.round(g.minutes / 30)); g.gen = Math.min(...list.map((x) => Number(x.g.gen || 1)));
      await q("UPDATE f_strains SET genes = ? WHERE id = ?", [JSON.stringify(g), keep]);
    }
    for (const old of olds) {
      const moveCount = (t: string, col: string, extra = "") => [
        DB.prepare(`INSERT INTO ${t} (user, ${col}, count${extra ? ", " + extra : ""}) SELECT user, ?, count${extra ? ", " + extra : ""} FROM ${t} WHERE ${col} = ? AND true
                    ON CONFLICT(user, ${col}) DO UPDATE SET count = count + excluded.count${extra ? `, ${extra} = ${extra} + excluded.${extra}` : ""}`).bind(keep, old),
        DB.prepare(`DELETE FROM ${t} WHERE ${col} = ?`).bind(old)];
      if (base) await q("UPDATE f_inv SET listed = 0 WHERE strain = ?", [old]);    // семена станции не продаются — снять с продажи
      const stmts = [
        ...moveCount("f_inv", "strain", "listed"), ...moveCount("f_chest", "strain"), ...moveCount("f_barn", "strain"),
        DB.prepare(`INSERT INTO f_stall (user, item, listed) SELECT user, ?, listed FROM f_stall WHERE item = ? AND true
                    ON CONFLICT(user, item) DO UPDATE SET listed = listed + excluded.listed`).bind(keep, old),
        DB.prepare("DELETE FROM f_stall WHERE item = ?").bind(old),
        DB.prepare("UPDATE f_plots SET crop = ? WHERE crop = ?").bind(keep, old),
        DB.prepare("UPDATE f_sales SET strain = ? WHERE strain = ?").bind(keep, old),
        DB.prepare("DELETE FROM f_prices WHERE item IN (?, ?)").bind(old, "s:" + old),
      ];
      // мука и выпечка этого сорта: «p:<рецепт>@старый» → «@новый»
      for (const [t, col, cnt] of [["f_barn", "strain", "count"], ["f_stall", "item", "listed"]] as const) {
        const ps = await q(`SELECT DISTINCT ${col} FROM ${t} WHERE ${col} LIKE ?`, ["p:%@" + old]);
        for (const [pid] of ps) {
          const nid = String(pid).slice(0, String(pid).length - old.length) + keep;
          stmts.push(DB.prepare(`INSERT INTO ${t} (user, ${col}, ${cnt}) SELECT user, ?, ${cnt} FROM ${t} WHERE ${col} = ? AND true
                                 ON CONFLICT(user, ${col}) DO UPDATE SET ${cnt} = ${cnt} + excluded.${cnt}`).bind(nid, pid),
                     DB.prepare(`DELETE FROM ${t} WHERE ${col} = ?`).bind(pid),
                     DB.prepare("DELETE FROM f_prices WHERE item = ?").bind(pid));
        }
      }
      stmts.push(DB.prepare(`INSERT INTO f_jobtake (user, slot, strain, n) SELECT user, slot, ?, n FROM f_jobtake WHERE strain = ? AND true
                             ON CONFLICT(user, slot, strain) DO UPDATE SET n = n + excluded.n`).bind(keep, old),
                 DB.prepare("DELETE FROM f_jobtake WHERE strain = ?").bind(old));
      const js = await q("SELECT user, kind, recipe FROM f_jobs WHERE recipe LIKE ?", ["%@" + old]);
      for (const [user, kind, recipe] of js)
        stmts.push(DB.prepare("UPDATE f_jobs SET recipe = ? WHERE user = ? AND kind = ?").bind(String(recipe).slice(0, String(recipe).length - old.length) + keep, user, kind));
      await DB.batch(stmts);
      report.push(`${name}: ${old} → ${keep}`);
    }
  }
  return report;
}
async function hashId(g: any) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(g))));
  return "h" + [...d.slice(0, 5)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Экономия чтений базы (2026-11-16, бесплатный лимит D1 — 5 млн строк в сутки): запись о сорте после создания не меняется
// (id — хэш его свойств), поэтому прочитанные сорта живут в памяти сервера. Раньше каждый запрос фермы перечитывал их заново —
// это была пятая часть всех чтений. Память у каждого экземпляра сервера своя и короткая; не нашёл в ней — читаем из базы.
const STRAIN_MEM = new Map<string, { name: string; genes: any }>(), STRAIN_NONE = new Map<string, number>();   // NONE — чего в базе нет (на 10 минут)
export async function strains(ids: string[]): Promise<Record<string, Strain>> {
  const out: Record<string, Strain> = {};
  for (const k in CROPS) if (!CROPS[k].hidden) out[k] = view(CROPS[k]);
  for (const i of ids) if (CROPS[i]?.hidden) out[i] = view(CROPS[i]);
  // ключи сорта муки и сырья («g:sun:2», «r:moss:2») — не растения, в таблице сортов их не бывает: не ищем
  const need = [...new Set(ids.filter((i) => i && !CROPS[i] && !/^[grh]:/.test(i)))], t = now();   // «h:…» — сорт мёда
  const miss = need.filter((i) => !STRAIN_MEM.has(i) && !((STRAIN_NONE.get(i) || 0) > t - 600));
  if (miss.length) {
    if (STRAIN_MEM.size > 5000) STRAIN_MEM.clear();
    if (STRAIN_NONE.size > 5000) STRAIN_NONE.clear();
    for (let k = 0; k < miss.length; k += 90) {                  // D1 принимает не больше 100 параметров на запрос
      const part = miss.slice(k, k + 90);
      const rows = await q(`SELECT id, name, genes FROM f_strains WHERE id IN (${part.map(() => "?").join(",")})`, part);
      for (const [id, name, genes] of rows) STRAIN_MEM.set(String(id), { name: String(name), genes: JSON.parse(genes) });
      for (const id of part) if (!STRAIN_MEM.has(id)) STRAIN_NONE.set(id, t);
    }
  }
  for (const id of need) { const m = STRAIN_MEM.get(id); if (m) out[id] = view({ id, name: m.name, ...m.genes }); }
  return out;
}
// гибрид: форма — от собираемого растения, цвет — от соседа; свойства — среднее родителей ± мутация
async function breed(a: Strain, b: Strain, mutX = 1): Promise<Strain> {
  const r = Math.random, avg = (k: keyof Strain) => ((a[k] as number) + (b[k] as number)) / 2, mut = () => 0.85 + r() * 0.4;
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const pick = (list: string[], not: string[]) => { const l = list.filter((x) => !not.includes(x)); return l[Math.floor(r() * l.length)]; };
  let mutation: string | null = null, shape = a.shape, color = b.color;
  const odd = a.odd || b.odd, kin = !odd && (a.color === "anomaly" || b.color === "anomaly");
  if (odd) { shape = a.odd ? b.shape : a.shape; color = "anomaly"; }               // со странным растением: форма — от другого родителя, расцветка странная
  else if (kin) {                                                                    // «странный» родитель передаёт странность редко
    const plain = [b.color, a.color].find((c) => c !== "anomaly");
    color = r() < ODD_PASS ? "anomaly" : plain || pick(COLORS, []);
  }
  if (r() < MUTATE_SHAPE * mutX) { shape = pick(SHAPES, [a.shape, b.shape]); mutation = "shape"; }
  if (!odd && color !== "anomaly" && r() < MUTATE_COLOR * mutX) { color = pick(COLORS, [a.color, b.color]); mutation = mutation ? "both" : "color"; }
  const g: any = {
    shape, color,
    minutes: Math.round(clamp(avg("minutes") * mut(), 5, 480)),          // до минуты, а не до 5 (его решение 2026-11-16, вопрос Denis: «почему 20, а не 15»)
    dust: Math.round(clamp(avg("dust") * mut(), 1, 400)),
    vinyl: Math.round(clamp(avg("vinyl") * mut(), 0.01, 0.5) * 100) / 100,
    thirst: Math.round(clamp(avg("thirst") * mut(), 10, 240) / 5) * 5,
    bonus: null as string | null, gen: Math.max(a.gen, b.gen) + 1,
  };
  if (r() < 0.1) {                                       // скачок: одно свойство заметно лучше
    const k = ["dust", "minutes", "vinyl", "thirst"][Math.floor(r() * 4)];
    if (k === "dust") g.dust = Math.min(400, Math.round(g.dust * 1.5));
    if (k === "minutes") g.minutes = Math.max(5, Math.round(g.minutes * 0.7));
    if (k === "vinyl") g.vinyl = Math.min(0.5, Math.round(g.vinyl * 150) / 100);
    if (k === "thirst") g.thirst = Math.min(240, Math.round(g.thirst * 1.5 / 5) * 5);
  }
  const inherited = [a.bonus, b.bonus].filter(Boolean) as string[];
  if (inherited.length && r() < 0.6) g.bonus = inherited[Math.floor(r() * inherited.length)];
  else if (r() < 0.15) { const all = Object.keys(BONUSES); g.bonus = all[Math.floor(r() * all.length)]; }
  g.points = Math.max(POINTS_HARVEST_MIN, Math.round(g.minutes / 30));
  const id = await hashId(g), name = nameFor(g);
  await q("INSERT OR IGNORE INTO f_strains (id, name, genes, created) VALUES (?, ?, ?, ?)", [id, name, JSON.stringify(g), now()]);
  STRAIN_NONE.delete(id);
  return { ...view({ id, name, ...g }), mutation };
}

// ---------- погода: событие дня, одна на всех ----------
// Каждые сутки (по Минску) — своя погода. Выбирается детерминированно из даты, поэтому её не надо хранить
// и можно показать прогноз на завтра. Особая погода не повторяется два дня подряд.
export const WEATHER: Record<string, { name: string; icon: string; effect: string; w: number }> = {
  clear:    { name: "Ясная ночь",      icon: "☾",  effect: "обычный день",                         w: 40 },
  stardust: { name: "Звёздный дождь",  icon: "✨", effect: "урожай вдвое больше",                    w: 15 },
  shower:   { name: "Лунный ливень",   icon: "🌧", effect: "поливать не нужно — грядки политы сами; пчёлы пережидают в улье, колосья после сбора час сохнут, огонь не разгорается, огненные и солнечные растут медленнее", w: 15 },
  drought:  { name: "Засуха",          icon: "☀",  effect: "полива хватает вдвое меньше",           w: 12 },
  wind:     { name: "Солнечный ветер", icon: "🌬", effect: "ветер разносит пыльцу — гибриды вдвое чаще", w: 10 },
  fullmoon: { name: "Полнолуние",      icon: "🌕", effect: "артефакты выпадают вдвое чаще", w: 8 },
};
const TZ = 3 * 3600, DAY = 86400;
const dayStart = (t: number) => Math.floor((t + TZ) / DAY) * DAY - TZ;     // начало суток по Минску
function rawWeather(d: number, salt: string) {
  let h = 2166136261;
  for (const ch of `moonfarm:${salt}:${d}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let x = (h % 1000) / 1000 * Object.values(WEATHER).reduce((a, w) => a + w.w, 0);
  for (const [k, w] of Object.entries(WEATHER)) { x -= w.w; if (x < 0) return k; }
  return "clear";
}
function dayWeather(d: number, depth = 0): string {         // особая погода не повторяется два дня подряд
  const prev = depth < 3 ? dayWeather(d - 1, depth + 1) : rawWeather(d - 1, "a");
  for (const salt of ["a", "b", "c", "d"]) { const w = rawWeather(d, salt); if (w === "clear" || w !== prev) return w; }
  return "clear";
}
export const WTEST = { force: "", moss: -1 };              // только для проверки у себя: принудительная погода; moss ≥ 0 — свой шанс мха
export function weatherOn(t: number) { return WTEST.force || dayWeather(Math.floor((t + TZ) / DAY)); }   // погода на сутки момента t
export function weatherView(t: number) {
  const id = weatherOn(t), next = weatherOn(t + DAY), from = dayStart(t);
  return { today: { id, ...WEATHER[id], from, until: from + DAY }, tomorrow: { id: next, ...WEATHER[next] } };
}
function showersIn(a: number, b: number) {                 // интервалы лунного ливня внутри [a, b)
  const out: [number, number][] = [];
  for (let d = dayStart(a), n = 0; d < b && n < 30; d += DAY, n++) if (weatherOn(d + 1) === "shower") out.push([Math.max(a, d), Math.min(b, d + DAY)]);
  return out;
}

// ---------- рост и полив ----------
// p = [idx, crop, planted, grown, wet_from, water_until]
// Растёт, пока полито: окно полива [wet_from, water_until) плюс дни лунного ливня (после wet_from).
// boost — окна Солнцестояния: рост в них идёт вдвое быстрее (влажное время внутри окна считается дважды)
// огненные и солнечные в лунный ливень растут на четверть медленнее (его решение 2026-11-19: сыро и нет солнца)
const RAIN_SLOW = 0.25;
function rainSlow(s?: Strain) { return s && (s.color === "sun" || s.color === "ember") ? RAIN_SLOW : 0; }
function growth(p: any[], t: number, boost: [number, number][] = [], slow = 0) {
  const a = Number(p[4]), w = Math.min(t, Number(p[5])), parts: [number, number][] = [], sh = showersIn(a, t);
  if (w > a) parts.push([a, w]);
  for (const [s0, s1] of sh) { const b0 = Math.max(s0, w > a ? w : a); if (s1 > b0) parts.push([b0, s1]); }   // ливень вне окна полива
  let wet = 0;
  for (const [x0, x1] of parts) { wet += x1 - x0; for (const [b0, b1] of boost) wet += Math.max(0, Math.min(x1, b1, t) - Math.max(x0, b0));
    if (slow) for (const [s0, s1] of sh) wet -= slow * Math.max(0, Math.min(x1, s1) - Math.max(x0, s0)); }
  return Number(p[3]) + wet;
}
function lastWet(p: any[], t: number) {                   // когда грядка последний раз была влажной
  let x = Math.max(Number(p[5]), Number(p[2]));
  for (const [, s1] of showersIn(Number(p[2]), t)) x = Math.max(x, s1);
  return x;
}
// Рядом (через сторону) со странным растением или «странным» гибридом растение созревает раньше.
// Его решения 2026-11-18: ускоряет и само странное растение, пока растёт; сила — 12% срока (было 25% — «такая большая разница»);
// странное растение ускоряет весь свой рост, пока не созреет (его правка 2026-11-19; было — первые сутки, ODD_FOR остался для старых страниц).
// Сутки идут от первой посадки (f_evlog «odd:win»): лопата и пересадка отсчёт не обнуляют, новый начинается после сбора.
// Баланс: ускорение — не порог, а доля. Считается та часть жизни растения, которую сосед простоял рядом и ещё ускорял: посадили
// вместе или сосед уже рос — все 12%; подсадили странное к почти созревшему — почти ничего. Несколько соседей не складываются.
// Странное растение само не ускоряется. «Странные» гибриды (растут как обычные) ускоряют, пока стоят.
const ODD_NEAR = 0.88, ODD_FOR = DAY;
async function oddWin(uid: number): Promise<number> {              // когда у игрока пошли сутки ускорения; 0 — не идут
  const [r] = await q("SELECT at FROM f_evlog WHERE user = ? AND kind = 'odd:win' ORDER BY at DESC LIMIT 1", [uid]);
  return r ? Number(r[0]) : 0;
}
function fastAt(all: any[][], ss: Record<string, Strain>, idx: number, win = 0, t = now()): number {
  const p = all.find((x) => Number(x[0]) === idx);
  if (!p || ss[String(p[1])]?.odd) return 0;
  const born = Number(p[2]), life = Math.max(1, t - born);
  let share = 0;
  for (const x of all) if (near4(idx).includes(Number(x[0])) && ss[x[1]]?.color === "anomaly") {
    // странное растение ускоряет весь свой рост, пока не созреет (его решение 2026-11-19: семян в игре мало, они ходят из рук в руки;
    // было — только первые сутки); созревшее больше не ускоряет — иначе его держали бы на грядке ради ускорения
    const xs = ss[x[1]], until = xs.odd ? (growth(x, t) >= xs.minutes * 60 ? ripeAt(x, xs, t, [], 0) : Infinity) : Infinity;
    share = Math.max(share, Math.min(1, Math.max(0, Math.min(t, until) - Math.max(born, Number(x[2]))) / life));
  }
  return share;
}
function stateOf(p: any[], s: Strain, t: number, boost: [number, number][] = [], fast: number | boolean = 0) {
  const ripe = growth(p, t, boost, rainSlow(s)) >= s.minutes * 60 * (1 - (1 - ODD_NEAR) * Number(fast));
  const dryFor = weatherOn(t) === "shower" ? 0 : t - lastWet(p, t);
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
async function rainUntil() {                              // звёздный дождь — теперь просто погода дня
  const w = weatherView(now()).today;
  return w.id === "stardust" ? w.until : 0;
}
function plotView(p: any[] | undefined, idx: number, unlocked: number, ev?: any, honey?: any) {
  if (idx >= unlocked) return { idx, locked: true, price: PLOT_PRICE[idx] };
  if (ev && ev.kind === "crater") return { idx, crop: null, crater: true, ...(ev.until === 1 ? { big: true } : {}) };
  if (!p) return ev && ev.kind === "frost" ? { idx, crop: null, frost: ev.until } : { idx, crop: null };
  const v: any = { idx, crop: p[1], planted: Number(p[2]), grown: Number(p[3]), wet_from: Number(p[4]), water_until: Number(p[5]) };
  if (ev && ev.kind === "coal") v.coal = true;
  if (ev && ev.kind === "burning") v.burning = ev.until;                // Огненная ночь: грядка горит до этого времени
  if (ev && ev.kind === "comet") v.comet = true;
  if (honey) v.honey = honey;                                         // мёд: { item, until, got } — пчёлы собирают до until
  return v;
}

// ---------- события расцветок (его решения 2026-11-15) ----------
// огненный: пока растёт, может вспыхнуть — на грядке остаётся уголь (ценный товар);
// кометный: может прилететь комета — растение сразу созревает, при сборе прибавка пыли (редко, не чаще раза в сутки);
// ледяной: при сборе может заморозить грядку на сутки; огненное растение, посаженное рядом, растапливает сразу;
// солнечный: при сборе луч с неба может ударить в другую растущую грядку — она тут же созревает.
// точки на траве, куда падают звёздочки от кометы (координаты картинки фермы 184×190, мимо построек)
const STAR_SPOTS: [number, number][] = [[24, 118], [58, 102], [150, 108], [170, 128], [118, 172], [72, 178], [152, 168], [96, 92], [16, 146], [176, 150], [132, 88], [40, 186]];
const EV_BURN = 0.04, EV_COMET = 0.012, EV_FROST = 0.05, EV_SUN = 0.06, FROST_FOR = 86400, COMET_DUST_X = 3;
export const COAL_DUST = 120;
const BURN_PER_DAY = 3;                                      // вспышек на ферму за сутки (без Огненной ночи)
const near4 = (i: number) => [i - 3, i + 3, i % 3 ? i - 1 : -1, i % 3 < 2 ? i + 1 : -1].filter((x) => x >= 0 && x < PLOTS_MAX);
// наступившие события: уголь и комета появляются к своему времени; просроченный иней тает. Возвращает события по грядкам.
async function plotEvents(uid: number) {
  const t = now(), rows = await q("SELECT idx, kind, at, until FROM f_plotev WHERE user = ?", [uid]), out: Record<number, any> = {};
  // огненное растение на соседней грядке растапливает иней, даже если его посадили раньше, чем грядка замёрзла (Yehor, 2026-11-16)
  let fireAt: number[] = [];
  if (rows.some((r) => String(r[1]) === "frost")) {
    const pl = await q("SELECT idx, crop FROM f_plots WHERE user = ?", [uid]), ps = await strains(pl.map((p) => String(p[1])));
    fireAt = pl.filter((p) => ps[String(p[1])]?.color === "ember").map((p) => Number(p[0]));
  }
  for (const [idx, kind, at, until] of rows) {
    const i = Number(idx), k = String(kind);
    if (k === "frost") { if (Number(until) <= t || fireAt.some((f) => near4(f).includes(i))) { await q("DELETE FROM f_plotev WHERE user = ? AND idx = ? AND kind = 'frost'", [uid, i]); continue; } out[i] = { kind: k, until: Number(until) }; continue; }
    if (k === "burning") {                                            // Огненная ночь: догорела — на грядке уголь
      if (Number(until) <= t) { await q("UPDATE f_plotev SET kind = 'coal', until = 0 WHERE user = ? AND idx = ? AND kind = 'burning'", [uid, i]); out[i] = { kind: "coal", until: 0 }; }
      else out[i] = { kind: k, until: Number(until) };
      continue;
    }
    if (Number(at) > t) continue;                                     // ещё не случилось
    if (k === "comet_due") {                                          // комета упала: на грядке кратер, по ферме звёздочки с пылью
      const [p] = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ? AND idx = ?`, [uid, i]);
      if (!p) { await q("DELETE FROM f_plotev WHERE user = ? AND idx = ?", [uid, i]); continue; }
      const s = (await strains([String(p[1])]))[String(p[1])], total = Math.max(12, Math.round((s ? s.dust : 10) * COMET_DUST_X)), n = 4 + Math.floor(Math.random() * 3);
      const spots = STAR_SPOTS.slice().sort(() => Math.random() - 0.5).slice(0, n), w = spots.map(() => 0.6 + Math.random());
      const sumW = w.reduce((a, b) => a + b, 0); let left = total;
      const stmts = [DB.prepare("DELETE FROM f_plots WHERE user = ? AND idx = ?").bind(uid, i),
        DB.prepare("UPDATE f_plotev SET kind = 'crater' WHERE user = ? AND idx = ?").bind(uid, i),
        DB.prepare("INSERT OR REPLACE INTO f_cratercrop (user, idx, crop) VALUES (?, ?, ?)").bind(uid, i, String(p[1])),
        DB.prepare("INSERT INTO f_evlog (user, kind, at) VALUES (?, 'comet', ?)").bind(uid, t)];
      spots.forEach(([x, y], j) => { const d = j === spots.length - 1 ? left : Math.max(1, Math.round(total * w[j] / sumW)); left -= d;
        stmts.push(DB.prepare("INSERT INTO f_stars (user, x, y, dust, at) VALUES (?, ?, ?, ?, ?)").bind(uid, x + Math.round(Math.random() * 6 - 3), y + Math.round(Math.random() * 4 - 2), Math.max(1, d), t)); });
      await DB.batch(stmts);
      out[i] = { kind: "crater", until: 0 }; continue;
    }
    if (k === "burn_due" && weatherOn(Number(at)) === "shower") {         // в ливень огонь не разгорается — вспышки и угля нет (его решение 2026-11-19)
      await q("DELETE FROM f_plotev WHERE user = ? AND idx = ? AND kind = 'burn_due'", [uid, i]); continue;
    }
    if (k === "burn_due") {
      await DB.batch([DB.prepare("UPDATE f_plotev SET kind = 'coal' WHERE user = ? AND idx = ?").bind(uid, i),
                      DB.prepare("INSERT INTO f_evlog (user, kind, at) VALUES (?, 'burn', ?)").bind(uid, t)]);
      out[i] = { kind: "coal" }; continue;
    }
    out[i] = { kind: k, until: Number(until) };
  }
  return out;
}
async function seenEvents(uid: number) { return (await q("SELECT DISTINCT kind FROM f_evlog WHERE user = ? AND kind NOT LIKE '%:%'", [uid])).map((r) => String(r[0])); }
// уголь с грядки — в амбар (без амбара — сразу пылью)
// звёздочка кометы — в пыль; кратер — восстановить грядку (бесплатно), семя растения, на которое упала комета, возвращается
export async function takeStar(u: any, id: number) {
  await ensureFarm(u);
  const [r] = await q("DELETE FROM f_stars WHERE id = ? AND user = ? RETURNING dust", [id, u.id]);
  if (!r) return { error: "Звёздочку уже собрали" };
  await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [Number(r[0]), u.id]);
  return { dust: Number(r[0]), farm: await farmState(u) };
}
export async function fixCrater(u: any, idx: number) {
  await ensureFarm(u);
  const [row] = await q("DELETE FROM f_plotev WHERE user = ? AND idx = ? AND kind = 'crater' RETURNING until", [u.id, idx]);
  if (!row) return { error: "Тут нет кратера" };
  const idxs = [idx];                                           // большой кратер кометного дождя убирается целиком
  if (Number(row[0]) === 1) for (const r of await q("DELETE FROM f_plotev WHERE user = ? AND kind = 'crater' AND until = 1 RETURNING idx", [u.id])) idxs.push(Number(r[0]));
  let first: string | null = null, seeds = 0;
  for (const i of idxs) {
    const [c] = await q("DELETE FROM f_cratercrop WHERE user = ? AND idx = ? RETURNING crop", [u.id, i]);
    if (!c) continue;
    await q("INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, 1, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1", [u.id, String(c[0])]);
    first = first || String(c[0]); seeds++;
  }
  return { seed: first, seeds, farm: await farmState(u) };
}
export async function takeCoal(u: any, idx: number) {
  await ensureFarm(u); await plotEvents(u.id);
  if (!(await q("DELETE FROM f_plotev WHERE user = ? AND idx = ? AND kind = 'coal' RETURNING 1", [u.id, idx])).length) return { error: "Тут нет угля" };
  await q("DELETE FROM f_plots WHERE user = ? AND idx = ?", [u.id, idx]);
  const hasBarn = (await q("SELECT 1 FROM f_builds WHERE user = ? AND kind = 'barn'", [u.id])).length > 0;
  if (hasBarn) await q("INSERT INTO f_barn (user, strain, count) VALUES (?, 'p:coal', 1) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1", [u.id]);
  else await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [COAL_DUST, u.id]);
  return { barn: hasBarn, dust: hasBarn ? 0 : COAL_DUST, farm: await farmState(u) };
}

// ---------- события моно-фермы (его решения 2026-11-15) ----------
// Все открытые грядки (не меньше 5) засажены одной расцветкой → крупное событие, не чаще раза в 3 суток:
// солнечная — «Солнцестояние» (сутки рост ×2, на ферме солнечные лучи и тёплое свечение);
// звёздная — «Созвездие» (на случайных грядках складывается созвездие; следующий сбор с каждой его грядки — урожай ×2);
// туманная — «Мифическое семя» (одно семя случайного растения: светится фиолетовым, плод ×3, семян не даёт;
//   пока растёт, следующий сбор с каждой соседней грядки — пыль ×3; созревшее ждёт сутки, потом рассыпается).
// вся ферма во мху любой расцветки — «Мох захватил ферму» (его шутка 2026-11-15 над любителем мха): сутки что ни посади — пробивается мох,
//   семя не тратится; урожай мха ×2; ферма зарастает; когда мох отцветает — по ферме раскатываются мшистые комочки с пылью.
// лунная расцветка — «Лунное эхо» (×2 к продаже еды по заказам) — потом, с заказами.
const MONO_MIN = 5, MONO_EVERY = 3 * DAY, SOLSTICE_FOR = DAY, CONST_FOR = 3 * DAY, MYTH_WAIT = DAY, CONST_N = 4;
// огненная — «Огненная ночь»: вся ферма разом сгорает, на каждой грядке остаётся звёздный уголь (урожай пропадает);
// кометная — «Кометный дождь»: на месте грядок один большой кратер, по ферме много осколков со звёздной пылью;
//   кратер убирают лопатой — все грядки возвращаются, семена тоже.
const MONO_OF: Record<string, string> = { sun: "solstice", berry: "constellation", nebula: "myth", ember: "fire", crystal: "comet",
  moss: "moss" };   // лунная расцветка любых видов — то же событие, что и сплошной мох (его правка 2026-11-18)
const COMET_RAIN_X = 2;
const FIRE_FOR = 6 * 3600;                                   // Огненная ночь: сколько горят грядки (его правка 2026-11-15)                                      // осколков в сумме — вдвое от цены всех растений на ферме
const MONO_CHANCE = 0.15;                                    // у всех больших событий один шанс — 15% (его решение 2026-11-15; разный шанс он не просил)                                    // большие события — не наверняка: жребий раз в сутки на ферму (сначала у мха, потом у всех — его правки 2026-11-15)
const MOSS_FOR = DAY, MOSS_DUST = 8;                         // мох держится сутки; комочков в сумме — по 8 пыли за открытую грядку
async function mossNow(uid: number) { return (await q("SELECT 1 FROM f_mono WHERE user = ? AND kind = 'moss' AND until > ?", [uid, now()])).length > 0; }
async function mossEnd(uid: number) {                       // мох отцвёл — раскатать комочки (один раз на событие)
  const t = now(), rows = await q("SELECT started FROM f_mono WHERE user = ? AND kind = 'moss' AND until <= ?", [uid, t]);
  for (const [started] of rows) {
    const key = "mossend:" + started;
    if ((await q("SELECT 1 FROM f_evlog WHERE user = ? AND kind = ?", [uid, key])).length) continue;
    const [[open]] = await q("SELECT unlocked FROM f_farms WHERE user = ?", [uid]), total = MOSS_DUST * Number(open), n = 5 + Math.floor(Math.random() * 3);
    const spots = STAR_SPOTS.slice().sort(() => Math.random() - 0.5).slice(0, n), w = spots.map(() => 0.6 + Math.random()), sumW = w.reduce((a, b) => a + b, 0);
    let left = total;
    await DB.batch([DB.prepare("INSERT INTO f_evlog (user, kind, at) VALUES (?, ?, ?)").bind(uid, key, t),
      ...spots.map(([x, y], j) => { const d = j === spots.length - 1 ? left : Math.max(1, Math.round(total * w[j] / sumW)); left -= d;
        return DB.prepare("INSERT INTO f_clumps (user, x, y, dust, at) VALUES (?, ?, ?, ?, ?)").bind(uid, x + Math.round(Math.random() * 6 - 3), y + Math.round(Math.random() * 4 - 2), Math.max(1, d), t); })]);
  }
}
export async function takeClump(u: any, id: number) {
  await ensureFarm(u);
  const [r] = await q("DELETE FROM f_clumps WHERE id = ? AND user = ? RETURNING dust", [id, u.id]);
  if (!r) return { error: "Комочек уже собрали" };
  await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [Number(r[0]), u.id]);
  return { dust: Number(r[0]), farm: await farmState(u) };
}
async function boostOf(uid: number): Promise<[number, number][]> {
  return (await q("SELECT started, until FROM f_mono WHERE user = ? AND kind = 'solstice'", [uid])).map((r) => [Number(r[0]), Number(r[1])] as [number, number]);
}
async function monoView(uid: number) {
  const t = now();
  // просроченные отметки: сначала читаем, удаляем — только если такие есть (раньше удаление шло при каждой загрузке фермы)
  const all = await q("SELECT idx, kind, n, until FROM f_monomark WHERE user = ? ORDER BY n", [uid]);
  const gone = (r: any[]) => Number(r[3]) > 0 && Number(r[3]) <= t && String(r[1]) !== "mythripe";
  if (all.some(gone)) await q("DELETE FROM f_monomark WHERE user = ? AND until > 0 AND until <= ? AND kind != 'mythripe'", [uid, t]);
  const [m] = await q("SELECT kind, started, until FROM f_mono WHERE user = ? AND until > ? ORDER BY started DESC LIMIT 1", [uid, t]);
  const marks = all.filter((r) => !gone(r))
    .map(([idx, kind, n, until]) => ({ idx: Number(idx), kind: String(kind), n: Number(n), until: Number(until) }));
  return { mono: m ? { kind: String(m[0]), started: Number(m[1]), until: Number(m[2]) } : null, marks, boost: await boostOf(uid), odd_win: await oddWin(uid), odd_for: ODD_FOR, odd_near: ODD_NEAR };
}
async function mythSeed(uid: number) {                         // мифический вариант случайного растения: из станции или из своего мешка
  const inv = (await q("SELECT strain FROM f_inv WHERE user = ? AND count > 0", [uid])).map((r) => String(r[0]));
  const pool = Object.values(await strains(inv)).filter((x) => !x.myth && !x.hidden);
  const b = pool[Math.floor(Math.random() * pool.length)];
  const g: any = { shape: b.shape, color: b.color, minutes: b.minutes, dust: Math.min(1200, b.dust * 3), vinyl: b.vinyl, thirst: b.thirst,
                   bonus: b.bonus, gen: b.gen, points: b.points, myth: true,
                   nonce: [...crypto.getRandomValues(new Uint8Array(4))].map((x) => x.toString(16).padStart(2, "0")).join("") };
  const id = await hashId(g), name = nameFor(g);
  await q("INSERT OR IGNORE INTO f_strains (id, name, genes, created) VALUES (?, ?, ?, ?)", [id, name, JSON.stringify(g), now()]);
  STRAIN_NONE.delete(id);
  await q("INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, 1, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1", [uid, id]);
  return view({ id, name, ...g });
}
async function checkMono(uid: number) {
  const t = now(), [[unlocked]] = await q("SELECT unlocked FROM f_farms WHERE user = ?", [uid]), open = Number(unlocked);
  if (open < MONO_MIN) return null;
  const plots = await q("SELECT idx, crop FROM f_plots WHERE user = ? AND idx < ?", [uid, open]);
  if (plots.length < open) return null;
  const ss = await strains(plots.map((p) => String(p[1]))), colors = new Set(plots.map((p) => ss[String(p[1])]?.color));
  const allMoss = plots.every((p) => ss[String(p[1])]?.shape === "moss");     // мох любой расцветки — главнее расцветки
  const kind = allMoss ? "moss" : colors.size === 1 ? MONO_OF[String([...colors][0])] : "";
  if (!kind) return null;
  if (kind === "fire" && weatherOn(t) === "shower") return null;   // Огненная ночь в ливень не начинается (его решение 2026-11-19); жребий дня не тратится
  if ((await q("SELECT 1 FROM f_mono WHERE user = ? AND started > ?", [uid, t - MONO_EVERY])).length) return null;
  {                                                            // любое большое событие — по жребию, один раз в сутки на ферму (его правка 2026-11-15):
    const roll = "monoroll:" + Math.floor((t + TZ) / DAY);    //   сколько ни пересаживай, второй попытки сегодня нет
    if ((await q("SELECT 1 FROM f_evlog WHERE user = ? AND kind IN (?, ?)", [uid, roll, "mossroll:" + Math.floor((t + TZ) / DAY)])).length) return null;
    await q("INSERT INTO f_evlog (user, kind, at) VALUES (?, ?, ?)", [uid, roll, t]);
    if (Math.random() >= (WTEST.moss >= 0 ? WTEST.moss : MONO_CHANCE)) return null;
  }
  const until = t + (kind === "solstice" ? SOLSTICE_FOR : kind === "constellation" ? CONST_FOR : kind === "moss" ? MOSS_FOR : kind === "fire" ? FIRE_FOR : DAY);
  if (!(await q("INSERT OR IGNORE INTO f_mono (user, kind, started, until) VALUES (?, ?, ?, ?) RETURNING 1", [uid, kind, t, until])).length) return null;
  await q("INSERT INTO f_evlog (user, kind, at) VALUES (?, ?, ?)", [uid, "mono_" + kind, t]);
  await logFeed("event", uid, null, kind);
  const out: any = { kind, until };
  if (kind === "constellation") {
    const idxs = Array.from({ length: open }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, CONST_N);   // порядок случайный — линии идут зигзагом, а не обводят грядку
    await DB.batch(idxs.map((i, n) => DB.prepare("INSERT OR REPLACE INTO f_monomark (user, idx, kind, n, at, until) VALUES (?, ?, 'star', ?, ?, ?)").bind(uid, i, n, t, until)));
    out.plots = idxs;
  }
  if (kind === "myth") { const m = await mythSeed(uid); out.seed = { id: m.id, name: m.name }; }
  if (kind === "fire")                                         // ферма горит FIRE_FOR, потом на каждой грядке уголь; лейкой можно потушить раньше
    await DB.batch(plots.map((p) => DB.prepare("INSERT OR REPLACE INTO f_plotev (user, idx, kind, at, until) VALUES (?, ?, 'burning', ?, ?)").bind(uid, Number(p[0]), t, t + FIRE_FOR)));
  if (kind === "comet") {                                      // большой кратер на все грядки (until = 1 — метка «большой») и осколки по ферме
    const total = Math.max(60, COMET_RAIN_X * plots.reduce((a, p) => a + (ss[String(p[1])]?.dust || 0), 0));
    const spots = STAR_SPOTS.slice().sort(() => Math.random() - 0.5).slice(0, 10 + Math.floor(Math.random() * 3)), w = spots.map(() => 0.6 + Math.random()), sumW = w.reduce((a, b) => a + b, 0);
    let left = total;
    await DB.batch([
      ...plots.flatMap((p) => [DB.prepare("DELETE FROM f_plots WHERE user = ? AND idx = ?").bind(uid, Number(p[0])),
        DB.prepare("INSERT OR REPLACE INTO f_plotev (user, idx, kind, at, until) VALUES (?, ?, 'crater', ?, 1)").bind(uid, Number(p[0]), t),
        DB.prepare("INSERT OR REPLACE INTO f_cratercrop (user, idx, crop) VALUES (?, ?, ?)").bind(uid, Number(p[0]), String(p[1]))]),
      DB.prepare("DELETE FROM f_monomark WHERE user = ?").bind(uid),
      ...spots.map(([x, y], j) => { const d = j === spots.length - 1 ? left : Math.max(1, Math.round(total * w[j] / sumW)); left -= d;
        return DB.prepare("INSERT INTO f_stars (user, x, y, dust, at) VALUES (?, ?, ?, ?, ?)").bind(uid, x + Math.round(Math.random() * 6 - 3), y + Math.round(Math.random() * 4 - 2), Math.max(1, d), t); })]);
    out.dust = total;
  }
  return out;
}
// мифическое растение: созрело — ждёт сутки, потом рассыпается; вместе с ним гаснут отметки соседей
async function mythTick(uid: number) {
  const t = now(), boost = await boostOf(uid), plots = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [uid]);
  const ss = await strains(plots.map((p) => String(p[1])));
  if (!plots.some((p) => ss[String(p[1])]?.myth)) return;                  // мифического нет — дальше считать нечего
  const win = await oddWin(uid);
  for (const p of plots) {
    const s = ss[String(p[1])], i = Number(p[0]);
    if (!s || !s.myth || !stateOf(p, s, t, boost, fastAt(plots, ss, i, win)).ripe) continue;
    await q("INSERT OR IGNORE INTO f_monomark (user, idx, kind, at, until) VALUES (?, ?, 'mythripe', ?, ?)", [uid, i, t, t + MYTH_WAIT]);
    const [m] = await q("SELECT until FROM f_monomark WHERE user = ? AND idx = ? AND kind = 'mythripe'", [uid, i]);
    if (m && Number(m[0]) <= t) await DB.batch([
      DB.prepare("DELETE FROM f_plots WHERE user = ? AND idx = ?").bind(uid, i),
      DB.prepare("DELETE FROM f_monomark WHERE user = ? AND kind IN ('myth', 'mythripe')").bind(uid),
      DB.prepare("INSERT INTO f_evlog (user, kind, at) VALUES (?, 'myth_lost', ?)").bind(uid, t)]);
  }
}
// мука и выпечка, смолотые до сортов, — разложить по новым ключам (раз для каждого игрока; ничего не теряется, одинаковое складывается)
const NORM_MEM = new Map<number, number>(), NORM_EVERY = 1800;   // когда у игрока последний раз искали товары старого формата
async function normFlour(uid: number) {
  // Раньше пять запросов шли при каждой загрузке фермы и почти всегда ничего не находили (14% всех чтений). Старый формат новым
  // товарам не выдаётся; попасть к игроку он может разве что покупкой у того, кто давно не заходил, — подхватим через полчаса.
  const last = NORM_MEM.get(uid) || 0; if (now() - last < NORM_EVERY) return;
  if (NORM_MEM.size > 5000) NORM_MEM.clear(); NORM_MEM.set(uid, now());
  const old = "({c} LIKE '%@%' AND {c} NOT LIKE '%@g:%' AND {c} NOT LIKE '%@r:%' OR {c} IN ('p:soup', 'soup'))";   // простой суп — из обычного мха
  const rows = [...(await q(`SELECT 'barn', strain, count FROM f_barn WHERE user = ? AND ${old.replaceAll("{c}", "strain")}`, [uid])),
                ...(await q(`SELECT 'stall', item, listed FROM f_stall WHERE user = ? AND ${old.replaceAll("{c}", "item")}`, [uid])),
                ...(await q(`SELECT 'job', recipe, 0 FROM f_jobs WHERE user = ? AND ${old.replaceAll("{c}", "recipe")}`, [uid])),
                ...(await q(`SELECT 'price', item, 0 FROM f_prices WHERE user = ? AND ${old.replaceAll("{c}", "item")}`, [uid])),
                ...(await q(`SELECT 'chest', strain, count FROM f_chest WHERE user = ? AND ${old.replaceAll("{c}", "strain")}`, [uid]))];
  if (!rows.length) return;
  const ss = await strains(rows.map((r) => sortOf(String(r[1]))));
  const conv = (id: string) => { const rec = recipeOf(id), r = RECIPES[rec], g = ss[sortOf(id)];
    if (rec === "soup" && !sortOf(id)) return (id.startsWith("p:") ? "p:" : "") + "soup@r:moss:2";
    if (r && g && RAW_MAIN[rec] === g.shape) return (id.startsWith("p:") ? "p:" : "") + rec + "@" + rawKey(g);
    if (!r || !g || !(rec === "flour" || r.needs["p:flour"])) return null;
    return (id.startsWith("p:") ? "p:" : "") + rec + "@" + flourKey(g); };
  for (const [where, id, n] of rows) {
    const to = conv(String(id)); if (!to || to === id) continue;
    if (where === "barn") await DB.batch([DB.prepare("INSERT INTO f_barn (user, strain, count) VALUES (?, ?, ?) ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count").bind(uid, to, Number(n)),
                                          DB.prepare("DELETE FROM f_barn WHERE user = ? AND strain = ?").bind(uid, id)]);
    if (where === "stall") await DB.batch([DB.prepare("INSERT INTO f_stall (user, item, listed) VALUES (?, ?, ?) ON CONFLICT(user, item) DO UPDATE SET listed = listed + excluded.listed").bind(uid, to, Number(n)),
                                           DB.prepare("DELETE FROM f_stall WHERE user = ? AND item = ?").bind(uid, id)]);
    if (where === "chest") await DB.batch([DB.prepare("INSERT INTO f_chest (user, strain, count) VALUES (?, ?, ?) ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count").bind(uid, to, Number(n)),
                                           DB.prepare("DELETE FROM f_chest WHERE user = ? AND strain = ?").bind(uid, id)]);
    if (where === "job") await q("UPDATE f_jobs SET recipe = ? WHERE user = ? AND recipe = ?", [to, uid, id]);
    if (where === "price") await DB.batch([DB.prepare("UPDATE OR IGNORE f_prices SET item = ? WHERE user = ? AND item = ?").bind(to, uid, id),
                                           DB.prepare("DELETE FROM f_prices WHERE user = ? AND item = ?").bind(uid, id)]);
  }
}
// Всё, что загрузка фермы читает наверняка, — одним пакетом (см. prefetch в index.ts). Тексты запросов здесь должны слово в слово
// совпадать с теми, что ниже по ходу; разойдутся — ничего не сломается, просто этот запрос пойдёт в базу отдельно.
function farmReads(uid: number, t: number): [string, any[]][] {
  return [
    ["SELECT started, until FROM f_mono WHERE user = ? AND kind = 'solstice'", [uid]],
    ["SELECT at FROM f_evlog WHERE user = ? AND kind = 'odd:win' ORDER BY at DESC LIMIT 1", [uid]],
    [`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [uid]],
    ["SELECT started FROM f_mono WHERE user = ? AND kind = 'moss' AND until <= ?", [uid, t]],
    ["SELECT idx, kind, at, until FROM f_plotev WHERE user = ?", [uid]],
    ["SELECT dust, unlocked, pub, water FROM f_farms WHERE user = ?", [uid]],
    ["SELECT item, tier, finish, count FROM g_items WHERE user = ? AND game = 'farm' AND kind = 'vinyl'", [uid]],
    ["SELECT strain, count, listed FROM f_inv WHERE user = ? AND count > 0", [uid]],
    ["SELECT from_name, dust FROM f_gifts WHERE to_user = ? AND opened = 0 ORDER BY id LIMIT 20", [uid]],
    ["SELECT buyer_name, strain, price FROM f_sales WHERE seller = ? AND seen = 0 ORDER BY id LIMIT 20", [uid]],
    ["SELECT strain, count FROM f_barn WHERE user = ? AND count > 0", [uid]],
    ["SELECT item, listed FROM f_stall WHERE user = ? AND listed > 0", [uid]],
    ["SELECT strain, count FROM f_chest WHERE user = ? AND count > 0", [uid]],
    ["SELECT kind FROM f_builds WHERE user = ?", [uid]],
    ["SELECT j.kind, j.recipe, j.n, j.started, j.ready, EXISTS(SELECT 1 FROM f_jobtake t WHERE t.user = j.user AND t.slot = j.kind) FROM f_jobs j WHERE j.user = ?", [uid]],
    ["SELECT kind, level FROM f_levels WHERE user = ?", [uid]],
    ["SELECT DISTINCT kind FROM f_evlog WHERE user = ? AND kind NOT LIKE '%:%'", [uid]],
    ["SELECT id, x, y, dust FROM f_stars WHERE user = ?", [uid]],
    ["SELECT id, x, y, dust FROM f_clumps WHERE user = ?", [uid]],
    ["SELECT item FROM f_decor WHERE user = ? AND kind = 'roof'", [uid]],
    ["SELECT roof FROM f_style WHERE user = ?", [uid]],
    ["SELECT item, price FROM f_prices WHERE user = ?", [uid]],
    ["SELECT idx, kind, n, until FROM f_monomark WHERE user = ? ORDER BY n", [uid]],
    ["SELECT kind, started, until FROM f_mono WHERE user = ? AND until > ? ORDER BY started DESC LIMIT 1", [uid, t]],
    ["SELECT MAX(id) FROM f_feed WHERE actor != ? AND at > ?", [uid, t - 3 * DAY]],
    ["SELECT slot, items, reward, until, ready FROM f_orders WHERE user = ?", [uid]],
    ["SELECT 1 FROM f_evlog WHERE user = ? AND kind = ?", [uid, "ordskip:" + Math.floor((t + TZ) / DAY)]],
    ["SELECT at FROM f_builds WHERE user = ? AND kind = 'hive'", [uid]],
    ["SELECT idx, planted, item, until, got FROM f_honey WHERE user = ?", [uid]],
    ["SELECT item, count FROM f_hive WHERE user = ? AND count > 0", [uid]],
  ];
}
export async function farmState(u: any) {
  // первым в пакете — «завести ферму, если её нет» (то же, что ensureFarm); новичку следом — стартовый мешок
  const pub0 = [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, "0")).join(""), t0 = now();
  let pre: any[][][] | null = null;
  try { pre = await prefetch([["INSERT OR IGNORE INTO f_farms (user, pub, created, unlocked) VALUES (?, ?, ?, 3) RETURNING 1", [u.id, pub0, t0]], ...farmReads(u.id, t0)]); }
  catch (e) { console.error("prefetch", e); preClear(); await ensureFarm(u); }      // пакет не прошёл — грузим по-старому, по одному запросу
  if (pre && pre[0].length) await DB.batch(STARTER.map(([k, n]) => DB.prepare("INSERT OR IGNORE INTO f_inv (user, strain, count, listed) VALUES (?, ?, ?, 0)").bind(u.id, k, n)));
  try { return await farmState1(u); } finally { preClear(); }
}
async function farmState1(u: any) {
  await normFlour(u.id);
  await mythTick(u.id); await mossEnd(u.id);
  const EVS = await plotEvents(u.id), HON = await honeyTick(u.id, EVS);
  const hive = (await q("SELECT item, count FROM f_hive WHERE user = ? AND count > 0", [u.id])).map(([item, count]) => ({ item: String(item), count: Number(count) }));
  const [[dust, unlocked, pub, water]] = await q("SELECT dust, unlocked, pub, water FROM f_farms WHERE user = ?", [u.id]);
  const plots = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [u.id]);
  const by = new Map(plots.map((p) => [Number(p[0]), p]));
  const vinyls = (await q("SELECT item, tier, finish, count FROM g_items WHERE user = ? AND game = 'farm' AND kind = 'vinyl'", [u.id]))
    .map((v) => ({ id: v[0], tier: v[1], finish: v[2], count: Number(v[3]) }));
  const inv = (await q("SELECT strain, count, listed FROM f_inv WHERE user = ? AND count > 0", [u.id]))
    .map(([strain, count, listed]) => ({ strain, count: Number(count), listed: Number(listed) }));
  const gifts = await q("SELECT from_name, dust FROM f_gifts WHERE to_user = ? AND opened = 0 ORDER BY id LIMIT 20", [u.id]);
  const sales = await q("SELECT buyer_name, strain, price FROM f_sales WHERE seller = ? AND seen = 0 ORDER BY id LIMIT 20", [u.id]);
  const barn = (await q("SELECT strain, count FROM f_barn WHERE user = ? AND count > 0", [u.id])).map(([strain, count]) => ({ strain, count: Number(count) }));
  const stall = (await q("SELECT item, listed FROM f_stall WHERE user = ? AND listed > 0", [u.id])).map(([item, listed]) => ({ item: String(item), listed: Number(listed) }));
  const chest = (await q("SELECT strain, count FROM f_chest WHERE user = ? AND count > 0", [u.id])).map(([strain, count]) => ({ strain: String(strain), count: Number(count) }));
  const bs = [...barn.map((b) => b.strain), ...stall.map((x) => x.item), ...hive.map((x) => x.item), ...Object.values(HON).map((h: any) => h.item)];
  const bss = await strains(barn.map((b) => String(b.strain)).filter((x) => !x.startsWith("p:")));   // что можно приготовить из амбара — с ценой и сортом
  for (const b of barn) { const id = String(b.strain), g = bss[id];
    if (g?.shape === "grain") bs.push("p:flour@" + flourKey(g));
    if (g) for (const rk in RAW_MAIN) if (RAW_MAIN[rk] === g.shape) bs.push("p:" + rk + "@" + rawKey(g));
    if (recipeOf(id) === "flour" && sortOf(id)) for (const rk in RECIPES) if (RECIPES[rk].needs["p:flour"]) bs.push("p:" + rk + "@" + sortOf(id)); }
  const kit = await kitchenOf(u.id);                           // один раз на запрос: раньше постройки, работы и уровни читались дважды, а работы — трижды
  return {
    dust: Number(dust), unlocked: Number(unlocked), max: PLOTS_MAX, pub, water: Number(water), can_max: CAN_MAX, dry_limit: DRY_LIMIT,
    plots: Array.from({ length: PLOTS_MAX }, (_, i) => plotView(by.get(i), i, Number(unlocked), EVS[i], HON[i])), events_seen: await seenEvents(u.id),
    stars: (await q("SELECT id, x, y, dust FROM f_stars WHERE user = ?", [u.id])).map(([id, x, y, d]) => ({ id: Number(id), x: Number(x), y: Number(y), dust: Number(d) })),
    clumps: (await q("SELECT id, x, y, dust FROM f_clumps WHERE user = ?", [u.id])).map(([id, x, y, d]) => ({ id: Number(id), x: Number(x), y: Number(y), dust: Number(d) })),
    strains: await strains([...plots.map((p) => p[1]), ...inv.map((i) => i.strain), ...sales.map((x) => x[1]), ...bs.filter((x) => !x.startsWith("p:")), ...bs.map(sortOf).filter(Boolean), ...chest.map((x) => x.strain)]),
    ...kit, ...(await decorView(u.id)), recipes: RECIPES, products: (await productsFor([...bs, ...kit.jobs.map((j: any) => "p:" + j.recipe)])).products, build_list: BUILDS,
    bonuses: BONUSES, rain_until: await rainUntil(), now: now(), weather: weatherView(now()), wanderer: await metWanderer(u.id, await wandererView(u.id)), notice: await noticeFor(u.id), showers: showersIn(now() - 3 * DAY, now() + DAY),
    vinyls, inv, barn, stall, chest, hive, shells: Number((await q("SELECT count FROM f_shell WHERE user = ?", [u.id]))[0]?.[0] || 0), shell_dust: SHELL_DUST, wet: await wetOf(u.id), seed_dust: SEED_DUST, stall_markup: STALL_MARKUP, prices: await ownPrices(u.id), price_range: [PRICE_LO, PRICE_HI], gifts: gifts.map((g) => ({ from: g[0], dust: Number(g[1]) })),
    sales: sales.map(([buyer, strain, price]) => ({ buyer, strain, price: Number(price) })), ...(await monoView(u.id)), feed_top: await feedTop(u.id),
    orders: await ordersOf(u.id, kit.builds),
  };
}

// лопата (2026-11-15): выкопать посаженное — семя обратно в инвентарь, очко за посадку списывается (иначе сажай-копай ради очков)
export async function dig(u: any, idx: number) {
  if (!(idx >= 0 && idx < PLOTS_MAX)) return { error: "Нет такой грядки" };
  await ensureFarm(u);
  const EVD = await plotEvents(u.id);
  if (EVD[idx] && (EVD[idx].kind === "burning" || EVD[idx].kind === "coal")) return { error: EVD[idx].kind === "burning" ? "Грядка горит — потуши её лейкой" : "Сначала забери уголь" };
  const del = await q("DELETE FROM f_plots WHERE user = ? AND idx = ? RETURNING crop, planted, water_until", [u.id, idx]);
  await q("DELETE FROM f_honey WHERE user = ? AND idx = ?", [u.id, idx]);
  await q("DELETE FROM f_plotev WHERE user = ? AND idx = ? AND kind != 'frost'", [u.id, idx]);
  // дикий мох (вырос сам, пока мох захватил ферму — семя не тратилось): выкопал — семени нет (дюп, сообщил Askat 2026-11-16)
  const wild = (await q("DELETE FROM f_monomark WHERE user = ? AND idx = ? AND kind = 'wild' RETURNING 1", [u.id, idx])).length > 0;
  await q("DELETE FROM f_monomark WHERE user = ? AND idx = ? AND kind IN ('g2', 'gseed', 'gcross')", [u.id, idx]);          // самоцветная пыль пропадает вместе с растением
  if (del.length && (await strains([String(del[0][0])]))[String(del[0][0])]?.myth)            // выкопал мифическое — соседство гаснет, второй раз не зажжётся
    await q("DELETE FROM f_monomark WHERE user = ? AND kind IN ('myth', 'mythripe')", [u.id]);
  if (!del.length) return { error: "Тут ничего не растёт" };
  const crop = String(del[0][0]), t = now();
  // выкопал — очки за посадку и за полив этой посадки забираем: иначе «посадил → полил → выкопал» накручивал очки
  const back = POINTS_PLANT + (Number(del[0][2]) > Number(del[0][1]) ? POINTS_WATER : 0);
  await DB.batch([
    ...(wild ? [] : [DB.prepare("INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, 1, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1").bind(u.id, crop)]),
    DB.prepare("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, ?, ?, ?, ?)").bind(u.id, nameOf(u), -back, "Лунная ферма", t),
  ]);
  return { crop, wild, points: -back, farm: await farmState(u) };
}
export async function plant(u: any, idx: number, crop: string) {
  if (!(idx >= 0 && idx < PLOTS_MAX) || !crop) return { error: "Нет такой грядки или семян" };
  await ensureFarm(u);
  const [[unlocked]] = await q("SELECT unlocked FROM f_farms WHERE user = ?", [u.id]);
  if (idx >= Number(unlocked)) return { error: "Грядка ещё закрыта" };
  if ((await q("SELECT 1 FROM f_plots WHERE user = ? AND idx = ?", [u.id, idx])).length) return { error: "Грядка занята" };
  await plotEvents(u.id);
  if ((await q("SELECT 1 FROM f_plotev WHERE user = ? AND idx = ? AND kind = 'frost'", [u.id, idx])).length) return { error: "Грядка замёрзла" };
  if ((await q("SELECT 1 FROM f_plotev WHERE user = ? AND idx = ? AND kind = 'crater'", [u.id, idx])).length) return { error: "Сначала убери кратер" };
  const t = now();
  // мох захватил ферму: что ни посади — пробивается лунный мох, а семя остаётся в мешке
  const mossy = crop !== "moss" && await mossNow(u.id);
  // сажаем всегда из мешка; выставленные в лавку не трогаем
  const ok = mossy ? await q("SELECT 1 FROM f_inv WHERE user = ? AND strain = ? AND count - listed > 0", [u.id, crop])
                   : await q("UPDATE f_inv SET count = count - 1 WHERE user = ? AND strain = ? AND count - listed > 0 RETURNING 1", [u.id, crop]);
  if (!ok.length) return { error: "Таких семян у тебя нет" };
  if (mossy) crop = "moss";
  // посадили сухим — сразу после посадки нужно полить
  await DB.batch([
    DB.prepare(`INSERT INTO f_plots (user, ${PLOT_COLS}) VALUES (?, ?, ?, ?, 0, ?, ?)`).bind(u.id, idx, crop, t, t, t),
    mossy ? DB.prepare("INSERT OR REPLACE INTO f_monomark (user, idx, kind, at) VALUES (?, ?, 'wild', ?)").bind(u.id, idx, t)
          : DB.prepare("DELETE FROM f_monomark WHERE user = ? AND idx = ? AND kind = 'wild'").bind(u.id, idx),
    DB.prepare("DELETE FROM f_monomark WHERE user = ? AND idx = ? AND kind IN ('g2', 'gseed', 'gcross', 'oddfresh')").bind(u.id, idx),   // старая самоцветная пыль на новую посадку не переходит
    DB.prepare("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, ?, ?, ?, ?)").bind(u.id, nameOf(u), POINTS_PLANT, "Лунная ферма", t),
  ]);
  if (crop === "anomaly" && (await q("DELETE FROM f_evlog WHERE rowid = (SELECT rowid FROM f_evlog WHERE user = ? AND kind = 'odd:fresh' LIMIT 1) RETURNING 1", [u.id])).length)
    await q("INSERT OR REPLACE INTO f_monomark (user, idx, kind, at) VALUES (?, ?, 'oddfresh', ?)", [u.id, idx, t]);   // посажено свежее семя
  const s = (await strains([crop]))[crop];
  if (s && s.odd) {                                                   // сутки ускорения соседей: от первой посадки; лопата и пересадка их не обнуляют
    const w = await oddWin(u.id), [[n]] = await q("SELECT COUNT(*) FROM f_plots WHERE user = ? AND crop = ?", [u.id, crop]);
    if (!w) await q("INSERT INTO f_evlog (user, kind, at) VALUES (?, 'odd:win', ?)", [u.id, t]);
    else if (t - w > 3 * DAY && Number(n) <= 1) await q("UPDATE f_evlog SET at = ? WHERE user = ? AND kind = 'odd:win'", [t, u.id]);   // семя долго лежало (продали, подарили) — отсчёт заново
  }
  let thawed: number[] = [];
  if (s && s.color === "ember") {                                    // огонь растапливает иней на соседних грядках
    const ice = near4(idx);
    const del = await q(`DELETE FROM f_plotev WHERE user = ? AND kind = 'frost' AND idx IN (${ice.map(() => "?").join(",")}) RETURNING idx`, [u.id, ...ice]);
    thawed = del.map((r) => Number(r[0]));
    if (Math.random() < EV_BURN) {                                   // вспыхнет где-то посреди роста
      // не больше BURN_PER_DAY вспышек за сутки на ферму (его решение 2026-11-18: навар на быстрых огненных сортах — да, но небольшой);
      // считаем случившиеся за сутки и уже назначенные. Огненная ночь сюда не входит.
      const [[had]] = await q("SELECT (SELECT COUNT(*) FROM f_evlog WHERE user = ?1 AND kind = 'burn' AND at > ?2) + (SELECT COUNT(*) FROM f_plotev WHERE user = ?1 AND kind = 'burn_due')", [u.id, t - DAY]);
      if (Number(had) < BURN_PER_DAY)
        await q("INSERT OR REPLACE INTO f_plotev (user, idx, kind, at) VALUES (?, ?, 'burn_due', ?)", [u.id, idx, t + Math.round(s.minutes * 60 * (0.3 + Math.random() * 0.6))]);
    }
  }
  if (s && s.color === "crystal" && Math.random() < EV_COMET) {      // комета — не чаще раза в сутки на ферму
    const recent = await q("SELECT 1 FROM f_evlog WHERE user = ? AND kind = 'comet' AND at > ?", [u.id, t - 86400]);
    const pending = await q("SELECT 1 FROM f_plotev WHERE user = ? AND kind IN ('comet_due', 'crater')", [u.id]);
    if (!recent.length && !pending.length)
      await q("INSERT OR REPLACE INTO f_plotev (user, idx, kind, at) VALUES (?, ?, 'comet_due', ?)", [u.id, idx, t + Math.round(s.minutes * 60 * (0.2 + Math.random() * 0.5))]);
  }
  if (s && s.myth && !(await q("SELECT 1 FROM f_evlog WHERE kind = ?", ["mythp:" + s.id])).length) {   // соседство — один раз на семя
    const [[open]] = await q("SELECT unlocked FROM f_farms WHERE user = ?", [u.id]), nb = near4(idx).filter((i) => i < Number(open));
    await DB.batch([DB.prepare("INSERT INTO f_evlog (user, kind, at) VALUES (?, ?, ?)").bind(u.id, "mythp:" + s.id, t),
      ...nb.map((i) => DB.prepare("INSERT OR REPLACE INTO f_monomark (user, idx, kind, at) VALUES (?, ?, 'myth', ?)").bind(u.id, i, t))]);
  }
  const mono = await checkMono(u.id);
  return { points: POINTS_PLANT, thawed, mono, mossy, farm: await farmState(u) };
}

// ---------- ночная аномалия в общей лавке (его решение 2026-11-18) ----------
// Ночь по Минску, 00–04. Ночь-кандидат — по хешу даты (примерно одна из шести), но не раньше чем через 7 ночей после прошлой:
// выходит не чаще раза в неделю, обычно раз в 9–16 дней, когда именно — не угадать. В такую ночь семя лежит среди семян
// игроков всю ночь, с 00 до 04 (его правка 2026-11-18, было 40–60 минут); продавец — неразборчивые символы. Забирает первый, кто успел (f_evlog, user 0).
export const ANOM_PUB = "~";
const ANOM_EPOCH = Date.UTC(2026, 10, 18) / 1000, ANOM_GAP = 7, ANOM_P = 6;
const fnv = (str: string) => { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; };
// Запуск (его решение 2026-11-18): пока семя никто не купил, оно лежит каждую ночь. Первая покупка игроком запускает цикл выше —
// следующая ночь не раньше чем через ANOM_GAP ночей после неё. Его собственная покупка в ночь 0 («anomclaim:0») запуском не считается.
const ANOM_DAYS = new Map<number, boolean>();
async function anomStart(): Promise<number | null> {             // ночь первой покупки; не запоминаем: несостоявшаяся покупка свою отметку снимает
  const rows = await q("SELECT kind FROM f_evlog WHERE user = 0 AND kind LIKE 'anomclaim:%' AND kind != 'anomclaim:0'");
  const ds = rows.map((r) => Number(String(r[0]).split(":")[1])).filter((x) => x >= 0);
  return ds.length ? Math.min(...ds) : null;
}
function anomDay(d: number, start: number | null): boolean {    // d — номер ночи по Минску от эпохи
  if (d < 0) return false;
  if (start == null || d <= start) return true;                 // цикл ещё не запущен — каждую ночь
  const m = ANOM_DAYS.get(d); if (m !== undefined) return m;
  let last = start;                                             // считаем вперёд от ночи запуска — от даты вызова не зависит
  for (let i = start + 1; i <= d; i++) {
    let v = ANOM_DAYS.get(i);
    if (v === undefined) { v = i - last >= ANOM_GAP && fnv("anom:" + i) % ANOM_P === 0; ANOM_DAYS.set(i, v); }
    if (v) last = i;
  }
  return ANOM_DAYS.get(d)!;
}
const GLYPHS = [..."ϞϟϠϡϢϣϤϥҖҗӜӝѮѯѰѱѦѧѪѫҨҩ҂ξζϑϕϖʬʭǂǁʘɮ∴≋⁂‡¤"], MARKS = ["\u0334", "\u0337", "\u0353", "\u0336", "\u031b", ""];
export let ANOM_FORCE = 0;                                      // стенд: 1 — продаётся прямо сейчас
export function anomalyMarket(t = now(), start: number | null = null) {
  const loc = t + TZ, d = Math.floor((loc - ANOM_EPOCH) / DAY), sec = loc - ANOM_EPOCH - d * DAY;
  if (!ANOM_FORCE && (sec >= 4 * 3600 || !anomDay(d, start))) return null;
  const h = fnv("anomw:" + d), from = ANOM_EPOCH - TZ + d * DAY, until = from + 4 * 3600;
  if (!ANOM_FORCE && (t < from || t >= until)) return null;
  let name = "", x = fnv("anomn:" + d);
  for (let i = 0, n = 6 + x % 3; i < n; i++) { x = Math.imul(x ^ (x >>> 13), 2654435761) >>> 0; name += GLYPHS[x % GLYPHS.length] + MARKS[(x >>> 7) % MARKS.length]; }
  return { key: "anomclaim:" + d, price: 25 + (h >>> 16) % 26, seller: name, until };
}
// иногда за ночь лежит больше одного семени (номер ночи → сколько). Ночь 0 (18.11.2026): он купил первое и попросил выложить ещё одно
const ANOM_LOTS: Record<number, number> = { 0: 2 };
async function anomalyLive(t = now()) {
  if (!ANOM_FORCE && (t + TZ - ANOM_EPOCH) % DAY >= 4 * 3600) return null;   // не ночь — в базу не ходим
  const o = anomalyMarket(t, await anomStart());
  if (!o) return null;
  const d = Number(o.key.split(":")[1]), lots = ANOM_LOTS[d] || 1;
  for (let i = 1; i <= lots; i++) {                                // первое некупленное
    const key = i === 1 ? o.key : o.key + ":" + i;
    if (!(await q("SELECT 1 FROM f_evlog WHERE user = 0 AND kind = ?", [key])).length) return { ...o, key };
  }
  return null;
}
async function buyAnomaly(u: any) {
  const o = await anomalyLive();
  if (!o) return { error: "Его здесь больше нет" };
  await ensureFarm(u);
  const full = (await oddHeld(u.id)) >= ODD_PER_USER;
  if (full && !(await oddEvictable(u.id))) return { error: ODD_FULL };
  if (!(await q("INSERT INTO f_evlog (user, kind, at) SELECT 0, ?, ? WHERE NOT EXISTS (SELECT 1 FROM f_evlog WHERE user = 0 AND kind = ?) RETURNING 1",
                [o.key, now(), o.key])).length) return { error: "Уже раскупили" };
  if (!(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [o.price, u.id, o.price])).length) {
    await q("DELETE FROM f_evlog WHERE user = 0 AND kind = ?", [o.key]); return { error: "Не хватает звёздной пыли" }; }
  const evicted = full && (await oddEvict(u.id));
  await q(`INSERT INTO f_inv (user, strain, count, listed) VALUES (?, 'anomaly', 1, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1`, [u.id]);
  await oddFresh(u.id);
  return { ok: true, price: o.price, odd_evicted: evicted, farm: await farmState(u) };
}

// «Семенная лавка станции»: базовые семена в мешок за пыль
export async function buySeeds(u: any, crop: string, n: number) {
  const c = CROPS[crop], k = Math.max(1, Math.min(20, Math.round(n) || 1));
  if (!c || c.hidden) return { error: "Таких семян в лавке станции нет" };
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
  const EVW = await plotEvents(u.id);
  if (EVW[idx] && EVW[idx].kind === "burning") {                 // потушить горящую грядку: полив из лейки, уголь — сразу
    if (!(await q("UPDATE f_farms SET water = water - 1 WHERE user = ? AND water > 0 RETURNING 1", [u.id])).length) return { error: "Лейка пуста — набери воды в колодце" };
    if (!(await q("UPDATE f_plotev SET kind = 'coal', until = 0 WHERE user = ? AND idx = ? AND kind = 'burning' RETURNING 1", [u.id, idx])).length) {
      await q("UPDATE f_farms SET water = water + 1 WHERE user = ?", [u.id]); return { error: "Уже потушено" };
    }
    return { doused: true, farm: await farmState(u) };
  }
  const [p] = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ? AND idx = ?`, [u.id, idx]);
  if (!p) return { error: "Грядка пустая" };
  const all0 = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [u.id]), ss0 = await strains(all0.map((x) => x[1]));
  const s = ss0[p[1]], t = now(), boost = await boostOf(u.id), st = stateOf(p, s, t, boost, fastAt(all0, ss0, idx, await oddWin(u.id)));
  if (st.dead) return { error: "Растение засохло — его можно только убрать" };
  if (st.ripe) return { error: "Уже созрело — собирай" };
  if (weatherOn(t) === "shower") return { error: "Сегодня лунный ливень — грядки политы сами" };
  // поливается только сухая грядка: иначе лейкой можно было бы «накликивать» очки
  if (t < Number(p[5])) return { error: "Грядка ещё влажная" };
  if (!(await q("UPDATE f_farms SET water = water - 1 WHERE user = ? AND water > 0 RETURNING 1", [u.id])).length)
    return { error: "Лейка пуста — набери воды в колодце" };
  // накопленный рост фиксируем и открываем новое окно полива
  // окно полива открывает ровно один запрос (условие water_until <= сейчас) — двойное нажатие не даст очки дважды
  const done = await q("UPDATE f_plots SET grown = ?, wet_from = ?, water_until = ? WHERE user = ? AND idx = ? AND water_until <= ? RETURNING 1",
                       [growth(p, t, boost, rainSlow(s)), t, t + s.thirst * 60 * (weatherOn(t) === "drought" ? 0.5 : 1) * (s.bonus === "hardy" ? 2 : 1), u.id, idx, t]);   // стойкому — вдвое дольше
  if (!done.length) { await q("UPDATE f_farms SET water = water + 1 WHERE user = ?", [u.id]); return { error: "Грядка ещё влажная" }; }
  await q("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, ?, ?, ?, ?)", [u.id, nameOf(u), POINTS_WATER, "Лунная ферма", t]);
  return { points: POINTS_WATER, farm: await farmState(u) };
}

export async function harvest(u: any, idx: number) {
  const EV = await plotEvents(u.id);
  if (EV[idx] && EV[idx].kind === "coal") return takeCoal(u, idx);
  if (EV[idx] && EV[idx].kind === "burning") return { error: "Грядка горит — потуши её лейкой или дождись угля" };
  const [p] = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ? AND idx = ?`, [u.id, idx]);
  if (!p) return { error: "Грядка пустая" };
  await honeyTick(u.id, EV);                                             // таймер мёда — свежий (ливень мог сдвинуть конец), досидевшее — в улей
  const t = now(), all = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [u.id]), boost = await boostOf(u.id);
  const ss = await strains(all.map((x) => x[1])), s = ss[p[1]], win = await oddWin(u.id), st = stateOf(p, s, t, boost, fastAt(all, ss, idx, win));
  if (!st.ripe && !st.dead) return { error: "Ещё не созрело" };
  // грядку забирает ровно один запрос: повторное нажатие не заплатит дважды
  if (!(await q("DELETE FROM f_plots WHERE user = ? AND idx = ? AND planted = ? RETURNING 1", [u.id, idx, p[2]])).length) return { error: "Уже собрано" };
  const evHere = EV[idx] && EV[idx].kind;
  const hon = await q("DELETE FROM f_honey WHERE user = ? AND idx = ? RETURNING planted, until, got, item", [u.id, idx]);   // не досидело до конца таймера — мёда не будет
  const honeyLost = hon.length > 0 && Number(hon[0][0]) === Number(p[2]) && !Number(hon[0][2]) && Number(hon[0][1]) > t;
  if (hon.length && Number(hon[0][0]) === Number(p[2]) && !Number(hon[0][2]) && Number(hon[0][1]) <= t)   // таймер вышел, а улей ещё не знал — баночка сейчас
    await q("INSERT INTO f_hive (user, item, count) VALUES (?, ?, 1) ON CONFLICT(user, item) DO UPDATE SET count = count + 1", [u.id, String(hon[0][3])]);
  await q("DELETE FROM f_plotev WHERE user = ? AND idx = ? AND kind NOT IN ('frost', 'crater')", [u.id, idx]);   // несостоявшиеся события грядки — прочь
  if (s && s.myth) await q("DELETE FROM f_monomark WHERE user = ? AND kind IN ('myth', 'mythripe')", [u.id]);
  if (s && s.odd && !all.some((x) => Number(x[0]) !== idx && ss[x[1]]?.odd))                 // странное собрано (или убрано засохшим) — следующая посадка начнёт новые сутки
    await q("DELETE FROM f_evlog WHERE user = ? AND kind = 'odd:win'", [u.id]);
  if (st.dead) return { withered: true, farm: await farmState(u) };       // засохшее — просто убрали (звезда созвездия на грядке остаётся)
  if (s && s.odd) await q("INSERT INTO f_evlog (user, kind, at) SELECT ?, 'odd:reaped', ? WHERE NOT EXISTS (SELECT 1 FROM f_evlog WHERE user = ? AND kind = 'odd:reaped')", [u.id, t, u.id]);   // первое странное собрано — гости дальше видят его как есть
  const marks = (await q("DELETE FROM f_monomark WHERE user = ? AND idx = ? AND kind IN ('star', 'myth', 'wild', 'g2', 'gseed', 'gcross') RETURNING kind", [u.id, idx])).map((r) => String(r[0]));
  const rain = (await rainUntil()) > t;
  const double = s.bonus === "rich" && Math.random() < 0.25;
  // урожай идёт в амбар (решение 2026-11-14): превратить в звёздную пыль (по цене сорта) или пустить на кухню
  // без амбара (его покупают) урожай сразу превращается в пыль, как было до кухни
  const star = marks.includes("star");                                    // грядка созвездия — урожай ×2
  const mossX = s.shape === "moss" && await mossNow(u.id);               // пока мох захватил ферму — урожай мха ×2
  const gem2 = marks.includes("g2");                                     // бирюзовая самоцветная пыль — урожай ×2, складывается с остальным
  const crop = (s.odd ? 2 : 1) * (rain ? (s.bonus === "rain" ? 3 : 2) : 1) * (double ? 2 : 1) * (star ? 2 : 1) * (mossX ? 2 : 1) * (gem2 ? 2 : 1);   // странное — пара глаз
  // сосед мифического растения (оно ещё на грядке): пыль ×3 — сверх урожая сразу +2 его цены
  const mythNear = !s.myth && marks.includes("myth") && all.some((x) => near4(idx).includes(Number(x[0])) && ss[x[1]]?.myth);
  const points = s.points;
  const hasBarn = (await q("SELECT 1 FROM f_builds WHERE user = ? AND kind = 'barn'", [u.id])).length > 0;
  const cometDust = evHere === "comet" ? COMET_DUST_X * s.dust : 0;      // комета: прибавка пыли сразу, сверх урожая
  const mythDust = mythNear ? crop * s.dust * 2 : 0;
  const dust = (hasBarn ? 0 : crop * s.dust) + cometDust + mythDust;
  // колосья, собранные в лунный ливень, — мокрые (его решение 2026-11-19): час сохнут в амбаре, смолоть их до того нельзя
  const wetGrain = hasBarn && s.shape === "grain" && weatherOn(t) === "shower";
  const writes: any[] = [hasBarn
    ? DB.prepare(`INSERT INTO f_barn (user, strain, count) VALUES (?, ?, ?)
                  ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count`).bind(u.id, s.odd ? "p:eye" : s.id, crop)
    : DB.prepare("UPDATE f_farms SET dust = dust + ? WHERE user = ?").bind(crop * s.dust, u.id)];
  if (wetGrain) writes.push(DB.prepare("INSERT INTO f_wet (user, strain, n, dry_at) VALUES (?, ?, ?, ?)").bind(u.id, s.id, crop, t + WET_DRY));
  if (cometDust + mythDust) writes.push(DB.prepare("UPDATE f_farms SET dust = dust + ? WHERE user = ?").bind(cometDust + mythDust, u.id));
  if (points > 0) writes.push(DB.prepare("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, ?, ?, ?, ?)")
    .bind(u.id, nameOf(u), points, "Лунная ферма", t));
  // с урожаем возвращаются семена той же культуры: не меньше 2 (посадил одно — получил больше), обычно 2, иногда 3;
  // «плодовитый» сорт даёт ещё одно. Так хозяйство растёт, а удачный гибрид можно размножить и продать.
  const fresh = s.odd && (await q("DELETE FROM f_monomark WHERE user = ? AND idx = ? AND kind = 'oddfresh' RETURNING 1", [u.id, idx])).length > 0;
  const oddStock = s.odd ? Number((await q(`SELECT COALESCE((SELECT count FROM f_inv WHERE user = ? AND strain = 'anomaly'), 0)
                                                 + COALESCE((SELECT count FROM f_chest WHERE user = ? AND strain = 'anomaly'), 0)`, [u.id, u.id]))[0][0]) : 0;
  const seeds = s.odd ? ((await oddHeld(u.id)) >= ODD_PER_USER ? 0 : (fresh && oddStock === 0) || (await oddInGame()) + 1 <= (await oddCap()) ? 1 : 0) : s.color === "anomaly" ? 1 : (s.myth ? 0 : SEEDS_MIN + (Math.random() < SEEDS_EXTRA ? 1 : 0) + (s.bonus === "seedy" ? 1 : 0)) * (marks.includes("gseed") ? 3 : 1);   // травяная пыль — семян втрое   // мифическое семян не даёт
  if (seeds) writes.push(DB.prepare(`INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, ?, 0)
                                     ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count`).bind(u.id, s.id, seeds));
  await DB.batch(writes);
  // скрещивание с созревшим соседом другого сорта
  let hybrid: any = null;
  const r0 = Math.floor(idx / 3), c0 = idx % 3;
  const near = all.filter((x) => {
    const i = Number(x[0]), r = Math.floor(i / 3), c = i % 3;
    return i !== idx && Math.abs(r - r0) + Math.abs(c - c0) === 1 && x[1] !== p[1] && ss[x[1]] && !ss[x[1]].myth && stateOf(x, ss[x[1]], t, boost, fastAt(all, ss, i, win)).ripe;
  });
  // розовая самоцветная пыль: гибрид наверняка — с соседом другого сорта (зрелость не нужна), а нет соседа — с базовым растением станции;
  // новая форма и новый цвет выпадают втрое чаще
  const gcross = !s.myth && !s.odd && marks.includes("gcross");
  const nearAny = gcross ? all.filter((x) => near4(idx).includes(Number(x[0])) && x[1] !== p[1] && ss[x[1]] && !ss[x[1]].myth && !ss[x[1]].odd) : [];
  // сосед выбирается заранее: со странным (или если собираемое странное) шанс вчетверо меньше — гибриды с ним остаются редкостью
  const pick0 = !gcross && !s.myth && near.length ? ss[near[Math.floor(Math.random() * near.length)][1]] : null;
  const crossP = CROSS_CHANCE * (weatherOn(t) === "wind" ? 2 : 1) * (oddish(s) || oddish(pick0) ? ODD_CROSS : 1);
  if (gcross || (pick0 && Math.random() < crossP)) {
    const pool = gcross ? (near.filter((x) => !ss[x[1]].odd).length ? near.filter((x) => !ss[x[1]].odd) : nearAny) : near, base = Object.values(CROPS).filter((c) => !c.hidden && c.id !== s.id);
    const other = pick0 || (pool.length ? ss[pool[Math.floor(Math.random() * pool.length)][1]] : view(base[Math.floor(Math.random() * base.length)]));
    const h = await breed(s, other, gcross ? 3 : 1);
    const [[had]] = await q("SELECT COUNT(*) FROM f_inv WHERE user = ? AND strain = ?", [u.id, h.id]);
    await q(`INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, 1, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1`, [u.id, h.id]);
    hybrid = { ...h, parents: [s.name, other.name], fresh: !Number(had) };
  }
  const vinyl = await dropVinyl(u.id, s.vinyl * (s.bonus === "lucky" ? 2 : 1) * (weatherOn(t) === "fullmoon" ? 2 : 1));
  // ледяной: может заморозить свою грядку; солнечный: луч с неба — другая растущая грядка сразу созревает
  let frost = 0, sunbeam = -1, thawed: number[] = [];
  if (s.color === "ember") {                                          // собрал огненное — лёд рядом тоже тает
    const ice = near4(idx);
    thawed = (await q(`DELETE FROM f_plotev WHERE user = ? AND kind = 'frost' AND idx IN (${ice.map(() => "?").join(",")}) RETURNING idx`, [u.id, ...ice])).map((r) => Number(r[0]));
  }
  if (s.color === "frost" && Math.random() < EV_FROST) {
    frost = t + FROST_FOR;
    await DB.batch([DB.prepare("INSERT OR REPLACE INTO f_plotev (user, idx, kind, at, until) VALUES (?, ?, 'frost', ?, ?)").bind(u.id, idx, t, frost),
                    DB.prepare("INSERT INTO f_evlog (user, kind, at) VALUES (?, 'frost', ?)").bind(u.id, t)]);
  }
  if (s.color === "sun" && Math.random() < EV_SUN) {
    const grow = all.filter((x) => Number(x[0]) !== idx && ss[x[1]] && !ss[x[1]].odd && !stateOf(x, ss[x[1]], t, boost, fastAt(all, ss, Number(x[0]), win)).ripe && !stateOf(x, ss[x[1]], t, boost).dead);
    if (grow.length) {
      const x = grow[Math.floor(Math.random() * grow.length)]; sunbeam = Number(x[0]);
      await DB.batch([DB.prepare("UPDATE f_plots SET grown = ?, wet_from = ?, water_until = ? WHERE user = ? AND idx = ?").bind(ss[x[1]].minutes * 60, t, t, u.id, sunbeam),
                      DB.prepare("INSERT INTO f_evlog (user, kind, at) VALUES (?, 'sun', ?)").bind(u.id, t)]);
    }
  }
  return { crop, dust, wet: wetGrain ? t + WET_DRY : 0, honey_lost: honeyLost, comet: cometDust, myth_dust: mythDust, star, moss2: mossX, gem2, frost, thawed, sunbeam, barn: hasBarn, points, rain, double, seeds, hybrid, vinyl, farm: await farmState(u) };
}

// амбар → звёздная пыль: s.dust за штуку. strain = "*" — продать всё.
export async function sellCrop(u: any, strain: string, n: number) {
  await ensureFarm(u);
  const rows = await q("SELECT strain, count FROM f_barn WHERE user = ? AND count > 0", [u.id]);
  // «весь урожай в пыль» не трогает самоцветы и их пыль — они куплены у странника (2026-11-17); их — только по одному, явно
  const GEMS = new Set([...Object.values(GEM_KINDS).flatMap((g) => [g.gem, g.dust]), "p:eye"]);   // и странные глаза — редкость, только явно
  const pick = strain === "*" ? rows.filter((r) => !GEMS.has(String(r[0]))) : rows.filter((r) => r[0] === strain);
  if (!pick.length) return { error: "В амбаре этого нет" };
  const ss: Record<string, { dust: number }> = { ...(await strains(pick.map((r) => r[0]).filter((x) => !String(x).startsWith("p:")))), ...(await productsFor(pick.map((r) => String(r[0])))).products };
  let got = 0, sold = 0;
  for (const [id, have] of pick) {
    const s = ss[id]; if (!s) continue;
    const k = strain === "*" ? Number(have) : Math.max(1, Math.min(Number(have), Math.round(n) || 1));
    // списывает ровно один запрос: двойное нажатие не продаст лишнего
    if (!(await q("UPDATE f_barn SET count = count - ? WHERE user = ? AND strain = ? AND count >= ? RETURNING 1", [k, u.id, id, k])).length) continue;
    got += k * s.dust; sold += k;
  }
  if (!sold) return { error: "В амбаре этого нет" };
  await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [got, u.id]);
  return { sold, dust: got, farm: await farmState(u) };
}

// мокрые колосья: сколько каких ещё сохнут (просохшие строки удаляются)
const WET_DRY = 3600;
async function wetOf(uid: number) {
  const t = now(), rows = await q("SELECT strain, n, dry_at FROM f_wet WHERE user = ?", [uid]);
  if (rows.some((r) => Number(r[2]) <= t)) await q("DELETE FROM f_wet WHERE user = ? AND dry_at <= ?", [uid, t]);
  return rows.filter((r) => Number(r[2]) > t).map(([strain, n, dry_at]) => ({ strain: String(strain), n: Number(n), dry_at: Number(dry_at) }));
}
// ---------- кухня: мельница и печь (2026-11-14) ----------
// Строения покупаются за пыль. В каждом одно задание: загрузил — ждёшь (как рост, без полива) — забрал в амбар.
// Ингредиенты — из амбара: по форме растения (любой сорт и цвет; берутся самые дешёвые) или готовые продукты («p:flour»).
// Готовое лежит в амбаре как «p:<рецепт>»: превращается в пыль по цене рецепта; дальше — заказы ресторанов.
// up — цены прокачки (его решение 2026-11-16): каждая даёт ещё одну ячейку, всего ячеек до трёх
export const BUILDS: Record<string, { name: string; price: number; max: number; up?: number[] }> = {
  barn: { name: "Амбар",    price: 50,  max: 0 },     // без амбара урожай сразу идёт в пыль; кухня без амбара не работает
  mill: { name: "Мельница", price: 200, max: 10, up: [400, 1000] },
  oven: { name: "Печь",     price: 300, max: 5,  up: [600, 1500] },
  shop: { name: "Магазин",  price: 500, max: 0 },     // заказы жителей станции на блюда (2026-11-15)
  hive: { name: "Улей",     price: 500, max: 0 },     // пчёлы собирают мёд с созревших растений (его идея 2026-11-18)
};
export const RECIPES: Record<string, { kind: string; name: string; needs: Record<string, number>; min: number; dust: number; points: number }> = {
  flour:  { kind: "mill", name: "Мука",               needs: { grain: 1 },                       min: 3,  dust: 7,   points: 0 },
  bread:  { kind: "oven", name: "Лунный хлеб",        needs: { "p:flour": 2 },                   min: 10, dust: 18,  points: 1 },
  soup:   { kind: "oven", name: "Суп из мха",         needs: { moss: 2, berry: 1 },              min: 10, dust: 36,  points: 1 },
  bun:    { kind: "oven", name: "Ягодная булочка",    needs: { "p:flour": 1, berry: 2 },         min: 20, dust: 55,  points: 2 },
  pie:    { kind: "oven", name: "Звёздный пирог",     needs: { "p:flour": 2, berry: 1, crystal: 1 }, min: 60, dust: 140, points: 4 },
  tea:    { kind: "oven", name: "Звездоцветный чай",  needs: { flower: 2 },                      min: 15, dust: 60,  points: 2 },
  stew:   { kind: "oven", name: "Грибная похлёбка",   needs: { mushroom: 2, moss: 1 },           min: 20, dust: 70,  points: 3 },
  pumpkin:{ kind: "oven", name: "Тыквенный пирог",    needs: { "p:flour": 1, pumpkin: 1 },       min: 30, dust: 80,  points: 3 },
  jam:    { kind: "oven", name: "Кактусовый джем",    needs: { cactus: 2, berry: 1 },            min: 20, dust: 75,  points: 3 },
  // из урожая странного растения (2026-11-18), чёрная, в разделе «Похлёбка» (его правка); в заказы магазина не попадает — глаза редкость
  brew:   { kind: "oven", name: "Странная похлёбка",     needs: { "p:eye": 1, moss: 2 },            min: 40, dust: 180, points: 5 },
  // из мёда улья (2026-11-18): подходит мёд любого сорта, берётся самый дешёвый
  honeycake: { kind: "oven", name: "Медовик",          needs: { "p:flour": 2, "p:honey": 1 },     min: 20, dust: 26,  points: 2 },
  honeytea:  { kind: "oven", name: "Медовый чай",      needs: { flower: 1, "p:honey": 1 },        min: 15, dust: 40,  points: 2 },
  honeypie:  { kind: "oven", name: "Ягодный медовый пирог", needs: { "p:flour": 1, berry: 2, "p:honey": 1 }, min: 40, dust: 60, points: 3 },   // его просьба 2026-11-18; цены медовых блюд — его решение 2026-11-18 (~1,2–1,3 цены продуктов)
  honeycandy:   { kind: "oven", name: "Хрустальные леденцы", needs: { crystal: 1, "p:honey": 1 }, min: 30, dust: 110, points: 4 },
  honeypumpkin: { kind: "oven", name: "Тыква в меду",     needs: { pumpkin: 1, "p:honey": 1 },       min: 30, dust: 50,  points: 3 },
  // самоцветы странника (2026-11-16): каждый мелется в пыль своего цвета; что делает пыль — в GEMS ниже
  gemdust:         { kind: "mill", name: "Лунная самоцветная пыль",    needs: { "p:gem": 1 },       min: 5, dust: 40, points: 0 },
  "gemdust-crop":  { kind: "mill", name: "Бирюзовая самоцветная пыль", needs: { "p:gem-crop": 1 },  min: 5, dust: 40, points: 0 },
  "gemdust-seed":  { kind: "mill", name: "Травяная самоцветная пыль",  needs: { "p:gem-seed": 1 },  min: 5, dust: 60, points: 0 },
  "gemdust-dew":   { kind: "mill", name: "Золотая самоцветная пыль",   needs: { "p:gem-dew": 1 },   min: 5, dust: 40, points: 0 },
  "gemdust-cross": { kind: "mill", name: "Розовая самоцветная пыль",   needs: { "p:gem-cross": 1 }, min: 5, dust: 40, points: 0 },
};
const PRODUCTS: Record<string, { name: string; dust: number }> = Object.fromEntries(Object.entries(RECIPES).map(([k, r]) => ["p:" + k, { name: r.name, dust: r.dust }]));
PRODUCTS["p:coal"] = { name: "Звёздный уголь", dust: 120 };
PRODUCTS["p:eye"] = { name: "Странный глаз", dust: 60 };          // урожай странного растения (2026-11-18): в амбаре отдельно от его семени
PRODUCTS["p:gem"] = { name: "Лунный самоцвет", dust: 30 };
PRODUCTS["p:gem-crop"] = { name: "Бирюзовый самоцвет", dust: 30 }; PRODUCTS["p:gem-seed"] = { name: "Травяной самоцвет", dust: 50 };
PRODUCTS["p:gem-dew"] = { name: "Золотой самоцвет", dust: 30 }; PRODUCTS["p:gem-cross"] = { name: "Розовый самоцвет", dust: 30 };              // продаёт странник в полнолуние; мельница мелет его в самоцветную пыль              // остаётся, когда сгорает огненное растение — редкий и ценный
// Мука помнит сорт колосьев («p:flour@<сорт>»), а выпечка — сорт муки («p:bread@<сорт>», его просьба 2026-11-14):
// из разной пшеницы — разная мука и разная выпечка. Цена: мука = цена колоса + 2; выпечка = рецепт + разница муки от пшеничной.
const BASE_FLOUR = 7;
export function sortOf(id: string) { const i = id.indexOf("@"); return i < 0 ? "" : id.slice(i + 1); }
function recipeOf(id: string) { const r = id.startsWith("p:") ? id.slice(2) : id, i = r.indexOf("@"); return i < 0 ? r : r.slice(0, i); }
// Сорт муки (его правка 2026-11-15: «повторы с одинаковым названием, но разной ценой»): мука помнит расцветку колосьев
// и получает сорт по их цене — второй (колосья до ✦7), первый (до ✦10), высший (дороже). Одинаковая мука — одна ячейка.
// Ключ сорта: «g:<расцветка>:<сорт>[:m]» (m — мифическая), мука «p:flour@g:frost:0», хлеб «p:bread@g:frost:0».
const FLOUR_PRICE = [15, 11, 7], GRADE_NAME = ["высший сорт", "первый сорт", "второй сорт"];
function gradeOf(dust: number) { return dust <= 7 ? 2 : dust <= 10 ? 1 : 0; }
export function flourKey(g: Strain) { return "g:" + g.color + ":" + gradeOf(g.myth ? g.dust / 3 : g.dust) + (g.myth ? ":m" : ""); }
// Блюда без муки (его правка 2026-11-15: «нужно, чтобы всё различалось по сырью») помнят главное сырьё рецепта:
// суп — мох, похлёбка — грибы, чай — звездоцвет, джем — кактус. Ключ «r:<расцветка>:<сорт>[:m]»; сорт — по цене сырья
// относительно обычного (до ×1,4 — второй, до ×2 — первый, дороже — высший). Цена блюда растёт с сортом, как у выпечки.
export const RAW_MAIN: Record<string, string> = { soup: "moss", stew: "mushroom", tea: "flower", jam: "cactus" };
const RAW_REF: Record<string, number> = { moss: 4, mushroom: 8, flower: 8, cactus: 8 };   // цена «обычного» сырья
const GRADE_X = [15 / 7, 11 / 7, 1];                                   // наценка за сорт — та же, что у муки
export function rawKey(g: Strain) {
  const d = (g.myth ? g.dust / 3 : g.dust) / (RAW_REF[g.shape] || 8);
  return "r:" + g.color + ":" + (d <= 1.4 ? 2 : d <= 2 ? 1 : 0) + (g.myth ? ":m" : "");
}
function parseFlour(k: string) { const [, color, gr, m] = k.split(":"); return { color, grade: Math.max(0, Math.min(2, Number(gr) || 0)), myth: m === "m" }; }
// ---------- улей и мёд (его идея 2026-11-18) ----------
// Пока улей построен, пчёлы собирают мёд с каждого созревшего растения: у грядки идёт оранжевый таймер — половина срока роста,
// от 10 минут до 2 часов, отсчёт с минуты созревания. Растение простояло до конца таймера — в улье появляется баночка мёда;
// собрали раньше — мёда нет. Мёд помнит расцветку растения и получает сорт по его цене («p:honey@h:<расцветка>:<сорт>[:m]»),
// копится в улье и забирается в амбар, как мука с мельницы. В амбаре продаётся, идёт в печь и в лавку.
const HONEY_MIN = 600, HONEY_MAX = 7200, HONEY_PRICE = [20, 8, 3];   // баланс (его решение 2026-11-18): мёд не дороже половины растения — ждать мёд выгодно отошедшему, а не сидящему
function honeyDust(id: any) { return recipeOf(String(id)) === "honey" ? honeyInfo(sortOf(String(id))).dust : 0; }
// в лунный ливень пчёлы не летают (его решение 2026-11-19): таймер мёда стоит, пока идёт ливень, — конец сдвигается на время ливня
function honeyEnd(start: number, dur: number) {
  let t0 = start, left = dur;
  for (const [a, b] of showersIn(start, start + dur + 4 * DAY)) {
    if (b <= t0) continue;
    if (a >= t0 + left) break;
    if (a > t0) left -= a - t0;
    t0 = Math.max(t0, b);
  }
  return t0 + left;
}
function honeyFor(s: Strain) { return Math.max(HONEY_MIN, Math.min(HONEY_MAX, Math.round(s.minutes * 30))); }
function honeyKey(s: Strain) { const d = s.myth ? s.dust / 3 : s.dust; return "h:" + s.color + ":" + (d <= 10 ? 2 : d <= 40 ? 1 : 0) + (s.myth ? ":m" : ""); }
function honeyInfo(k: string) {
  if (!k.startsWith("h:")) return { name: "Мёд", dust: HONEY_PRICE[2] };
  const f = parseFlour(k), adj = f.myth ? MYTH_ADJ[0] : (ADJ[f.color] || ODD_ADJ)[0];
  return { name: adj + " мёд", dust: HONEY_PRICE[f.grade] * (f.myth ? 3 : 1), sort: k, sort_name: GRADE_NAME[f.grade], color: f.color, grade: f.grade, ...(f.myth ? { myth: true } : {}) };
}
function ripeAt(p: any[], s: Strain, t: number, boost: [number, number][], fast: number) {   // когда растение созрело: рост во времени только растёт — делим пополам
  const need = s.minutes * 60 * (1 - (1 - ODD_NEAR) * fast);
  let lo = Math.max(Number(p[2]), Number(p[4])), hi = t;
  if (growth(p, lo, boost, rainSlow(s)) >= need) return lo;
  for (let i = 0; i < 26 && hi - lo > 1; i++) { const m = Math.floor((lo + hi) / 2); if (growth(p, m, boost, rainSlow(s)) >= need) hi = m; else lo = m; }
  return hi;
}
// таймеры мёда: заводятся у созревших растений, по окончании баночка — в улей (ровно один раз на посадку)
async function honeyTick(uid: number, EVS: Record<number, any>) {
  const [b] = await q("SELECT at FROM f_builds WHERE user = ? AND kind = 'hive'", [uid]);
  if (!b) return {};
  const t = now(), built = Number(b[0]), plots = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [uid]);
  const rows = new Map((await q("SELECT idx, planted, item, until, got FROM f_honey WHERE user = ?", [uid])).map((r) => [Number(r[0]), r]));
  const ss = await strains(plots.map((p) => String(p[1]))), boost = await boostOf(uid), win = await oddWin(uid), out: Record<number, any> = {};
  for (const p of plots) {
    const idx = Number(p[0]), s = ss[String(p[1])], ev = EVS[idx] && EVS[idx].kind;
    if (!s || s.odd || ev === "burning" || ev === "coal") continue;
    let r = rows.get(idx); rows.delete(idx);
    if (r && Number(r[1]) !== Number(p[2])) r = undefined;                 // таймер прошлой посадки
    let start = 0;
    if (!r || !Number(r[4])) {                                           // начало и конец сбора — заново: конец сдвигает ливень
      const fast = fastAt(plots, ss, idx, win, t), st = stateOf(p, s, t, boost, fast);
      if (!st.ripe) { if (r) out[idx] = { item: String(r[2]), until: Number(r[3]) }; continue; }
      start = Math.max(built, ripeAt(p, s, t, boost, fast));
      const until2 = honeyEnd(start, honeyFor(s));
      if (r && Number(r[3]) !== until2 && (await q("UPDATE f_honey SET until = ? WHERE user = ? AND idx = ? AND planted = ? AND got = 0 RETURNING 1", [until2, uid, idx, Number(p[2])])).length) r[3] = until2;
    }
    if (!r) {
      const until = honeyEnd(start, honeyFor(s)), item = "p:honey@" + honeyKey(s);
      // два параллельных запроса не должны обнулить уже выданную баночку: строку той же посадки не перезаписываем, а перечитываем
      await q(`INSERT INTO f_honey (user, idx, planted, item, until, got) VALUES (?, ?, ?, ?, ?, 0)
               ON CONFLICT(user, idx) DO UPDATE SET planted = excluded.planted, item = excluded.item, until = excluded.until, got = 0 WHERE f_honey.planted != excluded.planted`, [uid, idx, Number(p[2]), item, until]);
      const [r2] = await q("SELECT idx, planted, item, until, got FROM f_honey WHERE user = ? AND idx = ? AND planted = ?", [uid, idx, Number(p[2])]);
      if (!r2) continue;
      r = r2;
    }
    if (!Number(r[4]) && Number(r[3]) <= t &&
        (await q(`UPDATE f_honey SET got = 1 WHERE user = ?1 AND idx = ?2 AND planted = ?3 AND got = 0
                  AND EXISTS (SELECT 1 FROM f_plots WHERE user = ?1 AND idx = ?2 AND planted = ?3) RETURNING 1`, [uid, idx, Number(p[2])])).length) {   // растение уже собрали параллельно — баночку выдал сбор
      await q("INSERT INTO f_hive (user, item, count) VALUES (?, ?, 1) ON CONFLICT(user, item) DO UPDATE SET count = count + 1", [uid, String(r[2])]);
      r[4] = 1;
    }
    out[idx] = { item: String(r[2]), until: Number(r[3]), ...(start ? { from: start, dur: honeyFor(s) } : {}), ...(Number(r[4]) ? { got: true } : {}) };   // from и dur — для полоски: в ливень она стоит
  }
  for (const idx of rows.keys()) await q("DELETE FROM f_honey WHERE user = ? AND idx = ?", [uid, idx]);   // растения уже нет
  return out;
}
// забрать мёд из улья в амбар
export async function hiveCollect(u: any) {
  if (!(await q("SELECT 1 FROM f_builds WHERE user = ? AND kind = 'barn'", [u.id])).length) return { error: "Сначала нужен амбар: мёду негде лежать" };
  await honeyTick(u.id, await plotEvents(u.id));                       // досидевший мёд, который улей ещё не принял, — сначала в улей (жалоба 2026-11-18: «мёд готов, а там пусто»)
  const got = await q("DELETE FROM f_hive WHERE user = ? AND count > 0 RETURNING item, count", [u.id]);
  if (!got.length) return { error: "В улье пока нет мёда" };
  await DB.batch(got.map(([id, n]) => DB.prepare("INSERT INTO f_barn (user, strain, count) VALUES (?, ?, ?) ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count").bind(u.id, String(id), Number(n))));
  return { n: got.reduce((a, r) => a + Number(r[1]), 0), farm: await farmState(u) };
}
export function productInfo(id: string, ss: Record<string, Strain>) {
  if (recipeOf(id) === "honey") return honeyInfo(sortOf(id));
  const r = RECIPES[recipeOf(id)]; if (!r) return null;
  if (r.needs["p:honey"]) {                                              // медовые блюда — по мёду: цена растёт с сортом мёда, цвет глазури — его
    const k = sortOf(id); if (!k.startsWith("h:")) return { name: r.name, dust: r.dust };
    const f = parseFlour(k), h = honeyInfo(k);
    return { name: r.name, dust: Math.round((r.dust + r.needs["p:honey"] * (HONEY_PRICE[f.grade] - HONEY_PRICE[2])) * (f.myth ? 3 : 1)), sort: k,
             sort_name: h.name.toLowerCase() + ", " + GRADE_NAME[f.grade], color: f.color, grade: f.grade, ...(f.myth ? { myth: true } : {}) };
  }
  const sort = sortOf(id), nf = r.needs["p:flour"] || 0, isFlour = recipeOf(id) === "flour";
  if (isFlour || nf) {                                                   // мука и выпечка — по сорту муки
    const f = sort.startsWith("g:") ? parseFlour(sort) : ss[sort] ? parseFlour(flourKey(ss[sort])) : null;
    if (!f) return { name: r.name, dust: r.dust };
    const fd = FLOUR_PRICE[f.grade], base = isFlour ? fd : r.dust + nf * (fd - BASE_FLOUR), dust = Math.round(base * (f.myth ? 3 : 1));
    const adj = f.myth ? MYTH_ADJ[2] : (ADJ[f.color] || ODD_ADJ)[2], key = "g:" + f.color + ":" + f.grade + (f.myth ? ":m" : "");
    return { name: isFlour ? adj + " мука" : r.name, dust, sort: key, sort_name: isFlour ? GRADE_NAME[f.grade] : adj.toLowerCase() + " мука, " + GRADE_NAME[f.grade],
             color: f.color, grade: f.grade, ...(f.myth ? { myth: true } : {}) };
  }
  const main = RAW_MAIN[recipeOf(id)];
  if (main) {                                                            // суп, похлёбка, чай, джем — по главному сырью
    const k = sort.startsWith("r:") ? sort : ss[sort]?.shape === main ? rawKey(ss[sort]) : "";
    if (!k) return { name: r.name, dust: r.dust };
    const f = parseFlour(k), n = r.needs[main] || 1, [noun, form] = NOUN[main];
    const dust = Math.round((r.dust + n * (RAW_REF[main] || 8) * (GRADE_X[f.grade] - 1)) * (f.myth ? 3 : 1));
    const adj = f.myth ? MYTH_ADJ[form] : (ADJ[f.color] || ODD_ADJ)[form];
    return { name: r.name, dust, sort: k, sort_name: (adj + " " + noun).toLowerCase() + ", " + GRADE_NAME[f.grade], color: f.color, grade: f.grade, ...(f.myth ? { myth: true } : {}) };
  }
  const g = ss[sort];
  if (!g) return { name: r.name, dust: r.dust };
  const gd = g.myth ? g.dust / 3 : g.dust, fd = gd + 2, base = recipeOf(id) === "flour" ? fd : r.dust + nf * (fd - BASE_FLOUR);
  const dust = Math.round(base * (g.myth ? 3 : 1));                     // еда с мифическим — ×3
  return { name: r.name, dust, sort: g.id, sort_name: g.name, color: g.color, ...(g.myth ? { myth: true } : {}) };
}
function productIds(ids: string[]) { return ids.filter((x) => String(x).startsWith("p:")); }
async function productsFor(ids: string[]) {
  const ss = await strains(productIds(ids).map(sortOf).filter(Boolean)), out: Record<string, any> = { ...PRODUCTS };
  for (const id of productIds(ids)) { const p = productInfo(id, ss); if (p) out[id] = p; }
  return { products: out, sorts: ss };
}
// ячейки (2026-11-16): задание первой ячейки — kind «mill»/«oven» (как раньше), второй и третьей — «mill:1», «mill:2».
// Уровень строения — f_levels (нет строки — одна ячейка). Что списано из амбара — f_jobtake: по нему отмена возвращает сырьё.
const SLOTS_MAX = 3;
function slotKinds(kind: string, lvl: number) { return [kind, kind + ":1", kind + ":2"].slice(0, Math.max(1, Math.min(SLOTS_MAX, lvl))); }
async function levelOf(uid: number, kind: string) { const [r] = await q("SELECT level FROM f_levels WHERE user = ? AND kind = ?", [uid, kind]); return r ? Number(r[0]) : 1; }
async function kitchenOf(uid: number) {
  const builds = (await q("SELECT kind FROM f_builds WHERE user = ?", [uid])).map((r) => String(r[0]));
  const jobs = (await q("SELECT j.kind, j.recipe, j.n, j.started, j.ready, EXISTS(SELECT 1 FROM f_jobtake t WHERE t.user = j.user AND t.slot = j.kind) FROM f_jobs j WHERE j.user = ?", [uid]))
    .map(([kind, recipe, n, started, ready, took]) => ({ kind, recipe, n: Number(n), started: Number(started), ready: Number(ready), ...(Number(took) ? { undo: true } : {}) }));
  const levels: Record<string, number> = {};
  for (const [kind, level] of await q("SELECT kind, level FROM f_levels WHERE user = ?", [uid])) levels[String(kind)] = Number(level);
  return { builds, jobs, levels };
}
// прокачка мельницы или печи: ещё одна ячейка, всего до трёх
const UPGRADES_ON = false;                 // прокачка готова, но пока выключена (его решение 2026-11-16: сначала только отмена)
export async function upgrade(u: any, kind: string) {
  if (!UPGRADES_ON) return { error: "Прокачка пока закрыта" };
  const b = BUILDS[kind]; if (!b?.up) return { error: "Это строение не прокачивается" };
  if (!(await q("SELECT 1 FROM f_builds WHERE user = ? AND kind = ?", [u.id, kind])).length) return { error: b.name + " ещё не построена" };
  const lvl = await levelOf(u.id, kind);
  if (lvl >= SLOTS_MAX) return { error: "Больше ячеек не бывает" };
  const price = b.up[lvl - 1];
  if (!(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [price, u.id, price])).length) return { error: "Не хватает звёздной пыли" };
  await q("INSERT INTO f_levels (user, kind, level) VALUES (?, ?, ?) ON CONFLICT(user, kind) DO UPDATE SET level = excluded.level", [u.id, kind, lvl + 1]);
  return { farm: await farmState(u) };
}
// отменить готовку или помол (его просьба 2026-11-16): сырьё — ровно то, что списали, — возвращается в амбар
export async function uncook(u: any, slot: string) {
  const kind = slot.split(":")[0];
  if (!BUILDS[kind]?.up) return { error: "Нечего отменять" };
  const [j] = await q("SELECT ready FROM f_jobs WHERE user = ? AND kind = ?", [u.id, slot]);
  if (!j) return { error: "Нечего отменять" };
  if (Number(j[0]) <= now()) return { error: "Уже готово — забери в амбар" };
  const took = await q("SELECT strain, n FROM f_jobtake WHERE user = ? AND slot = ?", [u.id, slot]);
  if (!took.length) return { error: "Это загружено до обновления — отменить нельзя, дождись" };
  if (!(await q("DELETE FROM f_jobs WHERE user = ? AND kind = ? AND ready > ? RETURNING 1", [u.id, slot, now()])).length) return { error: "Уже готово — забери в амбар" };
  await DB.batch([
    ...took.map(([id, n]) => DB.prepare("INSERT INTO f_barn (user, strain, count) VALUES (?, ?, ?) ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count").bind(u.id, id, Number(n))),
    DB.prepare("DELETE FROM f_jobtake WHERE user = ? AND slot = ?").bind(u.id, slot)]);
  return { farm: await farmState(u) };
}
export async function build(u: any, kind: string) {
  const b = BUILDS[kind]; if (!b) return { error: "Такого строения нет" };
  await ensureFarm(u);
  if (kind === "shop" && !(await q("SELECT 1 FROM f_builds WHERE user = ? AND kind IN ('mill', 'oven')", [u.id])).length)
    return { error: "Сначала построй мельницу или печь: магазин заказывает блюда" };
  if ((await q("SELECT 1 FROM f_builds WHERE user = ? AND kind = ?", [u.id, kind])).length) return { error: "Уже построено" };
  if (!(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [b.price, u.id, b.price])).length)
    return { error: "Не хватает звёздной пыли" };
  await q("INSERT OR IGNORE INTO f_builds (user, kind, at) VALUES (?, ?, ?)", [u.id, kind, now()]);
  return { farm: await farmState(u) };
}
// загрузить n порций рецепта: ингредиенты списываются из амбара сразу (самые дешёвые подходящие)
export async function cook(u: any, recipe: string, n: number, sort = "") {
  const r = RECIPES[recipe]; if (!r) return { error: "Такого рецепта нет" };
  const b = BUILDS[r.kind], k = Math.max(1, Math.min(b.max, Math.round(n) || 1));
  if (!(await q("SELECT 1 FROM f_builds WHERE user = ? AND kind = ?", [u.id, r.kind])).length) return { error: b.name + " ещё не построена" };
  if (!(await q("SELECT 1 FROM f_builds WHERE user = ? AND kind = 'barn'", [u.id])).length) return { error: "Сначала нужен амбар: блюдам негде лежать" };
  const busy = new Set((await q("SELECT kind FROM f_jobs WHERE user = ? AND (kind = ? OR kind LIKE ?)", [u.id, r.kind, r.kind + ":%"])).map((x) => String(x[0])));
  const slot = slotKinds(r.kind, await levelOf(u.id, r.kind)).find((x) => !busy.has(x));
  if (!slot) return { error: b.name + " занята" };
  let barn = await q("SELECT strain, count FROM f_barn WHERE user = ? AND count > 0", [u.id]);
  const ss = await strains(barn.map((x) => x[0]).filter((x) => !String(x).startsWith("p:")));
  if (recipe === "flour") {                                             // мокрые колосья мельница не берёт, пока не просохнут
    const wet: Record<string, number> = {}; for (const w of await wetOf(u.id)) wet[w.strain] = (wet[w.strain] || 0) + w.n;
    const before = barn.filter(([id]) => ss[id]?.shape === "grain").reduce((a, [, c]) => a + Number(c), 0);
    barn = barn.map(([id, c]) => [id, Number(c) - (wet[String(id)] || 0)]).filter(([, c]) => Number(c) > 0);
    const after = barn.filter(([id]) => ss[id]?.shape === "grain").reduce((a, [, c]) => a + Number(c), 0);
    if (after < k && before >= k) return { error: "Колосья ещё сохнут после ливня — смолоть можно, когда просохнут" };
  }
  const plan: [string, number][] = [];
  // сорт: мельница мелет один сорт колосьев, печь берёт муку одного сорта; без сорта — как раньше (старая «p:flour»)
  const main = RAW_MAIN[recipe], hon = !!r.needs["p:honey"], sorted = hon || recipe === "flour" || !!r.needs["p:flour"] || !!main;
  // медовые блюда помнят мёд (его правка 2026-11-18: «глазурь такого цвета, какого мёд»): сорт блюда — мёд «h:…»; мука в них — любая, самая дешёвая
  if (hon && !(sort && sort.startsWith("h:"))) {
    const by: Record<string, number> = {};
    for (const [id, c] of barn) if (recipeOf(String(id)) === "honey" && sortOf(String(id)).startsWith("h:")) by[sortOf(String(id))] = (by[sortOf(String(id))] || 0) + Number(c);
    sort = Object.keys(by).filter((x) => by[x] >= r.needs["p:honey"] * k).sort((a, c) => honeyInfo(a).dust - honeyInfo(c).dust)[0] || "";
  }
  if (main && !(sort && sort.startsWith("r:"))) {           // суп, похлёбка, чай, джем: сорт главного сырья; не выбран — самый дешёвый, которого хватает
    const by: Record<string, number> = {}, price: Record<string, number> = {};
    for (const [id, c] of barn) { const g = ss[id]; if (g?.shape !== main) continue; const key = rawKey(g); by[key] = (by[key] || 0) + Number(c); price[key] = Math.min(price[key] ?? 1e9, g.dust); }
    const opts = Object.keys(by).filter((x) => by[x] >= r.needs[main] * k).sort((a, c) => price[a] - price[c]);
    sort = opts[0] || "";
  }
  if (sorted && !main && !hon && !sort) {                          // не выбран — берём тот, которого хватает и который дешевле
    const want = recipe === "flour" ? k : r.needs["p:flour"] * k;
    const opts = barn.filter(([id, c]) => Number(c) >= want && (recipe === "flour" ? ss[id]?.shape === "grain" : String(id).startsWith("p:flour")))
      .sort((a, c) => (ss[a[0]]?.dust || 0) - (ss[c[0]]?.dust || 0));
    if (opts.length) sort = recipe === "flour" ? String(opts[0][0]) : sortOf(String(opts[0][0]));
  }
  for (const [need, per] of Object.entries(r.needs)) {
    let left = per * k;
    const flourId = sort ? "p:flour@" + sort : "p:flour";
    const fit = barn.filter(([id]) => need === "p:flour" ? (hon ? recipeOf(String(id)) === "flour" : id === flourId) : need === "p:honey" ? recipeOf(String(id)) === "honey" && sortOf(String(id)) === sort : need.startsWith("p:") ? id === need
      : recipe === "flour" && sort ? id === sort : need === main ? !!ss[id] && ss[id].shape === need && rawKey(ss[id]) === sort : ss[id] && ss[id].shape === need)
      .sort((a, c) => (!sorted ? (ss[c[0]]?.myth ? 1 : 0) - (ss[a[0]]?.myth ? 1 : 0) : 0) || (ss[a[0]]?.dust || honeyDust(a[0])) - (ss[c[0]]?.dust || honeyDust(c[0])));   // мифическое — в дело первым; мёд — самый дешёвый
    for (const [id, have] of fit) { const take = Math.min(left, Number(have)); if (take > 0) { plan.push([id, take]); left -= take; } }
    if (left > 0) return { error: "Не хватает продуктов в амбаре" };
  }
  const done: [string, number][] = [];
  for (const [id, take] of plan) {                       // списываем; если что-то успели забрать параллельно — возвращаем
    if ((await q("UPDATE f_barn SET count = count - ? WHERE user = ? AND strain = ? AND count >= ? RETURNING 1", [take, u.id, id, take])).length) done.push([id, take]);
    else { for (const [id2, t2] of done) await q("UPDATE f_barn SET count = count + ? WHERE user = ? AND strain = ?", [t2, u.id, id2]); return { error: "Не хватает продуктов в амбаре" }; }
  }
  const t = now();
  if (!(await q("INSERT OR IGNORE INTO f_jobs (user, kind, recipe, n, started, ready) VALUES (?, ?, ?, ?, ?, ?) RETURNING 1", [u.id, slot, sorted && sort ? recipe + "@" + (recipe === "flour" && ss[sort] ? flourKey(ss[sort]) : sort) : !sorted && plan.some(([id]) => ss[id]?.myth) ? recipe + "@" + plan.find(([id]) => ss[id]?.myth)![0] : recipe, k, t, t + r.min * 60 * k])).length) {
    for (const [id2, t2] of done) await q("UPDATE f_barn SET count = count + ? WHERE user = ? AND strain = ?", [t2, u.id, id2]);
    return { error: b.name + " занята" };
  }
  await DB.batch([DB.prepare("DELETE FROM f_jobtake WHERE user = ? AND slot = ?").bind(u.id, slot),
                  ...done.map(([id, n]) => DB.prepare("INSERT INTO f_jobtake (user, slot, strain, n) VALUES (?, ?, ?, ?) ON CONFLICT(user, slot, strain) DO UPDATE SET n = n + excluded.n").bind(u.id, slot, id, n))]);
  return { farm: await farmState(u) };
}
// ---------- магазин: заказы на блюда (его решения 2026-11-15) ----------
// Магазин покупается за пыль. У каждого своя доска из трёх заказов: простой, сложный и особый. Заказ — несколько блюд
// по рецептам (сорт муки неважен); платит пылью в 1,5 / 1,7 / 2 раза больше, чем стоят эти блюда. Срок — от суток до трёх
// (простой — сутки, сложный — двое, особый — трое; его правка 2026-11-15);
// выполнил — новый заказ через полчаса, срок вышел — сразу новый. Раз в сутки можно заменить неудобный заказ.
// общий ритм (его решение 2026-11-17): простой и сложный заказы меняются раз в сутки, особый — раз в двое. Заказ висит свой срок;
// сдал — новый придёт, когда этот срок закончится; не сдал — в конце срока сменится на другой. Замена «Другой заказ» срок не сдвигает.
// простой — дважды в сутки, каждые 12 часов (его решение 2026-11-19)
const ORDER_FOR = [DAY / 2, DAY, 2 * DAY], ORDER_X = [1.5, 1.5, 2], ORDER_TIER = ["Простой", "Сложный", "Особый"];   // названия вернул по его просьбе
// сложный — ×1,5 цены блюд, особый (дорогие блюда) — ×2
// простой заказ (его правка 2026-11-15): категория — «Хлеб», «Пироги», «Похлёбка»… («~pie»); подходит любое блюдо категории любого сорта,
// какие именно отдать — выбирает игрок. Награда — ×1,5 от самого дешёвого блюда категории: дешёвое отдать выгодно, дорогое — в убыток.
export const ORDER_CATS: Record<string, { name: string; r: string[] }> = {
  bread: { name: "Хлеб", r: ["bread"] }, bun: { name: "Булочки", r: ["bun"] }, soup: { name: "Похлёбка", r: ["soup", "stew"] },
  pie: { name: "Пироги", r: ["pie", "pumpkin"] }, tea: { name: "Чай", r: ["tea"] }, jam: { name: "Джем", r: ["jam"] }, flour: { name: "Мука", r: ["flour"] },
  honey: { name: "Медовое", r: ["honeycake", "honeytea", "honeypie", "honeycandy", "honeypumpkin"] },
};
function anyOf(r: string) { return r.startsWith("~") ? (ORDER_CATS[r.slice(1)] || { r: [] }).r : []; }
function orderFits(r: string, recipe: string) { return r.startsWith("~") ? anyOf(r).includes(recipe) : r === recipe; }
// Новый заказ не должен повторять старый (его жалоба 2026-11-16 «заказы не заменяются»: при малом выборе блюд случай
// раз за разом выдавал тот же заказ). Сначала ищем другой набор блюд, потом хотя бы другое количество.
// Заказы разные всегда (его правка 2026-11-18): новый не берёт блюд прежнего заказа этой строки и блюд из других заказов на доске,
// пока есть из чего выбирать. other — блюда остальных заказов доски.
function orderRecipes(items: any[]) { return items.flatMap((it) => String(it.r).startsWith("~") ? anyOf(String(it.r)) : [String(it.r)]); }
function genOrder(slot: number, builds: string[], old?: string, ok?: Cook, other: string[] = []) {
  const oldItems = old && old !== "[]" ? JSON.parse(old) : [], avoid = new Set([...other, ...orderRecipes(oldItems)]);
  if (!oldItems.length) return genOrder1(slot, builds, ok, avoid);
  const key = (items: any[]) => items.map((it) => it.r).sort().join(","), oldKey = key(oldItems);
  let alt = null;
  for (let i = 0; i < 16; i++) {
    const g = genOrder1(slot, builds, ok, avoid); if (!g) return null;
    if (key(g.items) !== oldKey) return g;
    if (!alt && JSON.stringify(g.items) !== old) alt = g;
  }
  return alt || genOrder1(slot, builds, ok, avoid);
}
// Заказ — только на блюда из растений, которые у игрока открыты (его правка 2026-11-16: джем без кактуса — нельзя; но и не
// «что уже готово лежит» — магазин должен оставаться трудным). Открыто — всё, что когда-либо было в мешке (строки f_inv не
// удаляются, как в справочнике), плюс то, что растёт на грядке или лежит сырьём в амбаре.
async function canCook(uid: number) {
  const inv = await q("SELECT strain FROM f_inv WHERE user = ? UNION SELECT crop FROM f_plots WHERE user = ? UNION SELECT strain FROM f_barn WHERE user = ? AND strain NOT LIKE 'p:%'", [uid, uid, uid]);
  // strains() отдаёт и все сорта станции — форму берём только у своих
  const ids = inv.map((r) => String(r[0])), ss = await strains(ids), mine = ids.map((i) => ss[i]).filter(Boolean);
  const shapes = new Set(mine.map((g) => g.shape));
  const has = (need: string) => need === "p:honey" || shapes.has(need === "p:flour" ? "grain" : need);   // мёд — если есть улей (проверка в genOrder1)
  // какие сорта блюда игроку открыты: у выпечки — по сорту муки из его колосьев, у супа/похлёбки/чая/джема — по главному сырью
  const grades = (k: string) => {
    const main = RAW_MAIN[k], out = new Set<number>();
    if (RECIPES[k].needs["p:honey"]) return [];                        // медовые — сорт мёда в особых заказах не просим
    for (const g of mine) {
      if (main && g.shape === main) out.add(parseFlour(rawKey(g)).grade);
      else if (!main && g.shape === "grain" && (k === "flour" || RECIPES[k].needs["p:flour"])) out.add(parseFlour(flourKey(g)).grade);
    }
    return [...out];
  };
  return { ok: (k: string) => Object.keys(RECIPES[k].needs).every(has), grades };
}
type Cook = Awaited<ReturnType<typeof canCook>>;
// Сорт в особом заказе (его решение 2026-11-16): «не ниже первого сорта» или «высшего сорта» — только из открытых игроку сортов.
// Сорт блюда — из ключа «g:/r:<расцветка>:<сорт>»; блюдо без сорта — второй сорт.
function dishGrade(id: string) { const k = sortOf(id); return k.startsWith("g:") || k.startsWith("r:") || k.startsWith("h:") ? parseFlour(k).grade : 2; }
function gradeDust(k: string, grade: number) { return productInfo("p:" + k + "@" + (RAW_MAIN[k] ? "r:" : "g:") + "sun:" + grade, {})?.dust || RECIPES[k].dust; }
const GRADE_REQ = ["высшего сорта", "не ниже первого сорта"];
const HONEY_ORDER_P = 0.65;   // медовое блюдо — в сложном и особом заказе лишь иногда (его решение 2026-11-18: «не в каждом особом»)
function genOrder1(slot: number, builds: string[], cook?: Cook, avoid: Set<string> = new Set()) {
  const ok = cook?.ok;
  const can = Object.keys(RECIPES).filter((k) => !k.startsWith("gemdust") && k !== "brew" && builds.includes(RECIPES[k].kind) && (!RECIPES[k].needs["p:honey"] || builds.includes("hive")) && !(k === "flour" && builds.includes("oven")) && (!ok || ok(k)));   // мука — только пока нет печи
  if (!can.length) return null;
  if (slot === 0) {
    let cats = Object.keys(ORDER_CATS).filter((c) => ORDER_CATS[c].r.some((k) => can.includes(k)));   // хоть одно блюдо категории игроку по силам
    if (!cats.length) return null;
    const fresh = cats.filter((c) => !ORDER_CATS[c].r.some((k) => avoid.has(k))); if (fresh.length) cats = fresh;   // не та категория, что была, и не блюда других заказов
    const c = cats[Math.floor(Math.random() * cats.length)], n = 2 + Math.floor(Math.random() * 3), cheap = Math.min(...ORDER_CATS[c].r.filter((k) => can.includes(k)).map((k) => RECIPES[k].dust));
    return { items: [{ r: "~" + c, n }], reward: Math.max(10, Math.round(n * cheap * ORDER_X[0] / 5) * 5) };
  }
  const r = Math.random, isHon = (k: string) => !!RECIPES[k].needs["p:honey"];
  let base = r() < HONEY_ORDER_P ? can : can.filter((k) => !isHon(k)); if (!base.length) base = can;
  const fresh = base.filter((k) => !avoid.has(k)); if (fresh.length >= 2) base = fresh;   // блюда, которых нет в других заказах и в прежнем
  const pool = slot === 2 ? base.slice().sort((a, b) => RECIPES[b].dust - RECIPES[a].dust).slice(0, Math.max(3, Math.ceil(base.length / 2))) : base;
  const types = Math.min(pool.length, slot === 0 ? 1 + Math.floor(r() * 2) : slot === 1 ? 2 + Math.floor(r() * 2) : 3);
  // не больше одного медового блюда в заказе (его решение 2026-11-18: иначе особый почти всегда просил два медовых — мёд захватывал заказы)
  const pick: string[] = [];
  for (const k of pool.slice().sort(() => r() - 0.5)) { if (pick.length >= types) break; if (isHon(k) && pick.some(isHon)) continue; pick.push(k); }
  const items = pick.map((k) => ({ r: k, n: slot === 0 ? 1 + Math.floor(r() * 3) : slot === 1 ? 2 + Math.floor(r() * 3) : 2 + Math.floor(r() * 2) }));
  if (slot === 2 && cook) for (const it of items as any[]) {          // особый: блюдо нужного сорта, если игроку открыт сорт выше второго
    const gs = cook.grades(it.r).filter((g) => g < 2);
    if (gs.length) it.g = gs[Math.floor(r() * gs.length)];
  }
  const sum = items.reduce((a, it: any) => a + it.n * (it.g != null ? gradeDust(it.r, it.g) : RECIPES[it.r].dust), 0);
  return { items, reward: Math.max(10, Math.round(sum * ORDER_X[slot] / 5) * 5) };
}
async function ordersOf(uid: number, builds: string[]) {
  if (!builds.includes("shop")) return null;
  const t = now(), rows = new Map((await q("SELECT slot, items, reward, until, ready FROM f_orders WHERE user = ?", [uid])).map((r) => [Number(r[0]), r]));
  const out = []; let ok: Cook | undefined;
  for (let slot = 0; slot < 3; slot++) {
    let row = rows.get(slot), items = row ? JSON.parse(String(row[1])) : [];
    const oldSimple = slot === 0 && items.length && !(String(items[0].r).startsWith("~") && ORDER_CATS[String(items[0].r).slice(1)]);   // простой заказ прежнего вида — сразу на новый
    const stale = !row || oldSimple || (items.length && Number(row[3]) <= t) || (!items.length && Number(row[4]) <= t);
    if (stale) {
      ok ??= await canCook(uid);
      const other = [...rows.entries()].filter(([k]) => k !== slot).flatMap(([, rr]) => orderRecipes(JSON.parse(String(rr[1]))));
      const g = genOrder(slot, builds, row && items.length ? String(row[1]) : undefined, ok, other); if (!g) continue;
      await q("INSERT OR REPLACE INTO f_orders (user, slot, items, reward, until, ready) VALUES (?, ?, ?, ?, ?, ?)", [uid, slot, JSON.stringify(g.items), g.reward, t + ORDER_FOR[slot], t]);
      row = [slot, JSON.stringify(g.items), g.reward, t + ORDER_FOR[slot], t]; items = g.items; rows.set(slot, row);
    }
    out.push({ slot, tier: ORDER_TIER[slot], items: items.map((it: any) => ({ recipe: it.r, n: it.n, ...(it.g != null ? { grade: it.g } : {}),
                                                             name: String(it.r).startsWith("~") ? (ORDER_CATS[String(it.r).slice(1)]?.name || it.r) : (RECIPES[it.r]?.name || it.r) + (it.g != null ? ", " + GRADE_REQ[it.g] : ""),
                                                             ...(String(it.r).startsWith("~") ? { pick: true, fits: anyOf(it.r) } : {}) })),
               reward: Number(row![2]), until: Number(row![3]), ready: Number(row![4]) });
  }
  const day = Math.floor((t + TZ) / DAY);
  return { list: out, skip_left: (await q("SELECT 1 FROM f_evlog WHERE user = ? AND kind = ?", [uid, "ordskip:" + day])).length ? 0 : 1 };
}
export async function fulfil(u: any, slot: number, pick?: Record<string, number>) {   // pick — что именно отдать в простой заказ (выбирает игрок)
  await ensureFarm(u);
  const t = now(), [row] = await q("SELECT items, reward, until FROM f_orders WHERE user = ? AND slot = ?", [u.id, slot]);
  const items = row ? JSON.parse(String(row[0])) : [];
  if (!row || !items.length) return { error: "Заказа пока нет" };
  if (Number(row[2]) <= t) return { error: "Срок заказа вышел" };
  const barn = await q("SELECT strain, count FROM f_barn WHERE user = ? AND count > 0 AND strain LIKE 'p:%'", [u.id]);
  const prices = (await productsFor(barn.map((x) => String(x[0])))).products;
  const plan: [string, number][] = [];
  const fits = (it: any, id: string) => orderFits(it.r, recipeOf(id)) && (it.g == null || dishGrade(id) <= it.g);
  // игрок сам выбирает, какие блюда отдать — в простом (его решение 2026-11-15), а с 2026-11-16 и в сложном и особом
  if (pick && typeof pick === "object") {
    const have = new Map(barn.map((x) => [String(x[0]), Number(x[1])])), sum = items.map(() => 0);
    for (const [id, k0] of Object.entries(pick)) {
      const k = Math.max(0, Math.floor(Number(k0) || 0)); if (!k) continue;
      const i = items.findIndex((it: any) => fits(it, id));
      if (i < 0) return { error: items.some((it: any) => orderFits(it.r, recipeOf(id))) ? "Это блюдо не подходит по сорту" : "Это блюдо в заказе не нужно" };
      if ((have.get(id) || 0) < k) return { error: "Таких блюд в амбаре нет" };
      plan.push([id, k]); sum[i] += k;
    }
    const bad = items.findIndex((it: any, i: number) => sum[i] !== Number(it.n));
    if (bad >= 0) return { error: "Нужно выбрать ровно " + items[bad].n + (items.length > 1 ? ": " + (RECIPES[items[bad].r]?.name || "").toLowerCase() : "") };
  } else if (items.length === 1 && String(items[0].r).startsWith("~")) return { error: "Выбери, какие блюда отдать" };
  else
  for (const it of items) {                                  // берём сначала самые дешёвые блюда этого рецепта
    let left = Number(it.n);
    for (const [id, c] of barn.filter((x) => fits(it, String(x[0])) && !plan.some((p) => p[0] === String(x[0]) && p[1] >= Number(x[1]))).sort((a, b) => (prices[String(a[0])]?.dust || 0) - (prices[String(b[0])]?.dust || 0))) {
      const take = Math.min(left, Number(c)); if (take > 0) { plan.push([String(id), take]); left -= take; }
    }
    if (left > 0) return { error: "Не хватает блюд: " + (RECIPES[it.r]?.name || it.r).toLowerCase() + (it.g != null ? ", " + GRADE_REQ[it.g] : "") };
  }
  if (!(await q("DELETE FROM f_orders WHERE user = ? AND slot = ? AND items = ? RETURNING 1", [u.id, slot, String(row[0])])).length) return { error: "Заказ уже сдан" };
  const done: [string, number][] = [];
  for (const [id, k] of plan) {
    if ((await q("UPDATE f_barn SET count = count - ? WHERE user = ? AND strain = ? AND count >= ? RETURNING 1", [k, u.id, id, k])).length) { done.push([id, k]); continue; }
    for (const [id2, k2] of done) await q("UPDATE f_barn SET count = count + ? WHERE user = ? AND strain = ?", [k2, u.id, id2]);   // не вышло — всё вернуть
    await q("INSERT OR REPLACE INTO f_orders (user, slot, items, reward, until, ready) VALUES (?, ?, ?, ?, ?, ?)", [u.id, slot, String(row[0]), Number(row[1]), Number(row[2]), t]);
    return { error: "Не хватает блюд в амбаре" };
  }
  await DB.batch([DB.prepare("UPDATE f_farms SET dust = dust + ? WHERE user = ?").bind(Number(row[1]), u.id),
                  DB.prepare("INSERT INTO f_orders (user, slot, items, reward, until, ready) VALUES (?, ?, '[]', 0, 0, ?)").bind(u.id, slot, Math.min(Number(row[2]), t + ORDER_FOR[slot]))]);   // новый — в конце срока сданного (старые длинные сроки — не дольше нового ритма)
  await logFeed("order", u.id, null, null, Number(row[1]));
  return { dust: Number(row[1]), farm: await farmState(u) };
}
export async function skipOrder(u: any, slot: number) {
  await ensureFarm(u);
  const t = now(), day = Math.floor((t + TZ) / DAY);
  const [cur] = await q("SELECT items, until, ready FROM f_orders WHERE user = ? AND slot = ?", [u.id, slot]);
  if (cur && String(cur[0]) === "[]" && Number(cur[2]) > t) return { error: "Заказа пока нет — новый придёт позже" };   // ждём следующий по ритму: заменой его не поторопить
  const live = cur && String(cur[0]) !== "[]" && Number(cur[1]) > t;   // заменяем живой заказ — срок остаётся прежним, ритм не сбивается
  if (!(await q("INSERT INTO f_evlog (user, kind, at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM f_evlog WHERE user = ? AND kind = ?) RETURNING 1", [u.id, "ordskip:" + day, t, u.id, "ordskip:" + day])).length)
    return { error: "Заменить заказ можно раз в сутки" };
  const other = (await q("SELECT items FROM f_orders WHERE user = ? AND slot != ?", [u.id, slot])).flatMap((rr) => orderRecipes(JSON.parse(String(rr[0]))));
  const { builds } = await kitchenOf(u.id), g = genOrder(slot, builds, cur ? String(cur[0]) : undefined, await canCook(u.id), other);
  if (!g) return { error: "Нет блюд для заказа" };
  await q("INSERT OR REPLACE INTO f_orders (user, slot, items, reward, until, ready) VALUES (?, ?, ?, ?, ?, ?)", [u.id, slot, JSON.stringify(g.items), g.reward, live ? Math.min(Number(cur[1]), t + ORDER_FOR[slot]) : t + ORDER_FOR[slot], t]);
  return { farm: await farmState(u) };
}
// звёздный уголь в печь (его идея 2026-11-15): один уголь из амбара — всё, что сейчас печётся, готово сразу
export async function stoke(u: any, slot = "oven") {
  if (slot.split(":")[0] !== "oven") return { error: "Уголь — только в печь" };
  const [j] = await q("SELECT ready FROM f_jobs WHERE user = ? AND kind = ?", [u.id, slot]);
  if (!j) return { error: "В печи ничего не печётся" };
  if (Number(j[0]) <= now()) return { error: "Уже готово — забери в амбар" };
  if (!(await q("UPDATE f_barn SET count = count - 1 WHERE user = ? AND strain = 'p:coal' AND count >= 1 RETURNING 1", [u.id])).length) return { error: "В амбаре нет звёздного угля" };
  await q("UPDATE f_jobs SET ready = ? WHERE user = ? AND kind = ?", [now(), u.id, slot]);
  return { farm: await farmState(u) };
}
export async function collect(u: any, kind: string) {
  const [j] = await q("SELECT recipe, n, ready FROM f_jobs WHERE user = ? AND kind = ?", [u.id, kind]);
  if (!j) return { error: "Нечего забирать" };
  if (Number(j[2]) > now()) return { error: "Ещё не готово" };
  if (!(await q("DELETE FROM f_jobs WHERE user = ? AND kind = ? RETURNING 1", [u.id, kind])).length) return { error: "Уже забрано" };
  await q("DELETE FROM f_jobtake WHERE user = ? AND slot = ?", [u.id, kind]);
  const r = RECIPES[recipeOf(String(j[0]))], n = Number(j[1]), pts = (r?.points || 0) * n;
  const writes = [DB.prepare(`INSERT INTO f_barn (user, strain, count) VALUES (?, ?, ?) ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count`).bind(u.id, "p:" + j[0], n)];
  if (pts) writes.push(DB.prepare("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, ?, ?, ?, ?)").bind(u.id, nameOf(u), pts, "Лунная ферма", now()));
  await DB.batch(writes);
  return { recipe: j[0], n, points: pts, farm: await farmState(u) };
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
// Порядок — по звёздной пыли на руках, пыль видна у каждого (его просьба 2026-11-15).
export async function neighbors(u: any, hidden: number[]) {
  const not = hidden.length ? ` AND f.user NOT IN (${hidden.map(() => "?").join(",")})` : "";
  const rows = await q(`SELECT f.pub, p.name, p.title, p.avatar, f.dust,
                          (SELECT COUNT(*) FROM f_given g WHERE g.from_user = ? AND g.to_user = f.user AND g.day = ?)
                        FROM f_farms f JOIN g_profiles p ON p.user = f.user
                        WHERE f.user != ?${not} ORDER BY f.dust DESC LIMIT 30`, [u.id, today(), u.id, ...hidden]);
  // своя строка (его просьба 2026-11-16): видеть себя в рейтинге по пыли — место среди всех видимых соседей
  const [me] = await q(`SELECT p.name, p.title, p.avatar, f.dust, (SELECT COUNT(*) FROM f_farms f2 JOIN g_profiles p2 ON p2.user = f2.user
                          WHERE f2.user != ? AND f2.dust > f.dust${not.replaceAll("f.user", "f2.user")}) FROM f_farms f LEFT JOIN g_profiles p ON p.user = f.user WHERE f.user = ?`, [u.id, ...hidden, u.id]);
  return { me: me ? { name: me[0] || nameOf(u), title: me[1] || "", avatar: me[2] ? `/avatar/${me[2]}` : null, dust: Number(me[3]) || 0, place: Number(me[4]) + 1 } : null,
           neighbors: rows.map(([pub, name, title, avatar, dust, given]) => ({ pub, name, title, avatar: avatar ? `/avatar/${avatar}` : null, dust: Number(dust) || 0, gifted: Number(given) > 0 })),
           gifts_left: await giftsLeft(u.id), gifts_per_day: GIFTS_PER_DAY };
}

// сколько подарков игрок ещё может оставить сегодня
async function giftsLeft(uid: number) {
  const [[sent]] = await q("SELECT COUNT(*) FROM f_given WHERE from_user = ? AND day = ?", [uid, today()]);
  return Math.max(0, GIFTS_PER_DAY - Number(sent));
}

// ---------- вид фермы: цвет крыш (его решение 2026-11-15) ----------
// Каждый цвет покупается один раз за ✦300, между купленными — бесплатно; оранжевый — у всех с начала. Гости видят цвет хозяина.
export const ROOF_PRICE = 300;
export const ROOF_COLORS: Record<string, string> = { orange: "Оранжевая", amber: "Янтарная", red: "Красная", blue: "Синяя", green: "Зелёная", purple: "Фиолетовая", teal: "Бирюзовая", slate: "Графитовая" };
async function roofOf(uid: number) { const r = await q("SELECT roof FROM f_style WHERE user = ?", [uid]); const k = r.length ? String(r[0][0]) : ""; return ROOF_COLORS[k] ? k : "orange"; }
// Украшения двора (его решение 2026-11-19: «куда богатым тратить пыль» — начинаем с декораций; готовые места, не свободная расстановка).
// Забор, дорожка и площадка у печи — по одному варианту на место (первый в списке — бесплатный, как было); мелочи — каждая сама по себе,
// купленную можно спрятать. Купленное хранится навсегда (f_decor), выбор — в f_yard. Гости видят то же, что хозяин.
export const YARD: Record<string, { name: string; items: Record<string, { name: string; price: number }> }> = {
  fence: { name: "Забор", items: { wood: { name: "Деревянный", price: 0 }, vine: { name: "Дерево с плющом", price: 3000 }, white: { name: "Белый штакетник", price: 3000 },
                                   hedge: { name: "Живая изгородь", price: 3000 }, stone: { name: "Каменный", price: 3000 }, brick: { name: "Красный кирпич", price: 3000 },
                                   pillars: { name: "Столбы с фонарями", price: 3000 }, moon: { name: "Лунный забор", price: 3000 } } },
  path:  { name: "Дорожка", items: { dirt: { name: "Утоптанная", price: 0 }, stone: { name: "Каменные плиты", price: 2000 }, steps: { name: "Камни-ступеньки", price: 2000 }, brick: { name: "Кирпичная", price: 2000 },
                                     mossy: { name: "Старые камни со мхом", price: 2000 }, cobble: { name: "Мощёная", price: 2000 }, glow: { name: "Светящиеся плиты", price: 2000 },
                                     moon: { name: "Лунная дорожка", price: 2000 } } },
  ground: { name: "Двор вокруг грядок", items: { dirt: { name: "Утоптанная земля", price: 0 }, stone: { name: "Каменные плиты", price: 2500 },
                                                 brick: { name: "Кирпичный", price: 2500 }, mossy: { name: "Старые камни со мхом", price: 2500 }, cobble: { name: "Мощёный", price: 2500 },
                                                 glow: { name: "Светящиеся плиты", price: 2500 }, moon: { name: "Лунный", price: 2500 } } },   // его просьба 2026-11-19: варианты «как дорожки» вокруг грядок
  plaza: { name: "Площадка у печи", items: { none: { name: "Пусто", price: 0 }, birdbath: { name: "Чаша для птиц", price: 600 }, flowerbed: { name: "Круглая клумба", price: 800 },
                                             statue: { name: "Статуя звездочёта", price: 2000 }, fountain: { name: "Фонтан", price: 3000 },
                                             column: { name: "Фонтан-колонна", price: 2200 }, lily: { name: "Фонтан с кувшинками", price: 2600 }, tiered: { name: "Ярусный фонтан", price: 3500 },
                                             crystal: { name: "Хрустальный фонтан", price: 4000 }, starfount: { name: "Фонтан звездочёта", price: 5000 } } },
  scare: { name: "Пугало", items: { none: { name: "Без пугала", price: 0 }, classic: { name: "Пугало в белой рубахе", price: 400 }, straw: { name: "Пугало в соломенной шляпе", price: 400 },
                                    crow: { name: "Пугало с вороной", price: 500 }, witch: { name: "Пугало-ведьма", price: 600 }, pumpkin: { name: "Пугало-тыква", price: 600 } } },
  bits:  { name: "Мелочи", items: { hay: { name: "Сено", price: 300 }, birdhouse: { name: "Скворечник", price: 400 }, vane: { name: "Флюгер-петух", price: 500 },
                                    planters: { name: "Ящики с цветами", price: 600 }, fireflies: { name: "Светлячки", price: 1000 },
                                    arch: { name: "Арка из роз", price: 1500 } } },
};
// что из украшений уже открыто игрокам (его решение 2026-11-19: сначала только заборы, все платные по ✦3000); остальное — на стенде
export const YARD_ON = ["fence", "path", "ground"];   // открыто игрокам: заборы ✦3000, дорожки ✦2000, двор ✦2500 — его решения 2026-11-19
async function yardOf(uid: number) {
  const set = new Map((await q("SELECT slot, item FROM f_yard WHERE user = ?", [uid])).map((r) => [String(r[0]), String(r[1])]));
  const owned = new Set((await q("SELECT item FROM f_decor WHERE user = ? AND kind = 'yard'", [uid])).map((r) => String(r[0])));
  const y: any = {};
  for (const sl of ["fence", "path", "ground", "plaza", "scare"]) { const k = set.get(sl) || "", first = Object.keys(YARD[sl].items)[0]; y[sl] = YARD_ON.includes(sl) && YARD[sl].items[k] && (k === first || owned.has(sl + ":" + k)) ? k : first; }
  y.bits = YARD_ON.includes("bits") ? Object.keys(YARD.bits.items).filter((k) => owned.has("bits:" + k) && set.get("bit:" + k) !== "off") : [];
  return { yard: y, yard_owned: [...owned] };
}
async function decorView(uid: number) {
  const owned = (await q("SELECT item FROM f_decor WHERE user = ? AND kind = 'roof'", [uid])).map((r) => String(r[0]));
  return { roof: await roofOf(uid), roofs_owned: ["orange", ...owned.filter((k) => k !== "orange" && ROOF_COLORS[k])], roof_price: ROOF_PRICE, roof_colors: ROOF_COLORS,
           ...(await yardOf(uid)), yard_list: Object.fromEntries(Object.entries(YARD).filter(([k]) => YARD_ON.includes(k))) };
}
export async function setDecor(u: any, slot: string, item: string, on: boolean) {
  const S = YARD_ON.includes(slot) ? YARD[slot] : undefined, it = S && S.items[item];
  if (!it) return { error: "Такого украшения нет" };
  await ensureFarm(u);
  const key = slot + ":" + item, free = it.price === 0;
  const has = free || (await q("SELECT 1 FROM f_decor WHERE user = ? AND kind = 'yard' AND item = ?", [u.id, key])).length > 0;
  if (!has) {   // сперва «занять» покупку, потом списать: два одновременных нажатия не спишут дважды; не хватило пыли — покупка снимается
    const claim = await q("INSERT OR IGNORE INTO f_decor (user, kind, item, at) VALUES (?, 'yard', ?, ?) RETURNING 1", [u.id, key, now()]);
    if (claim.length && !(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [it.price, u.id, it.price])).length) {
      await q("DELETE FROM f_decor WHERE user = ? AND kind = 'yard' AND item = ?", [u.id, key]);
      return { error: "Не хватает звёздной пыли" };
    }
  }
  if (slot === "bits") await q("INSERT INTO f_yard (user, slot, item) VALUES (?, ?, ?) ON CONFLICT(user, slot) DO UPDATE SET item = excluded.item", [u.id, "bit:" + item, on ? "on" : "off"]);
  else await q("INSERT INTO f_yard (user, slot, item) VALUES (?, ?, ?) ON CONFLICT(user, slot) DO UPDATE SET item = excluded.item", [u.id, slot, item]);
  return { bought: !has, farm: await farmState(u) };
}
export async function setRoof(u: any, color: string) {
  if (!ROOF_COLORS[color]) return { error: "Такого цвета нет" };
  await ensureFarm(u);
  const has = color === "orange" || (await q("SELECT 1 FROM f_decor WHERE user = ? AND kind = 'roof' AND item = ?", [u.id, color])).length > 0;
  if (!has) {
    if (!(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [ROOF_PRICE, u.id, ROOF_PRICE])).length) return { error: "Не хватает звёздной пыли" };
    await q("INSERT OR IGNORE INTO f_decor (user, kind, item, at) VALUES (?, 'roof', ?, ?)", [u.id, color, now()]);
  }
  await q("INSERT INTO f_style (user, roof) VALUES (?, ?) ON CONFLICT(user) DO UPDATE SET roof = excluded.roof", [u.id, color]);
  return { bought: !has, farm: await farmState(u) };
}

export async function visit(u: any, pub: string) {
  const [f] = await q(`SELECT f.user, f.unlocked, p.name, p.title FROM f_farms f LEFT JOIN g_profiles p ON p.user = f.user WHERE f.pub = ?`, [pub]);
  if (!f || Number(f[0]) === u.id) return { error: "Участок не найден" };
  const plots = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [f[0]]);
  const by = new Map(plots.map((p) => [Number(p[0]), p]));
  const vin = Number((await q("SELECT COUNT(DISTINCT item) FROM g_items WHERE user = ? AND game = 'farm' ", [f[0]]))[0][0]);
  const given = (await q("SELECT 1 FROM f_given WHERE from_user = ? AND to_user = ? AND day = ?", [u.id, f[0], today()])).length > 0;
  const shop = await q("SELECT strain, listed FROM f_inv WHERE user = ? AND listed > 0", [f[0]]);
  const stall = await q("SELECT item, listed FROM f_stall WHERE user = ? AND listed > 0", [f[0]]);
  const ii = await itemInfo(stall.map((r) => String(r[0]))), own = await ownPrices(Number(f[0]));
  const res: any = { pub, name: f[2] || "Сосед", title: f[3] || "Ученик звёзд", unlocked: Number(f[1]), vinyls: vin, gifted: given, roof: await roofOf(Number(f[0])), ...(await yardOf(Number(f[0]))),
           plots: await (async () => { const ev = await plotEvents(Number(f[0])); return Array.from({ length: PLOTS_MAX }, (_, i) => plotView(by.get(i), i, Number(f[1]), ev[i])); })(), now: now(),
           rain_until: await rainUntil(), weather: weatherView(now()), showers: showersIn(now() - 3 * DAY, now() + DAY), dry_limit: DRY_LIMIT, gifts_left: await giftsLeft(u.id), gifts_per_day: GIFTS_PER_DAY,
           ...(await kitchenOf(Number(f[0]))),
           stall: stall.map(([item, n]) => ({ item: String(item), count: Number(n), price: ii.info[String(item)] ? sellerPrice(stallPrice(ii.info[String(item)].dust), own[String(item)]) : 0 })).filter((x) => x.price),
           ...(await monoView(Number(f[0]))), products: ii.products, ...(await (async () => {
             const ss = { ...ii.strains, ...(await strains([...plots.map((p) => p[1]), ...shop.map((x) => x[0])])) };
             return { strains: ss, shop: shop.map(([strain, n]) => ({ strain, count: Number(n), price: ss[strain] ? sellerPrice(ss[strain].price!, own["s:" + strain]) : 0 })) };
           })()), bonuses: BONUSES };
  // Только ферма хозяина канала (g_meta «owner»): его первое странное растение гости видят ростком, пока он его не соберёт
  // (его решение 2026-11-19: «не хочу, чтобы заранее видели, во что оно вырастает; только на этот первый раз; остальных не касается»).
  // После первого сбора (f_evlog «odd:reaped») — как есть.
  const ownerId = String((await q("SELECT value FROM g_meta WHERE key = 'owner'"))[0]?.[0] || "");
  if (ownerId && String(f[0]) === ownerId && !(await q("SELECT 1 FROM f_evlog WHERE user = ? AND kind = 'odd:reaped' LIMIT 1", [f[0]])).length)
    res.plots = res.plots.map((v: any) => v.crop && res.strains[v.crop]?.odd ? { ...v, veil: 1 } : v);
  return res;
}

// ---------- лавка ----------
// delta > 0 — выставить столько семян, < 0 — снять с продажи. Выставить можно не больше, чем есть.
export async function list(u: any, strain: string, delta: number) {
  if (CROPS[strain] && !CROPS[strain].odd) return { error: "Семена станции не продаются — только выведенные сорта" };   // странное — можно
  const d = Math.max(-1000, Math.min(1000, Math.round(delta) || 0));
  const ch = await q("UPDATE f_inv SET listed = MAX(0, MIN(count, listed + ?)) WHERE user = ? AND strain = ? AND listed != MAX(0, MIN(count, listed + ?)) RETURNING 1", [d, u.id, strain, d]);
  if (ch.length && d > 0) await logFeed("list", u.id, null, strain, d);
  return { farm: await farmState(u) };
}

// ---------- сундук: лишние семена (2026-11-14) ----------
// delta > 0 — убрать в сундук из инвентаря (выставленные на продажу не трогаем), < 0 — достать обратно.
export async function chestMove(u: any, strain: string, delta: number) {
  await ensureFarm(u);
  const d = Math.max(-100000, Math.min(100000, Math.round(delta) || 0));
  if (!strain || !d) return { farm: await farmState(u) };
  if (d > 0) {
    if (!(await q("UPDATE f_inv SET count = count - ? WHERE user = ? AND strain = ? AND count - listed >= ? RETURNING 1", [d, u.id, strain, d])).length)
      return { error: "В инвентаре столько нет" };
    await q("INSERT INTO f_chest (user, strain, count) VALUES (?, ?, ?) ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count", [u.id, strain, d]);
  } else {
    const k = -d;
    if (!(await q("UPDATE f_chest SET count = count - ? WHERE user = ? AND strain = ? AND count >= ? RETURNING 1", [k, u.id, strain, k])).length)
      return { error: "В сундуке столько нет" };
    await q("INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, ?, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count", [u.id, strain, k]);
  }
  return { farm: await farmState(u) };
}

// семена → звёздная пыль (его просьба 2026-11-14): 40% цены семени — базовые дешевле, чем у станции (купить и распылить невыгодно)
export const SEED_DUST = 0.4;
// поколение в распыл не идёт (его решение 2026-11-18): оно растёт без предела, и семена быстрых гибридов стоили в пыли вдвое дороже урожая.
// В лавках между игроками цена семени прежняя, с поколением.
export const seedDust = (st: Strain) => Math.max(1, Math.floor((st.base ? st.cost || 1 : (st.price || 1) - (st.gen || 0) * 2) * SEED_DUST));
export async function seedsToDust(u: any, strain: string, n: number, from = "inv") {
  await ensureFarm(u);
  const st = (await strains([strain]))[strain];
  if (!st) return { error: "Таких семян нет" };
  const k = Math.max(1, Math.min(100000, Math.round(n) || 1)), got = k * seedDust(st);
  const ok = from === "chest"
    ? await q("UPDATE f_chest SET count = count - ? WHERE user = ? AND strain = ? AND count >= ? RETURNING 1", [k, u.id, strain, k])
    : await q("UPDATE f_inv SET count = count - ? WHERE user = ? AND strain = ? AND count - listed >= ? RETURNING 1", [k, u.id, strain, k]);
  if (!ok.length) return { error: from === "chest" ? "В сундуке столько нет" : "Столько свободных семян нет" };
  await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [got, u.id]);
  return { dust: got, farm: await farmState(u) };
}

// ---------- прилавок: урожай и продукты игрокам (2026-11-14) ----------
// Цена — в полтора раза больше, чем дать пыль в амбаре: распылить — самое невыгодное, продать — выгоднее, еда — ещё выгоднее.
const STALL_MARKUP = 1.5;
export const stallPrice = (dust: number) => Math.max(1, Math.ceil(dust * STALL_MARKUP));
// продавец может сам двигать цену в небольших пределах (его просьба 2026-11-14): 70–130% от цены игры
const PRICE_LO = 0.7, PRICE_HI = 1.3;
export const priceRange = (base: number) => [Math.max(1, Math.floor(base * PRICE_LO)), Math.max(1, Math.ceil(base * PRICE_HI))];
const sellerPrice = (base: number, own: any) => { const [lo, hi] = priceRange(base), p = Number(own); return own == null || !p ? base : Math.max(lo, Math.min(hi, Math.round(p))); };
async function ownPrices(uid: number) { const m: Record<string, number> = {}; for (const [i, p] of await q("SELECT item, price FROM f_prices WHERE user = ?", [uid])) m[String(i)] = Number(p); return m; }
// ключ цены: семена — «s:<сорт>», товар прилавка — его код (у сорта семена и урожай — разные товары с разной ценой)
export async function setPrice(u: any, item: string, price: number, kind = "item") {
  await ensureFarm(u);
  let b = 0;
  if (kind === "seed") { const st = (await strains([item]))[item]; if (st && !st.base) b = st.price!; }
  else { const ii = (await itemInfo([item])).info[item]; if (ii) b = stallPrice(ii.dust); }
  if (!b) return { error: "Такого товара нет" };
  const p = sellerPrice(b, price), key = (kind === "seed" ? "s:" : "") + item;
  if (p === b) await q("DELETE FROM f_prices WHERE user = ? AND item = ?", [u.id, key]);
  else await q("INSERT INTO f_prices (user, item, price) VALUES (?, ?, ?) ON CONFLICT(user, item) DO UPDATE SET price = excluded.price", [u.id, key, p]);
  return { farm: await farmState(u) };
}
async function itemInfo(ids: string[]) {         // сорт или продукт → { name, dust }
  const ss = await strains(ids.filter((x) => !x.startsWith("p:"))), pr = await productsFor(ids), out: Record<string, any> = {};
  for (const id of ids) out[id] = id.startsWith("p:") ? pr.products[id] : ss[id];
  return { info: out, strains: { ...ss, ...pr.sorts }, products: pr.products };
}
export async function listItem(u: any, item: string, delta: number) {
  await ensureFarm(u);
  const d = Math.max(-1000, Math.min(1000, Math.round(delta) || 0));
  if (!item || !d) return { farm: await farmState(u) };
  if (d > 0) {                                           // из амбара на прилавок
    if (!(await q("UPDATE f_barn SET count = count - ? WHERE user = ? AND strain = ? AND count >= ? RETURNING 1", [d, u.id, item, d])).length)
      return { error: "В амбаре столько нет" };
    await q("INSERT INTO f_stall (user, item, listed) VALUES (?, ?, ?) ON CONFLICT(user, item) DO UPDATE SET listed = listed + excluded.listed", [u.id, item, d]);
    await logFeed("list", u.id, null, item, d);
  } else {                                               // с прилавка обратно в амбар
    const k = -d;
    if (!(await q("UPDATE f_stall SET listed = listed - ? WHERE user = ? AND item = ? AND listed >= ? RETURNING 1", [k, u.id, item, k])).length)
      return { error: "На прилавке столько нет" };
    await q("INSERT INTO f_barn (user, strain, count) VALUES (?, ?, ?) ON CONFLICT(user, strain) DO UPDATE SET count = count + excluded.count", [u.id, item, k]);
  }
  return { farm: await farmState(u) };
}
async function buyItem(u: any, seller: number, pub: string, item: string, myName: string) {
  if (!(await q("SELECT 1 FROM f_builds WHERE user = ? AND kind = 'barn'", [u.id])).length) return { error: "Урожай и продукты кладут в амбар — сначала построй его" };
  const it = (await itemInfo([item])).info[item];
  if (!it) return { error: "Такого товара нет" };
  const price = sellerPrice(stallPrice(it.dust), (await ownPrices(seller))[item]);
  if (!(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [price, u.id, price])).length)
    return { error: "Не хватает звёздной пыли" };
  if (!(await q("UPDATE f_stall SET listed = listed - 1 WHERE user = ? AND item = ? AND listed > 0 RETURNING 1", [seller, item])).length) {
    await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [price, u.id]);
    return { error: "Уже раскупили" };
  }
  await DB.batch([
    DB.prepare("UPDATE f_farms SET dust = dust + ? WHERE user = ?").bind(price, seller),
    DB.prepare("INSERT INTO f_barn (user, strain, count) VALUES (?, ?, 1) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1").bind(u.id, item),
    DB.prepare("INSERT INTO f_sales (seller, buyer_name, strain, price, at) VALUES (?, ?, ?, ?, ?)").bind(seller, myName, item, price, now()),
  ]);
  await logFeed("buy", u.id, seller, item);
  if (item.includes("@") && !/@[gr]:/.test(item)) NORM_MEM.delete(u.id);   // купил товар старого формата — разложить сразу, не ждать полчаса
  return { ok: true, price, ...(await visit(u, pub)), farm: await farmState(u) };
}

export async function buy(u: any, pub: string, strain: string, myName: string, kind = "seed") {
  if (pub === ANOM_PUB) return strain === "anomaly" ? buyAnomaly(u) : { error: "Такого товара нет" };
  const [f] = await q("SELECT user FROM f_farms WHERE pub = ?", [pub]);
  if (!f || Number(f[0]) === u.id) return { error: "Лавка не найдена" };
  if (kind === "item") { await ensureFarm(u); return buyItem(u, Number(f[0]), pub, strain, myName); }
  if (CROPS[strain] && !CROPS[strain].odd) return { error: "Такого товара нет" };
  const s = (await strains([strain]))[strain];
  if (!s) return { error: "Такого товара нет" };
  await ensureFarm(u);
  const full = strain === "anomaly" && (await oddHeld(u.id)) >= ODD_PER_USER;
  if (full && !(await oddEvictable(u.id))) return { error: ODD_FULL };
  const price = sellerPrice(s.price!, (await ownPrices(Number(f[0])))["s:" + strain]);
  if (!(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [price, u.id, price])).length)
    return { error: "Не хватает звёздной пыли" };
  // товар забирает ровно один покупатель; не вышло — пыль возвращаем
  if (!(await q("UPDATE f_inv SET count = count - 1, listed = listed - 1 WHERE user = ? AND strain = ? AND listed > 0 RETURNING 1", [f[0], strain])).length) {
    await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [price, u.id]);
    return { error: "Уже раскупили" };
  }
  const evicted = full && (await oddEvict(u.id));                          // третье — сначала пропадает одно старое, потом приходит новое
  await DB.batch([
    DB.prepare("UPDATE f_farms SET dust = dust + ? WHERE user = ?").bind(price, f[0]),
    DB.prepare(`INSERT INTO f_inv (user, strain, count, listed) VALUES (?, ?, 1, 0) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1`).bind(u.id, strain),
    DB.prepare("INSERT INTO f_sales (seller, buyer_name, strain, price, at) VALUES (?, ?, ?, ?, ?)").bind(f[0], myName, strain, price, now()),
  ]);
  await logFeed("buy", u.id, Number(f[0]), strain);
  if (strain === "anomaly") await oddFresh(u.id);                          // купленное у игрока — тоже «свежее»
  return { ok: true, price, odd_evicted: evicted, ...(await visit(u, pub)), farm: await farmState(u) };
}

// справочник: все сорта, которые у игрока когда-либо были (строки инвентаря не удаляются — в т.ч. посаженные и проданные)
export async function book(u: any) {
  await ensureFarm(u);
  const rows = await q("SELECT strain FROM f_inv WHERE user = ?", [u.id]);
  const ss = await strains(rows.map((r) => r[0]));
  return { strains: Object.values(ss), bonuses: BONUSES };
}

// рынок: все семена, выставленные игроками (кроме своих). Наружу — публичное имя продавца и номер участка (pub), не аккаунт.
export async function market(u: any, hidden: number[]) {
  const rows = await q(`SELECT i.user, f.pub, i.strain, i.listed, p.name, pr.price FROM f_inv i JOIN f_farms f ON f.user = i.user
                        LEFT JOIN g_profiles p ON p.user = i.user LEFT JOIN f_prices pr ON pr.user = i.user AND pr.item = 's:' || i.strain
                        WHERE i.listed > 0 AND i.user != ? LIMIT 200`, [u.id]);
  const ss = await strains(rows.map((r) => r[2]));
  const offers = rows.map(([uid, pub, strain, n, name, own]) => ({ pub, strain, count: Number(n), price: ss[strain] ? sellerPrice(ss[strain].price!, own) : 0,
                                                               seller: hidden.includes(Number(uid)) ? "Сосед" : name || "Сосед" }))
    .filter((o) => ss[o.strain]).sort((a, b) => b.price - a.price);
  const an = await anomalyLive();                                // ночная аномалия — среди семян игроков, на случайном месте
  if (an) { ss.anomaly = view(CROPS.anomaly); offers.splice(fnv(an.key) % (offers.length + 1), 0, { pub: ANOM_PUB, strain: "anomaly", count: 1, price: an.price, seller: an.seller }); }
  const st = await q(`SELECT s.user, f.pub, s.item, s.listed, p.name, pr.price FROM f_stall s JOIN f_farms f ON f.user = s.user
                      LEFT JOIN g_profiles p ON p.user = s.user LEFT JOIN f_prices pr ON pr.user = s.user AND pr.item = s.item
                      WHERE s.listed > 0 AND s.user != ? LIMIT 300`, [u.id]);
  const ii = await itemInfo(st.map((r) => String(r[2])));
  const items = st.map(([uid, pub, item, n, name, own]) => ({ pub, item: String(item), count: Number(n), price: ii.info[String(item)] ? sellerPrice(stallPrice(ii.info[String(item)].dust), own) : 0,
                                                          seller: hidden.includes(Number(uid)) ? "Сосед" : name || "Сосед" })).filter((o) => o.price);
  return { offers, items, strains: { ...ss, ...ii.strains }, products: ii.products, bonuses: BONUSES };
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
  await logFeed("gift", u.id, Number(f[0]), null);
  return { ok: true, dust: GIFT_DUST, gifts_left: await giftsLeft(u.id) };
}

export async function setRain(_hours: number) {           // посты канала больше не включают дождь (решение 2026-11-13) — погода случайная
  return { weather: weatherView(now()) };
}

// ---------- «Новости фермы» (2026-11-15) ----------
// Лента для всех: кто что выставил в лавку, кто у кого купил, кто кому подарил, у кого началось большое событие.
// Подряд одинаковые действия за 10 минут складываются в одну строку (выставил 5 раз по одному — «×5»).
const MONO_NAMES: Record<string, [string, string]> = {
  solstice: ["Солнцестояние", "сутки все растения растут вдвое быстрее"],
  constellation: ["Созвездие", "следующий сбор с отмеченных грядок — урожай ×2"],
  myth: ["Мифическое семя", "в инвентаре мифическое семя — посади его"],
  moss: ["Мох захватил ферму", "сутки вырастает только мох, зато урожай мха ×2"],
  fire: ["Огненная ночь", "ферма горит 6 часов, потом на каждой грядке останется звёздный уголь; потуши грядку лейкой — и уголь сразу твой"],
  comet: ["Кометный дождь", "на ферме большой кратер и осколки со звёздной пылью — собери их, кратер убери лопатой"],
};
export async function logFeed(kind: string, actor: number, target: number | null, item: string | null, n = 1) {
  if (item && /^(anomaly|p:eye|p:brew)/.test(item)) return;          // о странном в новостях — ни слова (его правка 2026-11-18)
  const t = now();
  const upd = await q("UPDATE f_feed SET n = n + ?, at = ? WHERE id = (SELECT id FROM f_feed WHERE kind = ? AND actor = ? AND target IS ? AND item IS ? AND at > ? ORDER BY id DESC LIMIT 1) RETURNING 1",
                      [n, t, kind, actor, target, item, t - 600]);
  if (!upd.length) await q("INSERT INTO f_feed (at, kind, actor, target, item, n) VALUES (?, ?, ?, ?, ?, ?)", [t, kind, actor, target, item, n]);
}
export async function feed(u: any, hidden: number[], since = 0) {      // since — только новее этого номера (для всплывающих уведомлений в игре)
  await ensureFarm(u);
  const rows = await q("SELECT id, at, kind, actor, target, item, n FROM f_feed WHERE at > ? AND id > ? ORDER BY id DESC LIMIT 60", [now() - 3 * DAY, since]);
  const users = [...new Set(rows.flatMap((r) => [Number(r[3]), Number(r[4])]).filter((x) => x && !hidden.includes(x)))];
  const prof: Record<number, [string, string]> = {};
  if (users.length) for (const [id, name, pub] of await q(`SELECT f.user, p.name, f.pub FROM f_farms f LEFT JOIN g_profiles p ON p.user = f.user WHERE f.user IN (${users.map(() => "?").join(",")})`, users))
    prof[Number(id)] = [String(name || "Сосед"), String(pub || "")];
  const items = rows.map((r) => String(r[5] || "")).filter((x) => x && !MONO_NAMES[x]);
  const ii = await itemInfo(items), ss = await strains(items.filter((x) => !x.startsWith("p:")));
  const nameOfItem = (id: string) => (ii.info[id] && ii.info[id].name) || (ss[id] && ss[id].name) || "товар";
  const who = (id: number) => (id && prof[id] ? { name: prof[id][0], pub: prof[id][1], me: id === u.id } : id === u.id ? { name: "ты", pub: "", me: true } : null);
  const out = [];
  for (const [id, at, kind, actor, target, item, n] of rows) {
    if (hidden.includes(Number(actor)) && Number(actor) !== u.id) continue;          // скрытых игроков в ленте нет
    const k = String(kind), it = String(item || "");
    out.push({ id: Number(id), at: Number(at), kind: k, n: Number(n), actor: who(Number(actor)), target: target ? who(Number(target)) || { name: "соседу", pub: "", me: false } : null,
               item: k === "event" ? { id: it, name: (MONO_NAMES[it] || [it])[0] } : it ? { id: it, name: nameOfItem(it) } : null });
  }
  const [nt] = await q("SELECT on_ FROM f_notify WHERE user = ?", [u.id]);
  return { items: out.slice(0, 40), notify: !!(nt && Number(nt[0])) };
}
export async function setNotify(u: any, on: boolean) {
  await q("INSERT INTO f_notify (user, on_, at) VALUES (?, ?, ?) ON CONFLICT(user) DO UPDATE SET on_ = excluded.on_, at = excluded.at", [u.id, on ? 1 : 0, now()]);
  return { notify: on };
}
async function feedTop(uid: number) {                          // самая свежая новость не от тебя — для точки «есть новое» на кнопке «Соседи»
  const [r] = await q("SELECT MAX(id) FROM f_feed WHERE actor != ? AND at > ?", [uid, now() - 3 * DAY]);
  return r && r[0] ? Number(r[0]) : 0;
}
export async function monoFeed(after: number) {                 // для бота: новые большие события; dm — игрок разрешил писать ему в личку
  return (await q("SELECT e.rowid, e.user, e.kind, e.at, n.on_ FROM f_evlog e LEFT JOIN f_notify n ON n.user = e.user WHERE substr(e.kind, 1, 5) = 'mono_' AND e.rowid > ? ORDER BY e.rowid LIMIT 50", [after]))   // не LIKE 'mono_%': «_» там — любой символ, и туда попадал служебный «monoroll:…»
    .map(([id, user, kind, at, on]) => { const k = String(kind).slice(5); return { id: Number(id), user: Number(user), kind: k, at: Number(at), dm: !!Number(on || 0) && !!MONO_NAMES[k],
      name: (MONO_NAMES[k] || [k])[0], text: (MONO_NAMES[k] || ["", ""])[1] }; });
}
export async function forgetFarm(uid: number) {
  for (const sql of ["DELETE FROM f_farms WHERE user = ?", "DELETE FROM f_plots WHERE user = ?", "DELETE FROM g_items WHERE user = ? AND game = 'farm'",
                     "DELETE FROM f_gifts WHERE to_user = ?", "DELETE FROM f_daily WHERE user = ?", "DELETE FROM f_inv WHERE user = ?", "DELETE FROM f_stall WHERE user = ?", "DELETE FROM f_plotev WHERE user = ?", "DELETE FROM f_evlog WHERE user = ?", "DELETE FROM f_stars WHERE user = ?", "DELETE FROM f_cratercrop WHERE user = ?", "DELETE FROM f_mono WHERE user = ?", "DELETE FROM f_monomark WHERE user = ?", "DELETE FROM f_clumps WHERE user = ?", "DELETE FROM f_notify WHERE user = ?", "DELETE FROM f_orders WHERE user = ?", "DELETE FROM f_chest WHERE user = ?", "DELETE FROM f_prices WHERE user = ?",
                     "DELETE FROM f_sales WHERE seller = ?", "DELETE FROM f_barn WHERE user = ?", "DELETE FROM f_builds WHERE user = ?", "DELETE FROM f_jobs WHERE user = ?",
                     "DELETE FROM f_levels WHERE user = ?", "DELETE FROM f_jobtake WHERE user = ?"]) await q(sql, [uid]);
  await q("DELETE FROM f_given WHERE from_user = ? OR to_user = ?", [uid, uid]);
  await q("DELETE FROM f_feed WHERE actor = ? OR target = ?", [uid, uid]);              // из ленты новостей — тоже
}

// ---------- Лунный странник (его идея 2026-11-16) ----------
// В полнолуние у калитки стоит странник и продаёт лунные самоцветы. Самоцвет мелют на мельнице в самоцветную пыль;
// щепотка пыли на растущую грядку — растение сразу созревает. Купить можно не больше GEM_MAX за одно полнолуние.
// Лесенки нет (его решение 2026-11-16, после пробы 60 / 100 / 150): камень всегда стоит ✦60, травяной (семена втрое — самый выгодный) — ✦100.
// Цена одна для всех (его правка: «должна быть одинаковая у всех»). Поднимается для всех сразу, когда игроки в целом начинают
// зарабатывать больше — иначе самоцвет станет почти бесплатным: берём лучший сорт (пыль за урожай) у каждого игрока, смотрим третий
// по величине (один везунчик цену не поднимет) и делим на 90 (кометный хрусталь станции); меньше 1 не бывает.
// Множитель считается один раз на полнолуние и запоминается — в течение суток цена не прыгает.
export const GEM_PRICES = [60, 100], GEM_MAX = 3, GEM_REF = 90;          // [обычный камень, травяной]
async function gemPrices(t: number) {
  const key = "gemx:" + dayStart(t);
  let [row] = await q("SELECT at FROM f_evlog WHERE user = 0 AND kind = ?", [key]);
  if (!row) {
    const top = await q(`SELECT MAX(json_extract(s.genes, '$.dust')) d FROM f_inv i JOIN f_strains s ON s.id = i.strain
                         WHERE i.count > 0 AND json_extract(s.genes, '$.myth') IS NULL GROUP BY i.user ORDER BY d DESC LIMIT 3`);
    const x = Math.max(1, (top.length >= 3 ? Number(top[2][0]) || 0 : 0) / GEM_REF);
    await q("INSERT INTO f_evlog (user, kind, at) SELECT 0, ?, ? WHERE NOT EXISTS (SELECT 1 FROM f_evlog WHERE user = 0 AND kind = ?)", [key, Math.round(x * 100), key]);
    [row] = await q("SELECT at FROM f_evlog WHERE user = 0 AND kind = ?", [key]);
  }
  const x = Math.max(1, Number(row[0]) / 100);
  return GEM_PRICES.map((p) => Math.round(p * x / 5) * 5);
}
// Пять самоцветов (его решения 2026-11-16): в меню странника выбираешь, какой купить; цена у всех одна,
// кроме травяного (семена втрое — самый выгодный): он дороже.
//   moon  — сиреневый: растение созревает сразу          crop  — бирюзовый: урожай с грядки ×2 (складывается с другими множителями)
//   seed  — травяной: семян с грядки втрое больше        dew   — золотой: растение не просит полива до сбора
//   cross — розовый: при сборе наверняка гибрид, мутации втрое чаще
// Лунную и золотую пыль сыплют на растущую грядку, остальные — и на созревшую (срабатывают при сборе); одна и та же пыль на одно растение — один раз.
export const GEM_KINDS: Record<string, { gem: string; dust: string; mark?: string; step: number }> = {
  moon:  { gem: "p:gem",       dust: "p:gemdust",       step: 0 },
  crop:  { gem: "p:gem-crop",  dust: "p:gemdust-crop",  mark: "g2", step: 0 },
  seed:  { gem: "p:gem-seed",  dust: "p:gemdust-seed",  mark: "gseed", step: 1 },
  dew:   { gem: "p:gem-dew",   dust: "p:gemdust-dew",   step: 0 },
  cross: { gem: "p:gem-cross", dust: "p:gemdust-cross", mark: "gcross", step: 0 },
};
const GEM_DEW_FOR = 10 * DAY;                                 // «не просит полива до сбора»: окно полива с запасом (дольше 8 часов растения не растут)
// В чемодане три случайных камня из пяти (его решение 2026-11-16) — одни и те же для всех игроков, на каждое полнолуние свои.
// Каждый камень можно купить один раз.
function gemStock(t: number) {
  const kinds = Object.keys(GEM_KINDS); let x = (Math.floor((t + TZ) / DAY) * 2654435761) >>> 0;
  for (let i = kinds.length - 1; i > 0; i--) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; const k = x % (i + 1); [kinds[i], kinds[k]] = [kinds[k], kinds[i]]; }
  return kinds.slice(0, GEM_MAX);
}
async function gemsBought(uid: number, t: number) {            // какие камни игрок уже купил в это полнолуние
  return (await q("SELECT kind FROM f_evlog WHERE user = ? AND kind LIKE 'gem:%' AND at >= ?", [uid, dayStart(t)])).map((r) => String(r[0]).slice(4));
}
export async function wandererView(uid: number) {
  const t = now(); if (weatherOn(t) !== "fullmoon") return null;
  const got = await gemsBought(uid, t), stock = gemStock(t), left = stock.filter((k) => !got.includes(k)).length, prices = await gemPrices(t);
  return { left, max: GEM_MAX, had: got.length, until: dayStart(t) + DAY,
           goods: stock.map((kind) => ({ kind, item: GEM_KINDS[kind].gem, step: GEM_KINDS[kind].step, price: prices[GEM_KINDS[kind].step], sold: got.includes(kind) })) };
}
export async function buyGem(u: any, kind: string) {
  await ensureFarm(u);
  const g = GEM_KINDS[kind]; if (!g) return { error: "Такого самоцвета у странника нет" };
  const t = now(); if (weatherOn(t) !== "fullmoon") return { error: "Странник ушёл" };
  if (!gemStock(t).includes(kind)) return { error: "Такого самоцвета у странника сегодня нет" };
  if (!(await q("SELECT 1 FROM f_builds WHERE user = ? AND kind = 'barn'", [u.id])).length) return { error: "Самоцветы кладут в амбар — сначала построй его" };
  const got = await gemsBought(u.id, t);
  if (got.includes(kind)) return { error: "Этот самоцвет ты уже купил" };
  if (got.length >= GEM_MAX) return { error: "Больше самоцветов странник сегодня не продаст" };
  const price = (await gemPrices(t))[g.step];
  if (!(await q("UPDATE f_farms SET dust = dust - ? WHERE user = ? AND dust >= ? RETURNING 1", [price, u.id, price])).length) return { error: "Не хватает звёздной пыли" };
  // камень достаётся одному запросу: двойное нажатие не купит его дважды
  if (!(await q("INSERT INTO f_evlog (user, kind, at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM f_evlog WHERE user = ? AND kind = ? AND at >= ?) RETURNING 1", [u.id, "gem:" + kind, t, u.id, "gem:" + kind, dayStart(t)])).length) {
    await q("UPDATE f_farms SET dust = dust + ? WHERE user = ?", [price, u.id]); return { error: "Этот самоцвет ты уже купил" };
  }
  await q("INSERT INTO f_barn (user, strain, count) VALUES (?, ?, 1) ON CONFLICT(user, strain) DO UPDATE SET count = count + 1", [u.id, g.gem]);
  return { ok: true, kind, price, farm: await farmState(u) };
}
// игрок встретил странника — запоминаем (открывает страницу «Самоцветы» в справочнике; его решение 2026-11-16)
async function metWanderer(uid: number, w: any) {
  if (w) await q("INSERT INTO f_evlog (user, kind, at) SELECT ?, 'wanderer', ? WHERE NOT EXISTS (SELECT 1 FROM f_evlog WHERE user = ? AND kind = 'wanderer')", [uid, now(), uid]);
  return w;
}
// щепотка самоцветной пыли на растущее растение
export async function gemDust(u: any, idx: number, kind = "moon") {
  const g = GEM_KINDS[kind]; if (!g) return { error: "Такой пыли нет" };
  const [p] = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ? AND idx = ?`, [u.id, idx]);
  if (!p) return { error: "Грядка пустая" };
  const allg = await q(`SELECT ${PLOT_COLS} FROM f_plots WHERE user = ?`, [u.id]), ssg = await strains(allg.map((x) => String(x[1])));
  const t = now(), boost = await boostOf(u.id), s = ssg[String(p[1])], st = stateOf(p, s, t, boost, fastAt(allg, ssg, idx, await oddWin(u.id)));
  if (st.ripe && !g.mark) return { error: "Уже созрело — эта пыль не нужна, собирай" };   // лунная и золотая — для растущих; бирюзовая, травяная, розовая срабатывают при сборе — их можно и на созревшее (его решение 2026-11-17)
  if (st.dead) return { error: "Растение засохло" };
  if (kind === "moon" && s.odd) return { error: "Странное растение не торопится — эта пыль на него не действует" };
  if (g.mark && (await q("SELECT 1 FROM f_monomark WHERE user = ? AND idx = ? AND kind = ?", [u.id, idx, g.mark])).length) return { error: "Эта пыль тут уже посыпана" };
  if (kind === "dew" && Number(p[5]) - t > DAY) return { error: "Эта пыль тут уже посыпана" };
  if (!(await q("UPDATE f_barn SET count = count - 1 WHERE user = ? AND strain = ? AND count >= 1 RETURNING 1", [u.id, g.dust])).length) return { error: "В амбаре нет такой пыли" };
  if (kind === "moon") await q("UPDATE f_plots SET grown = ?, wet_from = ?, water_until = ? WHERE user = ? AND idx = ?", [s.minutes * 60, t, t, u.id, idx]);
  else if (kind === "dew") await q("UPDATE f_plots SET grown = ?, wet_from = ?, water_until = ? WHERE user = ? AND idx = ?", [growth(p, t, boost, rainSlow(s)), t, t + GEM_DEW_FOR, u.id, idx]);
  else await q("INSERT OR REPLACE INTO f_monomark (user, idx, kind, at) VALUES (?, ?, ?, ?)", [u.id, idx, g.mark, t]);
  return { ok: true, kind, farm: await farmState(u) };
}

// ---------- личные объявления (разовые): показываются, пока игрок не закроет (его решение 2026-11-16) ----------
const NOTICES: Record<number, { id: string; title: string; text: string; points?: number; gift?: { item: string; n: number }; until: number }> = {
  5116432995: { id: "bug-moss", title: "Спасибо, что нашёл баг!", points: 223,
    text: "Ты нашёл дыру с диким мхом и лопатой и честно о ней рассказал. Мы её уже закрыли. В благодарность очки, которые ты успел набрать через этот баг, остаются у тебя.",
    until: Date.UTC(2026, 10, 23) / 1000 },
  // Денис рассказал, что пыль на созревшей грядке не срабатывала (2026-11-17) — в подарок розовая пыль (его решение)
  1990127853: { id: "gift-cross-dust", title: "Спасибо, что рассказал!", gift: { item: "p:gemdust-cross", n: 1 },
    text: "Ты заметил, что самоцветная пыль не срабатывала на созревшей грядке. Мы это исправили: розовую, бирюзовую и травяную пыль теперь можно сыпать и на созревшее — она сработает при сборе. В благодарность — щепотка розовой пыли в амбар.",
    until: Date.UTC(2026, 10, 24) / 1000 },
};
async function noticeFor(uid: number) {
  const n = NOTICES[uid]; if (!n || now() > n.until) return null;
  if ((await q("SELECT 1 FROM f_evlog WHERE user = ? AND kind = ?", [uid, "notice:" + n.id])).length) return null;
  return { id: n.id, title: n.title, text: n.text, points: n.points || 0, gift: n.gift || null };
}
export async function noticeSeen(u: any, id: string) {
  const n = NOTICES[u.id]; if (!n || n.id !== id) return { ok: true };
  const first = (await q("INSERT INTO f_evlog (user, kind, at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM f_evlog WHERE user = ? AND kind = ?) RETURNING 1", [u.id, "notice:" + id, now(), u.id, "notice:" + id])).length;
  if (!first || !n.gift || now() > n.until) return { ok: true };            // подарок — один раз: вторая отметка его не даёт
  await q("INSERT INTO f_barn (user, strain, count) VALUES (?, ?, ?) ON CONFLICT(user, strain) DO UPDATE SET count = count + ?", [u.id, n.gift.item, n.gift.n, n.gift.n]);
  return { ok: true, farm: await farmState(u) };
}
