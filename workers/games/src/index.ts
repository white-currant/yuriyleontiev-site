// Сервер мини-приложения «Игры» бота StarGuardian (страница games/) — Cloudflare Worker + база D1.
// Перенесён с Val Town (scripts/games-val.ts) 2026-11-13: Val Town закрывается 10.01.2027.
// Выкладка: workers/deploy.sh games. Секрет GAMES_KEY — тот же, что в ~/.config/chatguard/games_key на Proxima.
// Таблицы — schema.sql (wrangler d1 execute). Аватарки — в таблице g_avatars (вместо Blob Storage Val Town).
//
// Игроков проверяем по подписи Телеграма (Ed25519, открытый ключ Телеграма) — токен бота здесь не нужен.
// Игрок:  POST /api/me | /api/round | /api/answer | /api/top | /api/items | /api/link/start | /api/link/remove (заголовок X-Init-Data)
//         GET  /audio/<раунд> | /avatar/<ключ>
// Бот:    GET  /bot/events?after=N | POST /bot/profiles | /bot/link | /bot/forget | /bot/avatar   (заголовок X-Games-Key)

const BOT_ID = 8990614166; // @starguardian_yl_bot
const KARMA_START = 10;                                   // карма новичка, пока бот ещё не прислал его профиль (как в ChatGuard)
const TG_KEY = "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d"; // открытый ключ Телеграма (production)
const SITE = "https://yuriyleontiev.music";
const ORIGINS = [SITE, "http://127.0.0.1:8047", "http://localhost:8047"];
const SCORED_PER_DAY = 12; // раундов в день, за которые даются очки; дальше — тренировка без очков
const ROUND_SECONDS = 20;
const TZ_SHIFT = 3 * 3600; // «день» считаем по Минску

// «Угадай трек» играет по всем трекам каталога games/vinyls.json (тот же, что у пластинок фермы).
// У «Мастерской 47» — свои отрывки на сайте (ниже: id Apple Music, том, номер, название); у остальных — превью Apple.
const TRACKS: [string, number, number, string][] = [["1853557590",1,1,"Climb of the Formics"],["1853557803",1,2,"Thoughtform"],["1853557806",1,3,"Can You Be a Hero?"],["1853557810",1,4,"Digital Wind"],["1853557812",1,5,"Garden of Eidos"],["1853557817",1,6,"Tiny Companions"],["1853557823",1,7,"Electric Petal"],["1853557825",1,8,"Under the Living Sky"],["1853557829",1,9,"Voice Above the World"],["1853557831",1,10,"Together Always"],["1853557985",1,11,"Synthetic Flora"],["1853557988",1,12,"Where Life Begins"],["1853557991",1,13,"Subtle Forms"],["1853557994",1,14,"Inside the Stem"],["1853557998",1,15,"Falling Giants"],["1853557999",1,16,"Revelation"],["1853558003",1,17,"The First Danger"],["1853558005",1,18,"The Formics' song"],["1888776832",2,1,"External Control"],["1888776836",2,2,"New Territories"],["1888776837",2,3,"Chuck"],["1888776838",2,4,"Amarin"],["1888776839",2,5,"Mad Organ Grinder"],["1888776840",2,6,"Nothing Is the Same Anymore"],["1888776843",2,7,"Ivett"],["1888776844",2,8,"Cyber Intrusion"],["1888776849",2,9,"Vakhub"],["1888776851",2,10,"Friends"],["1888776852",2,11,"Something Is Wrong"],["1888776949",2,12,"Iliar"],["1888776951",2,13,"Reality Layer Compromised"],["1888776953",2,14,"White Void"],["1888776954",2,15,"Ascension"],["1888776955",2,16,"Wild Barrel Organ Melody"],["6830543169",3,1,"Hidden in the Nuances"],["6830543190",3,2,"Luma (feat. The Veresk)"],["6830543196",3,3,"Neitz Canyon"],["6830543360",3,4,"Canyon Run"],["6830543371",3,5,"The Warmth of a Mother"],["6830543503",3,6,"Cyberattack, Again"],["6830543513",3,7,"Under the Desert Sun"],["6830543747",3,8,"The Dark Forest"],["6830543766",3,9,"The Exalted Kingdom"],["6830543882",3,10,"Still Waters"],["6830543994",3,11,"Glassy Waters"],["6830544006",3,12,"Grevsburg"],["6830544187",3,13,"The Dark Side of the City"],["6830544237",3,14,"In the Shadows"],["6830544247",3,15,"Truth"],["6830544254",3,16,"One Spark"]];
const BY_ID = new Map(TRACKS.map((t) => [t[0], t]));
type Song = { id: string; title: string; album: string; n: number; preview: string };
let songs: Song[] = [], songsAt = 0;
async function songList(): Promise<Song[]> {
  if (songs.length && now() - songsAt < 3600) return songs;
  try {
    const d: any = await (await fetch(`${SITE}/games/vinyls.json?v=2`, { cf: { cacheTtl: 3600 } } as any)).json();   // ?v — новый ключ кэша после смены формата
    const list = d.tracks.map((t: any) => ({ id: String(t.id), title: String(t.title), album: String(t.album || ""), n: Number(t.n || 0), preview: String(t.preview || "") }))
      .filter((t: Song) => t.title && (t.preview || BY_ID.has(t.id)));
    if (list.length >= 4) { songs = list; songsAt = now(); }
  } catch { /* сайт недоступен — играем по запасному списку */ }
  if (!songs.length) songs = TRACKS.map((t) => ({ id: t[0], title: t[3], album: `Workshop 47, Vol. ${t[1]}`, n: t[2], preview: "" }));
  return songs;
}

