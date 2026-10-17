/* ==========================================================================
   AIMLAB WEB · Crosshair
   准星绘制（Game 实时绘制 / UI 设置页预览共用的唯一实现）
   ========================================================================== */
const Crosshair = (() => {
  'use strict';

  const DEFAULTS = {
    style: 'cross',
    color: '#2ce8ff',
    size: 14,
    thickness: 2,
    gap: 4,
    opacity: 0.95,
    outline: true,
  };

  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));

  function normalize(cfg) {
    const src = cfg || {};
    return {
      style: ['cross', 'dot', 'ring', 't', 'x'].indexOf(src.style) >= 0 ? src.style : DEFAULTS.style,
      color: typeof src.color === 'string' ? src.color : DEFAULTS.color,
      size: clamp(src.size, 6, 30),
      thickness: clamp(src.thickness, 1, 6),
      gap: clamp(src.gap, 0, 14),
      opacity: Number.isFinite(src.opacity) ? clamp(src.opacity, 0.2, 1) : DEFAULTS.opacity,
      outline: src.outline !== false,
    };
  }

  function hexToRgba(hex, alpha) {
    const a = alpha === undefined ? 1 : alpha;
    let value = String(hex || '').trim();
    if (/^#([0-9a-f]{3})$/i.test(value)) {
      value = '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
    }
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
    if (!match) return 'rgba(44,232,255,' + a + ')';
    return 'rgba(' + parseInt(match[1], 16) + ',' + parseInt(match[2], 16) + ',' + parseInt(match[3], 16) + ',' + a + ')';
  }

  function drawSegments(ctx, segments, width) {
    ctx.beginPath();
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      ctx.moveTo(seg[0], seg[1]);
      ctx.lineTo(seg[2], seg[3]);
    }
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function buildLines(style, gap, length) {
    if (style === 'cross' || style === 't') {
      const lines = [
        [gap, 0, gap + length, 0],
        [-(gap + length), 0, -gap, 0],
        [0, gap, 0, gap + length],
      ];
      if (style === 'cross') lines.push([0, -(gap + length), 0, -gap]);
      return lines;
    }
    if (style === 'x') {
      const diag = Math.SQRT1_2;
      const inner = gap * diag;
      const outer = (gap + length) * diag;
      return [
        [inner, inner, outer, outer],
        [-inner, -inner, -outer, -outer],
        [inner, -inner, outer, -outer],
        [-inner, inner, -outer, outer],
      ];
    }
    return [];
  }

  /**
   * 在 ctx 的 (x, y) 画准星。
   * opts: { kick:0..1, alpha:1, scale:1, colorOverride:string }
   */
  function draw(ctx, x, y, cfg, opts) {
    if (!ctx) return;
    const conf = normalize(cfg);
    const options = opts || {};
    const scale = clamp(options.scale === undefined ? 1 : options.scale, 0.25, 4);
    const opacity = clamp(options.alpha === undefined ? 1 : options.alpha, 0, 1) * conf.opacity;
    if (opacity <= 0) return;

    const kick = clamp(options.kick || 0, 0, 1);
    const kickPx = kick * 9 * scale;
    const color = options.colorOverride || conf.color;
    const thickness = Math.max(1, conf.thickness * scale);
    const gap = Math.max(0, (conf.gap + kickPx) * scale);
    const length = Math.max(2, conf.size * scale);

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = opacity;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    if (conf.style === 'dot') {
      const radius = Math.max(1.4, conf.size * 0.22 * scale);
      if (conf.outline) {
        ctx.beginPath();
        ctx.arc(0, 0, radius + Math.max(1, scale), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.68)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      return;
    }

    if (conf.style === 'ring') {
      const radius = Math.max(5, (conf.gap + length * 0.72 + kickPx * 0.6) * scale);
      const dot = Math.max(1, thickness * 0.9);
      if (conf.outline) {
        ctx.beginPath();
        ctx.arc(0, 0, radius + thickness * 0.5 + Math.max(1, scale), 0, Math.PI * 2);
        ctx.lineWidth = thickness + Math.max(2, scale * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.68)';
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.lineWidth = thickness;
      ctx.strokeStyle = color;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, dot, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      return;
    }

    const segments = buildLines(conf.style, gap, length);
    if (!segments.length) {
      ctx.restore();
      return;
    }

    if (conf.outline) {
      ctx.strokeStyle = 'rgba(0,0,0,0.72)';
      drawSegments(ctx, segments, thickness + Math.max(2, scale * 2));
    }
    ctx.strokeStyle = color;
    drawSegments(ctx, segments, thickness);
    ctx.restore();
  }

  /**
   * 设置页预览：深色网格舞台 + 模拟靶心 + 准星。
   * opts: { mode: 'dark'|'grid', scale }
   */
  function drawPreview(canvas, cfg, opts) {
    if (!canvas || !canvas.getContext) return;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
    const cssW = Math.round(rect.width || canvas.clientWidth || 0);
    const cssH = Math.round(rect.height || canvas.clientHeight || 0);
    if (cssW < 8 || cssH < 8) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const pixelW = Math.round(cssW * dpr);
    const pixelH = Math.round(cssH * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const conf = normalize(cfg);
    const options = opts || {};
    const cx = cssW / 2;
    const cy = cssH / 2;

    // 舞台底色
    const bg = ctx.createLinearGradient(0, 0, cssW, cssH);
    bg.addColorStop(0, '#08131f');
    bg.addColorStop(0.55, '#050b13');
    bg.addColorStop(1, '#03070c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    // 网格
    const gridSize = Math.max(22, Math.min(cssW, cssH) / 7);
    ctx.save();
    ctx.strokeStyle = 'rgba(90, 180, 255, 0.075)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = (cx % gridSize) - gridSize; gx < cssW; gx += gridSize) {
      ctx.moveTo(Math.round(gx) + 0.5, 0);
      ctx.lineTo(Math.round(gx) + 0.5, cssH);
    }
    for (let gy = (cy % gridSize) - gridSize; gy < cssH; gy += gridSize) {
      ctx.moveTo(0, Math.round(gy) + 0.5);
      ctx.lineTo(cssW, Math.round(gy) + 0.5);
    }
    ctx.stroke();
    ctx.restore();

    // 中心参考线与柔和准星光
    ctx.save();
    ctx.strokeStyle = 'rgba(44, 232, 255, 0.11)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, 18);
    ctx.lineTo(cx, cssH - 18);
    ctx.moveTo(18, cy);
    ctx.lineTo(cssW - 18, cy);
    ctx.stroke();
    ctx.restore();

    // 模拟靶环
    const targetRadius = Math.min(cssW, cssH) * 0.29;
    ctx.save();
    ctx.translate(cx, cy);
    const glow = ctx.createRadialGradient(0, 0, targetRadius * 0.2, 0, 0, targetRadius * 1.5);
    glow.addColorStop(0, 'rgba(44,232,255,0.11)');
    glow.addColorStop(0.55, 'rgba(44,232,255,0.035)');
    glow.addColorStop(1, 'rgba(44,232,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, targetRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(120, 214, 255, 0.22)';
    ctx.lineWidth = 1;
    for (let r = targetRadius; r > 4; r *= 0.64) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120, 214, 255, 0.35)';
    ctx.fill();
    ctx.restore();

    // 准星（预览按比例放大一点，便于观察细节）
    const baseScale = Math.max(0.9, Math.min(cssW / 340, cssH / 170));
    const userScale = options.scale === undefined ? 1.7 : options.scale;
    draw(ctx, cx, cy, conf, {
      scale: baseScale * userScale,
      alpha: 1,
      kick: 0,
      colorOverride: options.colorOverride,
    });

    // 四周暗角
    const vignette = ctx.createRadialGradient(cx, cy, Math.min(cssW, cssH) * 0.2, cx, cy, Math.max(cssW, cssH) * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  return {
    DEFAULTS,
    normalize,
    hexToRgba,
    draw,
    drawPreview,
  };
})();
