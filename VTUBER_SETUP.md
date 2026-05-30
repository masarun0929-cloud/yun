# 他Vtuber向けセットアップガイド

このリポジトリは、歌枠の曲リスト・ランキング・タイムライン・ジャンル管理を公開するための歌唱データベースです。キー情報は任意で、入力するまでは非表示にできます。

公開テンプレート用に、架空のサンプルデータとプレースホルダー設定を入れています。下の項目を置き換えると、実際のVtuberさん向けに使えます。

## 全体像

```text
Google Sheets
  曲一覧と歌枠セットリストの編集元

Cloudflare D1
  管理画面が編集するデータベース

Cloudflare Pages
  docs/ を公開し、通常は docs/data/*.json を読む

admin-server/
  Tailscaleなどローカル限定で開く歌枠追加・キー/ジャンル編集画面
```

## 必要なもの

- Cloudflareアカウント
- Cloudflare Pagesプロジェクト
- Cloudflare D1データベース
- Google Sheets
- Node.js
- Python 3
- Tailscale

Tailscaleは管理画面を外に公開しないための推奨構成です。自分だけが管理するなら、ローカル起動だけでも運用できます。

## 置き換える値

| 種別 | ファイル | 置き換える内容 |
| --- | --- | --- |
| サイト名・説明 | `docs/index.html` | `<title>`、description、OGP、ヘッダー、フッター |
| 公式リンク | `docs/index.html` | YouTube、X、お問い合わせフォーム |
| Spreadsheet | `docs/js/config.js` | `SHEET_ID`、各チャンネルの `listGid` / `setlistGid` |
| チャンネル名 | `docs/js/config.js`、`supabase/schema.sql` | `new` / `old` のラベルや初期行 |
| 管理画面名 | `admin-server/server.js` | `<title>` と `<h1>` |
| Cloudflare D1 | `admin-server/.env` | `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`、`CLOUDFLARE_API_TOKEN` |
| キー参照シート | `admin-server/.env` | `KEY_REFERENCE_CSV_URL` |
| SEO | `docs/robots.txt`、`docs/sitemap.xml` | 公開URL |
| アイコン | `docs/assets/site-icon.svg` | サイト用アイコン。まずは同梱の汎用アイコンを使い、必要になったら差し替え |
| オリジナル曲判定 | `docs/js/config.js`、Cloudflare Pages環境変数、`admin-server/.env` | `ORIGINAL_GENRE_KEYWORDS` |

まずは `docs/js/config.js` を変えると、見た目とデータ参照先の大部分を差し替えられます。HTMLを直接編集するのは、文言やレイアウトそのものを変えたいときだけで大丈夫です。

## アイコン

初期状態では、マイク・音符・データベースを組み合わせた汎用アイコンを入れています。

```text
docs/assets/site-icon.svg
docs/assets/songlist-generated-icon.png
```

通常は `site-icon.svg` だけ差し替えれば、ブラウザのタブ、ヘッダー、OGP画像設定に反映されます。

差し替える場合は、同じファイル名で上書きするか、ファイル名を変えて [docs/index.html](docs/index.html) と [docs/js/main.js](docs/js/main.js) の `assets/site-icon.svg` 参照を変更してください。

## 色テーマ

サイトの色合いだけを変えたい場合は、[docs/css/color-themes](docs/css/color-themes) のテーマCSSを使います。

```text
theme-sakura-pink.css
theme-sky-blue.css
theme-mint-green.css
theme-lemon-yellow.css
theme-lavender-purple.css
theme-night-navy.css
```

[docs/index.html](docs/index.html) のCSS読み込みで、`css/theme.css` の直後に使いたいテーマを1つ追加してください。

```html
<link rel="stylesheet" href="css/theme.css">
<link rel="stylesheet" href="css/color-themes/theme-sakura-pink.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/views.css">
```

`theme.css` は消さず、色テーマCSSを後ろに追加します。詳しくは [docs/css/color-themes/README.md](docs/css/color-themes/README.md) を参照してください。

## Google Sheetsの形

標準では2チャンネル構成です。

- `new`: 現在のチャンネル
- `old`: 旧チャンネル

各チャンネルに2つのタブを用意します。

| タブ | 用途 | `docs/js/config.js` の項目 |
| --- | --- | --- |
| 曲一覧 | 曲名・アーティスト・歌唱回数 | `listGid` |
| セットリスト | 歌枠ごとの日付・タイトル・URL・曲リスト | `setlistGid` |

## 1チャンネルだけで使う場合

メインchだけ、または配信チャンネルが1つだけの場合は、`new` だけを残すのが一番簡単です。`new` という内部IDはそのまま使い、画面上の名前だけを `メインch` や `YouTube` などに変えると、修正箇所が少なく済みます。

### 1. 使うモードを選ぶ

単一CH用の設定ファイルを2種類用意しています。

| ファイル | 向いているケース |
| --- | --- |
| `docs/js/config.single-channel-modes.js` | リスナー向け表示と配信者向け表示を両方使う |
| `docs/js/config.single-channel-listener-only.js` | リスナー向け表示だけで公開する |

