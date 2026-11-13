#!/usr/bin/env python3
"""Каталог пластинок «Лунной фермы»: одна пластинка — один трек Yuriy Leontiev.

Берёт альбомы из releases.js (их уже собирает update_releases.py) и треки каждого — из открытого каталога
Apple Music (iTunes lookup, без ключей). Пишет games/vinyls.json. Этот же каталог — список треков игры «Угадай трек»
(поле preview — отрывок Apple; у «Мастерской 47» игра берёт свои отрывки с сайта).

У трека нет своей редкости: у каждой пластинки есть все варианты, редкость (обычная / редкая / эпическая /
легендарная) и отделку (обычная / фольгированная / звёздная) сервер выбирает при каждой находке.

Запуск: python3 scripts/build_vinyls.py   (после update_releases.py; новые релизы попадут в игру сами)
"""
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "games", "vinyls.json")


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
                           "album": rel.get("title") or "", "date": rel.get("date") or rel.get("year") or "",
                           "preview": s.get("previewUrl", ""),          # 30-секундный отрывок Apple — для игры «Угадай трек»
                           "url": s.get("trackViewUrl", "").split("&uo=")[0]})
        print(f"{rel['title']}: {len(songs)}", file=sys.stderr)
        time.sleep(0.4)
    if not tracks:
        sys.exit("Каталог пуст — Apple не ответил, файл не трогаю")
    json.dump({"built": time.strftime("%Y-%m-%d"), "tracks": tracks}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"пластинок: {len(tracks)}", file=sys.stderr)


if __name__ == "__main__":
    main()
