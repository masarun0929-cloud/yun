# さざなみゆん歌唱データベース 公開セットアップ

この手順は、さざなみゆん歌唱データベースを GitHub + Cloudflare Pages + Cloudflare D1 で公開するためのものです。

標準運用は `docs/data/*.json` を読む静的JSON公開です。D1は編集元・再生成元として使います。ライブ情報タブは使いません。

## 1. GitHub

このリポジトリをGitHubへpushします。

Cloudflare Pagesではリポジトリ直下をRoot directoryにします。`docs` をRoot directoryにはしません。`functions/` もCloudflare Pages Functionsとして使うためです。

## 2. Cloudflare Pages

Cloudflare Dashboardで:

1. `Workers & Pages` を開く
2. `Create` を押す
3. `Pages` を選ぶ
4. GitHub repositoryを選ぶ

Build settings:

```text
Root directory: 空欄（リポジトリ直下）
Build command:
Build output directory: docs
```

Build commandは空欄で大丈夫です。

公開後の確認URL:

```text
https://<pages-project>.pages.dev/
https://<pages-project>.pages.dev/data/songs.json
https://<pages-project>.pages.dev/data/streams.json
https://<pages-project>.pages.dev/api/data
```

## 3. Cloudflare D1

Cloudflare Dashboardで:

1. `Workers & Pages` または `Storage & databases` を開く
2. `D1 SQL Database` を開く
3. `Create database` を押す

Database name例:

```text
sazanami-yun-songlist-db
```

D1 ConsoleでSQLを次の順番で実行します。

1. [d1/schema.sql](d1/schema.sql)
2. [d1/generated/console](d1/generated/console) 内のSQLをファイル名順

`songlist_seed.sql` は一括実行用です。D1 Consoleでは長すぎるため、通常は `d1/generated/console` の分割SQLを使います。

確認SQL:

```sql
SELECT 'artists' AS table_name, COUNT(*) AS count FROM artists
UNION ALL
SELECT 'songs', COUNT(*) FROM songs
UNION ALL
SELECT 'song_channel_stats', COUNT(*) FROM song_channel_stats
UNION ALL
SELECT 'streams', COUNT(*) FROM streams
UNION ALL
SELECT 'stream_songs', COUNT(*) FROM stream_songs;
```

初期投入後の目安:

```text
artists: 196
songs: 282
song_channel_stats: 282
streams: 32
stream_songs: 391
```

## 4. D1 Binding

静的JSONだけで表示する場合、公開サイトの表示自体にD1 bindingは必須ではありません。

ただし `/api/data`、`/api/d1-test`、Pages FunctionsからのD1確認も使う場合は、Cloudflare PagesにD1 bindingを追加します。

Cloudflare Pagesで:

1. 対象Pages projectを開く
2. `Settings` を開く
3. `Bindings` を開く
4. `D1 database bindings` を追加する

設定:

```text
Variable name: DB
Database: 作成したD1 database
```

Variable nameは必ず `DB` にします。

## 5. Cloudflare API Token

GitHub ActionsでD1から `docs/data/*.json` を再生成するために、Cloudflare API Tokenを作ります。

Cloudflareで:

1. 右上アイコンから `My Profile`
2. `API Tokens`
3. `Create Token`
4. `Custom token`

権限の目安:

```text
Permissions: Account / D1 / Edit
Account Resources: Include / 対象Cloudflare Account
```

必要な値:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_D1_DATABASE_ID
```

`CLOUDFLARE_D1_DATABASE_ID` はD1 databaseの `Settings` または `Overview` で確認します。

## 6. GitHub Secrets

GitHub repositoryで:

1. `Settings`
2. `Secrets and variables`
3. `Actions`
4. `New repository secret`

次を追加します。

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_D1_DATABASE_ID
```

Actionsの書き込み権限も有効にします。

```text
Settings
→ Actions
→ General
→ Workflow permissions
→ Read and write permissions
```

## 7. GitHub Actions

このリポジトリには [.github/workflows/update-static-data.yml](.github/workflows/update-static-data.yml) を用意しています。

実行すると:

