import argparse
import csv
import json
import os
import sys
import unicodedata
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime
from collections import defaultdict


SPREADSHEET_ID = os.environ.get("SONGLIST_SPREADSHEET_ID", "replace_with_google_spreadsheet_id")
CHANNELS = {
    "new": {
        "list_gid": os.environ.get("SONGLIST_NEW_LIST_GID", "0"),
        "setlist_gid": os.environ.get("SONGLIST_NEW_SETLIST_GID", "replace_with_main_setlist_gid"),
    },
    "old": {
        "list_gid": os.environ.get("SONGLIST_OLD_LIST_GID", "replace_with_sub_list_gid"),
        "setlist_gid": os.environ.get("SONGLIST_OLD_SETLIST_GID", "replace_with_sub_setlist_gid"),
    },
}


def normalize(value):
    return unicodedata.normalize("NFKC", str(value or "")).strip()


def normalized_key(value):
    return " ".join(normalize(value).split()).lower()


def song_key(title, artist):
    return f"{normalized_key(title)}__{normalized_key(artist)}"


def split_song_cell(raw):
    raw = str(raw or "").strip()
    for sep in (" / ", "／", "/"):
        idx = raw.rfind(sep)
        if idx >= 0:
            return raw[:idx].strip(), raw[idx + len(sep):].strip()
    return raw, ""


def parse_date(value):
    value = str(value or "").strip()
    for fmt in ("%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(value[:10], fmt).date().isoformat()
        except ValueError:
            pass
    return None


def fetch_sheet(gid):
    query = urllib.parse.urlencode({"tqx": "out:csv", "gid": gid})
    url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?{query}"
    with urllib.request.urlopen(url, timeout=30) as response:
        text = response.read().decode("utf-8-sig")
    return list(csv.reader(text.splitlines()))


class Supabase:
    def __init__(self):
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not self.url or not self.key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY are required")

    def request(self, method, path, payload=None, query=None, prefer=None):
        params = urllib.parse.urlencode(query or {}, doseq=True)
        url = f"{self.url}/rest/v1/{path}"
        if params:
            url += f"?{params}"
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        if prefer:
            req.add_header("Prefer", prefer)
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} failed: HTTP {exc.code} {detail}") from exc

    def select_one(self, table, **filters):
        query = {"select": "*", "limit": "1"}
        query.update({key: f"eq.{value}" for key, value in filters.items()})
        rows = self.request("GET", table, query=query)
        return rows[0] if rows else None

    def upsert(self, table, rows, conflict):
        if not rows:
            return []
        return self.request(
            "POST",
            table,
            payload=rows,
            query={"on_conflict": conflict},
            prefer="resolution=merge-duplicates,return=representation",
        )

    def delete(self, table, **filters):
        query = {key: f"eq.{value}" for key, value in filters.items()}
        return self.request("DELETE", table, query=query, prefer="return=minimal")

    def delete_all(self, table):
        return self.request(
            "DELETE",
            table,
            query={"created_at": "not.is.null"},
            prefer="return=minimal",
        )


def load_channels(db):
    rows = db.request("GET", "channels", query={"select": "id,code"})
    return {row["code"]: row["id"] for row in rows}


def clear_channel_import(db, channel_code, channel_id):
    streams = db.request(
        "GET",
        "streams",
        query={"select": "id", "channel_id": f"eq.{channel_id}"},
    )
    for stream in streams:
        db.delete("stream_songs", stream_id=stream["id"])
    db.delete("song_channel_stats", channel_id=channel_id)
    db.delete("streams", channel_id=channel_id)
    print(
        f"{channel_code}: cleared previous channel stream songs, streams and stats",
        flush=True,
    )


def import_channel(db, channel_code, channel_id, config):
    print(f"{channel_code}: fetching sheets", flush=True)
    list_rows = fetch_sheet(config["list_gid"])
    setlist_rows = fetch_sheet(config["setlist_gid"])
    clear_channel_import(db, channel_code, channel_id)

    songs_by_key = {}
    stats_rows = []
    artist_rows = {}

    for index, row in enumerate(list_rows[2:], start=1):
        title = normalize(row[1] if len(row) > 1 else "")
        if not title:
            continue
        artist = normalize(row[2] if len(row) > 2 else "")
        count = int(row[3]) if len(row) > 3 and str(row[3]).isdigit() else 0
        key = song_key(title, artist)
        artist_norm = normalized_key(artist or "(不明)")
        artist_rows[artist_norm] = {"name": artist or "(不明)", "normalized_name": artist_norm}
        songs_by_key[key] = {
            "title": title,
            "artist": artist,
            "normalized_title": normalized_key(title),
            "song_key": key,
            "source_index": int(row[0]) if row and str(row[0]).isdigit() else index,
            "count": count,
        }

    artists = db.upsert("artists", list(artist_rows.values()), "normalized_name")
    artist_id_by_norm = {row["normalized_name"]: row["id"] for row in artists}

    song_rows = []
    for song in songs_by_key.values():
        artist_norm = normalized_key(song["artist"] or "(不明)")
        song_rows.append({
            "title": song["title"],
            "normalized_title": song["normalized_title"],
            "artist_id": artist_id_by_norm.get(artist_norm),
            "song_key": song["song_key"],
        })
    songs = db.upsert("songs", song_rows, "song_key")
    song_id_by_key = {row["song_key"]: row["id"] for row in songs}
    unique_song_id_by_title = unique_title_song_map(songs_by_key, song_id_by_key)

    for key, song in songs_by_key.items():
        stats_rows.append({
            "song_id": song_id_by_key[key],
            "channel_id": channel_id,
            "sing_count": song["count"],
            "source_index": song["source_index"],
        })
    db.upsert("song_channel_stats", stats_rows, "song_id,channel_id")

    print(f"{channel_code}: importing streams", flush=True)
    stream_count, stream_song_count, unmatched_count, linked_counts = import_streams(
        db,
        channel_code,
        channel_id,
        setlist_rows,
        song_id_by_key,
        unique_song_id_by_title,
    )
    no_history = [
        song
        for key, song in songs_by_key.items()
        if song["count"] > 0 and linked_counts.get(song_id_by_key.get(key), 0) == 0
    ]
    print(
        f"{channel_code}: imported {len(song_rows)} songs, {stream_count} streams, "
        f"{stream_song_count} stream songs, {unmatched_count} unmatched",
        flush=True,
    )
    if no_history:
        print(f"{channel_code}: {len(no_history)} listed songs have no linked stream history", flush=True)
        for song in no_history[:20]:
            print(f"  - {song['title']} / {song['artist']} ({song['count']})", flush=True)
        if len(no_history) > 20:
            print(f"  ... and {len(no_history) - 20} more", flush=True)


