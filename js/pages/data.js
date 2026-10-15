window.CyclePages = window.CyclePages || {};

window.CyclePages.data = (function () {
  function fmt(v, digits) {
    if (v == null || Number.isNaN(Number(v))) return window.t("missing");
    return Number(v).toFixed(digits == null ? 2 : digits);
  }

  function fgStageKey(value) {
    if (value < 25) return "fgExtremeFear";
    if (value < 50) return "fgFear";
    if (value < 75) return "fgGreed";
    return "fgExtremeGreed";
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

  function kMetaHtml(k) {
    return `
      <div class="k-meta-block">
        <div class="kv-line"><span class="card-label">${window.t("wave")}</span><span class="card-value">K${k.wave.id}</span></div>
        <div class="kv-line"><span class="card-label">${window.t("phase")}</span><span class="card-value">${window.t(k.phaseKey)}</span></div>
        <div class="kv-line"><span class="card-label">${window.t("currentPosition")}</span><span class="card-value">${(k.progress * 100).toFixed(0)}%</span></div>
        <div class="kv-line"><span class="card-label">${window.t("direction")}</span><span class="card-value">→</span></div>
        <div class="ai-host" id="aiMacroHost"></div>
      </div>`;
  }

  function openWaveModal(k, withMeta) {
    const series = window.CycleKondratiev.longWaveSeries(new Date().getFullYear());
    window.CycleUI.openModal(`
      <div class="sheet-head"><h2>${withMeta ? window.t("kondratiev") : window.t("waveHistory")}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      ${withMeta ? kMetaHtml(k) : `<p class="card-date">K${k.wave.id} · ${window.t(k.phaseKey)} · ${(k.progress * 100).toFixed(0)}%</p>`}
      <canvas class="chart" id="waveChart" height="220"></canvas>
      ${withMeta ? "" : `<div class="ai-host" id="aiWaveHost"></div>`}
    `);
    requestAnimationFrame(() => {
      window.CycleCharts.lineChart(document.getElementById("waveChart"), series, {
        color: "#0f6e56",
        blinkAt: String(Math.round(k.year)),
        xUnit: window.CycleState.lang === "zh" ? "年" : "Year",
        yUnit: "",
        xTicks: 6,
      });
      if (withMeta) {
        window.CycleAIUI.mount(document.getElementById("aiMacroHost"), "wave", {
          waveId: k.wave.id,
          phase: window.t(k.phaseKey),
          progress: (k.progress * 100).toFixed(0),
        });
      } else {
        window.CycleAIUI.mount(document.getElementById("aiWaveHost"), "wave", {
          waveId: k.wave.id,
          phase: window.t(k.phaseKey),
          progress: (k.progress * 100).toFixed(0),
        });
      }
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
    });
  }

  function metricCard(id, titleHtml, valueText, subHtml) {
    const missing = valueText === window.t("missing");
    return `<button type="button" class="metric-card ${missing ? "is-missing" : ""}" data-metric="${id}" ${missing ? "disabled" : ""}>
      <div class="metric-top"><span class="card-title">${titleHtml}</span><span class="metric-open card-date">${missing ? "" : window.t("openChart")}</span></div>
      <div class="metric-value card-value">${valueText}</div>
      ${subHtml ? `<div class="metric-sub">${subHtml}</div>` : ""}
    </button>`;
  }

  async function render(root) {
    root.innerHTML = `<div class="loading">${window.t("loading")}</div>`;
    const code = window.CycleState.country;
    const lang = window.CycleState.lang;
    const k = window.CycleKondratiev.waveAt(new Date());

    const [macro, fg] = await Promise.all([
      window.CycleAPI.fetchMacro(code),
      window.CycleAPI.fetchFearGreed(),
    ]);

    const next = macro && macro.nextMeeting;
    const nextRow = next
      ? `<div class="next-meet card-content">
          <span class="card-label">${window.t("nextMeeting")}</span>
          <span class="card-date">${next.date || "—"}</span>
          <span class="card-content">${next.title[lang] || next.title.zh}</span>
          <button type="button" class="btn tiny" id="subMeet">${window.t("subscribe")}</button>
        </div>`
      : "";

    const cpiTitle = `${window.t("cpi")}<span class="term-tip" title="${window.t("cpiHint")}">?</span>`;
    const ppiTitle = `${window.t("ppi")}<span class="term-tip" title="${window.t("ppiHint")}">?</span>`;

    const fgVal = fg ? Math.round(fg.value) : null;
    const trend = fg ? fgTrend(fg.history) : 0;

    root.innerHTML = `
      <section class="panel k-panel" id="kPanel">
        <div class="panel-head">
          <h2 class="card-title">${window.t("kondratiev")}</h2>
          <span class="pill">K${k.wave.id} · ${window.t(k.phaseKey)}</span>
        </div>
        <p class="card-content k-desc">${k.wave.theme[lang]} · ${window.t(k.phaseKey + "Desc")}</p>
        <div class="k-wrap">
          <button type="button" class="k-hit" id="openWave" aria-label="${window.t("kondratiev")}">
            <svg id="kQuad" class="k-quad"></svg>
          </button>
          <div class="k-meta k-meta-pc">
            ${kMetaHtml(k)}
          </div>
        </div>
        <p class="k-tap-hint card-date">${window.t("kDetails")}</p>
      </section>

      <section class="metric-card fg-card metric-full ${fg ? "" : "is-missing"}" data-metric="fear">
        <div class="metric-top"><span class="card-title">${window.t("fearGreed")}</span>
          <span class="metric-open card-date">${fg ? window.t("openChart") : ""}</span></div>
        ${
          fg
            ? `<svg id="fgGauge" class="fg-gauge"></svg>`
            : `<div class="metric-value card-value">${window.t("missing")}</div>`
        }
      </section>

      <section class="metrics metrics-grid">
        ${metricCard(
          "rate",
          `${bankLabel(code)} · ${rateLabel(code)}`,
          macro && macro.policyRate != null
            ? fmt(macro.policyRate) + "%"
            : window.t("missing"),
          nextRow
        )}
        ${metricCard(
          "inflation",
          window.t("inflation"),
          macro && macro.inflation != null ? fmt(macro.inflation, 1) + "%" : window.t("missing")
        )}
        ${metricCard(
          "cpi",
          cpiTitle,
          macro && macro.cpiYoY != null ? fmt(macro.cpiYoY, 1) + "%" : window.t("missing"),
          `<span class="term-note card-content">${window.t("cpiHint")}</span>`
        )}
        ${metricCard(
          "ppi",
          ppiTitle,
          macro && macro.ppiYoY != null ? fmt(macro.ppiYoY, 1) + "%" : window.t("missing"),
          `<span class="term-note card-content">${window.t("ppiHint")}</span>`
        )}
      </section>
    `;

    window.CycleCharts.kondratievQuadrant(root.querySelector("#kQuad"), k);
    if (fg) {
      window.CycleCharts.fearGreedGauge(root.querySelector("#fgGauge"), fgVal, trend);
    }

    const isMobile = window.matchMedia("(max-width: 859px)").matches;
    const aiPayload = {
      countryLabel: countryLabel(code),
      waveId: k.wave.id,
      phase: window.t(k.phaseKey),
      rate: macro && macro.policyRate,
      inflation: macro && macro.inflation,
      cpi: macro && macro.cpiYoY,
      ppi: macro && macro.ppiYoY,
      fearGreed: fg && fg.value,
    };

    // PC：侧栏 AI；手机：点圆盘进弹窗（含详情+波形）
    if (!isMobile) {
      window.CycleAIUI.mount(root.querySelector("#aiMacroHost"), "macro", aiPayload);
    }

    root.querySelector("#openWave").addEventListener("click", () => {
      openWaveModal(k, isMobile);
    });

    const sub = root.querySelector("#subMeet");
    if (sub && next) {
      sub.addEventListener("click", (e) => {
        e.stopPropagation();
        icsMeeting(next);
        sub.textContent = window.t("subscribed");
      });
    }

    root.querySelectorAll(".metric-card:not(.is-missing)").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (e.target.closest("#subMeet") || e.target.closest(".term-tip")) return;
        const id = btn.dataset.metric;
        if (id === "fear") {
          openSeriesModal(
            window.t("fearGreed"),
            fg && fg.history,
            fg
              ? `<svg id="fgGaugeModal" class="fg-gauge"></svg>`
              : "",
            aiPayload
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
          const sm = document.getElementById("subMeet");
          if (sm && next) {
            sm.addEventListener("click", (ev) => {
              ev.stopPropagation();
              icsMeeting(next);
              sm.textContent = window.t("subscribed");
            });
          }
        } else if (id === "inflation") {
          openSeriesModal(
            window.t("inflation"),
            macro && macro.inflationHistory,
            "",
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
      });
    });
  }

  return { render };
})();
