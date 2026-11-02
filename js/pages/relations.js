window.CyclePages = window.CyclePages || {};

window.CyclePages.relations = (function () {
  const PIN_KEY = "cycle-relations-pins";
  const FACTOR_DEFS = [
    { id: "tnx", symbol: "^TNX", nameZh: "美债10年收益率", nameEn: "US 10Y Yield" },
    { id: "tyx", symbol: "^TYX", nameZh: "美债30年收益率", nameEn: "US 30Y Yield" },
    { id: "dxy", symbol: "DX-Y.NYB", nameZh: "美元指数", nameEn: "DXY" },
    { id: "cl", symbol: "CL=F", nameZh: "WTI原油", nameEn: "WTI Crude" },
    { id: "vix", symbol: "^VIX", nameZh: "VIX波动率", nameEn: "VIX" },
    { id: "gc", symbol: "GC=F", nameZh: "黄金期货", nameEn: "Gold" },
  ];

  const DEFAULTS = [
    { id: "es", symbol: "ES=F", nameZh: "标普500期货主连", nameEn: "S&P 500 Futures", period: "1y" },
    { id: "nq", symbol: "NQ=F", nameZh: "纳斯达克期货主连", nameEn: "Nasdaq Futures", period: "1y" },
    { id: "ym", symbol: "YM=F", nameZh: "道琼斯期货主连", nameEn: "Dow Futures", period: "1y" },
    { id: "gc", symbol: "GC=F", nameZh: "黄金期货主连", nameEn: "Gold Futures", period: "1y" },
    { id: "si", symbol: "SI=F", nameZh: "白银期货主连", nameEn: "Silver Futures", period: "1y" },
    { id: "btc", symbol: "BTC=F", nameZh: "比特币期货主连", nameEn: "Bitcoin Futures", period: "1y" },
    { id: "tyx", symbol: "^TYX", nameZh: "美国30年期国债收益率", nameEn: "US 30Y Yield", period: "1y" },
    { id: "sse", symbol: "000001.SS", nameZh: "上证指数", nameEn: "SSE Composite", period: "1y" },
    // Yahoo 无恒指期货连续合约，改用恒生指数 ^HSI
    { id: "hi", symbol: "^HSI", nameZh: "恒生指数", nameEn: "Hang Seng Index", period: "1y" },
  ];

  const cache = new Map();
  let renderSeq = 0;
  let searchTimer = null;

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function assetName(a) {
    const lang = window.CycleState.lang;
    if (lang === "en") return a.nameEn || a.name || a.symbol;
    return a.nameZh || a.name || a.symbol;
  }

  function factorName(f) {
    const lang = window.CycleState.lang;
    return lang === "en" ? f.nameEn : f.nameZh;
  }

  function normalizePin(a) {
    const base = Object.assign({ period: "1y" }, a, {
      period: (a && a.period) || "1y",
    });
    // 旧版错误代码迁移
    if (base.symbol === "HSI=F" || base.symbol === "HI=F") {
      base.symbol = "^HSI";
      base.id = "hi";
      base.nameZh = "恒生指数";
      base.nameEn = "Hang Seng Index";
      base.name = base.nameZh;
    }
    return base;
  }

  function loadPins() {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          const next = arr.map(normalizePin);
          savePins(next);
          return next;
        }
      }
    } catch (_) {}
    return DEFAULTS.map((a) => Object.assign({}, a));
  }

  function savePins(list) {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  function returns(series) {
    const out = [];
    for (let i = 1; i < series.length; i++) {
      const a = series[i - 1].v;
      const b = series[i].v;
      if (a == null || b == null || !a) continue;
      out.push({ d: series[i].d, v: (b - a) / a });
    }
    return out;
  }

  function alignByDate(a, b) {
    const map = new Map(b.map((p) => [p.d, p.v]));
    const xa = [];
    const xb = [];
    a.forEach((p) => {
      if (map.has(p.d)) {
        xa.push(p.v);
        xb.push(map.get(p.d));
      }
    });
    return { xa, xb };
  }

  function pearson(xa, xb) {
    const n = Math.min(xa.length, xb.length);
    if (n < 8) return null;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += xa[i];
      sy += xb[i];
    }
    const mx = sx / n;
    const my = sy / n;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i++) {
      const vx = xa[i] - mx;
      const vy = xb[i] - my;
      num += vx * vy;
      dx += vx * vx;
      dy += vy * vy;
    }
    if (dx < 1e-12 || dy < 1e-12) return null;
    return num / Math.sqrt(dx * dy);
  }

  function rollingCorrFlipMarkers(assetRet, factorRet, win) {
    const { xa, xb } = alignByDate(assetRet, factorRet);
    const markers = [];
    if (xa.length < win + 5) return markers;
    let prev = null;
    for (let i = win; i < xa.length; i++) {
      const c = pearson(xa.slice(i - win, i), xb.slice(i - win, i));
      if (c == null) continue;
      if (prev != null && Math.sign(prev) !== Math.sign(c) && Math.abs(c - prev) > 0.35) {
        markers.push({ idx: Math.round((i / xa.length) * Math.max(1, assetRet.length - 1)), label: "驱动切换" });
        if (markers.length >= 4) break;
      }
      prev = c;
    }
    return markers;
  }

  async function history(symbol, range) {
    const key = symbol + "|" + range;
    if (cache.has(key)) return cache.get(key);
    const d = await window.CycleAPI.fetchAssetHistory(symbol, range);
    if (d && d.series) cache.set(key, d);
    return d;
  }

  function pickFactors(asset) {
    return FACTOR_DEFS.filter((f) => f.symbol !== asset.symbol).slice(0, 5);
  }

  async function analyzeAsset(asset) {
    const period = asset.period || "1y";
    const main = await history(asset.symbol, period);
    if (!main || !main.series || main.series.length < 10) {
      return { asset, series: [], factors: [], markers: [], note: null };
    }
    const assetRet = returns(main.series);
    const factors = [];
    const factorSeries = [];
    for (const f of pickFactors(asset)) {
      try {
        const h = await history(f.symbol, period);
        if (!h || !h.series || h.series.length < 10) continue;
        const fr = returns(h.series);
        const { xa, xb } = alignByDate(assetRet, fr);
        const corr = pearson(xa, xb);
        if (corr == null) continue;
        factors.push({
          id: f.id,
          symbol: f.symbol,
          name: factorName(f),
          corr,
          series: h.series,
        });
        factorSeries.push({ id: f.id, name: factorName(f), series: h.series, corr });
      } catch (_) {}
    }
    factors.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
    const top = factors.slice(0, 4);
    const absSum = top.reduce((s, f) => s + Math.abs(f.corr), 0) || 1;
    top.forEach((f) => {
      f.weight = Math.abs(f.corr) / absSum;
    });

    let markers = [];
    if (top[0]) {
      const fr = returns(top[0].series);
      markers = rollingCorrFlipMarkers(assetRet, fr, Math.min(60, Math.floor(assetRet.length / 4)));
    }

    let note = null;
    if (
      window.CycleLLM &&
      window.CycleLLM.chat &&
      window.CycleLLM.getStatus &&
      window.CycleLLM.getStatus().status === "ready"
    ) {
      try {
        const summary = top
          .map(
            (f) =>
              `${f.name}: corr=${f.corr.toFixed(2)}, share=${(f.weight * 100).toFixed(0)}%`
          )
          .join("; ");
        const system =
          "你是宏观研究助手。只根据用户给出的统计结果写一两句中文解释，禁止编造未提供的数据。必须强调相关≠因果。";
        const user = `资产 ${assetName(asset)}，周期 ${period}，收益序列 Pearson：${summary}`;
        const live = await window.CycleLLM.chat(system, user, null, {
          max_tokens: 120,
        });
        if (live && live.ok && live.text) note = live.text.trim();
      } catch (_) {}
    }
    if (!note && top.length) {
      const lead = top[0];
      note =
        window.CycleState.lang === "en"
          ? `Strongest statistical link: ${lead.name} (${lead.corr >= 0 ? "+" : ""}${(lead.corr * 100).toFixed(0)}% corr). Not causation.`
          : `当前统计关联最强：${lead.name}（${lead.corr >= 0 ? "+" : ""}${(lead.corr * 100).toFixed(0)}%）。相关≠因果。`;
    }

    return {
      asset,
      series: main.series,
      factors: top,
      factorSeries,
      markers,
      note,
      name: main.name || assetName(asset),
    };
  }

  function factorChips(factors) {
    if (!factors || !factors.length) {
      return `<div class="rel-factors muted tiny">${window.t("missing")}</div>`;
    }
    return `<ul class="rel-factors">${factors
      .map((f) => {
        const up = f.corr >= 0;
        return `<li class="${up ? "pos" : "neg"}">
          <span class="rel-arrow" aria-hidden="true">${up ? "▲" : "▼"}</span>
          <span class="rel-fname">${escapeHtml(f.name)}</span>
          <span class="rel-pct">${(f.weight * 100).toFixed(0)}%</span>
        </li>`;
      })
      .join("")}</ul>`;
  }

  function paintMiniChart(canvas, series) {
    if (!canvas || !series || !series.length) return;
    window.CycleCharts.lineChart(canvas, series, {
      padL: 8,
      padR: 6,
      padT: 8,
      padB: 8,
      xTicks: 2,
      yUnit: "",
      color: "#0f6e56",
    });
  }

  async function openDetail(analysis, onPeriodChange) {
    const asset = analysis.asset;
    let period = asset.period || "1y";
    let current = analysis;
    let chartCtl = null;

    function periodBtns() {
      return ["1y", "10y", "30y"]
        .map((p) => {
          const label =
            p === "1y"
              ? window.t("relationsPeriod1y")
              : p === "10y"
                ? window.t("relationsPeriod10y")
                : window.t("relationsPeriod30y");
          return `<button type="button" class="btn tiny ${period === p ? "active" : ""}" data-period="${p}">${label}</button>`;
        })
        .join("");
    }

    function paintModal() {
      const seriesList = [
        {
          label: assetName(asset),
          color: "#0f6e56",
          points: current.series,
        },
      ].concat(
        (current.factors || []).slice(0, 3).map((f, i) => ({
          label: f.name,
          color: ["#3d8bfd", "#e4572e", "#b08900"][i],
          points: f.series,
        }))
      );

      window.CycleUI.openModal(`
        <div class="sheet-head">
          <h2 class="card-title">${escapeHtml(assetName(asset))}</h2>
          <button type="button" class="icon-btn" data-close>×</button>
        </div>
        <div class="rel-period-row">${periodBtns()}</div>
        <canvas class="chart rel-detail-chart" id="relDetailChart" height="260"></canvas>
        <div class="rel-detail-factors">
          <h3 class="card-label">${window.t("relationsFactors")}</h3>
          ${factorChips(current.factors)}
        </div>
        <p class="rel-ai-note card-content">${escapeHtml(current.note || "")}</p>
        <p class="tiny muted">${window.t("relationsAiNote")}</p>
      `);

      requestAnimationFrame(() => {
        const canvas = document.getElementById("relDetailChart");
        if (chartCtl && chartCtl.destroy) chartCtl.destroy();
        chartCtl = window.CycleCharts.multiLineChart(canvas, seriesList, {
          normalize: true,
          markers: current.markers || [],
          xTicks: 6,
        });
      });

      document.querySelectorAll("[data-period]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const next = btn.dataset.period;
          if (next === period) return;
          period = next;
          asset.period = period;
          const sheet = document.getElementById("sheet");
          if (sheet) {
            const note = sheet.querySelector(".rel-ai-note");
            if (note) note.textContent = window.t("relationsLoading");
          }
          current = await analyzeAsset(asset);
          if (typeof onPeriodChange === "function") onPeriodChange(asset, current);
          paintModal();
        });
      });
    }

    paintModal();
  }

  function pinAsset(list, item) {
    if (list.some((a) => a.symbol === item.symbol)) return list;
    const next = list.concat([
      {
        id: item.symbol,
        symbol: item.symbol,
        nameZh: item.name,
        nameEn: item.name,
        name: item.name,
        period: "1y",
      },
    ]);
    savePins(next);
    return next;
  }

  async function render(root, opts) {
    const seq = ++renderSeq;
    let pins = loadPins();
    const soft = opts && opts.soft;
    void soft;

    root.innerHTML = `
      <section class="panel rel-panel">
        <div class="panel-head">
          <h2 class="card-title">${window.t("navRelations")}</h2>
        </div>
        <div class="rel-search">
          <input type="search" id="relSearch" class="rel-search-input" placeholder="${escapeHtml(
            window.t("relationsSearchHint")
          )}" autocomplete="off" />
          <div class="rel-search-results" id="relResults" hidden></div>
        </div>
        <div class="rel-grid" id="relGrid">
          <div class="skel-block skel-list"></div>
        </div>
      </section>`;

    const grid = root.querySelector("#relGrid");
    const resultsEl = root.querySelector("#relResults");
    const searchInput = root.querySelector("#relSearch");

    async function paintCards() {
      grid.innerHTML = pins
        .map(
          (a) => `<article class="rel-card" data-symbol="${encodeURIComponent(a.symbol)}">
            <div class="rel-card-head">
              <h3 class="card-title">${escapeHtml(assetName(a))}</h3>
              <span class="card-date">${escapeHtml(a.symbol)}</span>
            </div>
            <canvas class="rel-mini-chart" height="72"></canvas>
            <div class="rel-card-factors muted tiny">${window.t("relationsLoading")}</div>
          </article>`
        )
        .join("");

      const analyses = {};
      await Promise.all(
        pins.map(async (a) => {
          try {
            analyses[a.symbol] = await analyzeAsset(a);
          } catch (e) {
            analyses[a.symbol] = { asset: a, series: [], factors: [], note: String(e.message || e) };
          }
        })
      );
      if (seq !== renderSeq) return;

      grid.querySelectorAll(".rel-card").forEach((card) => {
        const symbol = decodeURIComponent(card.dataset.symbol);
        const analysis = analyses[symbol];
        if (!analysis) return;
        const canvas = card.querySelector(".rel-mini-chart");
        paintMiniChart(canvas, analysis.series);
        const box = card.querySelector(".rel-card-factors");
        if (box) box.innerHTML = factorChips(analysis.factors);
        card.addEventListener("click", () => {
          openDetail(analysis, (asset, nextAnalysis) => {
            const idx = pins.findIndex((p) => p.symbol === asset.symbol);
            if (idx >= 0) {
              pins[idx].period = asset.period;
              savePins(pins);
            }
            analyses[asset.symbol] = nextAnalysis;
            const c = grid.querySelector(`[data-symbol="${encodeURIComponent(asset.symbol)}"]`);
            if (c) {
              paintMiniChart(c.querySelector(".rel-mini-chart"), nextAnalysis.series);
              const fb = c.querySelector(".rel-card-factors");
              if (fb) fb.innerHTML = factorChips(nextAnalysis.factors);
            }
          });
        });
      });
    }

    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim();
      if (searchTimer) clearTimeout(searchTimer);
      if (!q) {
        resultsEl.hidden = true;
        resultsEl.innerHTML = "";
        return;
      }
      searchTimer = setTimeout(async () => {
        try {
          const list = await window.CycleAPI.searchAssets(q);
          if (seq !== renderSeq) return;
          if (!list.length) {
            resultsEl.hidden = false;
            resultsEl.innerHTML = `<div class="muted tiny">${window.t("relationsEmpty")}</div>`;
            return;
          }
          resultsEl.hidden = false;
          resultsEl.innerHTML = list
            .map(
              (r) => `<button type="button" class="rel-search-item" data-symbol="${escapeHtml(
                r.symbol
              )}" data-name="${escapeHtml(r.name)}">
                <strong>${escapeHtml(r.symbol)}</strong>
                <span>${escapeHtml(r.name)}</span>
                <span class="rel-pin-lab">${window.t("relationsPin")}</span>
              </button>`
            )
            .join("");
          resultsEl.querySelectorAll(".rel-search-item").forEach((btn) => {
            btn.addEventListener("click", async () => {
              pins = pinAsset(pins, {
                symbol: btn.dataset.symbol,
                name: btn.dataset.name,
              });
              resultsEl.hidden = true;
              searchInput.value = "";
              await paintCards();
            });
          });
        } catch (e) {
          resultsEl.hidden = false;
          resultsEl.innerHTML = `<div class="empty tiny">${escapeHtml(String(e.message || e))}</div>`;
        }
      }, 320);
    });

    await paintCards();
  }

  return { render };
})();