迷ったら、まずはリスナーだけの `config.single-channel-listener-only.js` が一番シンプルです。

使うファイルを [docs/js/config.js](docs/js/config.js) にコピーします。

```powershell
Copy-Item docs\js\config.single-channel-listener-only.js docs\js\config.js
```

配信者モードも残す場合:

```powershell
Copy-Item docs\js\config.single-channel-modes.js docs\js\config.js
```

詳しくは [docs/js/README.config-variants.md](docs/js/README.config-variants.md) も参照してください。

### 2. docs/js/config.jsを自分用に直す

[docs/js/config.js](docs/js/config.js) の `CHANNELS` を1つだけにします。

```js
export const CHANNELS = {
  new: {
    id: 'new',
    label: 'メインch',
    listGid: '0',
    setlistGid: 'replace_with_main_setlist_gid',
  },
};

export const DEFAULT_CHANNEL = 'new';
```

`全期間` ボタンも不要なら、同じファイルで次のようにします。

```js
export const SHOW_COMBINED_CHANNEL = false;
```

`SHOW_COMBINED_CHANNEL` が `true` のままだと、1チャンネル構成でも `メインch` と `全期間` の2ボタンが表示されます。どちらも同じような集計になるため、1チャンネル運用では `false` の方が分かりやすいです。

リスナー/配信者モードの切り替えも消したい場合:

```js
export const SHOW_AUDIENCE_SWITCH = false;
```

この場合、画面は常にリスナーモードになります。配信者モードの「歌える曲を探す」用途も残したい場合は `true` にします。

キー表示も消したい場合:

```js
export const SHOW_SONG_KEYS = false;
```

キー情報をまだ入力しない場合は `false` のままで大丈夫です。`false` にすると、公開画面のキー表示、キー検索、キー確認済みフィルター、セトリ制作内のキー表示が出なくなります。あとからキー情報を公開したくなったら `true` にします。

### 3. D1のchannelsを1行にする

[d1/schema.sql](d1/schema.sql) の最後にある `INSERT INTO channels` を1行だけにします。

```sql
INSERT INTO channels (code, name, sort_order)
VALUES
  ('new', 'メインch', 1)
ON CONFLICT(code) DO UPDATE SET
  name = excluded.name,
  sort_order = excluded.sort_order;
```

すでにD1へ2行作ってしまった後で1チャンネルに変える場合は、D1 Consoleで次を実行します。

```sql
DELETE FROM channels WHERE code = 'old';
UPDATE channels SET name = 'メインch', sort_order = 1 WHERE code = 'new';
```

注意: すでに `old` 側に歌枠データを入れている場合、`old` を削除すると関連データも消える可能性があります。移行後に消すか、先にバックアップしてください。

### 4. Supabase旧運用を使う場合も1行にする

Supabaseを使わない場合、この手順は不要です。

旧Supabase運用も使うなら、[supabase/schema.sql](supabase/schema.sql) の `INSERT INTO channels` も同じように1行にします。

```sql
INSERT INTO channels (code, name, sort_order)
VALUES
  ('new', 'メインch', 1)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;
```

### 5. HTMLの初期表示文を合わせる

チャンネルボタン自体はJavaScriptが `docs/js/config.js` から作り直すため、基本的にはHTMLを大きく触らなくて大丈夫です。

ただし、JavaScript読み込み前に一瞬表示される初期HTMLも整えたい場合は、[docs/index.html](docs/index.html) の `channel-switch` を次のようにします。

```html
<div class="channel-switch" id="channel-switch" role="group" aria-label="チャンネル切替">
  <button class="ch-btn active" data-channel="new" type="button">メインch</button>
</div>
```

`SHOW_COMBINED_CHANNEL = false` にしている場合は、`data-channel="all"` の `全期間` ボタンも消してOKです。

リスナー/配信者モードも消す場合は、初期HTMLの `audience-switch` も消してOKです。ただし、`SHOW_AUDIENCE_SWITCH = false` にしていればJavaScript側で非表示になるため、初心者は無理にHTMLを削らなくても大丈夫です。

### 6. 説明文を1チャンネル向けに直す

[docs/index.html](docs/index.html) にある説明文も、必要なら次のように直します。

```text
メインchの歌唱データを、ランキング・曲リスト・タイムラインで確認できます。
```

標準テンプレートには `メインch・サブch・全期間` という説明が入っているため、公開前に自分の構成に合わせてください。

### 7. 確認すること

公開前に次を確認します。

```text
ヘッダーに不要なサブchボタンが出ていない
全期間ボタンを消したい場合、表示されていない
リスナーだけにした場合、リスナー/配信者切り替えが表示されていない
URLに ?ch=old を付けてもメインch表示に戻る
ランキングとタイムラインがメインchのデータで表示される
/api/data を使う場合、channels に old が残っていない
```

## D1初期化

Cloudflare D1 Consoleでテーブルを作ります。

1. `d1/schema.sql` を実行する
2. PagesのD1 binding名を `DB` にする

このプロジェクトでは、動的APIが `env.DB` を読んでいます。binding名を変えた場合は `functions/api/data.js` と `functions/api/d1-test.js` も合わせて変更してください。

