#!/usr/bin/env python3
"""Каталог пластинок «Лунной фермы»: одна пластинка — один трек Yuriy Leontiev.

Берёт альбомы из releases.js (их уже собирает update_releases.py) и треки каждого — из открытого каталога
Apple Music (iTunes lookup, без ключей). Пишет games/vinyls.json.

У каждого трека постоянная редкость (зависит только от номера трека — не меняется при пересборке):
обычная ~55%, редкая ~28%, эпическая ~13%, легендарная ~4%. Отделку (обычная / фольгированная / звёздная)
сервер выбирает при каждой находке — её у трека нет.

Запуск: python3 scripts/build_vinyls.py   (после update_releases.py; новые релизы попадут в игру сами)
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "games", "vinyls.json")
TIERS = [("legendary", 4), ("epic", 13), ("rare", 28), ("common", 55)]


def tier_of(track_id):
    x = int(hashlib.sha1(f"vinyl:{track_id}".encode()).hexdigest()[:8], 16) % 100
    acc = 0
    for name, share in TIERS:
        acc += share
        if x < acc:
            return name
    return "common"


def lookup(album_id):
    url = f"https://itunes.apple.com/lookup?id={album_id}&entity=song&limit=200&country=us"
    req = urllib.request.Request(url, headers={"User-Agent": "yl-site-vinyls"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r).get("results", [])
        except Exception as e:
            print(f"повтор {album_id}: {e}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    return []


def main():
    src = open(os.path.join(ROOT, "releases.js"), encoding="utf-8").read()
    releases = json.loads(re.search(r"=\s*(\[[\s\S]*\])\s*;?\s*$", src).group(1))
    tracks = []
    for rel in releases:
        songs = [x for x in lookup(rel["id"]) if x.get("wrapperType") == "track" and x.get("kind") == "song"]
        for s in sorted(songs, key=lambda s: (s.get("discNumber", 1), s.get("trackNumber", 0))):
            tid = str(s["trackId"])
            tracks.append({"id": tid, "title": s["trackName"], "release": str(rel["id"]), "n": s.get("trackNumber"),
                           "date": rel.get("date") or rel.get("year") or "", "tier": tier_of(tid),
                           "url": s.get("trackViewUrl", "").split("&uo=")[0]})
        print(f"{rel['title']}: {len(songs)}", file=sys.stderr)
        time.sleep(0.4)
    if not tracks:
        sys.exit("Каталог пуст — Apple не ответил, файл не трогаю")
    # Редкость: у уже известных треков — прежняя (не «переезжает» при пересборке);
    # при первой сборке — по долям среди всех треков (порядок задаёт хеш номера трека): 5% / 15% / 30% / остальные.
    old = {}
    if os.path.exists(OUT):
        old = {t["id"]: t["tier"] for t in json.load(open(OUT, encoding="utf-8")).get("tracks", []) if t.get("fixed")}
    fresh = [t for t in tracks if t["id"] not in old]
    if not old:
        ranked = sorted(fresh, key=lambda t: hashlib.sha1(f"vinyl:{t['id']}".encode()).hexdigest())
        n = len(ranked)
        for i, t in enumerate(ranked):
            f = i / n
            t["tier"] = "legendary" if f < .05 else "epic" if f < .20 else "rare" if f < .50 else "common"
    for t in tracks:
        if t["id"] in old:
            t["tier"] = old[t["id"]]
        t["fixed"] = True
    json.dump({"built": time.strftime("%Y-%m-%d"), "tracks": tracks}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    counts = {t: sum(1 for x in tracks if x["tier"] == t) for t, _ in TIERS}
    print(f"пластинок: {len(tracks)} — {counts}", file=sys.stderr)


if __name__ == "__main__":
    main()
