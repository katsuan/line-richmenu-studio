// リッチメニュースタジオの、画面に触らない部分のテスト。  node --test test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const core = require("../js/richmenu.js");

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const area = (over = {}) => ({
  id: "id2", x: 0, y: 0, w: 1250, h: 843, label: "予約", icon: "📅", image: null,
  bgColor: "#1B7A43", textColor: "#FFFFFF", transparent: false, radius: 16, border: "line",
  fontWeight: "bold", fontSize: null, textShadow: false, actionType: "message", actionValue: "予約", targetMenuId: null,
  ...over,
});
const menu = (over = {}) => ({
  id: "id1", alias: "tab1", size: "full", width: 2500, height: 1686, name: "メイン", chatBarText: "メニュー",
  bgColor: "#0B3B21", bgImage: null, areas: [area()], selectedId: "id2", ...over,
});

test("いつもの中身は、そのまま読める", () => {
  const saved = { activeMenuIndex: 0, menus: [menu({ bgImage: PNG })] };
  const state = core.normalizeState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(state, saved);
  assert.equal(core.nextIdNumber(state), 3);
});

test("壊れた中身・空の中身は読まない（はじめから作る）", () => {
  for (const bad of [null, "x", 1, {}, { menus: "x" }, { menus: [] }, { menus: [{ id: "<b>" }] }]) {
    assert.equal(core.normalizeState(bad), null);
  }
});

test("HTML に入る値は、決まった形のものだけ残る", () => {
  const evil = '"><img src=x onerror=alert(1)>'; // qcheck-ok: W8 テストで入れる危ない文字
  const state = core.normalizeState({
    activeMenuIndex: 0,
    menus: [
      menu({
        bgColor: evil,
        bgImage: 'x) ; background:url("https://example.com/")',
        areas: [
          area({ bgColor: evil, textColor: evil, actionType: evil, border: evil, fontWeight: evil, image: "javascript:alert(1)" }), // qcheck-ok: W8 テストで入れる危ない文字
          area({ id: evil }),
        ],
      }),
      menu({ id: evil }),
    ],
  });
  assert.equal(state.menus.length, 1);
  const m = state.menus[0];
  assert.equal(m.bgColor, "#0B3B21");
  assert.equal(m.bgImage, null);
  assert.equal(m.areas.length, 1);
  const a = m.areas[0];
  assert.deepEqual([a.bgColor, a.textColor, a.actionType, a.border, a.fontWeight, a.image], ["#1B7A43", "#FFFFFF", "message", "line", "bold", null]);
  // 文字（ラベルなど）は残し、画面に出すときに esc する
  const s = core.normalizeState({ menus: [menu({ areas: [area({ label: evil })] })] });
  assert.equal(s.menus[0].areas[0].label, evil);
});

test("数・長さ・位置の範囲をそろえる", () => {
  const many = Array.from({ length: 40 }, (_, i) => area({ id: "id" + (i + 10) }));
  const state = core.normalizeState({
    activeMenuIndex: 99,
    menus: [menu({ size: "compact", name: "あ".repeat(5000), areas: [area({ x: -50, y: 9999, w: 1e9, h: "100", radius: NaN }), ...many] })],
  });
  const m = state.menus[0];
  assert.equal(state.activeMenuIndex, 0);
  assert.equal(m.height, 843);
  assert.equal(m.name.length, core.LIMIT.NAME);
  assert.equal(m.areas.length, core.LIMIT.AREAS);
  const a = m.areas[0];
  assert.deepEqual([a.x, a.w, a.radius], [0, 2500, 16]);
  assert.ok(a.y + a.h <= 843);
  const tooMany = { menus: Array.from({ length: 50 }, (_, i) => menu({ id: "id" + (100 + i), areas: [] })) };
  assert.equal(core.normalizeState(tooMany).menus.length, core.LIMIT.MENUS);
});

test("消えたタブへの切りかえは外す", () => {
  const state = core.normalizeState({ menus: [menu({ areas: [area({ actionType: "richmenuswitch", targetMenuId: "id77" })] })] });
  assert.equal(state.menus[0].areas[0].targetMenuId, null);
});

