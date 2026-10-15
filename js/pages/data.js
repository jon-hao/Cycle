window.CyclePages = window.CyclePages || {};

window.CyclePages.data = (function () {
  let cache = null;

  function fmt(v, digits) {
    if (v == null || Number.isNaN(Number(v))) return window.t("missing");
    return Number(v).toFixed(digits == null ? 2 : digits);
  }

  function fmtDate(d) {
    if (!d) return "—";
    if (window.CycleTZ) return window.CycleTZ.formatYMD(d);
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
      const arrow = flat ? "→" : up ? "↑" : "↓";
      return `<span class="chg ${cls}">${label}<span class="chg-arrow">${arrow}</span>${Math.abs(n).toFixed(2)}%</span>`;
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

  function nextMeetHtml(next) {
    if (!next || !next.date) return "";
    const lang = window.CycleState.lang;
    const title =
      (next.title && (next.title[lang] || next.title.zh || next.title.en)) ||
      window.t("nextMeeting");
    return `<div class="next-meet card-content">
      <span class="card-label">${window.t("nextMeeting")}</span>
      <span class="card-date">${fmtDate(next.date)}</span>
      <span class="card-content">${title}</span>
      <button type="button" class="btn tiny sub-inline" id="subMeet">${window.t("subscribe")}</button>
    </div>`;
  }

  function icsMeeting(next) {
    if (!next || !next.date) return;
    const start = new Date(next.date + "T14:00:00");
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const stampLocal = window.CycleTZ.icsLocalStamp;
    const stampUtc = window.CycleTZ.icsUtcStamp;
    const lang = window.CycleState.lang;
    const title =
      (next.title && (next.title[lang] || next.title.zh || next.title.en)) ||
      window.t("nextMeeting");
    const body = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cycle//EN",
      "BEGIN:VEVENT",
      "UID:fomc-" + next.date + "@cycle",
      "DTSTAMP:" + stampUtc(new Date()),
      "DTSTART:" + stampLocal(start),
      "DTEND:" + stampLocal(end),
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

  function openWaveModal(k, aiPayload, macro, fg) {
    const country = k.country || window.CycleState.country;
    const mode = k.mode || window.CycleState.kModel || "schematic";
    const calYear = Math.round(k.year);
    const series =
      window.CycleKondratiev.seriesForMode(mode, k, macro, fg) ||
      window.CycleKondratiev.longWaveSeries(calYear, country);
    const pill = window.CycleKondratiev.pillText(k);
    const theme =
      k.theme ||
      window.CycleKondratiev.themeText(
        k.wave,
        country,
        window.CycleState.lang
      );
    const hint =
      mode === "realtime"
        ? window.t("kRealtimeHint")
        : window.t("kSchematicHint");
    const scoreLine =
      mode === "realtime" && k.scores
        ? `<p class="card-content">growth ${k.scores.growthScore.toFixed(2)} · inflation ${k.scores.inflationScore.toFixed(2)}</p>`
        : "";
    const blinkAt =
      mode === "realtime" && series && series.length
        ? String(series[series.length - 1].d)
        : String(calYear);
    window.CycleUI.openModal(`
      <div class="sheet-head"><h2 class="card-title">${window.t("kondratiev")}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      <p class="card-date"><span class="pill phase-${k.phaseKey}">${pill}</span>
        <span class="card-label"> · ${mode === "realtime" ? window.t("kModelRealtime") : window.t("kModelSchematic")}</span></p>
      <p class="card-content">${theme} · ${window.t(k.phaseKey + "Desc")}</p>
      ${scoreLine}
      <p class="k-model-note">${hint}</p>
      <canvas class="chart" id="waveChart" height="220"></canvas>
      <div class="ai-host" id="aiWaveHost"></div>
    `);
    requestAnimationFrame(() => {
      window.CycleCharts.lineChart(document.getElementById("waveChart"), series, {
        color: (window.CyclePhaseColor && window.CyclePhaseColor[k.phaseKey]) || "#0f6e56",
        blinkAt,
        xUnit: window.CycleState.lang === "en" ? "Time" : "时间",
        yUnit: "",
        xTicks: 6,
      });
      window.CycleAIUI.mount(
        document.getElementById("aiWaveHost"),
        "wave",
        Object.assign(
          {
            waveId: k.wave.id,
            phase: window.CycleKondratiev.phaseLabel(k.phaseKey),
            progress: (k.progress * 100).toFixed(0),
            mode,
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
            xUnit: window.CycleState.lang === "en" ? "Time" : "时间",
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

  function openFearModal(fg, fgVal, trend, aiPayload) {
    if (!fg || !fg.history) {
      window.CycleUI.openModal(`
        <div class="sheet-head"><h2 class="card-title">${window.t("fearGreed")}</h2><button type="button" class="icon-btn" data-close>×</button></div>
        <p class="empty">${window.t("missing")}</p>
      `);
      return;
    }
    window.CycleUI.openModal(`
      <div class="sheet-head"><h2 class="card-title">${window.t("fearGreed")}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      <div class="fg-chart-wrap">
        <div class="fg-stage-bar" aria-hidden="true" title="0–25 / 25–50 / 50–75 / 75–100">
          <span class="s-eg"></span><span class="s-g"></span><span class="s-f"></span><span class="s-ef"></span>
        </div>
        <canvas class="chart" id="metricChart" height="220"></canvas>
      </div>
      <div class="ai-host" id="aiMetricHost"></div>
    `);
    requestAnimationFrame(() => {
      window.CycleCharts.lineChart(document.getElementById("metricChart"), fg.history, {
        yUnit: "",
        xUnit: window.CycleState.lang === "en" ? "Time" : "时间",
        xTicks: 6,
        color: "#3d8bfd",
        padL: 40,
      });
      window.CycleAIUI.mount(document.getElementById("aiMetricHost"), "macro", aiPayload);
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
          <div class="panel-head"><h2 class="card-title">${window.t("kondratiev")}</h2></div>
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

  function kModelOptions() {
    return [
      { value: "schematic", label: window.t("kModelSchematic") },
      { value: "realtime", label: window.t("kModelRealtime") },
    ];
  }

  async function render(root, opts) {
    const soft = opts && opts.soft;
    root.innerHTML = skeleton();
    const code = window.CycleState.country;
    const mode = window.CycleState.kModel || "schematic";

    let macro;
    let fg;
    if (soft && cache && cache.code === code) {
      macro = cache.macro;
      fg = cache.fg;
    } else {
      [macro, fg] = await Promise.all([
        window.CycleAPI.fetchMacro(code),
        window.CycleAPI.fetchFearGreed(code),
      ]);
      cache = { code, macro, fg };
    }

    const k = window.CycleKondratiev.resolveModel(mode, code, macro, fg);

    const next = macro && macro.nextMeeting;
    const rateD = seriesDeltas(macro && macro.rateHistory);
    const inflD = seriesDeltas(macro && macro.inflationHistory);
    const cpiD = seriesDeltas(macro && macro.cpiHistory);
    const ppiD = seriesDeltas(macro && macro.ppiHistory);

    const fgVal = fg ? Math.round(fg.value) : null;
    const trend = fg ? fgTrend(fg.history) : 0;
    const modelHint =
      mode === "realtime" ? window.t("kRealtimeHint") : window.t("kSchematicHint");

    root.innerHTML = `
      <div class="hero-row">
        <section class="panel k-panel" id="kPanel">
          <div class="panel-head">
            <h2 class="card-title">${window.t("kondratiev")}</h2>
            <div class="sq-select k-model-select" id="kModelSelect" data-value="${mode}"></div>
          </div>
          <button type="button" class="k-hit" id="openWave" aria-label="${window.t("kondratiev")}">
            <svg id="kQuad" class="k-quad"></svg>
          </button>
          <p class="k-model-note">${modelHint}</p>
        </section>

        <section class="metric-card fg-card ${fg ? "" : "is-missing"}" data-metric="fear" role="button" tabindex="0">
          <div class="metric-top"><span class="card-title">${window.t("fearGreed")}</span>
            <span class="metric-open card-date">${fg ? window.t("openChart") : ""}</span></div>
          ${
            fg
              ? `<div class="fg-gauge-wrap"><svg id="fgGauge" class="fg-gauge"></svg></div>`
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
          deltaHtml(rateD)
        )}
        ${metricCard(
          "inflation",
          window.t("inflation"),
          macro && macro.inflation != null ? fmt(macro.inflation, 1) + "%" : window.t("missing"),
          deltaHtml(inflD)
        )}
        ${metricCard(
          "cpi",
          window.t("cpi"),
          macro && macro.cpiYoY != null ? fmt(macro.cpiYoY, 1) + "%" : window.t("missing"),
          deltaHtml(cpiD)
        )}
        ${metricCard(
          "ppi",
          window.t("ppi"),
          macro && macro.ppiYoY != null ? fmt(macro.ppiYoY, 1) + "%" : window.t("missing"),
          deltaHtml(ppiD)
        )}
        ${
          code === "US"
            ? metricCard(
                "coreCpi",
                window.t("coreCpi"),
                macro && macro.coreCpiYoY != null
                  ? fmt(macro.coreCpiYoY, 1) + "%"
                  : window.t("missing"),
                deltaHtml(seriesDeltas(macro && macro.coreCpiHistory))
              )
            : ""
        }
      </section>
      ${
        code === "US"
          ? `<h3 class="section-label card-label">${window.t("usExtras")}</h3>
      <section class="metrics metrics-grid">
        ${metricCard(
          "unrate",
          window.t("unrate"),
          macro && macro.unrate != null ? fmt(macro.unrate, 1) + "%" : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.unrateHistory))
        )}
        ${metricCard(
          "payrolls",
          window.t("payrolls"),
          macro && macro.payrollsYoY != null
            ? fmt(macro.payrollsYoY, 1) + "%"
            : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.payrollsYoYHistory))
        )}
        ${metricCard(
          "indpro",
          window.t("indpro"),
          macro && macro.indproYoY != null
            ? fmt(macro.indproYoY, 1) + "%"
            : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.indproYoYHistory))
        )}
        ${metricCard(
          "retail",
          window.t("retail"),
          macro && macro.retailYoY != null
            ? fmt(macro.retailYoY, 1) + "%"
            : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.retailYoYHistory))
        )}
        ${metricCard(
          "gdp",
          window.t("gdp"),
          macro && macro.gdpYoY != null ? fmt(macro.gdpYoY, 1) + "%" : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.gdpYoYHistory))
        )}
        ${metricCard(
          "yieldCurve",
          window.t("yieldCurve"),
          macro && macro.yieldCurve != null
            ? fmt(macro.yieldCurve, 2) + "%"
            : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.yieldCurveHistory))
        )}
        ${metricCard(
          "m2",
          window.t("m2"),
          macro && macro.m2YoY != null ? fmt(macro.m2YoY, 1) + "%" : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.m2YoYHistory))
        )}
        ${metricCard(
          "credit",
          window.t("credit"),
          macro && macro.creditYoY != null
            ? fmt(macro.creditYoY, 1) + "%"
            : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.creditYoYHistory))
        )}
        ${metricCard(
          "housing",
          window.t("housing"),
          macro && macro.housingYoY != null
            ? fmt(macro.housingYoY, 1) + "%"
            : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.housingYoYHistory))
        )}
        ${metricCard(
          "claims",
          window.t("claims"),
          macro && macro.claims != null
            ? Math.round(macro.claims).toLocaleString()
            : window.t("missing"),
          deltaHtml(seriesDeltas(macro && macro.claimsHistory))
        )}
      </section>`
          : ""
      }
    `;

    window.CycleSelect.mount(
      root.querySelector("#kModelSelect"),
      kModelOptions(),
      mode,
      (v) => {
        window.CycleState.kModel = v;
        localStorage.setItem("cycle-k-model", v);
        render(root, { soft: true });
      }
    );

    window.CycleCharts.kondratievQuadrant(root.querySelector("#kQuad"), k);
    if (fg) {
      window.CycleCharts.fearGreedGauge(root.querySelector("#fgGauge"), fgVal, trend);
    }

    const aiPayload = {
      countryLabel: countryLabel(code),
      waveId: k.wave.id,
      phase: window.CycleKondratiev.phaseLabel(k.phaseKey),
      rate: macro && macro.policyRate,
      inflation: macro && macro.inflation,
      cpi: macro && macro.cpiYoY,
      coreCpi: macro && macro.coreCpiYoY,
      ppi: macro && macro.ppiYoY,
      unrate: macro && macro.unrate,
      payrolls: macro && macro.payrollsYoY,
      indpro: macro && macro.indproYoY,
      retail: macro && macro.retailYoY,
      gdp: macro && macro.gdpYoY,
      yieldCurve: macro && macro.yieldCurve,
      m2: macro && macro.m2YoY,
      fearGreed: fg && fg.value,
      kMode: mode,
      growthScore: k.scores && k.scores.growthScore,
      inflationScore: k.scores && k.scores.inflationScore,
      _next: next,
    };

    root.querySelector("#openWave").addEventListener("click", (e) => {
      if (e.target.closest("#kModelSelect")) return;
      openWaveModal(k, aiPayload, macro, fg);
    });

    const seriesMap = {
      rate: {
        title: `${bankLabel(code)} · ${rateLabel(code)}`,
        series: macro && macro.rateHistory,
        extra: nextMeetHtml(next),
      },
      inflation: {
        title: window.t("inflation"),
        series: macro && macro.inflationHistory,
        extra: `<p class="term-note card-content">${window.t("inflationHint")}</p>`,
      },
      cpi: {
        title: window.t("cpi"),
        series: macro && macro.cpiHistory,
        extra: `<p class="term-note card-content">${window.t("cpiHint")}</p>`,
      },
      ppi: {
        title: window.t("ppi"),
        series: macro && macro.ppiHistory,
        extra: `<p class="term-note card-content">${window.t("ppiHint")}</p>`,
      },
      coreCpi: {
        title: window.t("coreCpi"),
        series: macro && macro.coreCpiHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      unrate: {
        title: window.t("unrate"),
        series: macro && macro.unrateHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      payrolls: {
        title: window.t("payrolls"),
        series: macro && macro.payrollsYoYHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      indpro: {
        title: window.t("indpro"),
        series: macro && macro.indproYoYHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      retail: {
        title: window.t("retail"),
        series: macro && macro.retailYoYHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      gdp: {
        title: window.t("gdp"),
        series: macro && macro.gdpYoYHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      yieldCurve: {
        title: window.t("yieldCurve"),
        series: macro && macro.yieldCurveHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      m2: {
        title: window.t("m2"),
        series: macro && macro.m2YoYHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      credit: {
        title: window.t("credit"),
        series: macro && macro.creditYoYHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      housing: {
        title: window.t("housing"),
        series: macro && macro.housingYoYHistory,
        extra: "",
        opts: { yUnit: "%" },
      },
      claims: {
        title: window.t("claims"),
        series: macro && macro.claimsHistory,
        extra: "",
        opts: { yUnit: "" },
      },
    };

    function openMetric(id) {
      if (id === "fear") {
        openFearModal(fg, fgVal, trend, aiPayload);
        return;
      }
      const conf = seriesMap[id];
      if (!conf) return;
      openSeriesModal(conf.title, conf.series, conf.extra, aiPayload, conf.opts);
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