def unique_title_song_map(songs_by_key, song_id_by_key):
    by_title = defaultdict(list)
    for key, song in songs_by_key.items():
        by_title[song["normalized_title"]].append(key)
    return {
        title_key: song_id_by_key[keys[0]]
        for title_key, keys in by_title.items()
        if len(keys) == 1 and keys[0] in song_id_by_key
    }


def resolve_song_id(title, key, song_id_by_key, unique_song_id_by_title):
    exact = song_id_by_key.get(key)
    if exact:
        return exact
    return unique_song_id_by_title.get(normalized_key(title))


def import_streams(db, channel_code, channel_id, rows, song_id_by_key, unique_song_id_by_title):
    if len(rows) < 5:
        return 0, 0, 0, {}
    index_row, date_row, title_row, url_row, count_row = rows[:5]
    col_count = max(len(index_row), len(date_row))
    imported_streams = 0
    imported_stream_songs = 0
    unmatched_count = 0
    count_mismatch_count = 0
    linked_counts = defaultdict(int)

    for col in range(1, col_count):
        streamed_on = parse_date(date_row[col] if col < len(date_row) else "")
        if not streamed_on:
            continue
        url = normalize(url_row[col] if col < len(url_row) else "")
        expected_count = int(count_row[col]) if col < len(count_row) and str(count_row[col]).isdigit() else 0
        stream_payload = [{
            "channel_id": channel_id,
            "source_index": int(index_row[col]) if col < len(index_row) and str(index_row[col]).isdigit() else col,
            "streamed_on": streamed_on,
            "title": normalize(title_row[col] if col < len(title_row) else ""),
            "url": url,
            "url_key": url,
            "song_count": expected_count,
        }]
        stream = db.upsert("streams", stream_payload, "channel_id,streamed_on,url_key")[0]
        db.delete("stream_songs", stream_id=stream["id"])

        stream_song_rows = []
        position = 1
        for row in rows[5:]:
            if col >= len(row) or not str(row[col]).strip():
                continue
            raw = str(row[col]).strip()
            title, artist = split_song_cell(raw)
            key = song_key(title, artist)
            song_id = resolve_song_id(title, key, song_id_by_key, unique_song_id_by_title)
            if not song_id:
                unmatched_count += 1
            else:
                linked_counts[song_id] += 1
            stream_song_rows.append({
                "stream_id": stream["id"],
                "song_id": song_id,
                "position": position,
                "raw_text": raw,
                "title_snapshot": normalize(title),
                "artist_snapshot": normalize(artist),
                "song_key_snapshot": key,
            })
            position += 1
        db.upsert("stream_songs", stream_song_rows, "stream_id,position")
        if expected_count and expected_count != len(stream_song_rows):
            count_mismatch_count += 1
            print(
                f"{channel_code}: count mismatch index={stream_payload[0]['source_index']} "
                f"date={streamed_on} expected={expected_count} imported={len(stream_song_rows)}",
                flush=True,
            )
        imported_streams += 1
        imported_stream_songs += len(stream_song_rows)
        if imported_streams == 1 or imported_streams % 10 == 0:
            print(
                f"{channel_code}: imported {imported_streams} streams "
                f"({imported_stream_songs} stream songs)",
                flush=True,
            )

    if count_mismatch_count:
        print(f"{channel_code}: {count_mismatch_count} streams have song count mismatches", flush=True)

    return imported_streams, imported_stream_songs, unmatched_count, linked_counts


def reset_import_tables(db):
    for table in ("stream_songs", "song_channel_stats", "streams", "songs", "artists"):
        db.delete_all(table)
        print(f"reset: deleted {table}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Import song data from Google Sheets to Supabase.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete imported data before importing. Channels are kept.",
    )
    args = parser.parse_args()

    db = Supabase()
    if args.reset:
        reset_import_tables(db)
    channels = load_channels(db)
    for code, config in CHANNELS.items():
        if code not in channels:
            raise RuntimeError(f"channels.code={code} is missing")
        import_channel(db, code, channels[code], config)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"import failed: {exc}", file=sys.stderr)
        sys.exit(1)