const RANKS: [number, string][] = [[0, "Ученик звёзд"], [30, "Ловец комет"], [100, "Чтец созвездий"], [250, "Заклинатель"],
  [500, "Звездочёт"], [1000, "Маг туманностей"], [2000, "Хранитель сфер"],
  // выше — шире разрывы и два новых звания (его решение 2026-11-17: очки за сбор на ферме выросли для хороших сортов)
  [5000, "Верховный маг"], [12000, "Звёздный оракул"], [25000, "Хранитель галактики"], [50000, "Творец звёзд"]];

import * as farm from "./farm";

let DB: any = null;     // привязка D1 (env.DB)
let ENV: any = {};      // секреты (env.GAMES_KEY)

function rows(r: any): any[][] {
  return (r.rows || []).map((x: any) => Array.isArray(x) ? x : r.columns.map((c: string) => x[c]));
}
// Объединение запросов (2026-11-18): загрузка фермы делала полсотни обращений к базе подряд. Теперь farmState одним пакетом
// (prefetch) читает всё, что ему наверняка понадобится, а q отдаёт заранее прочитанное по точному совпадению текста запроса
// и параметров. Запас живёт только внутри одной загрузки фермы: любая запись в базу, начало нового запроса к серверу
// и конец farmState его сбрасывают — тогда q, как раньше, идёт в базу. Не совпал текст — тоже просто обычный запрос.
let RAW: any = null;    // сама D1; DB — обёртка над ней, которая при пакетной записи сбрасывает запас
const PRE = new Map<string, any[][]>();
const preKey = (sql: string, args: any[]) => sql + "\u0001" + JSON.stringify(args);
const isRead = (sql: string) => /^\s*SELECT\b/i.test(sql);
const q = async (sql: string, args: any[] = []): Promise<any[][]> => {
  if (isRead(sql)) { const h = PRE.get(preKey(sql, args)); if (h) return h.map((r) => r.slice()); }
  else PRE.clear();
  return (await RAW.prepare(sql).bind(...args).raw()) as any[][];
};
// пакет запросов одним обращением; чтения кладутся в запас. Возвращает строки каждого запроса по порядку.
async function prefetch(list: [string, any[]][]): Promise<any[][][]> {
  const res = await RAW.batch(list.map(([s, a]) => RAW.prepare(s).bind(...a)));
  PRE.clear();
  return list.map(([s, a], i) => { const rows = ((res[i] && res[i].results) || []).map((o: any) => Object.values(o));
    if (isRead(s)) PRE.set(preKey(s, a), rows); return rows; });
}
const preClear = () => PRE.clear();
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

