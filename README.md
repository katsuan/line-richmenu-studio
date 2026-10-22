# Rich Menu Studio

LINE リッチメニューをブラウザ上でデザインし、Messaging API にそのまま渡せる画像(PNG)と `richmenu` JSON を書き出すツールです。

## 使い方

1. https://katsuan.github.io/line-richmenu-studio/ を開く
2. サイズ(Full / Compact)を選び、グリッドプリセットまたはドラッグでエリアを作成
3. 各エリアにラベル・色・タップ時のアクション(message / postback / uri)を設定
4. 「PNGを書き出す」でリッチメニュー画像、「JSONをダウンロード」で `richmenu` オブジェクトを取得
5. 書き出した JSON をそのまま `POST https://api.line.me/v2/bot/richmenu` に渡し、返ってきた `richMenuId` に対して PNG を `POST https://api-data.line.me/v2/bot/richmenu/{richMenuId}/content` でアップロードする

作っているメニューは、そのブラウザの中に残ります（次に開くと続きから。「新しく作る」で最初から）。エリアやタブを消したときは、下に出る「元に戻す」で戻せます。

## ローカルで確認する

```bash
python3 -m http.server 8000
```

`index.html` は単一ファイルです。フォントは Google Fonts、トーストなどの部品は [おくるん](https://github.com/katsuan/line-share) の共通部品（`shared/ui.css`・`ui.js`）を使います。
