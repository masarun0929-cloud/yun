import argparse
import csv
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

SPREADSHEET_ID = os.environ.get("SONGLIST_SPREADSHEET_ID", "replace_with_google_spreadsheet_id")
NEW_LIST_GID = os.environ.get("SONGLIST_NEW_LIST_GID", "0")
OLD_LIST_GID = os.environ.get("SONGLIST_OLD_LIST_GID", "replace_with_sub_list_gid")
SETLIST_KEYWORDS = ("セトリ", "セットリスト", "歌った曲", "曲リスト", "歌リスト", "タイムスタンプ", "timestamp")
NOISE_WORDS = ("お疲れ", "ありがとう", "配信", "最高", "かわいい", "チャンネル", "登録", "http", "www.")
TIMESTAMP_RE = re.compile(r"(?:^|\s)(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s|$)")
LEADING_MARK_RE = re.compile(r"^\s*(?:\d{1,3}[\).．、:：-]?|[・･*\-–—♪♫#]+)\s*")
URL_RE = re.compile(r"https?://(?:www\.)?(?:youtube\.com|youtu\.be)/\S+")


def read_urls(path: Path):
    items = []
    current = None
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = URL_RE.search(stripped)
        if match:
            current = {"url": match.group(0), "setlist_text": ""}
            items.append(current)
            rest = stripped[match.end():].strip(" ,\t")
            if rest:
                current["setlist_text"] += rest + "\n"
            continue
        if current:
            current["setlist_text"] += line.rstrip() + "\n"
    return items


def norm_text(value: str):
    return unicodedata.normalize("NFKC", value or "").replace(" ", "").replace("　", "").upper()


def split_song(value: str):
    text = clean_song_line(value)
    if " / " in text:
        title, artist = text.split(" / ", 1)
        return title.strip(), artist.strip()
    if "/" in text:
        title, artist = text.split("/", 1)
        return title.strip(), artist.strip()
    return text.strip(), ""


def song_key(title: str, artist: str):
    return f"{norm_text(title)}__{norm_text(artist)}"


def fetch_list_rows(gid: str):
    query = urllib.parse.urlencode({"tqx": "out:csv", "gid": gid})
    url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?{query}"
    with urllib.request.urlopen(url, timeout=30) as response:
        text = response.read().decode("utf-8-sig")
    return list(csv.reader(text.splitlines()))


def load_reference_map(use_sheet_reference: bool):
    by_key = {}
    by_title = {}
    if not use_sheet_reference:
        return by_key, by_title
    for gid in (NEW_LIST_GID, OLD_LIST_GID):
        try:
            rows = fetch_list_rows(gid)
        except Exception as exc:
            print(f"表記ゆれ参照の取得に失敗しました: gid={gid} {exc}", file=sys.stderr)
            continue
        for row in rows[2:]:
            if len(row) < 3:
                continue
            title = row[1].strip()
            artist = row[2].strip()
            if not title or title == "曲名":
                continue
            display = f"{title} / {artist}" if artist else title
            key = song_key(title, artist)
            by_key.setdefault(key, display)
            by_title.setdefault(norm_text(title), set()).add(display)
    unique_by_title = {title: next(iter(values)) for title, values in by_title.items() if len(values) == 1}
    return by_key, unique_by_title


def normalize_song(value: str, by_key: dict, by_title: dict):
    title, artist = split_song(value)
    if not title:
        return ""
    exact = by_key.get(song_key(title, artist))
    if exact:
        return exact
    title_only = by_title.get(norm_text(title))
    if title_only and not artist:
        return title_only
    return f"{title} / {artist}" if artist else title


def run_ytdlp(url: str):
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--skip-download",
        "--write-comments",
        "--dump-json",
        "--no-playlist",
        url,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    lines = [line for line in proc.stdout.splitlines() if line.strip().startswith("{")]
    if not lines:
        raise RuntimeError("yt-dlpから動画情報を取得できませんでした")
    return json.loads(lines[-1])


def format_date(value):
    if not value:
        return ""
    try:
        return datetime.strptime(value, "%Y%m%d").strftime("%Y/%m/%d")
    except ValueError:
        return value


def comment_text(comment):
    return comment.get("text") or comment.get("text_ext") or ""


