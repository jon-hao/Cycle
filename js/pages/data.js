window.CyclePages = window.CyclePages || {};

window.CyclePages.data = (function () {
  let fearCache = null;

  async function loadFearGreed() {
    if (fearCache) return fearCache;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch("https://fearandgreedgraph.com/api/fear-greed", {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("fg");
      const data = await res.json();
      const dates = data.dates || [];
      const values = data.values || [];
      const history = dates.map((d, i) => ({ d, v: values[i] })).slice(-120);
      const value = values[values.length - 1];
      fearCache = {
        value,
        label: rating(value),
        history,
        live: true,
      };
      return fearCache;
    } catch (_) {
      const fb = window.CycleState.seed.fearGreedFallback;
      fearCache = Object.assign({ live: false }, fb, {
        label: rating(fb.value),
      });
      return fearCache;
    }
  }

  function rating(v) {
    if (v < 25) return "Extreme Fear";
    if (v < 45) return "Fear";
    if (v < 55) return "Neutral";
    if (v < 75) return "Greed";
    return "Extreme Greed";
  }

  function countryData() {
    const code = window.CycleState.country;
    return window.CycleState.seed.countries[code];
  }

  function metricCard(id, title, value, unit, subtitle) {
    return `<button type="button" class="metric-card" data-metric="${id}">
      <div class="metric-top">
        <span class="metric-title">${title}</span>
        <span class="metric-open">${window.t("openChart")}</span>
      </div>
      <div class="metric-value">${value}<small>${unit || ""}</small></div>
      ${subtitle ? `<div class="metric-sub">${subtitle}</div>` : ""}
    </button>`;
  }

  async function render(root) {
    const lang = window.CycleState.lang;
    const c = countryData();
    const k = window.CycleKondratiev.waveAt(new Date());
    const fg = await loadFearGreed();
    const bank = c.centralBank[lang];
    const rateLabel = c.rateLabel[lang];

    root.innerHTML = `
      <section class="panel">
        <div class="panel-head">
          <h2>${window.t("kondratiev")}</h2>
          <span class="pill">K${k.wave.id} · ${window.t(k.phaseKey)}</span>
        </div>
        <p class="muted">${k.wave.theme[lang]} · ${window.t(k.phaseKey + "Desc")}</p>
        <div class="k-wrap">
          <svg id="kQuad" class="k-quad" role="img" aria-label="Kondratiev quadrant"></svg>
          <div class="k-meta">
            <div><strong>${window.t("wave")}</strong> K${k.wave.id}</div>
            <div><strong>${window.t("phase")}</strong> ${window.t(k.phaseKey)}</div>
            <div><strong>${window.t("currentPosition")}</strong> ${(k.progress * 100).toFixed(0)}%</div>
            <button type="button" class="btn ghost" id="aiMacro">${window.t("askAI")}</button>
            <pre class="ai-box" id="aiMacroOut" hidden></pre>
          </div>
        </div>
      </section>

      <section class="metrics">
        ${metricCard(
          "fear",
          window.t("fearGreed"),
          fg.value.toFixed ? fg.value.toFixed(0) : fg.value,
          "",
          fg.label + (fg.live ? " · live" : " · fallback")
        )}
        ${metricCard(
          "rate",
          `${bank} · ${rateLabel}`,
          c.policyRate.toFixed(2),
          "%",
          c.nextMeeting
            ? `${window.t("nextMeeting")}: ${c.nextMeetingLabel[lang]} (${c.nextMeeting})`
            : c.nextMeetingLabel[lang]
        )}
        ${metricCard("inflation", window.t("inflation"), c.inflation.toFixed(1), "%")}
        ${metricCard("cpi", window.t("cpi"), c.cpiYoY.toFixed(1), "% YoY")}
        ${metricCard("ppi", window.t("ppi"), c.ppiYoY.toFixed(1), "% YoY")}
      </section>
      <p class="footnote">${window.t("dataNote")}</p>
    `;

    window.CycleCharts.kondratievQuadrant(root.querySelector("#kQuad"), k);

    root.querySelectorAll(".metric-card").forEach((btn) => {
      btn.addEventListener("click", () => openMetric(btn.dataset.metric, c, fg));
    });

    root.querySelector("#aiMacro").addEventListener("click", async () => {
      const out = root.querySelector("#aiMacroOut");
      out.hidden = false;
      out.textContent = window.t("aiThinking");
      const res = await window.CycleLLM.interpret(
        "macro",
        {
          country: window.CycleState.country,
          wave: "K" + k.wave.id,
          phase: k.phaseKey,
          rate: c.policyRate,
          inflation: c.inflation,
          cpi: c.cpiYoY,
          ppi: c.ppiYoY,
          fearGreed: fg.value,
        },
        lang
      );
      out.textContent = res.text;
    });
  }

  function openMetric(id, c, fg) {
    const lang = window.CycleState.lang;
    let title = "";
    let series = [];
    let extra = "";

    if (id === "fear") {
      title = window.t("fearGreed");
      series = fg.history;
    } else if (id === "rate") {
      title = c.centralBank[lang] + " · " + c.rateLabel[lang];
      series = c.rateHistory;
      if (c.dotPlot) {
        extra = `<h3>${window.t("dotPlot")}</h3><canvas class="chart" id="dotCanvas" height="200"></canvas>`;
      }
      if (c.nextMeeting) {
        extra += `<p class="muted">${window.t("nextMeeting")}: <strong>${c.nextMeetingLabel[lang]}</strong> · ${c.nextMeeting}</p>`;
      }
    } else if (id === "inflation") {
      title = window.t("inflation");
      series = c.inflationHistory;
    } else if (id === "cpi") {
      title = window.t("cpi");
      series = c.cpiHistory;
    } else if (id === "ppi") {
      title = window.t("ppi");
      series = c.ppiHistory;
    }

    window.CycleUI.openModal(`
      <div class="sheet-head">
        <h2>${title}</h2>
        <button type="button" class="icon-btn" data-close>×</button>
      </div>
      <canvas class="chart" id="metricChart" height="200"></canvas>
      ${extra}
      <button type="button" class="btn" id="aiMetric">${window.t("askAI")}</button>
      <pre class="ai-box" id="aiMetricOut" hidden></pre>
    `);

    requestAnimationFrame(() => {
      const canvas = document.getElementById("metricChart");
      if (canvas && series.length) window.CycleCharts.lineChart(canvas, series);
      if (id === "rate" && c.dotPlot) {
        const dc = document.getElementById("dotCanvas");
        if (dc) window.CycleCharts.dotsPlot(dc, c.dotPlot);
      }
      const aiBtn = document.getElementById("aiMetric");
      if (aiBtn) {
        aiBtn.addEventListener("click", async () => {
          const out = document.getElementById("aiMetricOut");
          out.hidden = false;
          out.textContent = window.t("aiThinking");
          const last = series[series.length - 1];
          const res = await window.CycleLLM.interpret(
            "macro",
            {
              country: window.CycleState.country,
              wave: "metric:" + id,
              phase: id,
              rate: c.policyRate,
              inflation: c.inflation,
              cpi: c.cpiYoY,
              ppi: c.ppiYoY,
              fearGreed: last ? last.v : fg.value,
            },
            lang
          );
          out.textContent = res.text;
        });
      }
    });
  }

  return { render };
})();
