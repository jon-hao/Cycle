window.CyclePages = window.CyclePages || {};

window.CyclePages.data = (function () {
  function fmt(v, digits) {
    if (v == null || Number.isNaN(Number(v))) return window.t("missing");
    return Number(v).toFixed(digits == null ? 2 : digits);
  }

  function metricCard(id, title, valueText, sub) {
    const missing = valueText === window.t("missing");
    return `<button type="button" class="metric-card ${missing ? "is-missing" : ""}" data-metric="${id}" ${missing ? "disabled" : ""}>
      <div class="metric-top"><span>${title}</span><span class="metric-open">${missing ? "" : window.t("openChart")}</span></div>
      <div class="metric-value">${valueText}</div>
      ${sub ? `<div class="metric-sub">${sub}</div>` : ""}
    </button>`;
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

  async function autoAI(el, kind, payload) {
    if (!el) return;
    el.hidden = false;
    el.textContent = window.t("askAI");
    const res = await window.CycleLLM.interpret(kind, payload, window.CycleState.lang);
    el.textContent = res.text;
  }

  function openSeriesModal(title, series, extraHtml, aiPayload) {
    if (!series || !series.length) {
      window.CycleUI.openModal(`
        <div class="sheet-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close>×</button></div>
        <p class="empty">${window.t("missing")}</p>
      `);
      return;
    }
    window.CycleUI.openModal(`
      <div class="sheet-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      <canvas class="chart" id="metricChart" height="220"></canvas>
      ${extraHtml || ""}
      <pre class="ai-box" id="aiMetricOut"></pre>
    `);
    requestAnimationFrame(() => {
      window.CycleCharts.lineChart(document.getElementById("metricChart"), series);
      autoAI(document.getElementById("aiMetricOut"), "macro", aiPayload);
    });
  }

  function openWaveModal(k) {
    const series = window.CycleKondratiev.longWaveSeries(new Date().getFullYear());
    window.CycleUI.openModal(`
      <div class="sheet-head"><h2>${window.t("waveHistory")}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      <p class="muted">K${k.wave.id} · ${window.t(k.phaseKey)} · ${(k.progress * 100).toFixed(0)}%</p>
      <canvas class="chart" id="waveChart" height="220"></canvas>
      <pre class="ai-box" id="aiWaveOut"></pre>
    `);
    requestAnimationFrame(() => {
      window.CycleCharts.lineChart(document.getElementById("waveChart"), series, {
        color: "#0f6e56",
        blinkAt: String(Math.round(k.year)),
      });
      autoAI(document.getElementById("aiWaveOut"), "wave", {
        waveId: k.wave.id,
        phase: window.t(k.phaseKey),
        progress: (k.progress * 100).toFixed(0),
      });
    });
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
    const nextText = next
      ? `${window.t("nextMeeting")}: ${next.title[lang] || next.title.zh} (${next.date || "—"})`
      : "";

    root.innerHTML = `
      <section class="panel k-panel" id="kPanel">
        <div class="panel-head">
          <h2>${window.t("kondratiev")}</h2>
          <span class="pill">K${k.wave.id} · ${window.t(k.phaseKey)}</span>
        </div>
        <p class="muted">${k.wave.theme[lang]} · ${window.t(k.phaseKey + "Desc")}</p>
        <div class="k-wrap">
          <button type="button" class="k-hit" id="openWave" aria-label="${window.t("kondratiev")}">
            <svg id="kQuad" class="k-quad"></svg>
          </button>
          <div class="k-meta">
            <div><strong>${window.t("wave")}</strong> K${k.wave.id}</div>
            <div><strong>${window.t("phase")}</strong> ${window.t(k.phaseKey)}</div>
            <div><strong>${window.t("currentPosition")}</strong> ${(k.progress * 100).toFixed(0)}%</div>
            <div><strong>${window.t("direction")}</strong> →</div>
            <pre class="ai-box" id="aiMacroOut"></pre>
          </div>
        </div>
      </section>

      <section class="metrics">
        ${metricCard(
          "fear",
          window.t("fearGreed"),
          fg ? String(Math.round(fg.value)) : window.t("missing"),
          fg ? window.t(fg.labelKey || "fgNeutral") : ""
        )}
        ${metricCard(
          "rate",
          `${bankLabel(code)} · ${rateLabel(code)}`,
          macro && macro.policyRate != null
            ? fmt(macro.policyRate) + "%"
            : window.t("missing"),
          nextText
        )}
        ${metricCard(
          "inflation",
          window.t("inflation"),
          macro && macro.inflation != null ? fmt(macro.inflation, 1) + "%" : window.t("missing")
        )}
        ${metricCard(
          "cpi",
          window.t("cpi"),
          macro && macro.cpiYoY != null ? fmt(macro.cpiYoY, 1) + "%" : window.t("missing")
        )}
        ${metricCard(
          "ppi",
          window.t("ppi"),
          macro && macro.ppiYoY != null ? fmt(macro.ppiYoY, 1) + "%" : window.t("missing")
        )}
      </section>
      <p class="footnote">${window.t("dataNote")}${
        macro && macro.source ? ` · ${window.t("source")}: ${macro.source}` : ""
      }</p>
    `;

    window.CycleCharts.kondratievQuadrant(root.querySelector("#kQuad"), k);
    root.querySelector("#openWave").addEventListener("click", () => openWaveModal(k));

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
    autoAI(root.querySelector("#aiMacroOut"), "macro", aiPayload);

    root.querySelectorAll(".metric-card:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.metric;
        if (id === "fear") {
          openSeriesModal(window.t("fearGreed"), fg && fg.history, "", aiPayload);
        } else if (id === "rate") {
          const extra = nextText
            ? `<p class="muted">${nextText}</p><p class="muted">${window.t("dotPlot")}: ${window.t("missing")}</p>`
            : `<p class="muted">${window.t("dotPlot")}: ${window.t("missing")}</p>`;
          openSeriesModal(
            `${bankLabel(code)} · ${rateLabel(code)}`,
            macro && macro.rateHistory,
            extra,
            aiPayload
          );
        } else if (id === "inflation") {
          openSeriesModal(
            window.t("inflation"),
            macro && macro.inflationHistory,
            "",
            aiPayload
          );
        } else if (id === "cpi") {
          openSeriesModal(window.t("cpi"), macro && macro.cpiHistory, "", aiPayload);
        } else if (id === "ppi") {
          openSeriesModal(window.t("ppi"), macro && macro.ppiHistory, "", aiPayload);
        }
      });
    });
  }

  return { render };
})();
