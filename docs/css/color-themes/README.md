# Color theme files

サイトの色だけを差し替えるためのCSSです。

使い方:

1. 使いたいテーマCSSを選ぶ
2. [docs/index.html](../../index.html) の `css/theme.css` の直後に読み込む

```html
<link rel="stylesheet" href="css/theme.css">
<link rel="stylesheet" href="css/color-themes/theme-sakura-pink.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/views.css">
```

`theme.css` はレイアウトや共通CSSも含むので消さず、色テーマCSSを後ろに追加してください。

テーマ一覧:

| ファイル | 印象 |
| --- | --- |
| `theme-sakura-pink.css` | さくらピンク。やわらかくかわいい |
| `theme-sky-blue.css` | 空色ブルー。清潔感と透明感 |
| `theme-mint-green.css` | ミントグリーン。爽やかで軽い |
| `theme-lemon-yellow.css` | レモンイエロー。明るく元気 |
| `theme-lavender-purple.css` | ラベンダーパープル。上品で少し幻想的 |
| `theme-night-navy.css` | ナイトネイビー。夜・クール・配信感 |

全ファイルとも、ライト/ダーク/自動テーマのCSS変数を上書きします。
