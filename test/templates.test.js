// テンプレートとグリッドの中身のテスト。  node --test test/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const core = require("../js/richmenu.js");
const tpl = require("../js/templates.js");

const inside = (a, menu) => a.x >= 0 && a.y >= 0 && a.w > 0 && a.h > 0 && a.x + a.w <= menu.width && a.y + a.h <= menu.height;

test("どのテンプレートも、エリアがメニューの中に入り、LINE の数の上限より少ない", () => {
  for (const t of tpl.TEMPLATES) {
    const menu = core.SIZES[t.size];
    const areas = tpl.templateAreas(t, menu);
    assert.ok(areas.length > 0 && areas.length <= core.LIMIT.AREAS, t.name);
    for (const a of areas) assert.ok(inside(a, menu), t.name + " / " + a.label);
    assert.ok(t.bg.colors.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c)), t.name);
  }
});

test("テンプレートのエリアは、書き出すと LINE に断られない", () => {
  for (const t of tpl.TEMPLATES) {
    const size = core.SIZES[t.size];
    const menu = { id: "id1", size: t.size, width: size.width, height: size.height, name: t.name, chatBarText: "メニュー", areas: [] };
    menu.areas = tpl.templateAreas(t, menu).map((a, i) => ({ ...a, id: "id" + (i + 2), actionType: "message", actionValue: a.label }));
    for (const a of menu.areas) assert.equal(core.actionError(a, [menu]), "", t.name + " / " + a.label);
    const json = core.buildRichMenuObject(menu, [menu]);
    for (const area of json.areas) {
      assert.ok(area.bounds.x + area.bounds.width <= size.width);
      assert.ok(area.bounds.y + area.bounds.height <= size.height);
    }
  }
});

test("透明なエリアは、決めていなければ文字に影が付く", () => {
  const t = { areas: [{ xr: 0, yr: 0, wr: 1, hr: 1, label: "a", transparent: true }, { xr: 0, yr: 0, wr: 1, hr: 1, label: "b" }] };
  const [a, b] = tpl.templateAreas(t, core.SIZES.full);
  assert.equal(a.textShadow, true);
  assert.equal(b.textShadow, false);
  assert.equal(b.radius, 16);
  assert.equal(b.border, "line");
});

test("グリッドは行×列のエリアを左上から並べ、色を交互にする", () => {
  for (const p of tpl.GRID_PRESETS) {
    for (const size of Object.values(core.SIZES)) {
      const areas = tpl.gridAreas(p.rows, p.cols, size);
      assert.equal(areas.length, p.rows * p.cols);
      assert.ok(areas.length <= core.LIMIT.AREAS);
      areas.forEach((a, i) => {
        assert.ok(inside(a, size));
        assert.equal(a.label, "エリア" + (i + 1));
      });
    }
  }
  const two = tpl.gridAreas(1, 2, core.SIZES.full);
  assert.notEqual(two[0].bgColor, two[1].bgColor);
  assert.deepEqual([two[1].x, two[1].w], [1250, 1250]);
});

test("字の大きさは高さに合わせて 24〜88、太さは名前から", () => {
  assert.equal(core.autoFontSize({ h: 10 }), 24);
  assert.equal(core.autoFontSize({ h: 500 }), 70);
  assert.equal(core.autoFontSize({ h: 5000 }), 88);
  assert.deepEqual(["regular", "semibold", "bold", "extrabold", "?"].map(core.fontWeightCss), [500, 600, 700, 800, 700]);
});
