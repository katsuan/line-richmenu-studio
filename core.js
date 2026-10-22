/**
 * リッチメニュースタジオの、画面に触らない部分。
 * - normalizeState：この端末に残した中身を、使ってよい形・長さ・数にそろえて読む
 * - buildRichMenuObject：LINE の richmenu の JSON を作る
 * ブラウザでは window.RichMenuCore、node のテストでは require で使う。
 */
(function (root, factory) {
  var core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  else root.RichMenuCore = core;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SIZES = {
    full: { width: 2500, height: 1686 },
    compact: { width: 2500, height: 843 }
  };
  var LIMIT = {
    MENUS: 20,
    AREAS: 20,
    NAME: 300,        // LINE の name の上限
    ALIAS: 32,        // LINE のリッチメニューの別名の上限
    CHAT_BAR: 50,     // 画面では14字で知らせる。読むときは少し広めに残す
    LABEL: 100,
    ICON: 20,
    ACTION_VALUE: 1000,
    IMAGE: 12 * 1024 * 1024
  };
  var ID = /^id\d{1,9}$/;
  var COLOR = /^#[0-9a-fA-F]{6}$/;
  var IMAGE = /^data:image\/[a-z0-9.+-]{1,30};base64,[A-Za-z0-9+/=]+$/;
  var ACTION_TYPES = ["message", "postback", "uri", "richmenuswitch"];
  var BORDERS = ["line", "shadow", "none"];
  var WEIGHTS = ["regular", "semibold", "bold", "extrabold"];

  function text(value, max, fallback) {
    return typeof value === "string" ? value.slice(0, max) : (fallback || "");
  }
  function color(value, fallback) {
    return typeof value === "string" && COLOR.test(value) ? value : fallback;
  }
  function image(value) {
    return typeof value === "string" && value.length <= LIMIT.IMAGE && IMAGE.test(value) ? value : null;
  }
  function num(value, min, max, fallback) {
    var n = Number(value);
    if (typeof value !== "number" || !isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  }
  function oneOf(value, list, fallback) {
    return list.indexOf(value) !== -1 ? value : fallback;
  }

  function normalizeArea(a, menu) {
    if (!a || typeof a !== "object" || typeof a.id !== "string" || !ID.test(a.id)) return null;
    var w = num(a.w, 24, menu.width, 400);
    var h = num(a.h, 24, menu.height, 400);
    return {
      id: a.id,
      x: num(a.x, 0, menu.width - w, 0),
      y: num(a.y, 0, menu.height - h, 0),
      w: w,
      h: h,
      label: text(a.label, LIMIT.LABEL),
      icon: text(a.icon, LIMIT.ICON),
      image: image(a.image),
      bgColor: color(a.bgColor, "#1B7A43"),
      textColor: color(a.textColor, "#FFFFFF"),
      transparent: a.transparent === true,
      radius: num(a.radius, 0, 400, 16),
      border: oneOf(a.border, BORDERS, "line"),
      fontWeight: oneOf(a.fontWeight, WEIGHTS, "bold"),
      fontSize: a.fontSize == null ? null : num(a.fontSize, 8, 400, null),
      textShadow: a.textShadow === true,
      actionType: oneOf(a.actionType, ACTION_TYPES, "message"),
      actionValue: text(a.actionValue, LIMIT.ACTION_VALUE),
      targetMenuId: typeof a.targetMenuId === "string" && ID.test(a.targetMenuId) ? a.targetMenuId : null
    };
  }

  function normalizeMenu(m) {
    if (!m || typeof m !== "object" || typeof m.id !== "string" || !ID.test(m.id)) return null;
    var size = oneOf(m.size, ["full", "compact"], "full");
    var menu = {
      id: m.id,
      alias: text(m.alias, LIMIT.ALIAS),
      size: size,
      width: SIZES[size].width,
      height: SIZES[size].height,
      name: text(m.name, LIMIT.NAME),
      chatBarText: text(m.chatBarText, LIMIT.CHAT_BAR),
      bgColor: color(m.bgColor, "#0B3B21"),
      bgImage: image(m.bgImage),
      areas: [],
      selectedId: null
    };
    var seen = {};
    (Array.isArray(m.areas) ? m.areas : []).slice(0, LIMIT.AREAS).forEach(function (raw) {
      var area = normalizeArea(raw, menu);
      if (area && !seen[area.id]) {
        seen[area.id] = true;
        menu.areas.push(area);
      }
    });
    if (typeof m.selectedId === "string" && seen[m.selectedId]) menu.selectedId = m.selectedId;
    return menu;
  }

  /** 端末に残した中身を読む。使えないときは null（はじめから作る） */
  function normalizeState(saved) {
    if (!saved || typeof saved !== "object" || !Array.isArray(saved.menus)) return null;
    var seen = {};
    var menus = [];
    saved.menus.slice(0, LIMIT.MENUS).forEach(function (raw) {
      var menu = normalizeMenu(raw);
      if (menu && !seen[menu.id]) {
        seen[menu.id] = true;
        menus.push(menu);
      }
    });
    if (!menus.length) return null;
    // 消えたタブへの切りかえは外す
    menus.forEach(function (m) {
      m.areas.forEach(function (a) {
        if (a.targetMenuId && !seen[a.targetMenuId]) a.targetMenuId = null;
      });
    });
    return {
      activeMenuIndex: Math.floor(num(saved.activeMenuIndex, 0, menus.length - 1, 0)),
      menus: menus
    };
  }

  /** 次に作る id の番号（同じ id ができないように） */
  function nextIdNumber(state) {
    var max = 0;
    (state.menus || []).forEach(function (m) {
      max = Math.max(max, Number(m.id.slice(2)));
      m.areas.forEach(function (a) { max = Math.max(max, Number(a.id.slice(2))); });
    });
    return max + 1;
  }

  function buildAction(a, menus) {
    if (a.actionType === "postback") {
      return { type: "postback", data: a.actionValue || "", displayText: a.label || undefined };
    }
    if (a.actionType === "uri") {
      return { type: "uri", uri: a.actionValue || "https://" };
    }
    if (a.actionType === "richmenuswitch") {
      var targetMenu = null;
      for (var i = 0; i < menus.length; i += 1) {
        if (menus[i].id === a.targetMenuId) { targetMenu = menus[i]; break; }
      }
      return {
        type: "richmenuswitch",
        richMenuAliasId: targetMenu ? (targetMenu.alias || targetMenu.id) : "",
        data: a.actionValue || ""
      };
    }
    return { type: "message", text: a.actionValue || a.label || "" };
  }

  /** LINE の richmenu の JSON（POST /v2/bot/richmenu にそのまま渡せる形） */
  function buildRichMenuObject(menu, menus) {
    return {
      size: { width: menu.width, height: menu.height },
      selected: false,
      name: menu.name || "richmenu",
      chatBarText: (menu.chatBarText || "メニュー").slice(0, 14),
      areas: menu.areas.map(function (a) {
        return {
          bounds: { x: Math.round(a.x), y: Math.round(a.y), width: Math.round(a.w), height: Math.round(a.h) },
          action: buildAction(a, menus || [menu])
        };
      })
    };
  }

  return {
    SIZES: SIZES,
    LIMIT: LIMIT,
    normalizeState: normalizeState,
    nextIdNumber: nextIdNumber,
    buildRichMenuObject: buildRichMenuObject
  };
});
