#!/usr/bin/env python3
"""Собирает releases.js и обложки для сайта.

Источник списка релизов и обложек: Apple Music (iTunes API, без ключей).
Ссылки на стриминги: Apple Music (точная), Deezer (точная, публичный API),
Spotify (точная, если заданы SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET,
иначе ссылка на поиск), YouTube Music (поиск).

Ручные правки названий: scripts/overrides.json  {"<appleId>": {"title": "...", "sub": "...", "kind": "score|release"}}
Запуск:  python3 scripts/update_releases.py
"""
import base64
import json
import os
import re
import sys
import urllib.parse
import urllib.request

APPLE_ARTIST_ID = "919899904"
SPOTIFY_ARTIST_ID = "2xHIhkS5rqeGInYDac9gLq"
DEEZER_ARTIST_ID = "7043153"
ARTIST = "Yuriy Leontiev"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COVERS = os.path.join(ROOT, "covers")
OVERRIDES = os.path.join(ROOT, "scripts", "overrides.json")


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "yl-site-updater"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def get_json(url, headers=None):
    try:
        return json.loads(get(url, headers))
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} для {url.split('?')[0]}: {e.read().decode('utf-8', 'replace')[:300]}", file=sys.stderr)
        raise


def norm(s):
    s = s.lower()
    s = re.sub(r"\s*-\s*(single|ep)$", "", s)
    s = re.sub(r"[^a-z0-9а-яё]+", "", s)
    return s


def split_title(name):
    """Из названия альбома Apple Music делает (title, sub, kind)."""
    name = re.sub(r"\s*-\s*(Single|EP)$", "", name).strip()
    m = re.match(r"^(.*?)\s*\((.*)\)$", name)
    base, paren = (m.group(1).strip(), m.group(2).strip()) if m else (name, "")
    is_score = bool(re.search(r"soundtrack|film score", paren + " " + base, re.I))
    if not is_score:
        return name, "", "release"
    fm = re.match(r"From\s+(.+?):\s*(.*)", paren)
    if fm:
        return fm.group(1).strip(), base, "score"
    if " - " in base:
        left, right = base.rsplit(" - ", 1)
        return right.strip(), left.strip(), "score"
    return base, paren, "score"


def deezer_albums():
    out = {}
    url = f"https://api.deezer.com/artist/{DEEZER_ARTIST_ID}/albums?limit=100"
    try:
        for a in get_json(url).get("data", []):
            out[norm(a["title"])] = a["link"].split("?")[0]
    except Exception as e:  # сеть/лимиты не должны ронять сборку
        print("Deezer:", e, file=sys.stderr)
    return out


def spotify_albums():
    cid, secret = os.environ.get("SPOTIFY_CLIENT_ID"), os.environ.get("SPOTIFY_CLIENT_SECRET")
    if not (cid and secret):
        return {}
    try:
        tok = base64.b64encode(f"{cid}:{secret}".encode()).decode()
        req = urllib.request.Request(
            "https://accounts.spotify.com/api/token",
            data=b"grant_type=client_credentials",
            headers={"Authorization": f"Basic {tok}", "Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            token = json.loads(urllib.request.urlopen(req, timeout=30).read())["access_token"]
        except urllib.error.HTTPError as e:
            print(f"Spotify token: HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}", file=sys.stderr)
            raise
        h = {"Authorization": f"Bearer {token}"}
        # /artists/{id}/albums недоступен в режиме разработчика с 2026 г. — ищем через search (лимит 10)
        out, offset = {}, 0
        q = urllib.parse.quote(f'artist:"{ARTIST}"')
        while offset < 100:
            d = get_json(f"https://api.spotify.com/v1/search?q={q}&type=album&limit=10&offset={offset}", h)
            items = d["albums"]["items"]
            for a in items:
                if any(x["id"] == SPOTIFY_ARTIST_ID for x in a.get("artists", [])):
                    out[norm(a["name"])] = a["external_urls"]["spotify"]
            if not d["albums"].get("next") or not items:
                break
            offset += 10
        print(f"Spotify: найдено альбомов {len(out)}")
        return out
    except Exception as e:
        print("Spotify:", e, file=sys.stderr)
        return {}


def main():
    os.makedirs(COVERS, exist_ok=True)
    overrides = json.load(open(OVERRIDES, encoding="utf-8")) if os.path.exists(OVERRIDES) else {}
    apple = get_json(f"https://itunes.apple.com/lookup?id={APPLE_ARTIST_ID}&entity=album&limit=200&country=us")
    deezer, spotify = deezer_albums(), spotify_albums()

    releases = []
    for r in apple["results"]:
        if r.get("wrapperType") != "collection":
            continue
        cid = str(r["collectionId"])
        path = os.path.join(COVERS, cid + ".jpg")
        if not os.path.exists(path):
            art = re.sub(r"/\d+x\d+bb\.jpg", "/640x640bb.jpg", r["artworkUrl100"])
            with open(path, "wb") as f:
                f.write(get(art))
            print("cover:", cid)

        title, sub, kind = split_title(r["collectionName"])
        o = overrides.get(cid, {})
        title, sub, kind = o.get("title", title), o.get("sub", sub), o.get("kind", kind)

        key = norm(r["collectionName"])
        q = urllib.parse.quote(f"{ARTIST} {title}")
        links = [
            {"name": "Spotify", "url": spotify.get(key) or f"https://open.spotify.com/search/{q}"},
            {"name": "Apple Music", "url": r["collectionViewUrl"].split("?")[0]},
            {"name": "YouTube Music", "url": f"https://music.youtube.com/search?q={q}"},
        ]
        if key in deezer:
            links.append({"name": "Deezer", "url": deezer[key]})

        releases.append({
            "id": cid, "title": title, "sub": sub, "kind": kind,
            "date": r["releaseDate"][:10], "year": r["releaseDate"][:4],
            "cover": f"covers/{cid}.jpg", "links": links,
        })

    releases.sort(key=lambda x: x["date"], reverse=True)
    out = os.path.join(ROOT, "releases.js")
    new = "window.RELEASES = " + json.dumps(releases, ensure_ascii=False, indent=1) + ";\n"
    if not os.path.exists(out) or open(out, encoding="utf-8").read() != new:
        open(out, "w", encoding="utf-8").write(new)
        print(f"releases.js обновлён: {len(releases)} релизов, новейший: {releases[0]['title']}")
    else:
        print("без изменений")


if __name__ == "__main__":
    main()
