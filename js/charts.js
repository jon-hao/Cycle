window.CycleCharts = (function () {
  function themeColor(name, fallback) {
    return (
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
      fallback
    );
  }

  function formatTickLabel(raw) {
    const s = String(raw);
    if (/^\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
    if (s.length > 7) return s.slice(0, 7);
    return s;
  }

  /** 均匀选取横轴刻度下标，首尾必含，中间留白 */
  function pickXTicks(n, target) {
    if (n <= 1) return [0];
    const want = Math.max(2, Math.min(target || 5, n));
    if (n <= want) return Array.from({ length: n }, (_, i) => i);
    const idxs = [];
    for (let k = 0; k < want; k++) {
      idxs.push(Math.round((k * (n - 1)) / (want - 1)));
    }
    return [...new Set(idxs)];
  }

  function lineChart(canvas, points, opts) {
    const o = Object.assign(
      {
        color: themeColor("--accent-2", "#3d8bfd"),
        padL: 48,
        padR: 16,
        padT: 28,
        padB: 36,
        blinkAt: null,
        xUnit: "",
        yUnit: "",
        xTicks: 5,
      },
      opts || {}
    );
    if (o.pad != null) {
      o.padL = o.padL || o.pad;
      o.padR = o.padR || o.pad / 2;
      o.padT = o.padT || o.pad;
      o.padB = o.padB || o.pad;
    }
    if (!points || !points.length) return { destroy() {} };

    let blinkIdx = points.length - 1;
    if (o.blinkAt != null) {
      const want = String(o.blinkAt);
      const found = points.findIndex((p) => String(p.d) === want);
      if (found >= 0) blinkIdx = found;
    }

    const state = { idx: blinkIdx, points, o, t0: performance.now() };
    const ctx = canvas.getContext("2d");
    let raf = 0;

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 320;
      const h = canvas.clientHeight || 220;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const vals = points.map((p) => p.v);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min || 1;
      const padL = o.padL;
      const padR = o.padR;
      const padT = o.padT;
      const padB = o.padB;
      const iw = w - padL - padR;
      const ih = h - padT - padB;
      const ink = themeColor("--ink", "#111");
      const muted = themeColor("--muted", "#888");
      const line = themeColor("--line", "#ccc");

      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padT + (ih * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
      }

      const xy = points.map((p, i) => ({
        x: padL + (iw * i) / Math.max(1, points.length - 1),
        y: padT + ih - ((p.v - min) / span) * ih,
        p,
      }));

      ctx.beginPath();
      xy.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      ctx.lineTo(xy[xy.length - 1].x, padT + ih);
      ctx.lineTo(xy[0].x, padT + ih);
      ctx.closePath();
      if (o.color.startsWith("#")) {
        ctx.fillStyle = o.color + "24";
      } else {
        ctx.fillStyle = o.color.replace(")", ",0.14)").replace("rgb", "rgba");
      }
      ctx.fill();

      if (o.blinkAt != null && xy[blinkIdx]) {
        const pulse =
          0.35 + 0.65 * (0.5 + 0.5 * Math.sin((performance.now() - state.t0) / 280));
        const b = xy[blinkIdx];
        ctx.beginPath();
        ctx.arc(b.x, b.y, 10 + pulse * 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(228, 87, 46, ${pulse * 0.45})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = themeColor("--accent", "#e4572e");
        ctx.fill();
      }

      const i = Math.max(0, Math.min(points.length - 1, state.idx));
      const cur = xy[i];
      ctx.beginPath();
      ctx.moveTo(cur.x, padT);
      ctx.lineTo(cur.x, padT + ih);
      ctx.strokeStyle = muted;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = o.color;
      ctx.fill();

      // 顶部读数
      ctx.fillStyle = ink;
      ctx.font = "12px 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "left";
      const yUnit = o.yUnit || "";
      ctx.fillText(
        `${cur.p.d}  ·  ${cur.p.v.toFixed(2)}${yUnit}`,
        padL,
        16
      );

      // Y 轴刻度 + 单位
      ctx.fillStyle = muted;
      ctx.font = "11px 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "right";
      for (let g = 0; g <= 4; g++) {
        const val = max - (span * g) / 4;
        const y = padT + (ih * g) / 4;
        ctx.fillText(val.toFixed(1) + yUnit, padL - 6, y + 4);
      }
      if (o.yUnit) {
        ctx.textAlign = "left";
        ctx.fillText(o.yUnit, 4, padT - 8);
      }

      // X 轴刻度 + 单位
      const ticks = pickXTicks(points.length, o.xTicks);
      ctx.textAlign = "center";
      ctx.fillStyle = muted;
      ticks.forEach((ti) => {
        const pt = xy[ti];
        if (!pt) return;
        ctx.beginPath();
        ctx.moveTo(pt.x, padT + ih);
        ctx.lineTo(pt.x, padT + ih + 4);
        ctx.strokeStyle = line;
        ctx.stroke();
        ctx.fillText(formatTickLabel(pt.p.d), pt.x, padT + ih + 16);
      });
      if (o.xUnit) {
        ctx.textAlign = "right";
        ctx.fillText(o.xUnit, w - padR, h - 6);
      }
    }

    function posToIndex(clientX) {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const padL = o.padL;
      const padR = o.padR;
      const iw = w - padL - padR;
      const x = clientX - rect.left;
      const t = (x - padL) / Math.max(1, iw);
      return Math.round(Math.max(0, Math.min(1, t)) * (points.length - 1));
    }

    function onMove(e) {
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      state.idx = posToIndex(x);
      draw();
      if (e.cancelable) e.preventDefault();
    }

    canvas.style.touchAction = "none";
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchstart", onMove, { passive: false });

    function loop() {
      draw();
      if (o.blinkAt != null) raf = requestAnimationFrame(loop);
    }
    loop();
    window.addEventListener("resize", draw);

    return {
      destroy() {
        cancelAnimationFrame(raf);
        canvas.removeEventListener("mousemove", onMove);
        canvas.removeEventListener("touchmove", onMove);
        canvas.removeEventListener("touchstart", onMove);
        window.removeEventListener("resize", draw);
      },
    };
  }

  function kondratievQuadrant(svg, model) {
    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const w = 360;
    const h = 360;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const cx = w / 2;
    const cy = h / 2;
    const r = 128;

    function el(name, attrs, text) {
      const n = document.createElementNS(ns, name);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      if (text != null) n.textContent = text;
      svg.appendChild(n);
      return n;
    }

    el("defs", {});
    const defs = svg.querySelector("defs");
    const grad = document.createElementNS(ns, "radialGradient");
    grad.setAttribute("id", "kGlow");
    grad.innerHTML =
      '<stop offset="0%" stop-color="var(--brand)" stop-opacity="0.25"/><stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>';
    defs.appendChild(grad);

    el("circle", { cx, cy, r: r + 18, fill: "url(#kGlow)" });
    el("circle", {
      cx,
      cy,
      r,
      fill: "var(--card)",
      stroke: "var(--line)",
      "stroke-width": "1.5",
    });

    // quadrants soft fills
    const quads = [
      { d: `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`, f: "rgba(61,206,160,0.08)" },
      { d: `M ${cx} ${cy} L ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - r} Z`, f: "rgba(61,139,253,0.08)" },
      { d: `M ${cx} ${cy} L ${cx} ${cy + r} A ${r} ${r} 0 0 1 ${cx - r} ${cy} Z`, f: "rgba(255,122,89,0.08)" },
      { d: `M ${cx} ${cy} L ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy + r} Z`, f: "rgba(155,120,255,0.08)" },
    ];
    quads.forEach((q) => el("path", { d: q.d, fill: q.f }));

    el("line", { x1: cx - r, y1: cy, x2: cx + r, y2: cy, stroke: "var(--line)" });
    el("line", { x1: cx, y1: cy - r, x2: cx, y2: cy + r, stroke: "var(--line)" });

    const px = cx + model.x * r * 0.88;
    const py = cy - model.y * r * 0.88;
    el("circle", { cx: px, cy: py, r: 16, class: "pulse-ring", fill: "var(--accent)", opacity: "0.35" });
    el("circle", { cx: px, cy: py, r: 7, fill: "var(--accent)" });
    el("circle", { cx: px, cy: py, r: 3, fill: "#fff" });

    // direction arrow
    const ang = Math.atan2(-model.dy, model.dx);
    const len = 28;
    const ax = px + Math.cos(ang) * 14;
    const ay = py + Math.sin(ang) * 14;
    const bx = ax + Math.cos(ang) * len;
    const by = ay + Math.sin(ang) * len;
    el("line", {
      x1: ax,
      y1: ay,
      x2: bx,
      y2: by,
      stroke: "var(--accent)",
      "stroke-width": "3",
      "stroke-linecap": "round",
    });
    const left = ang + Math.PI * 0.8;
    const right = ang - Math.PI * 0.8;
    el("path", {
      d: `M ${bx} ${by} L ${bx + Math.cos(left) * 10} ${by + Math.sin(left) * 10} L ${bx + Math.cos(right) * 10} ${by + Math.sin(right) * 10} Z`,
      fill: "var(--accent)",
    });
  }

  /**
   * 恐惧贪婪上半圆仪表：4 段（极度恐慌 / 恐慌 / 贪婪 / 极度贪婪）
   * 角度：180°(左) → 0°(右)，经顶部；trend -1/0/+1
   */
  function fearGreedGauge(svg, value, trend) {
    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const w = 340;
    const h = 210;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const cx = w / 2;
    const cy = 148;
    const r = 108;
    const strokeW = 20;

    function el(name, attrs, text) {
      const n = document.createElementNS(ns, name);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      if (text != null) n.textContent = text;
      svg.appendChild(n);
      return n;
    }

    // 数学角：0° 右、90° 上、180° 左；SVG y 向下故用 cy - sin
    function pt(deg, rr) {
      const rad = (deg * Math.PI) / 180;
      return [cx + rr * Math.cos(rad), cy - rr * Math.sin(rad)];
    }

    function arc(degFrom, degTo, rr) {
      const [x0, y0] = pt(degFrom, rr);
      const [x1, y1] = pt(degTo, rr);
      // 从左到右沿上半圆：deg 递减，sweep=1
      return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rr} ${rr} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    }

    function degOf(v) {
      return 180 - (Math.max(0, Math.min(100, v)) / 100) * 180;
    }

    // 红 / 黄 / 绿 / 深绿
    const STAGE_COLORS = {
      fgExtremeFear: "#c0392b",
      fgFear: "#e6b422",
      fgGreed: "#27ae60",
      fgExtremeGreed: "#1e8449",
    };
    const segments = [
      { from: 180, to: 135, color: STAGE_COLORS.fgExtremeFear, key: "fgExtremeFear" },
      { from: 135, to: 90, color: STAGE_COLORS.fgFear, key: "fgFear" },
      { from: 90, to: 45, color: STAGE_COLORS.fgGreed, key: "fgGreed" },
      { from: 45, to: 0, color: STAGE_COLORS.fgExtremeGreed, key: "fgExtremeGreed" },
    ];

    function stageKeyOf(val) {
      if (val < 25) return "fgExtremeFear";
      if (val < 50) return "fgFear";
      if (val < 75) return "fgGreed";
      return "fgExtremeGreed";
    }

    segments.forEach((s) => {
      el("path", {
        d: arc(s.from, s.to, r),
        fill: "none",
        stroke: s.color,
        "stroke-width": String(strokeW),
        "stroke-linecap": "butt",
      });
    });

    // 标签放在弧内侧，避免重叠
    [
      { deg: 157, key: "fgExtremeFear" },
      { deg: 112, key: "fgFear" },
      { deg: 68, key: "fgGreed" },
      { deg: 23, key: "fgExtremeGreed" },
    ].forEach((L) => {
      const [x, y] = pt(L.deg, r - 34);
      el(
        "text",
        {
          x: x.toFixed(1),
          y: y.toFixed(1),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": "10",
          fill: "var(--muted)",
          "font-family": "Microsoft YaHei, sans-serif",
        },
        window.t(L.key)
      );
    });

    const v = value == null ? 50 : Number(value);
    const needleDeg = degOf(v);
    const [nx, ny] = pt(needleDeg, r - 26);
    el("line", {
      x1: cx,
      y1: cy,
      x2: nx.toFixed(1),
      y2: ny.toFixed(1),
      stroke: "var(--ink)",
      "stroke-width": "3",
      "stroke-linecap": "round",
    });
    el("circle", { cx, cy, r: 7, fill: "var(--ink)" });
    el("circle", { cx: nx.toFixed(1), cy: ny.toFixed(1), r: 5, fill: "var(--accent)" });

    const numColor = STAGE_COLORS[stageKeyOf(v)];
    el(
      "text",
      {
        x: cx,
        y: cy - 36,
        "text-anchor": "middle",
        "font-size": "30",
        "font-weight": "700",
        fill: numColor,
        "font-family": "Microsoft YaHei, sans-serif",
      },
      String(Math.round(v))
    );

    const tr = trend || 0;
    const trendY = cy + 28;
    if (tr !== 0) {
      const dir = tr > 0 ? 1 : -1;
      const tipX = cx + dir * 52;
      const baseX = cx + dir * 14;
      const col = dir > 0 ? "#27ae60" : "#c0392b";
      el("line", {
        x1: baseX,
        y1: trendY,
        x2: tipX,
        y2: trendY,
        stroke: col,
        "stroke-width": "3",
        "stroke-linecap": "round",
      });
      el("path", {
        d: `M ${tipX} ${trendY} L ${tipX - dir * 10} ${trendY - 6} L ${tipX - dir * 10} ${trendY + 6} Z`,
        fill: col,
      });
      el(
        "text",
        {
          x: cx,
          y: trendY + 22,
          "text-anchor": "middle",
          "font-size": "12",
          fill: "var(--muted)",
          "font-family": "Microsoft YaHei, sans-serif",
        },
        dir > 0 ? window.t("fgTrendGreed") : window.t("fgTrendFear")
      );
    } else {
      el(
        "text",
        {
          x: cx,
          y: trendY + 16,
          "text-anchor": "middle",
          "font-size": "12",
          fill: "var(--muted)",
          "font-family": "Microsoft YaHei, sans-serif",
        },
        window.t("fgTrendFlat")
      );
    }
  }

  return { lineChart, kondratievQuadrant, fearGreedGauge };
})();
