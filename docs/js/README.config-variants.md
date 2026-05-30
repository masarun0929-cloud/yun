# Config variants

`docs/js/config.js` はサイトの表示名、リンク、チャンネル、モード表示をまとめた設定ファイルです。

単一チャンネル用に、コピーして使える設定ファイルを用意しています。

| ファイル | 用途 |
| --- | --- |
| `config.single-channel-modes.js` | 1チャンネル + リスナーモード/配信者モード |
| `config.single-channel-listener-only.js` | 1チャンネル + リスナーモードだけ |

使い方:

1. 使いたいファイルを選ぶ
2. その内容で `docs/js/config.js` を置き換える
3. `replace_with_...` の値を自分用に変える
4. 必要なら `docs/index.html` の説明文も1チャンネル向けに変える

PowerShell例:

```powershell
Copy-Item docs\js\config.single-channel-listener-only.js docs\js\config.js
```

`SHOW_COMBINED_CHANNEL = false` にすると、全期間ボタンは表示されません。

`SHOW_AUDIENCE_SWITCH = false` にすると、リスナー/配信者モード切替は表示されず、常にリスナーモードになります。

`SHOW_SONG_KEYS = false` にすると、公開画面のキー表示、キー検索、キー確認済みフィルターは表示されません。キー情報をまだ入力しない場合は `false` のままで大丈夫です。
