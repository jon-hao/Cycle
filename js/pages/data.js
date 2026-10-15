window.CyclePages = window.CyclePages || {};

window.CyclePages.data = (function () {
  let cache = null;

  function fmt(v, digits) {
    if (v == null || Number.isNaN(Number(v))) return window.t("missing");
    return Number(v).toFixed(digits == null ? 2 : digits);
  }

  function fmtDate(d) {
    if (!d) return "—";
    return String(d).slice(0, 10).replace(/-/g, ".");
  }

  function fgTrend(history) {
    if (!history || history.length < 5) return 0;
    const cur = history[history.length - 1].v;
    const prev = history[Math.max(0, history.length - 8)].v;
    const d = cur - prev;
    if (d > 2) return 1;
    if (d < -2) return -1;
    return 0;
  }

  /** 从序列推同比/环比变化（百分点） */
  function seriesDeltas(history) {
    if (!history || history.length < 2) return { mom: null, yoy: null };
    const cur = history[history.length - 1].v;
    const mom = cur - history[history.length - 2].v;
    let yoy = null;
    if (history.length >= 13) yoy = cur - history[history.length - 13].v;
    else if (/^\d{4}$/.test(String(history[0].d)) && history.length >= 2) {
      yoy = mom;
    }
    return { mom, yoy };
  }

  function deltaHtml(deltas) {
    const parts = [];
    function chip(label, v) {
      if (v == null || Number.isNaN(Number(v))) return "";
      const n = Number(v);
      const up = n > 0;
      const flat = Math.abs(n) < 0.0005;
      const cls = flat ? "chg-flat" : up ? "chg-up" : "chg-down";
      const arrow = flat ? "→" : up ? "⬆️" : "⬇️";
      const sign = flat ? "" : "";
      return `<span class="chg ${cls}">${label}${arrow}${Math.abs(n).toFixed(2)}%</span>`;
    }
    const y = chip(window.t("yoyShort"), deltas.yoy);
    const m = chip(window.t("momShort"), deltas.mom);
    if (y) parts.push(y);
    if (m) parts.push(m);
    return parts.length ? `<div class="chg-row">${parts.join("")}</div>` : "";
  }

  function bankLabel(code) {
    if (code === "US") return window.t("bankUS");
    if (code === "CN") return window.t("bankCN");
    return window.t("bankGLOBAL");
  }

  function rateLabel(code) {
    if (code === "US") return window.t("rateUS");
    if (code === "CN") return window.t("rateCN");
    return window.t("rateGLOBAL");
  }

  function countryLabel(code) {
    return window.t("country" + code);
  }

  function icsMeeting(next) {
    if (!next || !next.date) return;
    const start = new Date(next.date + "T18:00:00Z");
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const stamp = (d) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const title =
      (next.title && (next.title[window.CycleState.lang] || next.title.zh)) ||
      window.t("nextMeeting");
    const body = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cycle//EN",
      "BEGIN:VEVENT",
      "UID:fomc-" + next.date + "@cycle",
      "DTSTAMP:" + stamp(new Date()),
      "DTSTART:" + stamp(start),
      "DTEND:" + stamp(end),
      "SUMMARY:" + title,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cycle-meeting.ics";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openWaveModal(k, aiPayload) {
    const series = window.CycleKondratiev.longWaveSeries(new Date().getFullYear());
    window.CycleUI.openModal(`
      <div class="sheet-head"><h2 class="card-title">${window.t("kondratiev")}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      <p class="card-date">K${k.wave.id} · ${window.t(k.phaseKey)}</p>
      <p class="card-content">${k.wave.theme[window.CycleState.lang]} · ${window.t(k.phaseKey + "Desc")}</p>
      <canvas class="chart" id="waveChart" height="220"></canvas>
      <div class="ai-host" id="aiWaveHost"></div>
    `);
    requestAnimationFrame(() => {
      window.CycleCharts.lineChart(document.getElementById("waveChart"), series, {
        color: "#0f6e56",
        blinkAt: String(Math.round(k.year)),
        xUnit: window.CycleState.lang === "zh" ? "年" : "Year",
        yUnit: "",
        xTicks: 6,
      });
      window.CycleAIUI.mount(
        document.getElementById("aiWaveHost"),
        "wave",
        Object.assign(
          {
            waveId: k.wave.id,
            phase: window.t(k.phaseKey),
            progress: (k.progress * 100).toFixed(0),
          },
          aiPayload || {}
        )
      );
    });
  }

  function openSeriesModal(title, series, extraHtml, aiPayload, chartOpts) {
    if (!series || !series.length) {
      window.CycleUI.openModal(`
        <div class="sheet-head"><h2 class="card-title">${title}</h2><button type="button" class="icon-btn" data-close>×</button></div>
        <p class="empty">${window.t("missing")}</p>
      `);
      return;
    }
    window.CycleUI.openModal(`
      <div class="sheet-head"><h2 class="card-title">${title}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      ${extraHtml || ""}
      <canvas class="chart" id="metricChart" height="220"></canvas>
      <div class="ai-host" id="aiMetricHost"></div>
    `);
    requestAnimationFrame(() => {
      window.CycleCharts.lineChart(
        document.getElementById("metricChart"),
        series,
        Object.assign(
          {
            yUnit: "%",
            xUnit: window.CycleState.lang === "zh" ? "时间" : "Time",
            xTicks: 5,
          },
          chartOpts || {}
        )
      );
      window.CycleAIUI.mount(document.getElementById("aiMetricHost"), "macro", aiPayload);
      const sm = document.getElementById("subMeet");
      if (sm && aiPayload && aiPayload._next) {
        sm.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          icsMeeting(aiPayload._next);
        });
      }
    });
  }

  function metricCard(id, titleHtml, valueText, subHtml) {
    const missing = valueText === window.t("missing");
    return `<div class="metric-card ${missing ? "is-missing" : ""}" data-metric="${id}" role="button" tabindex="0">
      <div class="metric-top"><span class="card-title">${titleHtml}</span><span class="metric-open card-date">${missing ? "" : window.t("openChart")}</span></div>
      <div class="metric-value card-value">${valueText}</div>
      ${subHtml ? `<div class="metric-sub">${subHtml}</div>` : ""}
    </div>`;
  }

  function skeleton() {
    return `
      <div class="hero-row">
        <section class="panel k-panel skel-card">
          <div class="panel-head"><h2 class="card-title">${window.t("kondratiev")}</h2><span class="pill skel-pill">…</span></div>
          <div class="skel-block skel-chart"></div>
        </section>
        <section class="metric-card fg-card skel-card">
          <div class="metric-top"><span class="card-title">${window.t("fearGreed")}</span><span class="metric-open card-date">${window.t("openChart")}</span></div>
          <div class="skel-block skel-gauge"></div>
        </section>
      </div>
      <section class="metrics metrics-grid">
        ${[1, 2, 3, 4]
          .map(
            () =>
              `<div class="metric-card skel-card"><div class="skel-line w60"></div><div class="skel-line w40 big"></div><div class="skel-line w80"></div></div>`
          )
          .join("")}
      </section>`;
  }

  async function render(root, opts) {
    const soft = opts && opts.soft;
    root.innerHTML = skeleton();
    const code = window.CycleState.country;
    const lang = window.CycleState.lang;
    const k = window.CycleKondratiev.waveAt(new Date());

    let macro;
    let fg;
    if (soft && cache && cache.code === code) {
      macro = cache.macro;
      fg = cache.fg;
    } else {
      [macro, fg] = await Promise.all([
        window.CycleAPI.fetchMacro(code),
        window.CycleAPI.fetchFearGreed(),
      ]);
      cache = { code, macro, fg };
    }

    const next = macro && macro.nextMeeting;
    const nextRow = next
      ? `<div class="next-meet card-content">
          <span class="card-label">${window.t("nextMeeting")}</span>
          <span class="card-date">${fmtDate(next.date)}</span>
          <span class="card-content">${next.title[lang] || next.title.zh}</span>
          <button type="button" class="btn tiny sub-inline" id="subMeet">${window.t("subscribe")}</button>
        </div>`
      : "";

    const rateD = seriesDeltas(macro && macro.rateHistory);
    const inflD = seriesDeltas(macro && macro.inflationHistory);
    const cpiD = seriesDeltas(macro && macro.cpiHistory);
    const ppiD = seriesDeltas(macro && macro.ppiHistory);

    const fgVal = fg ? Math.round(fg.value) : null;
    const trend = fg ? fgTrend(fg.history) : 0;

    root.innerHTML = `
      <div class="hero-row">
        <section class="panel k-panel" id="kPanel">
          <div class="panel-head">
            <h2 class="card-title">${window.t("kondratiev")}</h2>
            <span class="pill">K${k.wave.id} · ${window.t(k.phaseKey)}</span>
          </div>
          <p class="card-content k-desc">${k.wave.theme[lang]} · ${window.t(k.phaseKey + "Desc")}</p>
          <button type="button" class="k-hit" id="openWave" aria-label="${window.t("kondratiev")}">
            <svg id="kQuad" class="k-quad"></svg>
          </button>
        </section>

        <section class="metric-card fg-card ${fg ? "" : "is-missing"}" data-metric="fear" role="button" tabindex="0">
          <div class="metric-top"><span class="card-title">${window.t("fearGreed")}</span>
            <span class="metric-open card-date">${fg ? window.t("openChart") : ""}</span></div>
          ${
            fg
              ? `<svg id="fgGauge" class="fg-gauge"></svg>`
              : `<div class="metric-value card-value">${window.t("missing")}</div>`
          }
        </section>
      </div>

      <section class="metrics metrics-grid">
        ${metricCard(
          "rate",
          `${bankLabel(code)} · ${rateLabel(code)}`,
          macro && macro.policyRate != null
            ? fmt(macro.policyRate) + "%"
            : window.t("missing"),
          deltaHtml(rateD) + nextRow
        )}
        ${metricCard(
          "inflation",
          window.t("inflation"),
          macro && macro.inflation != null ? fmt(macro.inflation, 1) + "%" : window.t("missing"),
          deltaHtml(inflD) +
            `<span class="term-note card-content">${window.t("inflationHint")}</span>`
        )}
        ${metricCard(
          "cpi",
          window.t("cpi"),
          macro && macro.cpiYoY != null ? fmt(macro.cpiYoY, 1) + "%" : window.t("missing"),
          deltaHtml(cpiD) +
            `<span class="term-note card-content">${window.t("cpiHint")}</span>`
        )}
        ${metricCard(
          "ppi",
          window.t("ppi"),
          macro && macro.ppiYoY != null ? fmt(macro.ppiYoY, 1) + "%" : window.t("missing"),
          deltaHtml(ppiD) +
            `<span class="term-note card-content">${window.t("ppiHint")}</span>`
        )}
      </section>
    `;

    window.CycleCharts.kondratievQuadrant(root.querySelector("#kQuad"), k);
    if (fg) {
      window.CycleCharts.fearGreedGauge(root.querySelector("#fgGauge"), fgVal, trend);
    }

    const aiPayload = {
      countryLabel: countryLabel(code),
      waveId: k.wave.id,
      phase: window.t(k.phaseKey),
      rate: macro && macro.policyRate,
      inflation: macro && macro.inflation,
      cpi: macro && macro.cpiYoY,
      ppi: macro && macro.ppiYoY,
      fearGreed: fg && fg.value,
      _next: next,
    };

    root.querySelector("#openWave").addEventListener("click", () => {
      openWaveModal(k, aiPayload);
    });

    const sub = root.querySelector("#subMeet");
    if (sub && next) {
      sub.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        icsMeeting(next);
      });
    }

    function openMetric(id) {
      if (id === "fear") {
        openSeriesModal(
          window.t("fearGreed"),
          fg && fg.history,
          fg ? `<svg id="fgGaugeModal" class="fg-gauge"></svg>` : "",
          aiPayload,
          { yUnit: "", xTicks: 6 }
        );
        if (fg) {
          requestAnimationFrame(() => {
            const g = document.getElementById("fgGaugeModal");
            if (g) window.CycleCharts.fearGreedGauge(g, fgVal, trend);
          });
        }
      } else if (id === "rate") {
        openSeriesModal(
          `${bankLabel(code)} · ${rateLabel(code)}`,
          macro && macro.rateHistory,
          nextRow,
          aiPayload
        );
      } else if (id === "inflation") {
        openSeriesModal(
          window.t("inflation"),
          macro && macro.inflationHistory,
          `<p class="term-note card-content">${window.t("inflationHint")}</p>`,
          aiPayload
        );
      } else if (id === "cpi") {
        openSeriesModal(
          window.t("cpi"),
          macro && macro.cpiHistory,
          `<p class="term-note card-content">${window.t("cpiHint")}</p>`,
          aiPayload
        );
      } else if (id === "ppi") {
        openSeriesModal(
          window.t("ppi"),
          macro && macro.ppiHistory,
          `<p class="term-note card-content">${window.t("ppiHint")}</p>`,
          aiPayload
        );
      }
    }

    root.querySelectorAll(".metric-card:not(.is-missing)").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("#subMeet") || e.target.closest(".sub-inline")) return;
        openMetric(card.dataset.metric);
      });
    });
  }

  return { render };
})();
