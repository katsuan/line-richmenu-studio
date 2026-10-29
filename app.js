/**
 * リッチメニュースタジオの画面の入口。index.html から読む（js/richmenu.js のあと）。
 * 中に：作っているメニューの状態と、この端末に残す・元に戻す仕組み、キャンバスでエリアを作る・動かす・大きさを変える操作、
 * 右の設定欄、JSON のコピー・保存、画像（PNG／JPEG）の書き出し、テンプレートとグリッド。
 * 画面に触らない部分（中身をそろえる・JSON を作る・LINE に断られるものを見つける）は js/richmenu.js（window.RichMenuCore）。
 */
(function(){
  "use strict";

  var MIN_SIZE = 24;
  var DISPLAY_WIDTH = 860; // いちばん大きいときの表示の幅。画面がせまいときは、入る幅まで小さくする
  var STORAGE_KEY = "richmenu-studio:state:v1";
  var Core = window.RichMenuCore;
  var SIZES = Core.SIZES;
  var MAX_AREAS = Core.LIMIT.AREAS;
  var TOO_MANY_AREAS = "エリアは最大 " + MAX_AREAS + " 個までです";

  var idCounter = 1;
  // 新しい id（id1・id2…）を出す
  function uid(){ return "id" + (idCounter++); }

  // ---------- 作るときの形（タブ・エリア） ----------
  function makeMenu(n, over){
    return Object.assign({
      id: uid(),
      alias: "tab" + n,
      size: "full",
      width: SIZES.full.width,
      height: SIZES.full.height,
      name: "メニュー" + n,
      chatBarText: "メニュー" + n,
      bgColor: "#0B3B21",
      bgImage: null,
      areas: [],
      selectedId: null
    }, over);
  }

  // 新しいエリアの形（label の文字と、over で変える値）
  function makeArea(label, over){
    return Object.assign({
      id: uid(),
      x: 0, y: 0, w: 0, h: 0,
      label: label,
      icon: "",
      image: null,
      bgColor: "#1B7A43",
      textColor: "#FFFFFF",
      transparent: false,
      radius: 16,
      border: "line",
      fontWeight: "bold",
      fontSize: null,
      textShadow: false,
      actionType: "message",
      actionValue: label,
      targetMenuId: null
    }, over);
  }

  // はじめの状態（メインメニューのタブが1つ）
  function createInitialState(){
    return { activeMenuIndex: 0, menus: [makeMenu(1, { name: "メインメニュー", chatBarText: "メニュー" })] };
  }

  // 前に作っていたものがあれば、その続きから（この端末の中だけに残す）
  var restored = loadSavedState();
  var state = restored || createInitialState();

  var dragState = null;
  var downloadsApi = null;

  // いま開いているタブのメニュー
  function activeMenu(){ return state.menus[state.activeMenuIndex]; }

  // ---------- element refs ----------
  var el = {
    sizePreset: document.getElementById("sizePreset"),
    tabbar: document.getElementById("tabbar"),
    addMenuBtn: document.getElementById("addMenuBtn"),
    canvas: document.getElementById("canvas"),
    canvasSizeLabel: document.getElementById("canvasSizeLabel"),
    templateList: document.getElementById("templateList"),
    gridPresets: document.getElementById("gridPresets"),
    bgColor: document.getElementById("bgColor"),
    bgImageInput: document.getElementById("bgImageInput"),
    clearBgImage: document.getElementById("clearBgImage"),
    menuName: document.getElementById("menuName"),
    menuAlias: document.getElementById("menuAlias"),
    chatBarText: document.getElementById("chatBarText"),
    chatBarCounter: document.getElementById("chatBarCounter"),
    areaCounter: document.getElementById("areaCounter"),
    addAreaBtn: document.getElementById("addAreaBtn"),
    areasList: document.getElementById("areasList"),
    areasEmptyHint: document.getElementById("areasEmptyHint"),
    inspector: document.getElementById("inspector"),
    jsonPreview: document.querySelector("#jsonPreview code"),
    copyJsonBtn: document.getElementById("copyJsonBtn"),
    downloadJsonBtn: document.getElementById("downloadJsonBtn"),
    exportPngBtn: document.getElementById("exportPngBtn"),
    pngPreview: document.getElementById("pngPreview"),
    pngPreviewImg: document.getElementById("pngPreviewImg"),
    pngPreviewHint: document.getElementById("pngPreviewHint"),
    canvasScaleLabel: document.getElementById("canvasScaleLabel"),
    chatBarError: document.getElementById("chatBarError"),
    aliasError: document.getElementById("aliasError")
  };

  // キャンバスを出す幅（画面に入る大きさ。いちばん大きくて DISPLAY_WIDTH）
  function displayWidth(){
    var wrap = el.canvas.parentElement;
    var style = getComputedStyle(wrap);
    var avail = wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
    return Math.max(200, Math.min(DISPLAY_WIDTH, Math.floor(avail)));
  }
  // 実寸からキャンバスの表示への倍率
  function scale(){ return displayWidth() / activeMenu().width; }
  // v を min〜max の中におさめる
  function clampNum(v, min, max){ return Math.min(Math.max(v, min), max); }
  // HTML に入れる文字を esc する
  function escapeHtml(str){
    return String(str || "").replace(/[&<>"']/g, function(c){
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c];
    });
  }

  // 文字の大きさを決めていないエリアの字の大きさ（実寸。高さに合わせて 24〜88）
  function autoFontSize(area){
    return Math.max(24, Math.min(88, area.h * 0.14));
  }

  // 文字の太さの名前を CSS の数に
  function fontWeightCss(w){
    if (w === "regular") return 500;
    if (w === "semibold") return 600;
    if (w === "extrabold") return 800;
    return 700;
  }

  // いまのタブのエリアを id で探す（なければ null）
  function findArea(id){
    var areas = activeMenu().areas;
    for (var i = 0; i < areas.length; i += 1) {
      if (areas[i].id === id) return areas[i];
    }
    return null;
  }

  // アクションの種類の短い名前（バッジ用）
  function actionTypeLabel(type){
    if (type === "postback") return "Postback";
    if (type === "uri") return "URI";
    if (type === "richmenuswitch") return "Switch";
    return "Message";
  }

  // 知らせは Q キットのトースト（下に数秒。新しいものが来たら前のは消える）
  function showToast(message, _tone, options){
    if (window.LineShareUI) window.LineShareUI.toast(message, options || {});
  }

  // ---------- 保存（この端末に）と元に戻す ----------
  function loadSavedState(){
    try {
      // 端末に残した中身も「外からの中身」として、形・長さ・数をそろえてから使う
      var saved = Core.normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
      if (!saved) return null;
      idCounter = Core.nextIdNumber(saved);
      return saved;
    } catch (e) {
      return null;
    }
  }

  var saveTimer = null;
  var warnedImageNotSaved = false;
  // 少し待ってから、この端末に残す（続けて変えたときは最後の1回だけ）
  function scheduleSave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 400);
  }
  // この端末に残す。入らないときは大きな画像を外して残す
  function saveState(){
    var text = JSON.stringify(state);
    try {
      localStorage.setItem(STORAGE_KEY, text);
      return;
    } catch (e) { /* 大きすぎるときは、画像を外して残す */ }
    try {
      var light = JSON.parse(text);
      light.menus.forEach(function(m){
        if (m.bgImage && m.bgImage.length > 200000) m.bgImage = null;
        m.areas.forEach(function(a){ a.image = null; });
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
      if (!warnedImageNotSaved) {
        warnedImageNotSaved = true;
        showToast("画像が大きいので、画像だけはこの端末に残せません。開きなおしたら選びなおしてね");
      }
    } catch (e2) { /* 残せない環境でも、そのまま使える */ }
  }

  // いまの状態を文字にして控える（元に戻す用）
  function snapshot(){ return JSON.stringify(state); }
  // 控えた状態に戻して描きなおす
  function restoreSnapshot(text){
    state = JSON.parse(text);
    render();
  }
  // 消す・上書きする操作は確かめずにすぐ行い、トーストの「元に戻す」で戻せるようにする
  function undoable(message, change){
    var before = snapshot();
    change();
    render();
    showToast(message, null, { actionLabel: "元に戻す", onAction: function(){ restoreSnapshot(before); } });
  }
  // なくなるものがあるときだけ「元に戻す」を出す
  function changeMaybeUndoable(message, losesSomething, change){
    if (losesSomething) {
      undoable(message, change);
      return;
    }
    change();
    render();
    if (message) showToast(message);
  }

  // 新しく作りはじめる（トーストの「元に戻す」で戻せる）
  function startFresh(){
    undoable("新しく作りはじめました", function(){
      state = createInitialState();
    });
  }

  // 保存できなかったわけを、やさしい言葉に
  function downloadErrorMessage(err){
    var code = err && err.code;
    switch (code) {
      case "declined": return "保存をやめました";
      case "rate_limited": return "少し待ってから、もう一度ためしてね";
      case "too_large": return "ファイルが大きすぎて保存できません（16MB まで）";
      case "rejected_extension":
      case "extension_not_enabled": return "この形式のファイルは保存できません";
      default:
        console.error(err);
        return "保存できませんでした。もう一度ためしてね";
    }
  }

  // ---------- default factories ----------
  function createDefaultArea(x, y, w, h){
    return makeArea("エリア" + (activeMenu().areas.length + 1), { x: x, y: y, w: w, h: h });
  }

  // 「エリアを足す」：まん中に 400×400 のエリアを足して選ぶ
  function addManualArea(){
    var menu = activeMenu();
    if (menu.areas.length >= MAX_AREAS) {
      showToast(TOO_MANY_AREAS, "error");
      return;
    }
    var w = Math.min(400, menu.width);
    var h = Math.min(400, menu.height);
    var x = clampNum((menu.width - w) / 2, 0, menu.width - w);
    var y = clampNum((menu.height - h) / 2, 0, menu.height - h);
    var area = createDefaultArea(x, y, w, h);
    menu.areas.push(area);
    menu.selectedId = area.id;
    render();
  }

  // rows×cols のグリッドでエリアを作りなおす（あったエリアは「元に戻す」で戻せる）
  function generateGrid(rows, cols){
    var menu = activeMenu();
    var count = rows * cols;
    if (count > MAX_AREAS) {
      showToast(TOO_MANY_AREAS, "error");
      return;
    }
    var cellW = Math.floor(menu.width / cols);
    var cellH = Math.floor(menu.height / rows);
    var areas = [];
    var n = 1;
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        areas.push(makeArea("エリア" + n, {
          x: c * cellW,
          y: r * cellH,
          w: cellW,
          h: cellH,
          bgColor: n % 2 === 0 ? "#0F5C33" : "#1B7A43"
        }));
        n += 1;
      }
    }
    changeMaybeUndoable(rows + "×" + cols + " のグリッドを作りました", menu.areas.length > 0, function(){
      menu.areas = areas;
      menu.selectedId = null;
    });
  }

  // エリアを消す（「元に戻す」で戻せる）
  function deleteArea(id){
    var menu = activeMenu();
    var area = findArea(id);
    undoable("「" + ((area && area.label) || "エリア") + "」を消しました", function(){
      menu.areas = menu.areas.filter(function(a){ return a.id !== id; });
      if (menu.selectedId === id) menu.selectedId = null;
    });
  }

  // ---------- menus (tabs) ----------
  function addMenu(){
    var menu = makeMenu(state.menus.length + 1);
    state.menus.push(menu);
    state.activeMenuIndex = state.menus.length - 1;
    render();
    showToast("タブを追加しました");
  }

  // タブを切りかえる
  function switchMenu(index){
    state.activeMenuIndex = clampNum(index, 0, state.menus.length - 1);
    render();
  }

  // タブを消す（1つは残す）。そのタブへの切りかえは外す。「元に戻す」で戻せる
  function deleteMenu(id){
    if (state.menus.length <= 1) {
      showToast("タブは1つは残します", "error");
      return;
    }
    var idx = -1;
    for (var i = 0; i < state.menus.length; i += 1) {
      if (state.menus[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return;

    undoable("「" + (state.menus[idx].name || "タブ") + "」のタブを消しました", function(){
      state.menus.splice(idx, 1);
      state.menus.forEach(function(m){
        m.areas.forEach(function(a){
          if (a.actionType === "richmenuswitch" && a.targetMenuId === id) {
            a.targetMenuId = null;
          }
        });
      });
      if (state.activeMenuIndex >= state.menus.length) {
        state.activeMenuIndex = state.menus.length - 1;
      }
    });
  }

  // ---------- size preset ----------
  function setMenuSize(menu, key){
    menu.size = key;
    menu.width = SIZES[key].width;
    menu.height = SIZES[key].height;
  }

  // メニューの大きさ（Full・Compact）を変える。エリアは消える（「元に戻す」で戻せる）
  function applySizePreset(key){
    var menu = activeMenu();
    var lose = menu.areas.length > 0;
    changeMaybeUndoable(lose ? "サイズを変えたので、エリアを消しました" : "", lose, function(){
      setMenuSize(menu, key);
      menu.areas = [];
      menu.selectedId = null;
    });
  }

  // ---------- pointer interactions ----------
  function canvasPointToReal(e){
    var menu = activeMenu();
    var rect = el.canvas.getBoundingClientRect();
    return {
      x: clampNum((e.clientX - rect.left) / scale(), 0, menu.width),
      y: clampNum((e.clientY - rect.top) / scale(), 0, menu.height)
    };
  }

  // キャンバスの空いたところを押した：新しいエリアを作りはじめる
  function onCanvasPointerDown(e){
    if (e.target.closest('[data-role="area"]') || e.target.closest('[data-role="handle"]')) return;
    var menu = activeMenu();
    if (menu.areas.length >= MAX_AREAS) {
      showToast(TOO_MANY_AREAS, "error");
      return;
    }
    var p = canvasPointToReal(e);
    var area = createDefaultArea(p.x, p.y, 0, 0);
    menu.areas.push(area);
    menu.selectedId = area.id;
    dragState = { mode: "create", id: area.id, originX: p.x, originY: p.y };
    el.canvas.setPointerCapture(e.pointerId);
    render();
  }

  // エリアを押した：選んで、動かしはじめる
  function onAreaPointerDown(e){
    e.stopPropagation();
    var id = e.currentTarget.dataset.id;
    var area = findArea(id);
    if (!area) return;
    activeMenu().selectedId = id;
    var p = canvasPointToReal(e);
    dragState = {
      mode: "move", id: id, startX: p.x, startY: p.y,
      startAreaX: area.x, startAreaY: area.y
    };
    el.canvas.setPointerCapture(e.pointerId);
    render();
  }

  // 右下の丸を押した：大きさを変えはじめる
  function onHandlePointerDown(e){
    e.stopPropagation();
    var id = e.currentTarget.dataset.id;
    activeMenu().selectedId = id;
    dragState = { mode: "resize", id: id };
    el.canvas.setPointerCapture(e.pointerId);
    render();
  }

  // 押したまま動かした：作る・動かす・大きさを変える
  function onCanvasPointerMove(e){
    if (!dragState) return;
    var menu = activeMenu();
    var area = findArea(dragState.id);
    if (!area) return;
    var p = canvasPointToReal(e);

    if (dragState.mode === "create") {
      area.x = Math.min(dragState.originX, p.x);
      area.y = Math.min(dragState.originY, p.y);
      area.w = Math.abs(p.x - dragState.originX);
      area.h = Math.abs(p.y - dragState.originY);
    } else if (dragState.mode === "move") {
      area.x = clampNum(dragState.startAreaX + (p.x - dragState.startX), 0, menu.width - area.w);
      area.y = clampNum(dragState.startAreaY + (p.y - dragState.startY), 0, menu.height - area.h);
    } else if (dragState.mode === "resize") {
      area.w = clampNum(p.x - area.x, MIN_SIZE, menu.width - area.x);
      area.h = clampNum(p.y - area.y, MIN_SIZE, menu.height - area.y);
    }
    render();
  }

  // 指を離した：小さすぎるエリアはふつうの大きさにする
  function onCanvasPointerUp(){
    if (!dragState) return;
    var menu = activeMenu();
    var area = findArea(dragState.id);
    if (area && dragState.mode === "create" && (area.w < MIN_SIZE || area.h < MIN_SIZE)) {
      area.w = Math.min(300, menu.width);
      area.h = Math.min(300, menu.height);
      area.x = clampNum(area.x, 0, menu.width - area.w);
      area.y = clampNum(area.y, 0, menu.height - area.h);
    }
    dragState = null;
    render();
  }

  document.addEventListener("keydown", function(e){
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    var menu = activeMenu();
    if (menu.selectedId) {
      e.preventDefault();
      deleteArea(menu.selectedId);
    }
  });

  // ---------- image helpers ----------
  function readImageAsDataUrl(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * 選んだ画像を読む。メニューより大きい写真は、メニューの大きさまで縮める
   * （書き出す画像は同じ。この端末に残せるようになり、動きも軽くなる）。
   * 読めない画像なら null。
   */
  async function loadImageFile(file){
    try {
      if (!file || !/^image\//.test(file.type || "image/")) return null;
      var dataUrl = await readImageAsDataUrl(file);
      var img = await loadImageAsync(dataUrl);
      var fit = Core.fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, SIZES.full.width, SIZES.full.height);
      var small = fit.width < (img.naturalWidth || img.width);
      if (!small && /^data:image\/(png|jpeg|gif|webp);/i.test(dataUrl)) return dataUrl;
      var canvas = document.createElement("canvas");
      canvas.width = fit.width;
      canvas.height = fit.height;
      canvas.getContext("2d").drawImage(img, 0, 0, fit.width, fit.height);
      return /^data:image\/png;/i.test(dataUrl) ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.9);
    } catch (e) {
      return null;
    }
  }

  // 画像を選んだら読んで入れる。読めないときは知らせる
  async function pickImage(input, apply){
    var file = input.files && input.files[0];
    if (!file) return;
    var dataUrl = await loadImageFile(file);
    input.value = "";
    if (!dataUrl) {
      showToast("この画像は読めませんでした。JPEG か PNG の画像を選んでね", "error");
      return;
    }
    apply(dataUrl);
    render();
  }

  // ---------- render ----------
  function render(){
    scheduleSave();
    renderTopbar();
    renderTabs();
    renderToolbox();
    renderCanvas();
    renderInspector();
    renderJsonPreview();
  }

  // 上の大きさの選択を、いまのタブに合わせる
  function renderTopbar(){
    el.sizePreset.value = activeMenu().size;
  }

  // タブの列を描く
  function renderTabs(){
    el.tabbar.innerHTML = "";
    state.menus.forEach(function(menu, index){
      var chip = document.createElement("div");
      var isActive = index === state.activeMenuIndex;
      var label = menu.name || ("メニュー" + (index + 1));
      chip.className = "tab-chip" + (isActive ? " is-active" : "");
      chip.innerHTML =
        '<button type="button" class="tab-main" role="tab" aria-selected="' + isActive + '">' + escapeHtml(label) + '</button>' +
        (state.menus.length > 1 ? '<button type="button" class="tab-close" data-close="' + menu.id + '" aria-label="「' + escapeHtml(label) + '」のタブを消す" title="このタブを消す">✕</button>' : "");
      chip.querySelector(".tab-main").addEventListener("click", function(){
        switchMenu(index);
      });
      var closeBtn = chip.querySelector("[data-close]");
      if (closeBtn) {
        closeBtn.addEventListener("click", function(e){
          e.stopPropagation();
          deleteMenu(menu.id);
        });
      }
      el.tabbar.appendChild(chip);
    });
  }

  // 左の欄（背景・名前・別名・チャットバーの文字・エリアの一覧）を描く
  function renderToolbox(){
    var menu = activeMenu();
    el.bgColor.value = menu.bgColor;
    el.clearBgImage.disabled = !menu.bgImage;
    el.menuName.value = menu.name;
    el.menuAlias.value = menu.alias;
    el.chatBarText.value = menu.chatBarText;

    var chatLen = menu.chatBarText.length;
    el.chatBarCounter.textContent = chatLen + "/14";
    el.chatBarCounter.className = "counter" + (chatLen > 14 ? " danger" : chatLen > 10 ? " warn" : "");
    setFieldError(el.chatBarText, el.chatBarError, chatLen > 14 ? "14文字までにしてね（書き出すと15文字目からは切れます）" : "");
    var alias = menu.alias || "";
    setFieldError(el.menuAlias, el.aliasError, alias && !/^[A-Za-z0-9_-]+$/.test(alias) ? "半角の英数字と - _ だけ使えます" : "");

    el.areaCounter.textContent = menu.areas.length + "/" + MAX_AREAS;
    el.addAreaBtn.disabled = menu.areas.length >= MAX_AREAS;
    el.areasEmptyHint.style.display = menu.areas.length === 0 ? "block" : "none";

    el.areasList.innerHTML = "";
    menu.areas.forEach(function(area, index){
      var li = document.createElement("li");
      li.className = "area-row" + (area.id === menu.selectedId ? " is-active" : "");
      li.innerHTML =
        '<span class="idx">' + (index + 1) + '</span>' +
        '<span class="lbl">' + (area.icon ? escapeHtml(area.icon) + " " : "") + escapeHtml(area.label || "(無題)") + '</span>' +
        '<span class="pill type-' + area.actionType + '">' + actionTypeLabel(area.actionType) + '</span>' +
        '<button class="btn danger-text" type="button" title="消す" aria-label="「' + escapeHtml(area.label || "無題") + '」を消す" data-del="' + area.id + '">✕</button>';
      li.addEventListener("click", function(e){
        if (e.target.closest("[data-del]")) return;
        menu.selectedId = area.id;
        render();
      });
      li.querySelector("[data-del]").addEventListener("click", function(e){
        e.stopPropagation();
        deleteArea(area.id);
      });
      el.areasList.appendChild(li);
    });
  }

  // キャンバスとエリアを描く
  function renderCanvas(){
    var menu = activeMenu();
    var s = scale();
    scheduleSave();
    el.canvasScaleLabel.textContent = "表示倍率 " + Math.round(s * 100) + "%";
    el.canvas.style.width = Math.round(menu.width * s) + "px";
    el.canvas.style.height = Math.round(menu.height * s) + "px";
    el.canvas.style.backgroundImage = menu.bgImage ? "url(" + menu.bgImage + ")" : "none";
    el.canvas.style.backgroundColor = menu.bgImage ? "transparent" : menu.bgColor;
    el.canvasSizeLabel.textContent = "実寸 " + menu.width + "×" + menu.height + "px";

    el.canvas.innerHTML = "";
    menu.areas.forEach(function(area){
      var box = document.createElement("div");
      box.className = "area-box" + (area.id === menu.selectedId ? " is-selected" : "");
      box.dataset.role = "area";
      box.dataset.id = area.id;
      box.style.left = Math.round(area.x * s) + "px";
      box.style.top = Math.round(area.y * s) + "px";
      box.style.width = Math.round(area.w * s) + "px";
      box.style.height = Math.round(area.h * s) + "px";
      box.style.backgroundImage = area.image ? "url(" + area.image + ")" : "none";
      box.style.backgroundSize = "cover";
      box.style.backgroundPosition = "center";
      box.style.backgroundColor = area.image ? "transparent" : (area.transparent ? "transparent" : area.bgColor);
      box.style.color = area.textColor;
      box.style.borderRadius = Math.round((area.radius || 0) * s) + "px";

      if (area.border === "shadow") {
        box.style.border = "none";
        box.style.boxShadow = "0 " + Math.round(18 * s) + "px " + Math.round(48 * s) + "px rgba(0,0,0,0.35)";
      } else if (area.border === "line") {
        box.style.border = "2px solid " + (area.transparent || area.image ? area.bgColor : "rgba(255,255,255,0.35)");
        box.style.boxShadow = "none";
      } else {
        box.style.border = "none";
        box.style.boxShadow = "none";
      }

      var autoFontSizeReal = autoFontSize(area);
      var labelFontSize = Math.round((area.fontSize || autoFontSizeReal) * s);
      var textShadowCss = area.textShadow ? "text-shadow:0 1px 3px rgba(0,0,0,0.65),0 0 8px rgba(0,0,0,0.35);" : "";
      var labelStyle = "font-weight:" + fontWeightCss(area.fontWeight) + ";" + textShadowCss + "font-size:" + labelFontSize + "px;";
      var iconStyle = textShadowCss + "font-size:" + Math.round(labelFontSize * 1.6) + "px;";

      box.innerHTML =
        '<span class="area-type-badge">' + actionTypeLabel(area.actionType) + '</span>' +
        (area.icon ? '<span class="area-icon" style="' + iconStyle + '">' + escapeHtml(area.icon) + '</span>' : "") +
        '<span class="area-label" style="' + labelStyle + '">' + escapeHtml(area.label || "") + '</span>';
      box.addEventListener("pointerdown", onAreaPointerDown);
      el.canvas.appendChild(box);

      if (area.id === menu.selectedId) {
        var handle = document.createElement("div");
        handle.className = "resize-handle";
        handle.dataset.role = "handle";
        handle.dataset.id = area.id;
        handle.style.left = Math.round((area.x + area.w) * s) + "px";
        handle.style.top = Math.round((area.y + area.h) * s) + "px";
        handle.addEventListener("pointerdown", onHandlePointerDown);
        el.canvas.appendChild(handle);
      }
    });
  }

  // 入力欄のすぐ下に、まちがいを出す（空なら消す）
  function setFieldError(input, box, message){
    if (!input || !box) return;
    box.textContent = message;
    input.setAttribute("aria-invalid", String(!!message));
  }

  // このエリアのアクションが LINE に断られるなら、その理由
  function actionValueError(area){
    return Core.actionError(area, state.menus);
  }

  // 右の設定欄（選んだエリアの文字・色・アクション・位置）を描いて、入力をつなぐ
  function renderInspector(){
    var menu = activeMenu();
    var area = menu.selectedId ? findArea(menu.selectedId) : null;
    if (!area) {
      el.inspector.innerHTML = '<p class="inspector-empty">エリアを選択すると、ラベル・色・タップ時のアクションを編集できます。<br><br>キャンバス上の空いている場所をドラッグすると新しいエリアを作成できます。</p>';
      return;
    }

    el.inspector.innerHTML = inspectorHtml(area, menu);
    bindInspector(area);
  }

  // 右の設定欄の HTML（選んだエリアの値を入れる。文字は esc する）
  function inspectorHtml(area, menu){
    var isSwitch = area.actionType === "richmenuswitch";
    var actionValueLabel = area.actionType === "uri" ? "リンク先 URL" :
      area.actionType === "postback" ? "postback data" : "送信するテキスト";
    var actionValueType = area.actionType === "uri" ? "url" : "text";

    var actionFieldsHtml;
    if (isSwitch) {
      var otherMenus = state.menus.filter(function(m){ return m.id !== menu.id; });
      var hasTarget = otherMenus.some(function(m){ return m.id === area.targetMenuId; });
      // まだ選んでいないときは「選んでね」を出す（先頭のタブが選ばれているように見せない）
      var optionsHtml = otherMenus.length
        ? (hasTarget ? "" : '<option value="" selected>（選んでね）</option>') + otherMenus.map(function(m){
            return '<option value="' + m.id + '"' + (m.id === area.targetMenuId ? " selected" : "") + '>' + escapeHtml(m.name || "無題") + '</option>';
          }).join("")
        : '<option value="">(他にタブがありません)</option>';
      actionFieldsHtml =
        '<div class="field"><label for="fArea_target">切り替え先タブ</label><select id="fArea_target"' + (otherMenus.length ? "" : " disabled") + ' aria-describedby="fArea_valueError">' + optionsHtml + '</select></div>' +
        '<div class="field"><label for="fArea_value">data(任意・受信側での判定用)</label><input type="text" id="fArea_value" value="' + escapeHtml(area.actionValue) + '" aria-describedby="fArea_valueError"><p class="field-error" id="fArea_valueError" aria-live="polite"></p></div>';
    } else {
      actionFieldsHtml =
        '<div class="field"><label for="fArea_value">' + actionValueLabel + '</label><input type="' + actionValueType + '" id="fArea_value" value="' + escapeHtml(area.actionValue) + '"' + (area.actionType === "uri" ? ' inputmode="url" autocapitalize="off" spellcheck="false"' : "") + ' aria-describedby="fArea_valueError"><p class="field-error" id="fArea_valueError" aria-live="polite"></p></div>';
    }

    return '<div class="inspector-head"><h2>エリア設定</h2><button class="btn danger-text" id="deleteAreaBtn" type="button">🗑 消す</button></div>' +
      '<div class="field"><label>ラベル</label><input type="text" id="fArea_label" value="' + escapeHtml(area.label) + '"></div>' +
      '<div class="field"><label>アイコン(絵文字)</label><input type="text" id="fArea_icon" value="' + escapeHtml(area.icon) + '" placeholder="任意"></div>' +

      '<div class="field"><label>背景画像</label>' +
      '<div class="bg-row" style="margin:0;">' +
      '<button class="btn file-btn full" type="button">画像を選ぶ<input type="file" id="fArea_imageInput" accept="image/*"></button>' +
      '<button class="btn ghost full" id="fArea_imageClear" type="button"' + (area.image ? "" : " disabled") + '>外す</button>' +
      '</div></div>' +

      '<div class="grid2">' +
      '<div class="field"><label>背景色</label><input type="color" id="fArea_bg" value="' + area.bgColor + '"' + (area.image ? " disabled" : "") + '></div>' +
      '<div class="field"><label>文字色</label><input type="color" id="fArea_fg" value="' + area.textColor + '"></div>' +
      '</div>' +

      '<div class="field"><label>背景を透明にする<input type="checkbox" id="fArea_transparent"' + (area.transparent ? " checked" : "") + (area.image ? " disabled" : "") + '></label></div>' +

      '<div class="grid2">' +
      '<div class="field"><label>枠のスタイル</label><select id="fArea_border">' +
      '<option value="line"' + (area.border === "line" ? " selected" : "") + '>ライン</option>' +
      '<option value="shadow"' + (area.border === "shadow" ? " selected" : "") + '>シャドウ</option>' +
      '<option value="none"' + (area.border === "none" ? " selected" : "") + '>なし</option>' +
      '</select></div>' +
      '<div class="field"><label>角丸</label><input class="mono" type="text" inputmode="numeric" id="fArea_radius" value="' + Math.round(area.radius || 0) + '"></div>' +
      '</div>' +

      '<div class="grid2">' +
      '<div class="field"><label>文字の太さ</label><select id="fArea_weight">' +
      '<option value="regular"' + (area.fontWeight === "regular" ? " selected" : "") + '>標準</option>' +
      '<option value="semibold"' + (area.fontWeight === "semibold" ? " selected" : "") + '>やや太字</option>' +
      '<option value="bold"' + (area.fontWeight === "bold" ? " selected" : "") + '>太字</option>' +
      '<option value="extrabold"' + (area.fontWeight === "extrabold" ? " selected" : "") + '>極太</option>' +
      '</select></div>' +
      '<div class="field"><label>文字サイズ</label><input class="mono" type="text" inputmode="numeric" id="fArea_fontSize" value="' + (area.fontSize ? Math.round(area.fontSize) : "") + '" placeholder="自動"></div>' +
      '</div>' +

      '<div class="field"><label>文字に縁取り/影を付ける<input type="checkbox" id="fArea_textShadow"' + (area.textShadow ? " checked" : "") + '></label></div>' +

      '<div class="field"><label>アクション種別</label><select id="fArea_type">' +
      '<option value="message"' + (area.actionType === "message" ? " selected" : "") + '>message(発言する)</option>' +
      '<option value="postback"' + (area.actionType === "postback" ? " selected" : "") + '>postback(裏でデータ送信)</option>' +
      '<option value="uri"' + (area.actionType === "uri" ? " selected" : "") + '>uri(リンクを開く)</option>' +
      '<option value="richmenuswitch"' + (isSwitch ? " selected" : "") + '>richmenuswitch(タブ切り替え)</option>' +
      '</select></div>' +
      actionFieldsHtml +

      '<div class="grid2">' +
      '<div class="field"><label>X</label><input class="mono" type="text" inputmode="numeric" id="fArea_x" value="' + Math.round(area.x) + '"></div>' +
      '<div class="field"><label>Y</label><input class="mono" type="text" inputmode="numeric" id="fArea_y" value="' + Math.round(area.y) + '"></div>' +
      '<div class="field"><label>幅</label><input class="mono" type="text" inputmode="numeric" id="fArea_w" value="' + Math.round(area.w) + '"></div>' +
      '<div class="field"><label>高さ</label><input class="mono" type="text" inputmode="numeric" id="fArea_h" value="' + Math.round(area.h) + '"></div>' +
      '</div>';
  }

  // 右の設定欄の入力を、エリアにつなぐ
  function bindInspector(area){
    document.getElementById("deleteAreaBtn").addEventListener("click", function(){ deleteArea(area.id); });
    var valueInput = document.getElementById("fArea_value");
    var showValueError = function(){ setFieldError(valueInput, document.getElementById("fArea_valueError"), actionValueError(area)); };
    bindText("fArea_label", function(v){ area.label = v; showValueError(); });
    bindText("fArea_icon", function(v){ area.icon = v; });
    bindText("fArea_value", function(v){ area.actionValue = v; showValueError(); });
    showValueError();

    document.getElementById("fArea_imageInput").addEventListener("change", function(){
      pickImage(this, function(dataUrl){ area.image = dataUrl; });
    });
    document.getElementById("fArea_imageClear").addEventListener("click", function(){
      undoable("エリアの画像を外しました", function(){ area.image = null; });
    });

    document.getElementById("fArea_bg").addEventListener("input", function(){ area.bgColor = this.value; renderCanvas(); });
    document.getElementById("fArea_fg").addEventListener("input", function(){ area.textColor = this.value; renderCanvas(); });
    document.getElementById("fArea_transparent").addEventListener("change", function(){
      area.transparent = this.checked;
      if (area.transparent && !area._shadowAutoSet) {
        area.textShadow = true;
        area._shadowAutoSet = true;
      }
      render();
    });
    document.getElementById("fArea_border").addEventListener("change", function(){ area.border = this.value; renderCanvas(); });
    bindNumber("fArea_radius", function(v){ area.radius = clampNum(v, 0, 200); });
    document.getElementById("fArea_weight").addEventListener("change", function(){ area.fontWeight = this.value; renderCanvas(); });
    document.getElementById("fArea_fontSize").addEventListener("change", function(){
      var raw = this.value.trim();
      area.fontSize = raw === "" ? null : clampNum(parseInt(raw, 10) || 0, 8, 400);
      renderCanvas();
    });
    document.getElementById("fArea_textShadow").addEventListener("change", function(){ area.textShadow = this.checked; renderCanvas(); });

    document.getElementById("fArea_type").addEventListener("change", function(){ area.actionType = this.value; render(); });
    var targetSelect = document.getElementById("fArea_target");
    if (targetSelect) {
      targetSelect.addEventListener("change", function(){ area.targetMenuId = this.value || null; render(); });
    }

    bindNumber("fArea_x", function(v){ area.x = clampNum(v, 0, activeMenu().width - area.w); });
    bindNumber("fArea_y", function(v){ area.y = clampNum(v, 0, activeMenu().height - area.h); });
    bindNumber("fArea_w", function(v){ area.w = clampNum(v, MIN_SIZE, activeMenu().width - area.x); });
    bindNumber("fArea_h", function(v){ area.h = clampNum(v, MIN_SIZE, activeMenu().height - area.y); });
  }

  // 文字の欄を入力のたびに反映する
  function bindText(id, apply){
    var input = document.getElementById(id);
    input.addEventListener("input", function(){
      apply(this.value);
      renderCanvas();
      renderToolbox();
      renderJsonPreview();
    });
  }

  // 数の欄を確定したときに反映する
  function bindNumber(id, apply){
    var input = document.getElementById(id);
    input.addEventListener("change", function(){
      var v = parseInt(this.value, 10);
      if (isNaN(v)) v = 0;
      apply(v);
      render();
    });
  }

  // タブの richmenu の JSON（LINE の API に渡す形）
  function buildRichMenuObject(menu){
    return Core.buildRichMenuObject(menu || activeMenu(), state.menus);
  }

  // JSON の見本を描く
  function renderJsonPreview(){
    scheduleSave();
    el.jsonPreview.textContent = JSON.stringify(buildRichMenuObject(activeMenu()), null, 2);
  }

  // ---------- clipboard ----------
  function selectPreformattedText(node){
    var range = document.createRange();
    range.selectNodeContents(node);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // JSON をコピーする（できないときは文字を選んでおく）
  async function copyJsonToClipboard(){
    var text = JSON.stringify(buildRichMenuObject(activeMenu()), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      showToast("JSON をコピーしました");
    } catch (err) {
      selectPreformattedText(document.getElementById("jsonPreview"));
      showToast("自動でコピーできなかったので、文字を選んでおきました。⌘/Ctrl+C でコピーできます");
    }
  }

  // ---------- export: json ----------
  async function downloadJson(){
    var menu = activeMenu();
    var text = JSON.stringify(buildRichMenuObject(menu), null, 2);
    if (downloadsApi) {
      try {
        await downloadsApi.save({ filename: sanitizeFilename(menu.name) + ".json", data: text });
        showToast("richmenu.json を保存しました");
      } catch (err) {
        showToast(downloadErrorMessage(err), "error");
      }
    } else if (triggerBrowserDownload(sanitizeFilename(menu.name) + ".json", text, "application/json")) {
      showToast("richmenu.json をダウンロードしました");
    } else {
      selectPreformattedText(document.getElementById("jsonPreview"));
      showToast("ここでは保存できないので、文字を選んでおきました。コピーして使ってね");
    }
  }

  // ファイル名に使えない文字を _ に
  function sanitizeFilename(name){
    var cleaned = String(name || "richmenu").trim().replace(/[\\/:*?"<>|]+/g, "_");
    return cleaned || "richmenu";
  }

  /**
   * Claude Artifact のサンドボックス外(GitHub Pages など通常のブラウザ)で
   * 動いている場合向けの素朴なダウンロード手段。
   * サンドボックス内ではクリックが無効化されるだけで害はない。
   *
   * @param {string} filename 保存ファイル名
   * @param {Blob|string} data 保存内容
   * @param {string} mime data が文字列のときの MIME タイプ
   * @returns {boolean} 発火できたか
   */
  function triggerBrowserDownload(filename, data, mime){
    try {
      var blob = data instanceof Blob ? data : new Blob([data], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * data:image/png;base64,... 形式の文字列を同期的に Blob へ変換します。
   *
   * @param {string} dataUrl data URL 文字列
   * @returns {Blob}
   */
  function dataUrlToBlobSync(dataUrl){
    var parts = dataUrl.split(",");
    var mimeMatch = parts[0].match(/:(.*?);/);
    var mime = mimeMatch ? mimeMatch[1] : "image/png";
    var binary = atob(parts[1]);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  // ---------- export: png ----------
  function loadImageAsync(src){
    return new Promise(function(resolve, reject){
      var img = new Image();
      img.onload = function(){ resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  // 画像を枠いっぱいに（はみ出しは切る）描く
  function drawImageCover(ctx, img, x, y, w, h){
    var ir = img.width / img.height;
    var tr = w / h;
    var sx, sy, sw, sh;
    if (ir > tr) {
      sh = img.height;
      sw = sh * tr;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / tr;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  // 角の丸い四角の線を作る
  function roundedRectPath(ctx, x, y, w, h, r){
    var rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // 書き出す画像に、エリア1つ（箱・画像・枠・文字）を描く
  async function drawExportArea(ctx, a){
    var img = null;
    if (a.image) {
      try { img = await loadImageAsync(a.image); } catch (e) { img = null; }
    }
    drawExportAreaBox(ctx, a, img);
    drawExportAreaText(ctx, a);
  }

  // エリアの箱（影・背景の色か画像・枠の線）を描く。img は読めたエリアの画像（なければ null）
  function drawExportAreaBox(ctx, a, img){
    var radius = a.radius || 0;

    if (a.border === "shadow" && !a.transparent && !a.image) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 10;
      roundedRectPath(ctx, a.x, a.y, a.w, a.h, radius);
      ctx.fillStyle = a.bgColor;
      ctx.fill();
      ctx.restore();
    }

    if (a.image) {
      ctx.save();
      roundedRectPath(ctx, a.x, a.y, a.w, a.h, radius);
      ctx.clip();
      if (img) {
        drawImageCover(ctx, img, a.x, a.y, a.w, a.h);
      } else if (!a.transparent) {
        ctx.fillStyle = a.bgColor;
        ctx.fillRect(a.x, a.y, a.w, a.h);
      }
      ctx.restore();
    } else if (!a.transparent && a.border !== "shadow") {
      roundedRectPath(ctx, a.x, a.y, a.w, a.h, radius);
      ctx.fillStyle = a.bgColor;
      ctx.fill();
    }

    if (a.border === "line") {
      roundedRectPath(ctx, a.x + 2, a.y + 2, Math.max(0, a.w - 4), Math.max(0, a.h - 4), Math.max(0, radius - 2));
      ctx.strokeStyle = (a.transparent || a.image) ? a.bgColor : "rgba(255,255,255,0.35)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  // エリアの文字（絵文字のアイコンとラベル）を描く
  function drawExportAreaText(ctx, a){
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = a.textColor;
    var fontSize = a.fontSize ? a.fontSize : autoFontSize(a);
    var weight = fontWeightCss(a.fontWeight);
    var cx = a.x + a.w / 2;
    var cy = a.y + a.h / 2;

    if (a.textShadow) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;
    }

    if (a.icon) {
      ctx.font = Math.round(fontSize * 1.7) + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
      ctx.fillText(a.icon, cx, cy - fontSize * 0.55);
      ctx.font = weight + " " + Math.round(fontSize) + 'px Archivo, sans-serif';
      ctx.fillText(a.label || "", cx, cy + fontSize * 0.75);
    } else {
      ctx.font = weight + " " + Math.round(fontSize) + 'px Archivo, sans-serif';
      ctx.fillText(a.label || "", cx, cy);
    }

    if (a.textShadow) { ctx.restore(); }
  }

  // 書き出す画像を、実寸のキャンバスに描く
  async function renderExportCanvas(menu){
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* ignore */ }
    }
    var canvas = document.createElement("canvas");
    canvas.width = menu.width;
    canvas.height = menu.height;
    var ctx = canvas.getContext("2d");

    if (menu.bgImage) {
      try {
        var bgImg = await loadImageAsync(menu.bgImage);
        drawImageCover(ctx, bgImg, 0, 0, menu.width, menu.height);
      } catch (e) {
        ctx.fillStyle = menu.bgColor;
        ctx.fillRect(0, 0, menu.width, menu.height);
      }
    } else {
      ctx.fillStyle = menu.bgColor;
      ctx.fillRect(0, 0, menu.width, menu.height);
    }

    for (var i = 0; i < menu.areas.length; i += 1) {
      await drawExportArea(ctx, menu.areas[i]);
    }

    return canvas;
  }

  // キャンバスを画像のファイル（Blob）にする
  function canvasToBlob(canvas, type, quality){
    return new Promise(function(resolve){
      if (canvas.toBlob) canvas.toBlob(resolve, type, quality);
      else resolve(dataUrlToBlobSync(canvas.toDataURL(type, quality)));
    });
  }

  /**
   * LINE に入れられる画像（1MB まで）にする。PNG で入ればそのまま PNG。
   * 写真などで大きくなるときは、入るまで画質を下げた JPEG にする。
   */
  async function encodeForLine(canvas){
    var png = await canvasToBlob(canvas, "image/png");
    if (png && png.size <= Core.LIMIT.LINE_IMAGE) return { blob: png, ext: "png", jpeg: false };
    var qualities = [0.92, 0.85, 0.75, 0.65, 0.5];
    var jpeg = null;
    for (var i = 0; i < qualities.length; i += 1) {
      jpeg = await canvasToBlob(canvas, "image/jpeg", qualities[i]);
      if (jpeg && jpeg.size <= Core.LIMIT.LINE_IMAGE) break;
    }
    return { blob: jpeg || png, ext: "jpg", jpeg: true, tooLarge: !jpeg || jpeg.size > Core.LIMIT.LINE_IMAGE };
  }

  var previewUrl = null;
  // 「PNGを書き出す」：画像を作って保存する（1MB をこえるときは JPEG）
  async function exportPng(){
    el.exportPngBtn.disabled = true;
    try {
      var menu = activeMenu();
      var canvas = await renderExportCanvas(menu);
      var out = await encodeForLine(canvas);
      var filename = sanitizeFilename(menu.name) + "." + out.ext;
      var kind = out.jpeg ? "JPEG" : "PNG";
      // PNG だと 1MB をこえて LINE に入らないときは、JPEG にしたことを知らせる
      var note = out.tooLarge ? "（1MB をこえています。LINE に入らないので、写真を小さくしてね）"
        : out.jpeg ? "（PNG だと 1MB をこえて LINE に入らないので、JPEG にしました）" : "";
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(out.blob);
      el.pngPreviewImg.src = previewUrl;
      el.pngPreview.classList.add("is-visible");

      if (downloadsApi) {
        try {
          await downloadsApi.save({ filename: filename, data: out.blob });
          el.pngPreviewHint.textContent = "保存しました。長押し/右クリックでも保存できます。" + note;
          showToast(kind + " を保存しました" + note);
        } catch (err) {
          el.pngPreviewHint.textContent = "自動保存に失敗したため、下の画像を長押し/右クリックして保存してください。" + note;
          showToast(downloadErrorMessage(err), "error");
        }
      } else if (triggerBrowserDownload(filename, out.blob, out.blob.type)) {
        el.pngPreviewHint.textContent = "ダウンロードしました。長押し/右クリックでも保存できます。" + note;
        showToast(kind + " をダウンロードしました" + note);
      } else {
        el.pngPreviewHint.textContent = "この環境では自動保存できません。下の画像を長押し/右クリックして保存してください。" + note;
      }
    } catch (err) {
      console.error(err);
      showToast("画像を作れませんでした。画像を外すか小さくして、もう一度ためしてね", "error");
    } finally {
      el.exportPngBtn.disabled = false;
    }
  }

  // ---------- templates ----------

  /**
   * グラデーション画像を生成して data URL を返します。
   *
   * menu.bgImage にそのまま設定できる形にすることで、
   * 既存の背景画像パイプライン(プレビュー/PNG書き出し)をそのまま使い回せます。
   *
   * @param {number} targetW キャンバスの実寸幅
   * @param {number} targetH キャンバスの実寸高さ
   * @param {{colors:string[], angle?:number}} spec グラデーション定義
   * @returns {string} data URL
   */
  function generateGradientDataUrl(targetW, targetH, spec){
    var w = 480;
    var h = Math.max(1, Math.round(w * targetH / targetW));
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    var angle = spec.angle !== undefined ? spec.angle : 135;
    var rad = (angle * Math.PI) / 180;
    var cx = w / 2;
    var cy = h / 2;
    var dx = Math.cos(rad) * (w / 2);
    var dy = Math.sin(rad) * (h / 2);
    var grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    spec.colors.forEach(function(color, i){
      grad.addColorStop(spec.colors.length > 1 ? i / (spec.colors.length - 1) : 0, color);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return c.toDataURL("image/png");
  }

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
      bg: { colors: ["#092635", "#1B4242" ], angle: 120 },
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

  // テンプレートにする（あったものは「元に戻す」で戻せる）
  function applyTemplate(template){
    var menu = activeMenu();
    changeMaybeUndoable(template.name + " にしました", Boolean(menu.areas.length || menu.bgImage), function(){
      applyTemplateNow(template, menu);
    });
  }

  // テンプレートの大きさ・背景・エリアを、いまのタブに入れる
  function applyTemplateNow(template, menu){
    if (template.size) setMenuSize(menu, template.size);

    if (template.bg) {
      menu.bgColor = template.bg.colors[0];
      menu.bgImage = generateGradientDataUrl(menu.width, menu.height, template.bg);
    }

    menu.areas = template.areas.map(function(spec){
      var transparent = !!spec.transparent;
      return makeArea(spec.label, {
        x: Math.round(spec.xr * menu.width),
        y: Math.round(spec.yr * menu.height),
        w: Math.round(spec.wr * menu.width),
        h: Math.round(spec.hr * menu.height),
        icon: spec.icon || "",
        bgColor: spec.bgColor || "#1B7A43",
        textColor: spec.textColor || "#FFFFFF",
        transparent: transparent,
        radius: spec.radius !== undefined ? spec.radius : 16,
        border: spec.border || "line",
        fontWeight: spec.fontWeight || "bold",
        fontSize: spec.fontSize || null,
        textShadow: spec.textShadow !== undefined ? spec.textShadow : transparent
      });
    });
    menu.selectedId = null;
  }

  // テンプレートのボタンを並べる
  function renderTemplateButtons(){
    el.templateList.innerHTML = "";
    TEMPLATES.forEach(function(template){
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tpl-btn";

      var swatch = document.createElement("div");
      swatch.className = "tpl-swatch";
      swatch.style.background = "linear-gradient(" + ((template.bg.angle || 135) - 90) + "deg, " + template.bg.colors.join(",") + ")";
      template.areas.forEach(function(spec){
        var mark = document.createElement("i");
        mark.style.left = (spec.xr * 100) + "%";
        mark.style.top = (spec.yr * 100) + "%";
        mark.style.width = (spec.wr * 100) + "%";
        mark.style.height = (spec.hr * 100) + "%";
        mark.style.background = spec.transparent ? "transparent" : (spec.bgColor || "#1B7A43");
        swatch.appendChild(mark);
      });
      btn.appendChild(swatch);

      var meta = document.createElement("div");
      meta.className = "tpl-meta";
      meta.innerHTML = "<strong>" + escapeHtml(template.name) + "</strong><span>" + escapeHtml(template.desc) + "</span>";
      btn.appendChild(meta);

      btn.addEventListener("click", function(){ applyTemplate(template); });
      el.templateList.appendChild(btn);
    });
  }

  // ---------- static UI: grid presets ----------
  var GRID_PRESETS = [
    { rows: 1, cols: 1, label: "全面 1つ" },
    { rows: 1, cols: 2, label: "1×2" },
    { rows: 2, cols: 2, label: "2×2" },
    { rows: 2, cols: 3, label: "2×3" },
    { rows: 3, cols: 2, label: "3×2" },
    { rows: 1, cols: 3, label: "1×3" }
  ];

  // グリッドのボタンを並べる
  function renderGridPresetButtons(){
    el.gridPresets.innerHTML = "";
    GRID_PRESETS.forEach(function(p){
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "grid-btn";
      var swatch = document.createElement("div");
      swatch.className = "grid-swatch";
      swatch.style.gridTemplateColumns = "repeat(" + p.cols + ",1fr)";
      swatch.style.gridTemplateRows = "repeat(" + p.rows + ",1fr)";
      for (var i = 0; i < p.rows * p.cols; i += 1) {
        var cell = document.createElement("span");
        swatch.appendChild(cell);
      }
      btn.appendChild(swatch);
      var text = document.createElement("span");
      text.textContent = p.label;
      btn.appendChild(text);
      btn.addEventListener("click", function(rows, cols){
        return function(){ generateGrid(rows, cols); };
      }(p.rows, p.cols));
      el.gridPresets.appendChild(btn);
    });
  }

  // ---------- wire static events ----------
  el.sizePreset.addEventListener("change", function(){ applySizePreset(this.value); });
  el.canvas.addEventListener("pointerdown", onCanvasPointerDown);
  el.canvas.addEventListener("pointermove", onCanvasPointerMove);
  el.canvas.addEventListener("pointerup", onCanvasPointerUp);
  el.canvas.addEventListener("pointercancel", onCanvasPointerUp);

  el.addMenuBtn.addEventListener("click", addMenu);

  el.bgColor.addEventListener("input", function(){ activeMenu().bgColor = this.value; renderCanvas(); });
  // 画面の幅が変わったら、キャンバスを入る大きさに
  var resizeFrame = 0;
  var lastWrapWidth = 0;
  // 画面の幅が変わったら、キャンバスを描きなおす
  function onWrapResize(){
    var w = el.canvas.parentElement.clientWidth;
    if (w === lastWrapWidth) return;
    lastWrapWidth = w;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(renderCanvas);
  }
  if (window.ResizeObserver) new ResizeObserver(onWrapResize).observe(el.canvas.parentElement);
  window.addEventListener("resize", onWrapResize);
  el.bgImageInput.addEventListener("change", function(){
    var menu = activeMenu();
    pickImage(this, function(dataUrl){ menu.bgImage = dataUrl; });
  });
  el.clearBgImage.addEventListener("click", function(){
    el.bgImageInput.value = "";
    undoable("背景の画像を外しました", function(){ activeMenu().bgImage = null; });
  });

  el.menuName.addEventListener("input", function(){ activeMenu().name = this.value; renderTabs(); renderJsonPreview(); });
  el.menuAlias.addEventListener("input", function(){ activeMenu().alias = this.value; renderToolbox(); renderJsonPreview(); });
  el.chatBarText.addEventListener("input", function(){ activeMenu().chatBarText = this.value; renderToolbox(); renderJsonPreview(); });

  el.addAreaBtn.addEventListener("click", addManualArea);
  el.copyJsonBtn.addEventListener("click", copyJsonToClipboard);
  el.downloadJsonBtn.addEventListener("click", downloadJson);
  el.exportPngBtn.addEventListener("click", exportPng);

  // ---------- init ----------
  renderTemplateButtons();
  renderGridPresetButtons();
  render();

  // Q キット（ui.js は defer で読むので、読み終わってから）：前回の続きの知らせと、はじめての人への案内
  document.addEventListener("DOMContentLoaded", function(){
    if (!window.LineShareUI) return;
    if (restored) {
      showToast("前回の続きから開きました", null, { actionLabel: "新しく作る", onAction: startFresh });
    }
    window.LineShareUI.firstTip("richmenu-studio", [
      "「テンプレート」か「グリッド」で、ボタンの並びを作る（キャンバスをなぞっても作れます）",
      "エリアを選ぶと、文字・色・押したときの動きを変えられます",
      "「🖼️ PNGを書き出す」と JSON を、LINE のリッチメニューに使う"
    ], document.querySelector(".workspace"));
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(function(){});

  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then(function(api){
      downloadsApi = api;
    });
  }
})();