1. D1から曲・配信データを読む
2. `docs/data/meta.json`
3. `docs/data/songs.json`
4. `docs/data/streams.json`
5. 変更があればcommit/push

Cloudflare PagesがGitHub repositoryに接続されていれば、push後に自動デプロイされます。

## 8. 管理画面からGitHub Actionsを起動する場合

管理画面の「静的JSON生成」ボタンから `update-static-data.yml` を起動したい場合は、Cloudflare PagesのEnvironment variablesに次を設定します。

```text
ADMIN_TOKEN=好きな管理用パスワード
GITHUB_ACTIONS_TOKEN=GitHub Fine-grained Personal Access Token
GITHUB_OWNER=masarun0929-cloud
GITHUB_REPO=yun
GITHUB_STATIC_WORKFLOW=update-static-data.yml
GITHUB_STATIC_REF=main
```

`ADMIN_TOKEN` は `/admin.html` を開くときの管理用パスワードです。公開してはいけません。

`GITHUB_ACTIONS_TOKEN` は、管理画面からGitHub ActionsをdispatchするためのGitHub tokenです。CloudflareのD1用API Tokenとは別物です。

GitHub Fine-grained Personal Access Tokenの作成例:

1. GitHub右上アイコンから `Settings`
2. `Developer settings`
3. `Personal access tokens`
4. `Fine-grained tokens`
5. `Generate new token`

設定:

```text
Token name: sazanami-yun-actions-dispatch
Expiration: 90 days または 180 days
Resource owner: masarun0929-cloud
Repository access: Only select repositories
Selected repositories: GITHUB_REPOに設定するrepository
```

Permissions:

```text
Actions: Read and write
Metadata: Read-only
```

作成後に表示されるtokenを `GITHUB_ACTIONS_TOKEN` としてCloudflare Pagesに登録します。tokenは再表示できないので、登録後は必要な場所に安全に保管してください。

Cloudflare PagesでEnvironment variablesを登録する場所:

```text
対象Pages project
→ Settings
→ Environment variables
```

登録・変更後はPagesを再デプロイします。

## 9. 通常の更新フロー

1. D1 Consoleまたは管理画面でデータを更新する
2. GitHub Actionsの `Update static data` を実行する
3. `docs/data/*.json` がcommitされる
4. Cloudflare Pagesが自動デプロイする
5. 公開サイトに反映される

反映確認:

```text
https://<pages-project>.pages.dev/data/songs.json?v=check1
https://<pages-project>.pages.dev/data/streams.json?v=check1
```

## 10. ローカルで再生成する場合

CSVから静的JSONとD1 seed SQLを作り直す場合:

```powershell
node tools\convert-local-csv.mjs
node tools\generate-d1-songlist-sql.mjs
node tools\split-d1-seed-sql.mjs d1\generated\songlist_seed.sql d1\generated\console 25000
```

ローカル表示:

```powershell
python -m http.server 8098 --bind 127.0.0.1 --directory docs
```

## 11. よくあるエラー

### D1 binding DB is missing

PagesのD1 binding名が `DB` ではありません。

Cloudflare Pagesの `Settings > Bindings` で、Variable nameを `DB` にします。

### Unexpected token '<'

`/api/data` がJSONではなくHTMLを返しています。

Cloudflare PagesのRoot directoryが `docs` になっている可能性があります。Root directoryはリポジトリ直下、Build output directoryは `docs` にします。

### songs.jsonが更新されない

原因候補:

- GitHub Secretsの値が違う
- D1 Database IDが違う
- GitHub ActionsのWorkflow permissionsがRead and writeではない
- D1にまだデータが入っていない

### 管理画面から静的JSON生成を押してもActionsが起動しない

原因候補:

- `GITHUB_ACTIONS_TOKEN` が未設定
- tokenのActions権限がRead and writeではない
- `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_STATIC_WORKFLOW` の値が違う
- Cloudflare Pagesの環境変数変更後に再デプロイしていない

## 12. 秘密情報

次の値はGitHub、公開HTML、チャット、ログへ貼りません。

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_D1_DATABASE_ID
ADMIN_TOKEN
GITHUB_ACTIONS_TOKEN
```

漏れた場合は、Cloudflare側でTokenを削除して作り直します。
