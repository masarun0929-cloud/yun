# 用語集

このファイルは、フロントエンド、デプロイ、D1、GitHubなどの言葉に慣れていない人向けの説明です。

## まず覚える言葉

| 用語 | 意味 | このプロジェクトでは |
| --- | --- | --- |
| フロントエンド | ブラウザに表示される画面のこと | `docs/` のHTML、CSS、JavaScript |
| バックエンド | 画面の裏側でデータを処理する仕組み | `functions/api/data.js` や `admin-server/` |
| デプロイ | 作ったサイトをインターネット上で見られるように反映すること | GitHubへpushするとCloudflare Pagesが公開する |
| ビルド | 公開前にファイルを変換・準備する処理 | このテンプレートでは基本的に不要。Build commandは空欄 |
| リポジトリ | Gitで管理するプロジェクト一式 | GitHubに置くこのフォルダ全体 |
| commit | 変更内容をGitに記録すること | 「ここまで作業した」という保存ポイント |
| push | ローカルのcommitをGitHubへ送ること | push後にCloudflare Pagesが自動デプロイする |
| clone | GitHub上のリポジトリをPCへコピーすること | 他の人がテンプレートを使い始めるときに使う |
| branch | 作業の分岐 | 通常は `main` だけでOK |

## サイトのファイル

| 用語 | 意味 | 触る場所 |
| --- | --- | --- |
| HTML | 画面の骨組み | `docs/index.html` |
| CSS | 色、余白、レイアウトなど見た目 | `docs/css/` |
| JavaScript | 検索、切り替え、グラフなどの動き | `docs/js/` |
| config | サイト名やリンクなどの設定 | `docs/js/config.js` |
| 静的ファイル | サーバー処理なしでそのまま配れるファイル | `docs/` の中身 |
| 静的JSON | 公開サイトが読むデータファイル | `docs/data/*.json` |

## データ関係

| 用語 | 意味 | このプロジェクトでは |
| --- | --- | --- |
| JSON | データ保存形式のひとつ | `docs/data/meta.json` など |
| SQL | データベースに命令する言葉 | `d1/schema.sql` など |
| schema | テーブル構造の定義 | どんな表を作るかを書くSQL |
| table | データベース内の表 | `songs`, `streams`, `channels` など |
| D1 | CloudflareのSQLite系データベース | 歌枠や曲データの編集元 |
| Supabase | データベースサービス | 旧運用やSpreadsheet移行用。新規では必須ではない |
| API | データを受け渡しする入口 | `/api/data`, `/api/d1-test` |
| binding | Cloudflare Pages FunctionsへD1などを渡す設定 | D1 binding名は `DB` |

## Cloudflare

| 用語 | 意味 | このプロジェクトでは |
| --- | --- | --- |
| Cloudflare Pages | 静的サイトを公開するサービス | `docs/` を公開する |
| Pages Functions | Pages上で動く小さなバックエンド | `functions/api/data.js` |
| Production | 本番公開環境 | 実際に見てもらうサイト |
| Preview | 確認用の仮環境 | branchやPRごとの確認に使う場合がある |
| Environment variables | Cloudflare側に置く設定値 | `ORIGINAL_GENRE_KEYWORDS` など |
| Secret | 外に見せてはいけない環境変数 | API tokenなど。公開HTMLへ出さない |
| D1 database ID | D1を識別するID | `admin-server/.env` に入れる |
| Account ID | CloudflareアカウントのID | `admin-server/.env` に入れる |
| API token | Cloudflare APIを使うための鍵 | GitHubへ入れない |

## GitHub

| 用語 | 意味 | よく使うコマンド |
| --- | --- | --- |
| status | 変更されたファイルを見る | `git status` |
| add | commit対象に入れる | `git add .` |
| commit | 変更を記録する | `git commit -m "message"` |
| push | GitHubへ送る | `git push` |
| remote | GitHub側の接続先 | `git remote -v` |
| .gitignore | Gitに入れないファイルの指定 | `.env`, HAR, logなどを除外 |

## 管理画面

| 用語 | 意味 | このプロジェクトでは |
| --- | --- | --- |
| admin-server | ローカル用の管理画面 | `admin-server/server.js` |
| localhost | 自分のPCだけで見られるURL | `http://127.0.0.1:8788` |
| Tailscale | 自分の端末だけで安全に繋ぐ仕組み | 管理画面を外に直接公開しないために使う |
| ADMIN_TOKEN | 管理画面用の簡易パスワード | `.env` に入れ、GitHubへ入れない |

## 公開前に注意する言葉

| 用語 | 注意点 |
| --- | --- |
| `.env` | 本物のtokenやIDを入れるローカルファイル。GitHubへ入れない |
| HAR | ブラウザ通信ログ。CookieやURLが入ることがあるので公開しない |
| log | エラーや通信内容が残ることがあるので公開しない |
| service_role key | Supabaseの強い権限キー。絶対に公開しない |
| Bearer token | API認証用の鍵。チャットやGitHubへ貼らない |

## よくある読み替え

```text
デプロイする = GitHubへpushしてCloudflare Pagesに反映する
環境変数を設定する = Cloudflareや.envに設定値を書く
bindingする = Cloudflare Pages FunctionsからD1を使えるように接続する
schemaを流す = D1 ConsoleやSQL Editorでschema.sqlを実行する
静的JSONを生成する = 管理画面からdocs/data/*.jsonを作る
```

迷ったら、まずは次の3つだけ覚えれば大丈夫です。

```text
docs/ は公開サイト
admin-server/ は管理画面
.env は秘密情報なので公開しない
```
