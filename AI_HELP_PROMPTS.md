# AI相談用プロンプト集

Cloudflare、D1、Supabase、GitHub連携で詰まったときに、ChatGPT / Gemini / Claude などへ相談するためのテンプレートです。

## 使う前に

AIへ貼ってよいもの:

```text
エラーメッセージ
画面名
設定項目名
SQL
ファイル名
公開URL
```

AIへ貼らないもの:

```text
Cloudflare API Token
Supabase secret key
Supabase service_role key
ADMIN_TOKEN
個人メールアドレス
Cookie
Authorization header
```

ID類の扱い:

```text
Cloudflare Account ID、D1 Database ID、Supabase Project URLは、必要な場合だけ伏せ字で貼ります。
例: CLOUDFLARE_ACCOUNT_ID=xxxxx
例: CLOUDFLARE_D1_DATABASE_ID=xxxxx
例: SUPABASE_URL=https://xxxxx.supabase.co
```

## まず貼る共通情報

どの相談でも、最初にこれを貼ると話が早いです。

```text
私はVtuber歌唱データベースをCloudflare Pagesで公開しようとしています。

構成:
- フロントエンド: docs/
- 標準運用: docs/data/*.json を読む静的JSON運用
- 任意運用: Pages Functionsの functions/api/data.js がD1を読む動的API運用
- 動的API運用時のD1 binding名: DB
- D1 schema: d1/schema.sql
- ローカル管理画面: admin-server/server.js
- 管理画面はCloudflare D1 REST APIへ書き込みます
- Supabaseは旧運用/移行用で、D1編集元/静的JSON公開の標準運用では必須ではありません

やりたいこと:
（ここに目的を書く）

今起きている問題:
（ここにエラーや画面の状態を書く）

貼ってよい範囲での設定:
（ここに伏せ字の設定を書く）

秘密情報は貼っていません。必要そうに見えても、API tokenやsecret keyそのものは要求しないでください。
```

## Cloudflare Pages設定を見てもらう

```text
Cloudflare Pagesの設定が正しいか確認してください。

前提:
- Build output directory は docs
- Build command は空欄
- functions/ に Pages Functions があります
- 標準では docs/data/*.json を読む静的JSON運用です
- 動的API運用も使う場合、D1 binding名は DB にしたいです
- 動的API運用では /api/data が env.DB を読みます

現在の設定:
- Project name: （例: my-songlist）
- Production branch: （例: main）
- Build command: （例: 空欄）
- Build output directory: （例: docs）
- D1 binding:
  - Type: D1 database
  - Variable name: （例: DB）
  - Database: （例: my-songlist-db）
- Environment variables:
  - ORIGINAL_GENRE_KEYWORDS=（例: Vtuber名,ユニット名）

確認してほしいこと:
1. 静的JSON運用だけならこの設定で公開できるか
2. 動的API運用を使う場合、Pages Functionsが動く構成になっているか
3. D1 binding名がコードと一致しているか
4. 設定後に再デプロイが必要か
5. /api/d1-test と /api/data の確認順序
```

## D1 schema作成で詰まったとき

```text
Cloudflare D1 Consoleで schema SQL を実行したいです。

実行したSQL:
```sql
（d1/schema.sql の内容を貼る。長い場合はエラーが出た周辺だけ）
```

エラー:
```text
（D1 Consoleのエラーを貼る）
```

期待している状態:
- channels
- artists
- songs
- streams
- stream_songs
- song_channel_stats
が作成される

確認したいこと:
1. このSQLはD1 SQLite向けとして正しいか
2. 途中まで作成された場合、再実行してよいか
3. channelsの初期データをどう確認するか
4. 修正SQLが必要なら、D1 Consoleで実行できる形で出してください

注意:
Cloudflare API TokenやDatabase IDの実値は貼りません。
```

## `/api/d1-test` が失敗するとき

```text
Cloudflare Pages Functionsの /api/d1-test が失敗します。

エラー:
```text
（ブラウザに出たJSONやエラー文を貼る）
```

関連コード:
```js
export async function onRequestGet({ env }) {
  if (!env.DB) {
    return json({ error: 'D1 binding DB is missing' }, 500);
  }
  const result = await env.DB.prepare('SELECT * FROM songs ORDER BY id DESC LIMIT 10').all();
  return json({ source: 'd1', songs: result.results });
}
```

Cloudflare Pages設定:
- D1 binding variable name: （例: DB）
- Database: （例: my-songlist-db）
- Environment: Production / Preview のどちらか
- 最後に再デプロイした日時: （分かれば）

確認してほしいこと:
1. binding名の不一致か
2. Production/Previewのbinding設定漏れか
3. schema未作成か
4. 再デプロイが必要か
5. 次に確認すべき画面
```

## `/api/data` が失敗するとき

```text
Cloudflare Pages Functionsの /api/data が失敗します。

エラー:
```text
（/api/data のレスポンス、CloudflareのFunctionログ、ブラウザconsoleを貼る）
```

前提:
- 動的API運用を使っています
- D1 binding名は DB
- d1/schema.sql は実行済み
- /api/d1-test は （成功/失敗）

確認したいこと:
1. 足りないテーブルやカラムがあるか
2. D1 schemaと functions/api/data.js の期待がずれているか
3. 空データでも /api/data がJSONを返せるか
4. 修正SQLかコード修正が必要か

秘密情報は貼っていません。
```