def score_comment(text: str):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    keyword_score = sum(8 for key in SETLIST_KEYWORDS if key.lower() in text.lower())
    timestamp_score = min(20, len(TIMESTAMP_RE.findall(text)) * 3)
    slash_score = min(20, sum(1 for line in lines if "/" in line) * 2)
    list_score = min(20, sum(1 for line in lines if LEADING_MARK_RE.search(line)) * 2)
    length_score = 10 if len(lines) >= 5 else 0
    noise_penalty = sum(2 for word in NOISE_WORDS if word in text and len(lines) < 5)
    return keyword_score + timestamp_score + slash_score + list_score + length_score - noise_penalty


def choose_comment(comments):
    if not comments:
        return "", 0
    ranked = sorted(((score_comment(comment_text(c)), comment_text(c)) for c in comments), reverse=True)
    best_score, best_text = ranked[0]
    return best_text, best_score


def clean_song_line(line: str):
    line = line.replace("　", " ").strip()
    line = re.sub(r"^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*", "", line)
    line = LEADING_MARK_RE.sub("", line)
    line = re.sub(r"\s+#.*$", "", line).strip()
    line = re.sub(r"\s+", " ", line)
    if not line:
        return ""
    lowered = line.lower()
    if any(word.lower() in lowered for word in SETLIST_KEYWORDS) and len(line) < 20:
        return ""
    if line.startswith(("http://", "https://")):
        return ""
    if len(line) > 120:
        return ""
    return line


def extract_songs(text: str):
    songs = []
    seen = set()
    for raw_line in text.splitlines():
        line = clean_song_line(raw_line)
        if not line:
            continue
        looks_like_song = bool(TIMESTAMP_RE.search(raw_line) or "/" in line or LEADING_MARK_RE.search(raw_line))
        if not looks_like_song:
            continue
        key = line.casefold()
        if key not in seen:
            songs.append(line)
            seen.add(key)
    return songs


def make_row(item: dict, by_key: dict, by_title: dict):
    url = item["url"]
    info = run_ytdlp(url)
    comments = info.get("comments") or []
    chosen, score = choose_comment(comments)
    source = item.get("setlist_text", "").strip()
    source_kind = "pasted" if source else "comment"
    if not source:
        source = chosen if score >= 10 else ""
    songs = [normalize_song(song, by_key, by_title) for song in extract_songs(source)]
    songs = [song for song in songs if song]
    return {
        "video_id": info.get("id", ""),
        "date": format_date(info.get("upload_date") or info.get("release_date")),
        "title": info.get("title", ""),
        "url": info.get("webpage_url") or url,
        "comment_count": len(comments),
        "candidate_score": score,
        "setlist_count": len(songs),
        "source": source_kind,
        "candidate_comment": source.replace("\r\n", "\n").replace("\r", "\n"),
        "songs": songs,
    }


def write_csv(rows, out_path: Path):
    max_songs = max((len(row["songs"]) for row in rows), default=0)
    fieldnames = ["video_id", "date", "title", "url", "comment_count", "candidate_score", "source", "setlist_count"]
    fieldnames += [f"song_{i}" for i in range(1, max_songs + 1)]
    fieldnames += ["candidate_comment"]
    with out_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            out = {key: row.get(key, "") for key in fieldnames}
            for idx, song in enumerate(row["songs"], start=1):
                out[f"song_{idx}"] = song
            writer.writerow(out)


def main():
    parser = argparse.ArgumentParser(description="旧CHのYouTube URLと貼り付けセトリから確認用CSVを作ります。")
    parser.add_argument("--urls", required=True, type=Path, help="YouTube URL、またはURL＋セトリを複数ブロックで入れたテキスト")
    parser.add_argument("--out", default=Path("old_ch_setlist_candidates.csv"), type=Path, help="出力CSV")
    parser.add_argument("--no-sheet-reference", action="store_true", help="新CH/旧CHリストを表記ゆれ参照に使わない")
    args = parser.parse_args()

    items = read_urls(args.urls)
    by_key, by_title = load_reference_map(not args.no_sheet_reference)
    rows = []
    for index, item in enumerate(items, start=1):
        print(f"[{index}/{len(items)}] {item['url']}", file=sys.stderr)
        try:
            rows.append(make_row(item, by_key, by_title))
        except Exception as exc:
            rows.append({
                "video_id": "",
                "date": "",
                "title": "取得失敗",
                "url": item["url"],
                "comment_count": 0,
                "candidate_score": 0,
                "source": "error",
                "setlist_count": 0,
                "candidate_comment": str(exc),
                "songs": [],
            })
    write_csv(rows, args.out)
    print(str(args.out))


if __name__ == "__main__":
    main()
