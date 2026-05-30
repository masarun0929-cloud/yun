# さざなみゆん 歌唱データベース

さざなみゆんさんの歌枠データを、曲リスト・ランキング・タイムライン・ジャンル検索として公開するためのファンメイド歌唱データベースです。

公開セットアップは [DEPLOY_SETUP.md](DEPLOY_SETUP.md) にまとめています。

## 構成

```text
docs/
  Cloudflare Pagesで公開するフロントエンド

functions/api/data.js
  Cloudflare Pages Functions。動的API運用にする場合、D1から公開JSONを返す

admin-server/
  ローカルまたはTailscale内だけで使う管理画面

d1/
  D1テーブル作成SQLと初期データ投入SQL

tools/
  Spreadsheet取り込みや補助ツール
```

## 推奨運用

D1を編集元データベースとして使い、公開サイトは `docs/data/*.json` の静的JSONを読む運用を標準にしています。

この構成が一番シンプルです。

```text
admin-serverでD1を編集
  ↓
静的JSONを生成
  ↓
docs/data/*.json をGitHubへpush
  ↓
Cloudflare Pagesで公開
```

公開サイトはまず `docs/data/*.json` を読みます。静的JSONが読めない場合だけ `/api/data` へフォールバックします。

運用の選び方:

| 運用 | おすすめ度 | 特徴 |
| --- | --- | --- |
| 静的JSON運用 | 標準 | Pagesだけで表示できる。公開側のD1 bindingがなくても動く |
| 動的API運用 | 任意 | `/api/data` がD1を直接読む。PagesのD1 binding `DB` が必要 |

普段の更新手順:

1. 歌枠追加や曲メタデータ編集は `admin-server/` の管理画面で行う
2. 管理画面の「静的JSONを生成」またはGitHub Actionsで `docs/data/*.json` を更新する
3. 変更をGitへpushする
4. Cloudflare Pagesの自動デプロイで公開サイトへ反映する

```powershell
node admin-server\server.js
```

```text
http://127.0.0.1:8788
```

Tailscale内に出す場合:

```powershell
tailscale serve http://127.0.0.1:8788
```

管理サーバーの詳細は [admin-server/README.md](admin-server/README.md) を参照してください。

## GitHubで公開する場合

このリポジトリは公開テンプレートとして使えるよう、実データ・実トークンを含まないサンプル状態にしています。

公開前に確認すること:

```text
admin-server/.env が存在してもGitに入っていない
*.har や *.log がGitに入っていない
docs/data/*.json が公開してよいデータだけになっている
docs/js/config.js がサンプル値または公開してよい値になっている
スクリーンショットにメールアドレス、実URL、tokenが写っていない
```

GitHubへ置く基本手順:

```powershell
git status
git add .
git commit -m "Prepare public songlist template"
git push
```

`.env`、Cloudflare API token、Supabase secret key、管理画面の `ADMIN_TOKEN` はGitHubへpushしません。Cloudflare PagesとGitHub repositoryを接続すると、`main` ブランチへpushしたタイミングで自動デプロイできます。

GitHub連携とPages設定の詳しい手順は [INFRA_SETUP.md](INFRA_SETUP.md) の「GitHub」も見てください。

## 初期セットアップ

Cloudflare D1 Consoleで以下を実行します。

1. `d1/schema.sql`
2. `d1/generated/songlist_seed.sql`

`songlist_seed.sql` は、リストCSVのB列を曲名、D列をアーティスト名として生成します。E列の歌唱回数は `song_channel_stats` に入ります。
ジャンルは初期SQLでは入れず、管理画面から後でCSV同期します。CSVの例は `d1/genre_import_template.csv` です。

```powershell
npm run d1:seed-sql
```

動的API運用も使う場合、Cloudflare PagesではD1 binding名を `DB` にしてください。公開APIは `env.DB` を参照します。

静的JSON運用だけなら、公開サイトの表示自体は `docs/data/*.json` で完結します。ただし `/api/data` と `/api/d1-test` を使ってD1接続確認もしたい場合は、D1 bindingを設定します。

管理サーバーは `admin-server/env.example` を `admin-server/.env` にコピーして設定します。

```env
CLOUDFLARE_ACCOUNT_ID=replace_with_cloudflare_account_id
CLOUDFLARE_D1_DATABASE_ID=replace_with_d1_database_id
CLOUDFLARE_API_TOKEN=replace_with_cloudflare_api_token
ADMIN_TOKEN=replace_with_private_admin_password
```

`.env` はGitへcommitしません。

Cloudflare Pages、D1、API token、Supabase旧運用の細かい設定は [INFRA_SETUP.md](INFRA_SETUP.md) にまとめています。

設定中に詰まってChatGPTやGeminiなどへ相談する場合は、秘密情報を貼らずに使える [AI_HELP_PROMPTS.md](AI_HELP_PROMPTS.md) のテンプレートを使ってください。

## 確認方法

公開後、以下を確認します。

```text
https://your-site.example/api/d1-test
https://your-site.example/api/data
https://your-site.example/admin.html
```

画面で見る項目:

```text
チャンネル切替が動く
ランキングが表示される
全曲リスト検索が動く
タイムラインが表示される
ライブ情報が表示される
アナリティクスのグラフが表示される
管理ページの曲数・歌枠数・最新日付が期待通り
```

## APIキャッシュ

`/api/data` はCloudflare側で最大約1分キャッシュします。D1更新直後は、サイト表示に少し遅れが出ることがあります。

キャッシュ時間は [functions/api/data.js](functions/api/data.js) の `CACHE_SECONDS` で調整できます。

## 他Vtuber向けに変える場所

まず [docs/js/config.js](docs/js/config.js) を編集します。

```text
SITE.creatorName
SITE.baseUrl
SITE.officialLinks
SHEET_ID
CHANNELS
ORIGINAL_GENRE_KEYWORDS
```

管理画面は [admin-server/env.example](admin-server/env.example) をコピーした `.env` で `ADMIN_TITLE` と `ORIGINAL_GENRE_KEYWORDS` を変えます。

Cloudflare Pagesにも、必要なら環境変数 `ORIGINAL_GENRE_KEYWORDS` を設定します。値はカンマ区切りです。

詳細なチェックリストは [VTUBER_SETUP.md](VTUBER_SETUP.md) にあります。

## Spreadsheetから移行する場合

既存のSpreadsheet取り込みツールは、環境変数でSpreadsheet ID/GIDを差し替えられます。

```powershell
$env:SONGLIST_SPREADSHEET_ID="your_spreadsheet_id"
$env:SONGLIST_NEW_LIST_GID="0"
$env:SONGLIST_NEW_SETLIST_GID="123456789"
$env:SONGLIST_OLD_LIST_GID="987654321"
$env:SONGLIST_OLD_SETLIST_GID="234567890"
```

旧Supabase運用を使う場合のみ、次の環境変数も設定します。

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_..."
python tools\import_supabase.py
```

削除も反映する完全再インポート:

```powershell
python tools\import_supabase.py --reset
```

## 秘密情報の運用

Cloudflare API token、D1 database ID、Supabase secret key、`ADMIN_TOKEN` は公開しません。

チャット、ログ、GitHub、公開HTMLに出してしまった場合は、CloudflareまたはSupabaseのDashboardで該当キーを削除し、新しいキーへ差し替えます。
