/**
 * リッチメニュースタジオの、画像を作る部分（index.html から読む。js/richmenu.js のあと。app.js が window.RichMenuExport として使う）。
 * - renderMenuCanvas：メニュー1つを、実寸のキャンバスに描く（背景・エリアの箱・画像・枠・文字）
 * - encodeForLine：LINE に入る画像（1MB まで）にする。入らないときは画質を下げた JPEG
 * - gradientDataUrl：テンプレートの背景のグラデーションの画像
 * - loadImage：画像の URL を読んで img にする
 * キャンバス（document）を使うので、ブラウザの中だけで動く。
 */
(function (root) {
  "use strict";

  var Core = root.RichMenuCore;

  // 画像の URL を読んで img にする
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  // data:image/…;base64,… を Blob にする（toBlob がない古いブラウザ用）
  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(",");
    var mimeMatch = parts[0].match(/:(.*?);/);
    var mime = mimeMatch ? mimeMatch[1] : "image/png";
    var binary = atob(parts[1]);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  // 画像を枠いっぱいに（はみ出しは切る）描く
  function drawImageCover(ctx, img, x, y, w, h) {
    var ir = img.width / img.height;
    var tr = w / h;
    var sw = img.width;
    var sh = img.height;
    if (ir > tr) sw = sh * tr;
    else sh = sw / tr;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  // 角の丸い四角の線を作る
  function roundedRectPath(ctx, x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // エリアの箱（影・背景の色か画像・枠の線）を描く。img は読めたエリアの画像（なければ null）
  function drawAreaBox(ctx, a, img) {
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
  function drawAreaText(ctx, a) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = a.textColor;
    var fontSize = a.fontSize ? a.fontSize : Core.autoFontSize(a);
    var labelFont = Core.fontWeightCss(a.fontWeight) + " " + Math.round(fontSize) + "px Archivo, sans-serif";
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
      ctx.font = labelFont;
      ctx.fillText(a.label || "", cx, cy + fontSize * 0.75);
    } else {
      ctx.font = labelFont;
      ctx.fillText(a.label || "", cx, cy);
    }

    if (a.textShadow) ctx.restore();
  }

  // 書き出す画像に、エリア1つ（箱・画像・枠・文字）を描く
  async function drawArea(ctx, a) {
    var img = null;
    if (a.image) {
      try { img = await loadImage(a.image); } catch (e) { img = null; }
    }
    drawAreaBox(ctx, a, img);
    drawAreaText(ctx, a);
  }

  // 背景（画像か塗り色）を描く。画像が読めないときは塗り色
  async function drawBackground(ctx, menu) {
    if (menu.bgImage) {
      try {
        drawImageCover(ctx, await loadImage(menu.bgImage), 0, 0, menu.width, menu.height);
        return;
      } catch (e) { /* 塗り色にする */ }
    }
    ctx.fillStyle = menu.bgColor;
    ctx.fillRect(0, 0, menu.width, menu.height);
  }

  /** メニュー1つを、実寸のキャンバスに描く（字のフォントを読み終わってから） */
  async function renderMenuCanvas(menu) {
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* そのまま描く */ }
    }
    var canvas = document.createElement("canvas");
    canvas.width = menu.width;
    canvas.height = menu.height;
    var ctx = canvas.getContext("2d");
    await drawBackground(ctx, menu);
    for (var i = 0; i < menu.areas.length; i += 1) {
      await drawArea(ctx, menu.areas[i]);
    }
    return canvas;
  }

  // キャンバスを画像のファイル（Blob）にする
  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) canvas.toBlob(resolve, type, quality);
      else resolve(dataUrlToBlob(canvas.toDataURL(type, quality)));
    });
  }

  /**
   * LINE に入れられる画像（1MB まで）にする。PNG で入ればそのまま PNG。
   * 写真などで大きくなるときは、入るまで画質を下げた JPEG にする。
   * 返すのは { blob, ext, jpeg, tooLarge }（tooLarge は、いちばん下げても入らないとき）。
   */
  async function encodeForLine(canvas) {
    var max = Core.LIMIT.LINE_IMAGE;
    var png = await canvasToBlob(canvas, "image/png");
    if (png && png.size <= max) return { blob: png, ext: "png", jpeg: false, tooLarge: false };
    var qualities = [0.92, 0.85, 0.75, 0.65, 0.5];
    var jpeg = null;
    for (var i = 0; i < qualities.length; i += 1) {
      jpeg = await canvasToBlob(canvas, "image/jpeg", qualities[i]);
      if (jpeg && jpeg.size <= max) break;
    }
    return { blob: jpeg || png, ext: "jpg", jpeg: true, tooLarge: !jpeg || jpeg.size > max };
  }

  /**
   * テンプレートの背景のグラデーションの画像（data URL）。
   * menu.bgImage にそのまま入れる（見本・書き出しは、ふつうの背景の画像と同じに描ける）。
   * spec は { colors: [色…], angle: 角度（はじめは 135） }。
   */
  function gradientDataUrl(targetW, targetH, spec) {
    var w = 480;
    var h = Math.max(1, Math.round(w * targetH / targetW));
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    var rad = ((spec.angle !== undefined ? spec.angle : 135) * Math.PI) / 180;
    var dx = Math.cos(rad) * (w / 2);
    var dy = Math.sin(rad) * (h / 2);
    var grad = ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
    spec.colors.forEach(function (color, i) {
      grad.addColorStop(spec.colors.length > 1 ? i / (spec.colors.length - 1) : 0, color);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return c.toDataURL("image/png");
  }

  root.RichMenuExport = {
    loadImage: loadImage,
    renderMenuCanvas: renderMenuCanvas,
    encodeForLine: encodeForLine,
    gradientDataUrl: gradientDataUrl
  };
})(typeof self !== "undefined" ? self : this);
