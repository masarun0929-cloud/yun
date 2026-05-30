# Tailscale Admin Server

Tailscale内だけで開く歌枠追加用のローカル管理画面です。公開Pagesには管理APIを置かず、このサーバーがCloudflare D1 REST APIへ直接書き込みます。

## Setup

1. `env.example` を `.env` にコピーします。
2. `CLOUDFLARE_API_TOKEN` を設定します。
3. `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_D1_DATABASE_ID` を設定します。
4. 必要なら `ADMIN_TOKEN` を設定します。

Cloudflare API tokenには、対象アカウントのD1を編集できる権限を付けてください。

Account ID、D1 Database ID、API tokenの取得手順はリポジトリ直下の [INFRA_SETUP.md](../INFRA_SETUP.md) にまとめています。

```env
CLOUDFLARE_ACCOUNT_ID=replace_with_cloudflare_account_id
CLOUDFLARE_D1_DATABASE_ID=replace_with_d1_database_id
CLOUDFLARE_API_TOKEN=replace_with_cloudflare_api_token
ADMIN_HOST=127.0.0.1
ADMIN_PORT=8788
ADMIN_TOKEN=replace_with_private_admin_password
ADMIN_TITLE=replace_with_vtuber_name 歌枠管理
ORIGINAL_GENRE_KEYWORDS=replace_with_vtuber_name,replace_with_unit_name
```

## Start

```powershell
node admin-server\server.js
```

標準ではローカルだけで待ち受けます。

```text
http://127.0.0.1:8788
```

Tailscale内に出す場合は、同じ端末で次を実行します。

```powershell
tailscale serve http://127.0.0.1:8788
```

## What It Writes

歌枠追加時に以下のD1テーブルを更新します。

```text
artists
songs
streams
stream_songs
song_channel_stats
```

リアルライブ情報の追加時は以下のD1テーブルを更新します。公開サイトでは閲覧専用の「ライブ情報」タブとして表示し、外部リンク遷移は行いません。

```text
live_events
live_event_songs
```

曲リストは1行1曲で、基本形は次です。

```text
曲名 / アーティスト
```

キーやジャンルも同時に保存する場合は、行末に `|` 区切りで追加できます。

```text
曲名 / アーティスト | +2 | アニソン
```

同じ `channel + date + url` の歌枠を登録した場合は、その歌枠の `stream_songs` を作り直します。

リアルライブのセトリは、曲名だけでも登録できます。既存曲に同名が1件だけある場合は、その曲へ紐づきます。曖昧な場合や新曲の場合は、`曲名 / アーティスト` の形で入力してください。

## Key and Genre Metadata

D1の `songs.display_key` と `songs.genre` を更新します。

- 曲検索から個別編集できます。
- 統合集計SpreadsheetのT/U/V/X列から一括同期できます。
- CSVを書き出して管理画面からアップロード同期することもできます。

新規D1の場合は、先にリポジトリ直下の `d1/schema.sql` をD1 Consoleで実行してください。既存D1に後からキー/ジャンル列を足す場合だけ、`d1/add_song_metadata.sql` を実行します。

Spreadsheet URLは、統合集計タブのURLを使います。列名から `曲名` / `アーティスト` / `キー` / `ジャンル` を判定します。

既存の統合集計フォーマットも読めます。その場合は、T列=曲名、U列=アーティスト、V列=キー、X列=ジャンルとして読み込みます。

```text
https://docs.google.com/spreadsheets/d/your_spreadsheet_id/edit?gid=your_gid#gid=your_gid
```

毎回入力したくない場合は `.env` に保存できます。

```env
KEY_REFERENCE_CSV_URL=https://docs.google.com/spreadsheets/d/your_spreadsheet_id/edit?gid=your_gid#gid=your_gid
```

## 他Vtuber向けに使う場合

画面タイトルやサイト側の文言も差し替える必要があります。全体の置き換え箇所はリポジトリ直下の [VTUBER_SETUP.md](../VTUBER_SETUP.md) を参照してください。