// Игрок: завести/обновить имя и сбросить дневные счётчики в новый день — одним запросом (быстрее ответа в игре).
async function player(u: any) {
  // экономия записей (2026-11-16): если имя и день те же, обновлять нечего — тогда строку просто читаем
  let [row] = await q(`INSERT INTO g_users (user, name, day) VALUES (?1, ?2, ?3)
      ON CONFLICT(user) DO UPDATE SET name = excluded.name,
        scored = CASE WHEN g_users.day = excluded.day THEN g_users.scored ELSE 0 END,
        earned_today = CASE WHEN g_users.day = excluded.day THEN g_users.earned_today ELSE 0 END,
        day = excluded.day
      WHERE g_users.name IS NOT excluded.name OR g_users.day IS NOT excluded.day
      RETURNING scored, earned_today, streak, best_streak, played, correct, recent`, [u.id, nameOf(u), today()]);
  if (!row) [row] = await q("SELECT scored, earned_today, streak, best_streak, played, correct, recent FROM g_users WHERE user = ?", [u.id]);
  const [scored, earned, streak, best, played, correct, recent] = row;
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

async function profile(u: any, g?: any) {
  g = g || await player(u);
  const [r] = await q(`SELECT p.points, p.karma, p.place, p.name, p.avatar,
      (SELECT COALESCE(SUM(delta), 0) FROM g_events WHERE user = ?1
         AND id > COALESCE((SELECT CAST(value AS INTEGER) FROM g_meta WHERE key = 'consumed'), 0)),
      (SELECT value FROM g_meta WHERE key = 'owner'),
      l.code, l.expires, l.title, l.state
    FROM (SELECT ?1 AS uid) x LEFT JOIN g_profiles p ON p.user = x.uid LEFT JOIN g_links l ON l.user = x.uid`, [u.id]);
  const [sp, karma, place, sname, savatar, pending, owner, lcode, lexp, ltitle, lstate] = r;
  const points = Number(sp || 0) + Number(pending || 0);
  // хозяин и так виден каналом — привязка ему не нужна
  const link = String(u.id) === String(owner || "") ? null
    : lstate === "linked" ? { state: "linked", title: ltitle }
    : lstate === "pending" && Number(lexp) >= now() ? { state: "pending", code: lcode, expires: Number(lexp) }
    : { state: "none" };
  // имя — как его показывает бот (хозяин — названием канала, привязавший — каналом); своё фото — только себе
  const name = link?.state === "linked" ? link.title : sname || nameOf(u);
  const avatar = savatar ? `/avatar/${savatar}` : (link === null || link?.state === "linked") ? null : (u.photo_url || null);
  return { name, avatar, link, dg: farm.dgOpen() || String(u.id) === String(owner || ""), dg_at: farm.DG_OPEN_AT,
    dg_art: farm.dgOpen() || String(u.id) === String(owner || "") ? "dg/card-1875ac22ed65.webp" : null,   // настоящая картинка — только кому открыто; на сайте card.webp — размытая (2026-11-20)
    now: Math.floor(Date.now() / 1000),   // подземелье: до открытия — хозяину, остальным — отсчёт   // подземелье видно: всем после открытия, до него — хозяину
           points, karma: karma == null ? KARMA_START : Number(karma), place: sp != null ? Number(place) : null, ...rankOf(points),
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
  const all = await songList(), titleOf = new Map(all.map((t) => [t.id, t.title]));
  const fresh = all.filter((t) => !g.recent.includes(t.id));
  const track = pick(fresh.length ? fresh : all, 1)[0];
  const others = pick(all.filter((t) => t.id !== track.id && t.title !== track.title), 3);
  const options = pick([track, ...others], 4).map((t) => t.id);
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await DB.batch([                                     // три записи — одним обращением к базе
    DB.prepare("INSERT INTO g_rounds (id, user, track, options, started) VALUES (?, ?, ?, ?, ?)").bind(id, u.id, track.id, JSON.stringify(options), now()),
    DB.prepare("UPDATE g_users SET recent = ? WHERE user = ?").bind(JSON.stringify([track.id, ...g.recent].slice(0, 40)), u.id),
    DB.prepare("DELETE FROM g_rounds WHERE started < ?").bind(now() - 86400),
  ]);
  return { round: id, audio: `/audio/${id}`, seconds: ROUND_SECONDS,
           options: options.map((tid) => ({ id: tid, title: titleOf.get(tid) || "" })),
           practice: g.scored >= SCORED_PER_DAY };
}

async function answer(u: any, round: string, choice: string) {
  const [r] = await q("SELECT user, track, options, started, done FROM g_rounds WHERE id = ?", [round]);
  if (!r || Number(r[0]) !== u.id) return { error: "Раунд не найден" };
  if (Number(r[4])) return { error: "Уже отвечено" };
  const g = await player(u);
  const elapsed = now() - Number(r[3]);
  const right = choice === r[1];
  const late = elapsed > ROUND_SECONDS + 5;
  let points = 0, bonus = 0;
  const streak = right && !late ? g.streak + 1 : 0;
  const scoring = g.scored < SCORED_PER_DAY;
  if (right && !late && scoring) {
    // баланс с фермой (2026-11-13): было 10 / 7 / 5 и +5 за серию — за 2 минуты игры выходило до 130 очков в день,
    // вдвое-втрое больше, чем за день на ферме. Стало 5 / 4 / 3. 2026-11-17 — в полтора раза больше вслед за фермой (там хорошие сорта стали щедрее).
    points = elapsed <= 8 ? 8 : elapsed <= 15 ? 6 : 5;
    if (streak % 5 === 0) bonus = 3; // каждые 5 угаданных подряд
  }
  const writes = [
    DB.prepare("UPDATE g_rounds SET done = 1 WHERE id = ?").bind(round),
    DB.prepare(`UPDATE g_users SET streak = ?, best_streak = MAX(best_streak, ?), played = played + 1, correct = correct + ?,
                scored = scored + ?, earned_today = earned_today + ? WHERE user = ?`)
      .bind(streak, streak, right ? 1 : 0, scoring ? 1 : 0, points + bonus, u.id),
  ];
  if (points + bonus > 0) {
    writes.push(DB.prepare("INSERT INTO g_events (user, name, delta, reason, at) VALUES (?, ?, ?, ?, ?)")
      .bind(u.id, nameOf(u), points + bonus, "Угадай трек" + (bonus ? ", серия" : ""), now()));
  }
  await DB.batch(writes);                               // все записи — одним обращением к базе
  const g2 = { ...g, streak, best: Math.max(g.best, streak), played: g.played + 1, correct: g.correct + (right ? 1 : 0),
               scored: g.scored + (scoring ? 1 : 0), earned: g.earned + points + bonus };
  const t = (await songList()).find((x) => x.id === r[1]) || { id: r[1], title: "", album: "", n: 0 };
  return { right, late, points, bonus, streak, practice: !scoring,
           answer: { id: t.id, title: t.title, album: t.album, n: t.n }, me: await profile(u, g2) };
}

// кого не показывать в «Звёздном зале» (хозяин, анонимные администраторы) — список присылает бот
async function hiddenIds(): Promise<number[]> {
  try { return JSON.parse((await q("SELECT value FROM g_meta WHERE key = 'hidden'"))[0]?.[0] || "[]"); } catch { return []; }
}

// рейтинг открывают часто, а меняется он медленно — держим готовый ответ 30 секунд в памяти сервера
let TOP_CACHE: { at: number; v: any } = { at: 0, v: null };
async function top() {
  if (TOP_CACHE.v && Date.now() - TOP_CACHE.at < 30000) return TOP_CACHE.v;
  const v = await topFresh(); TOP_CACHE = { at: Date.now(), v }; return v;
}
async function topFresh() {
  const h = await hiddenIds();
  const not = h.length ? ` AND user NOT IN (${h.map(() => "?").join(",")})` : "";
  const all = await q(`SELECT name, points, title, avatar, user FROM g_profiles WHERE points > 0${not} ORDER BY points DESC LIMIT 500`, h);   // все игроки (потолок — от случайной лавины)
  // имя — как его прислал бот (хозяин — названием канала), а не из Телеграма при входе в игру
  // вкладка «Сегодня» убрана (его решение 2026-11-16): ради неё каждое начисление очков писало в базу лишнюю строку
  const av = (k: any) => (k ? `/avatar/${k}` : null);
  const ids = [...new Set(all.map((r) => Number(r[4])))], refs = new Map<number, string>();
  for (const id of ids) refs.set(id, await refOf(id));
  if (ids.length) await DB.batch(ids.map((id) => DB.prepare("INSERT OR IGNORE INTO g_refs (ref, user) VALUES (?, ?)").bind(refs.get(id), id)));
  return { all: all.map(([name, points, title, a, id]) => ({ name, points: Number(points), title, avatar: av(a), ref: refs.get(Number(id)) })),
           today: [] };
}

// метка игрока: хеш номера с секретом сервера — по ней профиль открывается, а номер аккаунта наружу не уходит
async function refOf(id: number) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ref:${ENV.GAMES_KEY || "x"}:${id}`)));
  return [...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// профиль игрока для «Звёздного зала»: звание, очки, ферма и коллекция. Скрытых (хозяин без канала и т. п.) не отдаём.
async function playerCard(ref: string) {
  const [r] = await q("SELECT user FROM g_refs WHERE ref = ?", [ref]);
  if (!r) return { error: "Игрок не найден" };
  const uid = Number(r[0]);
  if ((await hiddenIds()).includes(uid)) return { error: "Игрок не найден" };
  const [p] = await q("SELECT name, points, karma, title, place, avatar FROM g_profiles WHERE user = ?", [uid]);
  if (!p) return { error: "Игрок не найден" };
  const [fm] = await q("SELECT pub, unlocked FROM f_farms WHERE user = ?", [uid]);
  // виды считаем как справочник: по форме и расцветке сорта; у сортов станции они свои (колосья станции — «колосья/солнечные», а не «wheat/wheat»; разные цифры заметил игрок 2026-11-17)
  const ids = fm ? (await q("SELECT strain FROM f_inv WHERE user = ?", [uid])).map((x) => String(x[0])) : [];
  const seen = new Set(Object.values(await farm.strains(ids)).filter((g) => !g.odd && g.color !== "anomaly").map((g) => `${g.shape}/${g.color}`));   // аномалия и «странные» гибриды — не виды
  const it = await q("SELECT game, kind, item, tier, finish, count, first_at FROM g_items WHERE user = ? ORDER BY first_at DESC", [uid]);
  const cards = await farm.cardsOf(uid);
  return { name: p[0], points: Number(p[1]), karma: p[2] == null ? KARMA_START : Number(p[2]), title: p[3], place: Number(p[4] || 0), avatar: p[5] ? `/avatar/${p[5]}` : null,
           farm: fm ? { pub: fm[0], beds: Number(fm[1]), species: seen.size, species_total: farm.SPECIES_TOTAL } : null,
           cards, items: it.map(([game, kind, item, tier, finish, count, at]) => ({ game, kind, id: item, tier, finish, count: Number(count), at: Number(at) })) };
}

// коллекция: предметы всех игр, которые выпали игроку (профиль гильдии показывает их вместе)
async function items(u: any) {
  const rows = await q("SELECT game, kind, item, tier, finish, count, first_at FROM g_items WHERE user = ? ORDER BY first_at DESC", [u.id]);
  const cards = await farm.cardsOf(u.id);                                    // карты подземелья — в коллекцию, у каждой свой номер (2026-11-20)   // карты подземелья — в коллекцию (2026-11-20)
  return { cards, items: rows.map(([game, kind, item, tier, finish, count, at]) => ({ game, kind, id: item, tier, finish, count: Number(count), at: Number(at) })) };
}

// ---------- HTTP ----------

export default {
  async fetch(req: Request, env: any): Promise<Response> {
    RAW = env.DB; ENV = env; PRE.clear();
    DB = { prepare: (sql: string) => RAW.prepare(sql), batch: (st: any[]) => { PRE.clear(); return RAW.batch(st); } };
    farm.setup({ q, DB, now, today, nameOf, prefetch, preClear });
    try {
      return await handle(req);
    } catch (e) {
      // упали — отвечаем ошибкой с CORS, иначе браузер покажет «нет связи» вместо причины
      console.error(e);
      const origin = req.headers.get("origin") || "";
      return new Response(JSON.stringify({ error: "Сервер игр споткнулся — попробуй ещё раз" }), { status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0], "Vary": "Origin" } });
    }
  },
};

// ---------- время в играх ----------
// Считаем по действиям, за которые идут очки. Заход — действия подряд с паузами до 5 минут; на каждый заход прибавляется минута.
// Сутки — по Минску; в полночь заход обрывается, поэтому сутки считаются независимо и их можно складывать по одним.
function playDays(ev: any[][], day0: number, n: number) {
  const days = Array.from({ length: n }, (_, i) => ({ day: new Date((day0 + i) * 86400000).toISOString().slice(0, 10), sec: 0, acts: 0, visits: 0, by: {} as Record<string, number> }));
  const hours = Array.from({ length: 24 }, () => 0), games: Record<string, { name: string; sec: number; acts: number }> = {};
  let prev = 0, prevDay = -1;
  for (const [at0, reason] of ev) {
    const at = Number(at0), loc = at + TZ_SHIFT, di = Math.floor(loc / 86400) - day0, d = days[di]; if (!d) continue;
    const cont = prev > 0 && di === prevDay && at - prev <= 300, add = cont ? at - prev : 60;
    if (!cont) d.visits++;
    const game = String(reason || "Игры").split(",")[0].trim() || "Игры";       // «Угадай трек, серия» — та же игра; время идёт игре этого действия
    d.sec += add; d.acts++; d.by[game] = (d.by[game] || 0) + add; hours[Math.floor(loc % 86400 / 3600)] += add;
    (games[game] ??= { name: game, sec: 0, acts: 0 }).sec += add; games[game].acts++;
    prev = at; prevDay = di;
  }
  return { days, hours, games: Object.values(games).sort((a, b) => b.sec - a.sec) };
}
// «Всего в игре»: действия старше 30 дней удаляются, поэтому завершённые сутки (до today, не включая) складываем в g_playtime.
// Читает только то, что ещё не сложено. Сегодняшние сутки сюда не входят — их прибавляет тот, кто спрашивает.
let FOLD_DAY = 0;
async function foldPlay(uid: number, today: number): Promise<{ sec: number; since: number }> {
  const [row] = await q("SELECT sec, upto, since FROM g_playtime WHERE user = ?", [uid]);
  const have = row ? Number(row[0]) : 0, upto = row ? Number(row[1]) : -1, since0 = row ? Number(row[2]) : 0;
  if (upto >= today) return { sec: have, since: since0 };
  const ev = await q("SELECT at, reason FROM g_events WHERE user = ? AND at >= ? AND at < ? AND reason != 'unlink' ORDER BY at",
                     [uid, upto < 0 ? 0 : upto * 86400 - TZ_SHIFT, today * 86400 - TZ_SHIFT]);
  if (!ev.length && !row) return { sec: 0, since: 0 };
  const first = ev.length ? Math.floor((Number(ev[0][0]) + TZ_SHIFT) / 86400) : today;
  const add = ev.length ? playDays(ev, first, today - first).days.reduce((a, d) => a + d.sec, 0) : 0, since = since0 || (ev.length ? Number(ev[0][0]) : 0);
  // складывает ровно один запрос: условие «upto прежний» не даст двум одновременным запросам прибавить дважды
  await q(`INSERT INTO g_playtime (user, sec, upto, since) VALUES (?, ?, ?, ?)
           ON CONFLICT(user) DO UPDATE SET sec = g_playtime.sec + excluded.sec, upto = excluded.upto, since = CASE WHEN g_playtime.since > 0 THEN g_playtime.since ELSE excluded.since END
           WHERE g_playtime.upto = ?`, [uid, add, today, since, upto]);
  return { sec: have + add, since };
}

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
    if (!r) return new Response("not found", { status: 404, headers: cors });
    const own = BY_ID.get(r[0]);                                  // свой отрывок на сайте — у «Мастерской 47»
    const song = own ? null : (await songList()).find((x) => x.id === r[0]);
    const file = own ? `${testing.audioBase}/rating/previews/v${own[1]}-${String(own[2]).padStart(2, "0")}.m4a`
      : song && /^https:\/\/audio-ssl\.itunes\.apple\.com\//.test(song.preview) ? song.preview : "";
    if (!file) return new Response("not found", { status: 404, headers: cors });
    // отрывок не должен «висеть»: 8 секунд на попытку, одна повторная
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2 && !(res && res.ok); attempt++) {
      try { res = await fetch(file, { signal: AbortSignal.timeout(8000) }); } catch { res = null; }
    }
    if (!res) return new Response("audio unavailable", { status: 502, headers: cors });
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
    if (req.method === "GET" && url.pathname === "/bot/cards/ledger") {    // журнал карт целиком — копия-свидетель на Proxima (его просьба 2026-11-20)
      await farm.cardsOf(0);                                                // досоздать первые записи старым картам
      const rows = await q("SELECT seq, card, ev, from_user, to_user, at, info, prev, hash FROM d_card_log ORDER BY seq LIMIT 20000");
      return json(rows.map(([seq, card, ev, from, to, at, info, prev, hash]) => ({ seq: Number(seq), card: Number(card), ev, from: from == null ? null : Number(from), to: to == null ? null : Number(to), at: Number(at), info, prev, hash })));
    }
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
        await q("INSERT INTO g_meta (key, value) VALUES ('owner', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE g_meta.value IS NOT excluded.value", [String(body.owner)]);
      }
      if (Array.isArray(body.hidden)) {
        await q("INSERT INTO g_meta (key, value) VALUES ('hidden', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE g_meta.value IS NOT excluded.value",
                [JSON.stringify(body.hidden.map(Number).filter(Number.isFinite))]);
      }
      if (body.consumed != null) {
        await q("INSERT INTO g_meta (key, value) VALUES ('consumed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE g_meta.value IS NOT excluded.value", [String(body.consumed)]);
        const today = Math.floor((now() + TZ_SHIFT) / 86400);
        if (FOLD_DAY !== today) {                                  // раз в сутки: время тех, чьи действия скоро удалятся, — в накопленное
          const [m] = await q("SELECT value FROM g_meta WHERE key = 'playfold'");
          if (!m || Number(m[0]) !== today) {
            for (const [u] of await q("SELECT DISTINCT user FROM g_events WHERE at < ?", [now() - 28 * 86400])) await foldPlay(Number(u), today);
            await q("INSERT INTO g_meta (key, value) VALUES ('playfold', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(today)]);
          }
          FOLD_DAY = today;
        }
        await q("DELETE FROM g_events WHERE +id <= ? AND at < ?", [Number(body.consumed), now() - 30 * 86400]);
        await q("DELETE FROM g_daypts WHERE day < ?", [Math.floor((now() + TZ_SHIFT) / 86400) - 2]);   // «+id» — искать по индексу времени, а не перебирать номера
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
    // время в играх для карточки бота (команда /gametime в чате, 2026-11-18) — см. playDays и foldPlay ниже
    if (req.method === "GET" && url.pathname === "/bot/playtime") {
      const uid = Number(url.searchParams.get("user") || 0), today = Math.floor((now() + TZ_SHIFT) / 86400), day0 = today - 6;
      const ev = await q("SELECT at, reason FROM g_events WHERE user = ? AND at >= ? AND reason != 'unlink' ORDER BY at LIMIT 30000", [uid, day0 * 86400 - TZ_SHIFT]);
      const week = playDays(ev, day0, 7), all = await foldPlay(uid, today);
      return json({ ...week, total: all.sec + week.days[6].sec, since: all.since || (ev.length ? Number(ev[0][0]) : 0) });
    }
    if (req.method === "GET" && url.pathname === "/bot/weather") return json(farm.weatherView(now()));   // для объявлений бота в чате
    if (req.method === "GET" && url.pathname === "/bot/mono") return json(await farm.monoFeed(Number(url.searchParams.get("after")) || 0));   // события моно-фермы — объявить в чате
    if (req.method === "POST" && url.pathname === "/bot/rain") {   // новый пост в канале — дождь звёздной пыли
      return json(await farm.setRain(Number((await req.json()).hours || 24)));
    }
    if (req.method === "POST" && url.pathname === "/bot/forget") {
      const uid = Number((await req.json()).user);
      for (const t of ["g_users", "g_profiles", "g_links", "g_events", "g_rounds", "g_items", "g_refs", "g_daypts", "g_playtime"]) await q(`DELETE FROM ${t} WHERE user = ?`, [uid]);
      await farm.forgetFarm(uid);
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
    case "/api/items": return json(await items(user));
    case "/api/player": return json(await playerCard(String(body.ref || "")));
    case "/api/link/start": return json(await linkStart(user));
    case "/api/link/remove": return json(await linkRemove(user));
    // «Лунная ферма»
    case "/api/farm": return json(await farm.farmState(user));
    case "/api/farm/star": return json(await farm.takeStar(user, Number(body.id)));
    case "/api/farm/clump": return json(await farm.takeClump(user, Number(body.id)));
    case "/api/farm/crater": return json(await farm.fixCrater(user, Number(body.idx)));
    case "/api/farm/coal": return json(await farm.takeCoal(user, Number(body.idx)));
    case "/api/farm/slimes": return json(await farm.slimesDone(user));
    case "/api/farm/notice": return json(await farm.noticeSeen(user, String(body.id || "").slice(0, 40)));
    case "/api/farm/gem": return json(await farm.buyGem(user, String(body.kind || "moon").slice(0, 12)));
    case "/api/farm/gemdust": return json(await farm.gemDust(user, Number(body.idx), String(body.kind || "moon").slice(0, 12)));
    case "/api/farm/dig": return json(await farm.dig(user, Number(body.idx)));
    case "/api/farm/plant": return json(await farm.plant(user, Number(body.idx), String(body.crop || "")));
    case "/api/farm/harvest": return json(await farm.harvest(user, Number(body.idx)));
    case "/api/farm/unlock": return json(await farm.unlock(user));
    case "/api/farm/build": return json(await farm.build(user, String(body.kind || "")));
    case "/api/farm/order": return json(await farm.fulfil(user, Number(body.slot), body.pick));
    case "/api/farm/order/skip": return json(await farm.skipOrder(user, Number(body.slot)));
    case "/api/farm/cook": return json(await farm.cook(user, String(body.recipe || ""), Number(body.n || 1), String(body.sort || "").slice(0, 64)));
    case "/api/farm/collect": return json(await farm.collect(user, String(body.kind || "")));
    case "/api/farm/hive/collect": return json(await farm.hiveCollect(user));
    case "/api/farm/stoke": return json(await farm.stoke(user, String(body.slot || "oven").slice(0, 16)));
    case "/api/farm/uncook": return json(await farm.uncook(user, String(body.slot || "").slice(0, 16)));
    case "/api/farm/upgrade": return json(await farm.upgrade(user, String(body.kind || "")));
    case "/api/farm/sell": return json(await farm.sellCrop(user, String(body.strain || ""), Number(body.n || 1)));
    case "/api/farm/gifts": return json(await farm.openGifts(user));
    case "/api/farm/neighbors": return json(await farm.neighbors(user, await hiddenIds()));
    case "/api/farm/feed": return json(await farm.feed(user, await hiddenIds(), Number(body.since) || 0));
    case "/api/farm/notify": return json(await farm.setNotify(user, !!body.on));
    case "/api/farm/visit": return json(await farm.visit(user, String(body.pub || "")));
    case "/api/farm/roof": return json(await farm.setRoof(user, String(body.color || "")));
    case "/api/farm/shell": return json(await farm.dustShell(user));
    case "/api/farm/decor": return json(await farm.setDecor(user, String(body.slot || ""), String(body.item || ""), body.on !== false));
    case "/api/farm/fertilize": return json(await farm.fertilize(user, Number(body.idx)));
    case "/api/farm/water": return json(await farm.water(user, Number(body.idx)));
    case "/api/farm/fill": return json(await farm.fill(user));
    case "/api/farm/book": return json(await farm.book(user));
    case "/api/dg": return json(await farm.dgState(user));
    case "/api/dg/pack": return json(await farm.dgPack(user, String(body.item || "").slice(0, 80), body.slot == null ? -1 : Number(body.slot)));
    case "/api/dg/start": return json(await farm.dgStart(user, String(body.size || "")));
    case "/api/dg/finish": return json(await farm.dgFinish(user, String(body.run || "").slice(0, 32), Number(body.bones) || 0, !!body.dead, !!body.left, !!body.revived));
    case "/api/dg/chest": return json(await farm.dgChest(user, String(body.run || "").slice(0, 32), Number(body.slot)));
    case "/api/cards/history": return json(await farm.cardHistory(user, Number(body.id) || 0));
    case "/api/dg/altar": return json(await farm.dgAltar(user, String(body.run || "").slice(0, 32)));
    case "/api/dg/drink": return json(await farm.dgDrink(user, String(body.item || "").slice(0, 80)));
    case "/api/dg/brew": return json(await farm.dgBrew(user, Number(body.n) || 1));
    case "/api/farm/market": return json(await farm.market(user, await hiddenIds()));
    case "/api/farm/seeds": return json(await farm.buySeeds(user, String(body.crop || ""), Number(body.n || 1)));
    case "/api/farm/list": return json(await farm.list(user, String(body.strain || ""), Number(body.delta || 0)));
    case "/api/farm/price": return json(await farm.setPrice(user, String(body.item || "").slice(0, 80), Number(body.price || 0), body.kind === "seed" ? "seed" : "item"));
    case "/api/farm/seed-dust": return json(await farm.seedsToDust(user, String(body.strain || "").slice(0, 80), Number(body.n || 1), body.from === "chest" ? "chest" : "inv"));
    case "/api/farm/chicken-feed": return json(await farm.feedChickens(user, String(body.strain || "").slice(0, 80), Number(body.n)));
    case "/api/farm/chicken-collect": return json(await farm.collectEggs(user));
    case "/api/farm/chest": return json(await farm.chestMove(user, String(body.strain || "").slice(0, 80), Number(body.delta || 0)));
    case "/api/farm/stall": return json(await farm.listItem(user, String(body.item || "").slice(0, 80), Number(body.delta || 0)));
    case "/api/farm/sales/seen": return json(await farm.salesSeen(user));
    case "/api/farm/buy": {
      const [p] = await q("SELECT name FROM g_profiles WHERE user = ?", [user.id]);
      return json(await farm.buy(user, String(body.pub || ""), String(body.strain || ""), p?.[0] || "Сосед", body.kind === "item" ? "item" : "seed"));
    }
    case "/api/farm/gift": {
      // в подарке — публичное имя (как в «Звёздном зале»), а не имя из Телеграма
      const [p] = await q("SELECT name FROM g_profiles WHERE user = ?", [user.id]);
      return json(await farm.gift(user, String(body.pub || ""), p?.[0] || "Сосед"));
    }
  }
  return json({ error: "not found" }, 404);
}