test("書き出す JSON は LINE の richmenu の形", () => {
  const main = menu({
    areas: [
      area({ id: "id2", x: 0.4, w: 1250.6, actionType: "postback", actionValue: "a=1" }),
      area({ id: "id3", x: 1250, actionType: "uri", actionValue: "https://example.com" }),
      area({ id: "id4", y: 843, actionType: "richmenuswitch", targetMenuId: "id9", actionValue: "go" }),
      area({ id: "id5", y: 843, x: 1250, actionValue: "" }),
    ],
    chatBarText: "とても長いメニューの名前ですよね",
  });
  const sub = menu({ id: "id9", alias: "tab2", areas: [] });
  const json = core.buildRichMenuObject(main, [main, sub]);
  assert.deepEqual(json.size, { width: 2500, height: 1686 });
  assert.equal(json.chatBarText.length, 14);
  assert.deepEqual(json.areas[0].bounds, { x: 0, y: 0, width: 1251, height: 843 });
  assert.deepEqual(json.areas.map((a) => a.action.type), ["postback", "uri", "richmenuswitch", "message"]);
  assert.equal(json.areas[2].action.richMenuAliasId, "tab2");
  assert.equal(json.areas[3].action.text, "予約");
  // JSON にしても中身が変わらない（そのまま API に渡せる）
  assert.deepEqual(JSON.parse(JSON.stringify(json)).areas.length, 4);
});

test("ボタンの範囲は、四捨五入してもメニューの外にはみ出さない", () => {
  // ドラッグで小数になった位置（右下ぎりぎり）
  const m = menu({ areas: [area({ x: 1249.5, w: 1250.5, y: 842.5, h: 843.5 })] });
  const b = core.buildRichMenuObject(m, [m]).areas[0].bounds;
  assert.ok(b.x + b.width <= 2500, JSON.stringify(b));
  assert.ok(b.y + b.height <= 1686, JSON.stringify(b));
  assert.ok(b.width >= 1250 && b.height >= 843);
});

test("LINE に断られるアクションを、書き出す前に知らせる", () => {
  const sub = menu({ id: "id9", alias: "tab2", areas: [] });
  const err = (over) => core.actionError(area(over), [menu(), sub]);
  assert.equal(err({}), "");
  assert.equal(err({ actionType: "uri", actionValue: "https://example.com" }), "");
  assert.equal(err({ actionType: "richmenuswitch", targetMenuId: "id9" }), "");
  assert.equal(err({ actionType: "postback", actionValue: "a=1", label: "" }), "");
  // 送る文字が空（ラベルも空）
  assert.ok(err({ actionValue: "", label: "" }));
  assert.ok(err({ actionValue: "あ".repeat(301) }));
  assert.ok(err({ actionType: "postback", actionValue: "" }));
  assert.ok(err({ actionType: "postback", actionValue: "x".repeat(301) }));
  assert.ok(err({ actionType: "uri", actionValue: "" }));
  assert.ok(err({ actionType: "uri", actionValue: "javascript:alert(1)" })); // qcheck-ok: W8 テストで入れる危ない文字
  assert.ok(err({ actionType: "uri", actionValue: "https://example.com/" + "a".repeat(1000) }));
  assert.ok(err({ actionType: "richmenuswitch", targetMenuId: null }));
  assert.ok(err({ actionType: "richmenuswitch", targetMenuId: "id9", actionValue: "x".repeat(301) }));
});

test("大きな画像は、メニューの大きさまで縮める（形は変えない）", () => {
  assert.deepEqual(core.fitSize(4000, 3000, 2500, 1686), { width: 2248, height: 1686 });
  assert.deepEqual(core.fitSize(6000, 1000, 2500, 1686), { width: 2500, height: 417 });
  assert.deepEqual(core.fitSize(800, 600, 2500, 1686), { width: 800, height: 600 });
  assert.equal(core.LIMIT.LINE_IMAGE, 1024 * 1024);
});

test("前の名前の core.js は、js/richmenu.js と同じ中身（古い画面を覚えている LINE のため。2026-11-25 に消す）", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  assert.equal(read("core.js"), read("js/richmenu.js"));
});
