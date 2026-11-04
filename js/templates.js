/**
 * リッチメニュースタジオの、テンプレートとグリッドの中身（index.html から読む。app.js が window.RichMenuTemplates として使う）。
 * - TEMPLATES：はじめから用意したメニューの形（背景のグラデーション・エリアの位置は 0〜1 の割合）
 * - GRID_PRESETS：グリッドのボタン（行×列）
 * - templateAreas：テンプレートのエリアを、メニューの実寸の位置と見た目にする
 * - gridAreas：行×列のグリッドのエリアの位置と色
 * 画面には触らない。ブラウザでは window.RichMenuTemplates、node のテストでは require で使う。
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  else root.RichMenuTemplates = mod;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // エリアの色を決めていないときの色（グリッドは2色を交互に）
  var AREA_COLOR = "#1B7A43";
  var AREA_COLOR_ALT = "#0F5C33";

  var TEMPLATES = [
    {
      name: "シンプル基本形",
      desc: "6ボタン・情報整理向け",
      size: "full",
      bg: { colors: ["#123524", "#0B3B21"], angle: 160 },
      areas: [
        { xr: 0, yr: 0, wr: 1 / 3, hr: 0.5, label: "お知らせ", icon: "📣", bgColor: "#15613F" },
        { xr: 1 / 3, yr: 0, wr: 1 / 3, hr: 0.5, label: "予約", icon: "📅", bgColor: "#0C4A30" },
        { xr: 2 / 3, yr: 0, wr: 1 / 3, hr: 0.5, label: "メニュー", icon: "📖", bgColor: "#15613F" },
        { xr: 0, yr: 0.5, wr: 1 / 3, hr: 0.5, label: "アクセス", icon: "📍", bgColor: "#0C4A30" },
        { xr: 1 / 3, yr: 0.5, wr: 1 / 3, hr: 0.5, label: "クーポン", icon: "🎟️", bgColor: "#15613F" },
        { xr: 2 / 3, yr: 0.5, wr: 1 / 3, hr: 0.5, label: "お問い合わせ", icon: "💬", bgColor: "#0C4A30" }
      ]
    },
    {
      name: "ヒーロー+3ボタン",
      desc: "訴求バナー付き",
      size: "full",
      bg: { colors: ["#1F1147", "#4A2E8A"], angle: 135 },
      areas: [
        { xr: 0, yr: 0, wr: 1, hr: 0.62, label: "今日のおすすめ", icon: "✨", transparent: true, border: "none", fontWeight: "extrabold", fontSize: 96, textShadow: true },
        { xr: 0, yr: 0.62, wr: 1 / 3, hr: 0.38, label: "予約する", icon: "📅", bgColor: "#B33951", border: "shadow", radius: 22 },
        { xr: 1 / 3, yr: 0.62, wr: 1 / 3, hr: 0.38, label: "メニュー", icon: "📖", bgColor: "#1D5C63", border: "shadow", radius: 22 },
        { xr: 2 / 3, yr: 0.62, wr: 1 / 3, hr: 0.38, label: "クーポン", icon: "🎟️", bgColor: "#4C3B4D", border: "shadow", radius: 22 }
      ]
    },
    {
      name: "左右2分割",
      desc: "予約 / 問い合わせの2択",
      size: "full",
      bg: { colors: ["#092635", "#1B4242"], angle: 120 },
      areas: [
        { xr: 0, yr: 0, wr: 0.5, hr: 1, label: "予約する", icon: "📅", bgColor: "#134E4A", border: "shadow", radius: 28, fontWeight: "extrabold", fontSize: 64 },
        { xr: 0.5, yr: 0, wr: 0.5, hr: 1, label: "お問い合わせ", icon: "💬", bgColor: "#0F766E", border: "shadow", radius: 28, fontWeight: "extrabold", fontSize: 64 }
      ]
    },
    {
      name: "下部タブ風 4分割",
      desc: "Compact・ミニマルなナビ",
      size: "compact",
      bg: { colors: ["#101820", "#1B2A38"], angle: 90 },
      areas: [
        { xr: 0, yr: 0, wr: 0.25, hr: 1, label: "ホーム", icon: "🏠", transparent: true, border: "none", fontWeight: "semibold", fontSize: 34, textShadow: true },
        { xr: 0.25, yr: 0, wr: 0.25, hr: 1, label: "予約", icon: "📅", transparent: true, border: "none", fontWeight: "semibold", fontSize: 34, textShadow: true },
        { xr: 0.5, yr: 0, wr: 0.25, hr: 1, label: "マイページ", icon: "👤", transparent: true, border: "none", fontWeight: "semibold", fontSize: 34, textShadow: true },
        { xr: 0.75, yr: 0, wr: 0.25, hr: 1, label: "設定", icon: "⚙️", transparent: true, border: "none", fontWeight: "semibold", fontSize: 34, textShadow: true }
      ]
    },
    {
      name: "ファミリーログ",
      desc: "体調・出来事などの家族記録",
      size: "full",
      bg: { colors: ["#3E2723", "#6D4C41"], angle: 135 },
      areas: [
        { xr: 0, yr: 0, wr: 0.5, hr: 0.5, label: "体調", icon: "🩺", bgColor: "#8D6E63" },
        { xr: 0.5, yr: 0, wr: 0.5, hr: 0.5, label: "出来事", icon: "📌", bgColor: "#795548" },
        { xr: 0, yr: 0.5, wr: 1 / 3, hr: 0.5, label: "買い物", icon: "🛒", bgColor: "#A1887F" },
        { xr: 1 / 3, yr: 0.5, wr: 1 / 3, hr: 0.5, label: "家事", icon: "🧺", bgColor: "#6D4C41" },
        { xr: 2 / 3, yr: 0.5, wr: 1 / 3, hr: 0.5, label: "自由記録", icon: "📝", bgColor: "#5D4037" }
      ]
    }
  ];

  var GRID_PRESETS = [
    { rows: 1, cols: 1, label: "全面 1つ" },
    { rows: 1, cols: 2, label: "1×2" },
    { rows: 2, cols: 2, label: "2×2" },
    { rows: 2, cols: 3, label: "2×3" },
    { rows: 3, cols: 2, label: "3×2" },
    { rows: 1, cols: 3, label: "1×3" }
  ];

  /**
   * テンプレートのエリアを、メニュー（width・height）の実寸にする。
   * 返すのは、エリアを作るときに上書きする値（label・位置・色・枠・文字）の並び。
   */
  function templateAreas(template, menu) {
    return template.areas.map(function (spec) {
      var transparent = !!spec.transparent;
      return {
        label: spec.label,
        x: Math.round(spec.xr * menu.width),
        y: Math.round(spec.yr * menu.height),
        w: Math.round(spec.wr * menu.width),
        h: Math.round(spec.hr * menu.height),
        icon: spec.icon || "",
        bgColor: spec.bgColor || AREA_COLOR,
        textColor: spec.textColor || "#FFFFFF",
        transparent: transparent,
        radius: spec.radius !== undefined ? spec.radius : 16,
        border: spec.border || "line",
        fontWeight: spec.fontWeight || "bold",
        fontSize: spec.fontSize || null,
        textShadow: spec.textShadow !== undefined ? spec.textShadow : transparent
      };
    });
  }

  /** rows×cols のグリッドのエリア（左上から順に。名前は「エリア1」から、色は2色を交互に） */
  function gridAreas(rows, cols, menu) {
    var cellW = Math.floor(menu.width / cols);
    var cellH = Math.floor(menu.height / rows);
    var areas = [];
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var n = areas.length + 1;
        areas.push({
          label: "エリア" + n,
          x: c * cellW,
          y: r * cellH,
          w: cellW,
          h: cellH,
          bgColor: n % 2 === 0 ? AREA_COLOR_ALT : AREA_COLOR
        });
      }
    }
    return areas;
  }

  return {
    TEMPLATES: TEMPLATES,
    GRID_PRESETS: GRID_PRESETS,
    templateAreas: templateAreas,
    gridAreas: gridAreas
  };
});