標準の静的JSON運用だけなら、公開サイトは `docs/data/*.json` を先に読むため、D1 bindingがなくても画面表示はできます。`/api/data` や `/api/d1-test` でD1を直接確認したい場合は、D1 bindingを設定してください。

Cloudflare Pagesの環境変数には、必要に応じて次も設定します。

```text
ORIGINAL_GENRE_KEYWORDS=Vtuber名,ユニット名,オリジナル企画名
```

Cloudflare Pagesの作成、D1 binding、API token、Supabase旧運用の詳細は [INFRA_SETUP.md](INFRA_SETUP.md) を参照してください。

## GitHubへ置く

公開サイトとして運用する場合は、GitHub repositoryへpushし、Cloudflare Pagesからそのrepositoryを接続します。

最初に確認します。

```powershell
git status
```

GitHubへ入れてよいもの:

```text
docs/
functions/
d1/
supabase/schema.sql
admin-server/env.example
README.md
VTUBER_SETUP.md
INFRA_SETUP.md
AI_HELP_PROMPTS.md
```

GitHubへ入れないもの:

```text
admin-server/.env
Cloudflare API token
Supabase secret key
ADMIN_TOKEN
HARファイル
ログ
ローカルDB
個人情報が写ったスクリーンショット
```

commitとpushの例:

```powershell
git add .
git commit -m "Prepare songlist site"
git push
```

Cloudflare Pages側では、GitHub repositoryを選んで次のように設定します。

```text
Production branch: main
Framework preset: None
Build command: 空欄
Build output directory: docs
Root directory: 空欄またはリポジトリルート
```

GitHubやCloudflare Pagesで詰まった場合も、tokenやsecret keyは貼らず、[AI_HELP_PROMPTS.md](AI_HELP_PROMPTS.md) のテンプレートに `xxxxx` として相談してください。

## 管理サーバー設定

`admin-server/env.example` を `admin-server/.env` にコピーして、自分の値を入れます。

```env
CLOUDFLARE_ACCOUNT_ID=replace_with_cloudflare_account_id
CLOUDFLARE_D1_DATABASE_ID=replace_with_d1_database_id
CLOUDFLARE_API_TOKEN=replace_with_cloudflare_api_token
ADMIN_HOST=127.0.0.1
ADMIN_PORT=8788
ADMIN_TOKEN=replace_with_private_admin_password
ADMIN_TITLE=replace_with_vtuber_name 歌枠管理
ORIGINAL_GENRE_KEYWORDS=replace_with_vtuber_name,replace_with_unit_name
KEY_REFERENCE_CSV_URL=https://docs.google.com/spreadsheets/d/your_spreadsheet_id/edit?gid=your_gid#gid=your_gid
```

起動します。

```powershell
node admin-server\server.js
```

ブラウザで確認します。

```text
http://127.0.0.1:8788
```

Tailscaleで同じtailnet内だけに出す場合:

```powershell
tailscale serve http://127.0.0.1:8788
```

## Spreadsheetから取り込む

Supabase向けの既存インポートツールは、環境変数でSpreadsheetを差し替えられます。

```powershell
$env:SONGLIST_SPREADSHEET_ID="your_spreadsheet_id"
$env:SONGLIST_NEW_LIST_GID="0"
$env:SONGLIST_NEW_SETLIST_GID="123456789"
$env:SONGLIST_OLD_LIST_GID="987654321"
$env:SONGLIST_OLD_SETLIST_GID="234567890"
```

D1を主運用にする場合は、管理画面から歌枠を追加するか、D1用のCSV/SQLインポートを使います。公開テンプレートに同梱している `docs/data/*.json` は表示確認用の架空サンプルなので、実運用では自分のD1データから作り直してください。

## 公開前チェック

- GitHub repositoryへ入れる前に `git status` を確認した
- `.env`、HAR、ログ、ローカルDB、個人情報入り画像がGitに入っていない
- `docs/index.html` に別Vtuberさんの名前・公式リンク・説明文が入っている
- `docs/js/config.js` のSpreadsheet ID/GIDが自分のものになっている
- `admin-server/.env` に本物のCloudflare値を入れ、Gitに入れていない
- Cloudflare Pagesの `ORIGINAL_GENRE_KEYWORDS` が自分用になっている
- Cloudflare PagesのD1 binding名が `DB` になっている
- `/api/d1-test` がD1を読める
- `/api/data` がエラーを返さない
- トップページで曲数・歌枠数・ランキング・タイムラインが表示される
- `robots.txt` と `sitemap.xml` のURLが公開URLになっている

## AIへ相談するとき

設定で詰まったら、[AI_HELP_PROMPTS.md](AI_HELP_PROMPTS.md) を使ってください。ChatGPTやGeminiへそのまま貼れる形で、Cloudflare Pages、D1、Supabase、admin-server別の相談文を用意しています。

## 秘密情報の扱い

Cloudflare API token、D1 database ID、管理トークン、Supabase secret keyは公開しません。

`.env` は `.gitignore` に入っています。チャット、README、公開HTML、GitHub issueにも貼らないでください。漏れた場合はCloudflareまたはSupabase側で即ローテーションします。