## admin-serverの `.env` を確認してもらう

```text
ローカル管理画面 admin-server/server.js の .env 設定が正しいか見てください。

実際の値は伏せています。

```env
CLOUDFLARE_ACCOUNT_ID=xxxxx
CLOUDFLARE_D1_DATABASE_ID=xxxxx
CLOUDFLARE_API_TOKEN=xxxxx
ADMIN_HOST=127.0.0.1
ADMIN_PORT=8788
ADMIN_TOKEN=xxxxx
ADMIN_TITLE=replace_with_vtuber_name 歌枠管理
ORIGINAL_GENRE_KEYWORDS=replace_with_vtuber_name,replace_with_unit_name
KEY_REFERENCE_CSV_URL=https://docs.google.com/spreadsheets/d/xxxxx/edit?gid=xxxxx#gid=xxxxx
```

起動コマンド:
```powershell
node admin-server\server.js
```

エラー:
```text
（起動時やブラウザで出たエラーを貼る）
```

確認してほしいこと:
1. 必須環境変数が足りているか
2. Cloudflare API Tokenの権限不足が疑われるか
3. D1 Database IDとPages binding先のdatabaseが一致していそうか
4. ADMIN_TOKENの入力方法に問題がないか
```

## Cloudflare API Token権限で詰まったとき

```text
Cloudflare D1 REST APIへ admin-server から書き込みたいですが、API token権限で失敗しているかもしれません。

エラー:
```text
（admin-server画面やterminalに出た D1 query failed の内容を貼る）
```

やりたいこと:
- D1 databaseへSELECT/INSERT/UPDATE/DELETEしたい
- 対象AccountとD1 databaseだけに権限を絞りたい

確認してほしいこと:
1. Cloudflare API Tokenに必要な最小権限
2. Account単位とdatabase単位の指定で注意すること
3. tokenを作り直すべきケース
4. tokenをチャットに貼らずに確認する方法

Cloudflareの画面で候補に出ている権限名:
- Account / D1 / Edit

この権限で足りるか、不要に広い権限を避けるにはどうすればよいかも見てください。
```

## Supabase旧運用で詰まったとき

```text
Supabase旧運用で Google Sheets から tools/import_supabase.py を使って取り込みたいです。

前提:
- D1編集元/静的JSON公開の標準運用ではなく、旧Supabase運用/移行用です
- supabase/schema.sql はSupabase SQL Editorで実行済み
- SUPABASE_URL と SUPABASE_SECRET_KEY はローカル環境変数に設定済み

PowerShellで設定した値（実値は伏せています）:
```powershell
$env:SONGLIST_SPREADSHEET_ID="xxxxx"
$env:SONGLIST_NEW_LIST_GID="0"
$env:SONGLIST_NEW_SETLIST_GID="xxxxx"
$env:SONGLIST_OLD_LIST_GID="xxxxx"
$env:SONGLIST_OLD_SETLIST_GID="xxxxx"
$env:SUPABASE_URL="https://xxxxx.supabase.co"
$env:SUPABASE_SECRET_KEY="xxxxx"
python tools\import_supabase.py
```

エラー:
```text
（import failed 以降を貼る）
```

確認してほしいこと:
1. Supabase schemaが足りているか
2. Spreadsheetの公開設定/GIDが正しいか
3. secret key / service_role keyの権限不足か
4. `--reset` を使うべき状況か
```

## Google SheetsのGIDが分からないとき

```text
Google SheetsのURLから、歌唱データベース用のGID設定を作りたいです。

Spreadsheet URL:
```text
https://docs.google.com/spreadsheets/d/xxxxx/edit?gid=123456789#gid=123456789
```

やりたいこと:
- docs/js/config.js の SHEET_ID を設定したい
- CHANNELS.new.listGid / setlistGid を設定したい
- CHANNELS.old.listGid / setlistGid を設定したい

確認してほしいこと:
1. URLのどこがSpreadsheet IDか
2. URLのどこがgidか
3. config.jsへどう書けばよいか
4. 1チャンネルだけの場合の書き方
```

## エラー調査を依頼するとき

```text
以下のエラーを、原因候補と確認順に分けて調査してください。

環境:
- Cloudflare Pages
- 標準運用: docs/data/*.json を読む静的JSON運用
- 動的API運用を使う場合のD1 binding名: DB
- Build output directory: docs
- ローカル管理画面: admin-server/server.js

症状:
```text
（何をしたら何が起きたか）
```

エラー:
```text
（エラーメッセージ）
```

直前に変更したこと:
```text
（例: D1 bindingを追加した / schema.sqlを実行した / envを変えた）
```

確認してほしい出力形式:
1. 最もありそうな原因
2. 画面で確認する場所
3. 実行するSQLやURL
4. 修正案
5. 秘密情報を貼らずに追加確認する方法
```
