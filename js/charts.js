window.CycleCharts = (function () {
  function lineChart(canvas, points, opts) {
    const o = Object.assign(
      {
        color: "#3d8bfd",
        fill: "rgba(61,139,253,0.15)",
        grid: true,
        pad: 28,
      },
      opts || {}
    );
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 180;
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

    if (o.grid) {
      ctx.strokeStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--line")
        .trim() || "#ccc";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad + (ih * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(w - pad, y);
        ctx.stroke();
      }
    }

    const xy = points.map((p, i) => {
      const x = pad + (iw * i) / Math.max(1, points.length - 1);
      const y = pad + ih - ((p.v - min) / span) * ih;
      return { x, y, p };
    });

    ctx.beginPath();
    xy.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    if (o.fill && xy.length) {
      ctx.lineTo(xy[xy.length - 1].x, pad + ih);
      ctx.lineTo(xy[0].x, pad + ih);
      ctx.closePath();
      ctx.fillStyle = o.fill;
      ctx.fill();
    }

    ctx.fillStyle = getComputedStyle(document.body).color || "#111";
    ctx.font = "11px system-ui,sans-serif";
    ctx.fillText(String(max.toFixed(1)), 4, pad + 4);
    ctx.fillText(String(min.toFixed(1)), 4, pad + ih);
    if (points.length) {
      ctx.fillText(points[0].d, pad, h - 8);
      ctx.fillText(points[points.length - 1].d, w - pad - 40, h - 8);
    }
  }

  function kondratievQuadrant(svg, model) {
    // model: {x,y} in [-1,1]
    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const w = 320;
    const h = 320;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const cx = w / 2;
    const cy = h / 2;
    const r = 120;

    function el(name, attrs) {
      const n = document.createElementNS(ns, name);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      svg.appendChild(n);
      return n;
    }

    el("circle", {
      cx,
      cy,
      r,
      fill: "var(--card)",
      stroke: "var(--line)",
      "stroke-width": "1.5",
    });
    el("line", {
      x1: cx - r,
      y1: cy,
      x2: cx + r,
      y2: cy,
      stroke: "var(--line)",
    });
    el("line", {
      x1: cx,
      y1: cy - r,
      x2: cx,
      y2: cy + r,
      stroke: "var(--line)",
    });

    const labels = [
      { t: window.t("summer"), x: cx - r * 0.55, y: cy - r * 0.55 },
      { t: window.t("spring"), x: cx + r * 0.55, y: cy - r * 0.55 },
      { t: window.t("autumn"), x: cx - r * 0.55, y: cy + r * 0.55 },
      { t: window.t("winter"), x: cx + r * 0.55, y: cy + r * 0.55 },
    ];
    labels.forEach((L) => {
      const text = el("text", {
        x: L.x,
        y: L.y,
        "text-anchor": "middle",
        fill: "var(--muted)",
        "font-size": "12",
      });
      text.textContent = L.t;
    });

    const px = cx + model.x * r * 0.85;
    const py = cy - model.y * r * 0.85;
    el("circle", {
      cx: px,
      cy: py,
      r: 8,
      class: "pulse-dot",
      fill: "var(--accent)",
    });
    el("circle", {
      cx: px,
      cy: py,
      r: 3.5,
      fill: "#fff",
    });
  }

  function dotsPlot(canvas, series) {
    // series: [{year, dots:[...]}]
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 200;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!series || !series.length) return;

    const all = series.flatMap((s) => s.dots);
    const min = Math.min(...all) - 0.25;
    const max = Math.max(...all) + 0.25;
    const pad = 36;
    const iw = w - pad * 2;
    const ih = h - pad * 2;
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#3d8bfd";

    series.forEach((s, i) => {
      const x = pad + ((i + 0.5) * iw) / series.length;
      ctx.fillStyle = getComputedStyle(document.body).color || "#111";
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(String(s.year), x, h - 10);
      s.dots.forEach((v, j) => {
        const y = pad + ih - ((v - min) / (max - min)) * ih;
        const jitter = ((j % 5) - 2) * 4;
        ctx.beginPath();
        ctx.arc(x + jitter, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    });
  }

  return { lineChart, kondratievQuadrant, dotsPlot };
})();
