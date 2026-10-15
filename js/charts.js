window.CycleCharts = (function () {
  function themeColor(name, fallback) {
    return (
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
      fallback
    );
  }

  function lineChart(canvas, points, opts) {
    const o = Object.assign(
      {
        color: themeColor("--accent-2", "#3d8bfd"),
        pad: 36,
        blinkAt: null, // 日期字符串，用于闪烁当前节点
      },
      opts || {}
    );
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
      const h = canvas.clientHeight || 200;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const vals = points.map((p) => p.v);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min || 1;
      const pad = o.pad;
      const iw = w - pad * 2;
      const ih = h - pad * 2;

      ctx.strokeStyle = themeColor("--line", "#ccc");
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad + (ih * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(w - pad, y);
        ctx.stroke();
      }

      const xy = points.map((p, i) => ({
        x: pad + (iw * i) / Math.max(1, points.length - 1),
        y: pad + ih - ((p.v - min) / span) * ih,
        p,
      }));

      ctx.beginPath();
      xy.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      ctx.lineTo(xy[xy.length - 1].x, pad + ih);
      ctx.lineTo(xy[0].x, pad + ih);
      ctx.closePath();
      if (o.color.startsWith("#")) {
        ctx.fillStyle = o.color + "24";
      } else {
        ctx.fillStyle = o.color.replace(")", ",0.14)").replace("rgb", "rgba");
      }
      ctx.fill();

      // 当前节点闪烁
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
      ctx.moveTo(cur.x, pad);
      ctx.lineTo(cur.x, pad + ih);
      ctx.strokeStyle = themeColor("--muted", "#888");
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = o.color;
      ctx.fill();

      ctx.fillStyle = themeColor("--ink", "#111");
      ctx.font = "12px 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${cur.p.d}  ·  ${cur.p.v.toFixed(2)}`, pad, 18);
      ctx.fillText(max.toFixed(1), 4, pad + 8);
      ctx.fillText(min.toFixed(1), 4, pad + ih);
    }

    function posToIndex(clientX) {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const pad = o.pad;
      const iw = w - pad * 2;
      const x = clientX - rect.left;
      const t = (x - pad) / Math.max(1, iw);
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

    [
      { t: window.t("summer"), x: cx - r * 0.52, y: cy - r * 0.52 },
      { t: window.t("spring"), x: cx + r * 0.52, y: cy - r * 0.52 },
      { t: window.t("autumn"), x: cx - r * 0.52, y: cy + r * 0.58 },
      { t: window.t("winter"), x: cx + r * 0.52, y: cy + r * 0.58 },
    ].forEach((L) =>
      el(
        "text",
        {
          x: L.x,
          y: L.y,
          "text-anchor": "middle",
          fill: "var(--muted)",
          "font-size": "13",
          "font-family": "Microsoft YaHei, sans-serif",
        },
        L.t
      )
    );

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
   * 恐惧贪婪半圆仪表：4 段（极度恐慌 / 恐慌 / 贪婪 / 极度贪婪）
   * trend: -1 偏恐慌，+1 偏贪婪，0 持平
   */
  function fearGreedGauge(svg, value, trend) {
    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const w = 320;
    const h = 190;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const cx = w / 2;
    const cy = 150;
    const r = 110;

    function el(name, attrs, text) {
      const n = document.createElementNS(ns, name);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      if (text != null) n.textContent = text;
      svg.appendChild(n);
      return n;
    }

    function polar(a, rr) {
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    }

    // 半圆：从 π(左) 到 0(右)，值 0→100
    function angleOf(v) {
      return Math.PI - (Math.max(0, Math.min(100, v)) / 100) * Math.PI;
    }

    function arcPath(a0, a1, rr) {
      const [x0, y0] = polar(a0, rr);
      const [x1, y1] = polar(a1, rr);
      const large = a0 - a1 > Math.PI ? 1 : 0;
      return `M ${x0} ${y0} A ${rr} ${rr} 0 ${large} 1 ${x1} ${y1}`;
    }

    const segments = [
      { a0: Math.PI, a1: (3 * Math.PI) / 4, color: "#c0392b", key: "fgExtremeFear" },
      { a0: (3 * Math.PI) / 4, a1: Math.PI / 2, color: "#e67e22", key: "fgFear" },
      { a0: Math.PI / 2, a1: Math.PI / 4, color: "#27ae60", key: "fgGreed" },
      { a0: Math.PI / 4, a1: 0, color: "#1e8449", key: "fgExtremeGreed" },
    ];

    segments.forEach((s) => {
      el("path", {
        d: arcPath(s.a0, s.a1, r),
        fill: "none",
        stroke: s.color,
        "stroke-width": "18",
        "stroke-linecap": "butt",
      });
    });

    // 刻度标签
    const labels = [
      { v: 12, key: "fgExtremeFear", y: 78 },
      { v: 37, key: "fgFear", y: 48 },
      { v: 62, key: "fgGreed", y: 48 },
      { v: 88, key: "fgExtremeGreed", y: 78 },
    ];
    labels.forEach((L) => {
      const a = angleOf(L.v);
      const [x, y] = polar(a, r - 36);
      el(
        "text",
        {
          x,
          y,
          "text-anchor": "middle",
          "font-size": "10",
          fill: "var(--muted)",
          "font-family": "Microsoft YaHei, sans-serif",
        },
        window.t(L.key)
      );
    });

    const v = value == null ? 50 : Number(value);
    const needle = angleOf(v);
    const [nx, ny] = polar(needle, r - 28);
    el("line", {
      x1: cx,
      y1: cy,
      x2: nx,
      y2: ny,
      stroke: "var(--ink)",
      "stroke-width": "3",
      "stroke-linecap": "round",
    });
    el("circle", { cx, cy, r: 6, fill: "var(--ink)" });
    el("circle", { cx: nx, cy: ny, r: 5, fill: "var(--accent)" });

    el(
      "text",
      {
        x: cx,
        y: cy - 28,
        "text-anchor": "middle",
        "font-size": "28",
        "font-weight": "700",
        fill: "var(--ink)",
        "font-family": "Microsoft YaHei, sans-serif",
      },
      String(Math.round(v))
    );

    // 趋势箭头：向左=更恐慌，向右=更贪婪
    const tr = trend || 0;
    if (tr !== 0) {
      const dir = tr > 0 ? 1 : -1;
      const tipX = cx + dir * 48;
      const baseX = cx + dir * 18;
      el("line", {
        x1: baseX,
        y1: cy + 22,
        x2: tipX,
        y2: cy + 22,
        stroke: dir > 0 ? "#27ae60" : "#c0392b",
        "stroke-width": "3",
        "stroke-linecap": "round",
      });
      el("path", {
        d: `M ${tipX} ${cy + 22} L ${tipX - dir * 10} ${cy + 16} L ${tipX - dir * 10} ${cy + 28} Z`,
        fill: dir > 0 ? "#27ae60" : "#c0392b",
      });
      el(
        "text",
        {
          x: cx,
          y: cy + 42,
          "text-anchor": "middle",
          "font-size": "11",
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
          y: cy + 38,
          "text-anchor": "middle",
          "font-size": "11",
          fill: "var(--muted)",
          "font-family": "Microsoft YaHei, sans-serif",
        },
        window.t("fgTrendFlat")
      );
    }
  }

  return { lineChart, kondratievQuadrant, fearGreedGauge };
})();
