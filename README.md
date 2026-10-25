# Rich Menu Studio

LINE リッチメニューをブラウザ上でデザインし、Messaging API にそのまま渡せる画像(PNG)と `richmenu` JSON を書き出すツールです。

## 使い方

1. https://katsuan.github.io/line-richmenu-studio/ を開く
2. サイズ(Full / Compact)を選び、グリッドプリセットまたはドラッグでエリアを作成
3. 各エリアにラベル・色・タップ時のアクション(message / postback / uri)を設定
4. 「PNGを書き出す」でリッチメニュー画像、「JSONをダウンロード」で `richmenu` オブジェクトを取得（写真などで PNG が LINE の上限 1MB をこえるときは、1MB に入る JPEG で書き出します）
5. 書き出した JSON をそのまま `POST https://api.line.me/v2/bot/richmenu` に渡し、返ってきた `richMenuId` に対して PNG を `POST https://api-data.line.me/v2/bot/richmenu/{richMenuId}/content` でアップロードする

作っているメニューは、そのブラウザの中に残ります（次に開くと続きから。「新しく作る」で最初から）。エリアやタブを消したときは、下に出る「元に戻す」で戻せます。

## ローカルで確認する

```bash
python3 -m http.server 8000
```

| ファイル | 役わり |
|---|---|
| `index.html` | 画面（公開 URL） |
| `app.js` | 画面の入口：状態・この端末に残す・元に戻す・キャンバスの操作・設定欄・JSON と画像の書き出し・テンプレート |
| `style.css` | 見た目 |
| `js/richmenu.js` | 画面に触らない部分：この端末に残した中身を読む・richmenu の JSON を作る・LINE に断られるアクションを見つける・画像を縮める大きさ |
| `core.js` | `js/richmenu.js` の前の名前の写し（古い画面を覚えている LINE のため）。**2026-11-25 に消す** |
| `sw.js` | 電波がないときに開く仕組み（おくるんの `shared/sw-core.js`） |
| `test/` | `js/richmenu.js` のテスト |

フォントは Google Fonts、トーストなどの部品は [おくるん](https://github.com/katsuan/line-share) の共通部品（`shared/ui.css`・`ui.js`）を使います。

## テスト

`js/richmenu.js` のテストです（node の標準のテスト。npm の部品は要りません）。

```bash
node --test test/
```

チャネルのアクセストークンは、このツールには入れません（書き出した JSON と PNG を、自分の手元から LINE の API に送ります）。
