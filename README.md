# Rich Menu Studio

LINE リッチメニューをブラウザ上でデザインし、Messaging API にそのまま渡せる画像(PNG)と `richmenu` JSON を書き出すツールです。

## 使い方

1. https://katsuan.github.io/line-richmenu-studio/ を開く
2. サイズ(Full / Compact)を選び、グリッドプリセットまたはドラッグでエリアを作成
3. 各エリアにラベル・色・タップ時のアクション(message / postback / uri)を設定
4. 「PNGを書き出す」でリッチメニュー画像、「JSONをダウンロード」で `richmenu` オブジェクトを取得
5. 書き出した JSON をそのまま `POST https://api.line.me/v2/bot/richmenu` に渡し、返ってきた `richMenuId` に対して PNG を `POST https://api-data.line.me/v2/bot/richmenu/{richMenuId}/content` でアップロードする

## ローカルで確認する

```bash
python3 -m http.server 8000
```

`index.html` は外部ライブラリに依存しない単一ファイルです(フォントのみ Google Fonts を使用)。
