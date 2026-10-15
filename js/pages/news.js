window.CyclePages = window.CyclePages || {};

window.CyclePages.news = (function () {
  function formatTime(iso, lang) {
    try {
      return new Date(iso).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return iso;
    }
  }

  function render(root) {
    const lang = window.CycleState.lang;
    const country = window.CycleState.country;
    const all = window.CycleState.seed.news || [];
    let filter = country === "GLOBAL" ? "ALL" : country;

    function paint() {
      const list =
        filter === "ALL"
          ? all
          : all.filter((n) => n.country === filter || n.country === "GLOBAL");

      root.innerHTML = `
        <section class="panel">
          <div class="panel-head">
            <h2>${window.t("navNews")}</h2>
            <label class="inline">
              ${window.t("newsFilter")}
              <select id="newsCountry">
                <option value="ALL">${window.t("filterAll")}</option>
                <option value="US">US</option>
                <option value="CN">CN</option>
                <option value="GLOBAL">Global</option>
              </select>
            </label>
          </div>
          <div class="news-list">
            ${list
              .map((n) => {
                const impact =
                  n.impact === "high"
                    ? window.t("impactHigh")
                    : n.impact === "medium"
                      ? window.t("impactMed")
                      : window.t("impactLow");
                return `<article class="news-card" data-id="${n.id}">
                  <div class="news-meta">
                    <span class="tag">${n.country}</span>
                    <span class="tag impact-${n.impact}">${impact}</span>
                    <time>${formatTime(n.time, lang)}</time>
                  </div>
                  <h3>${n.title[lang]}</h3>
                  <p>${n.summary[lang]}</p>
                </article>`;
              })
              .join("")}
          </div>
        </section>
      `;

      const sel = root.querySelector("#newsCountry");
      sel.value = filter;
      sel.addEventListener("change", () => {
        filter = sel.value;
        paint();
      });

      root.querySelectorAll(".news-card").forEach((card) => {
        card.addEventListener("click", () => {
          const n = all.find((x) => x.id === card.dataset.id);
          if (!n) return;
          window.CycleUI.openModal(`
            <div class="sheet-head">
              <h2>${n.title[lang]}</h2>
              <button type="button" class="icon-btn" data-close>×</button>
            </div>
            <p class="muted">${n.country} · ${formatTime(n.time, lang)}</p>
            <p>${n.summary[lang]}</p>
            <button type="button" class="btn" id="aiNews">${window.t("askAI")}</button>
            <pre class="ai-box" id="aiNewsOut" hidden></pre>
          `);
          document.getElementById("aiNews").addEventListener("click", async () => {
            const out = document.getElementById("aiNewsOut");
            out.hidden = false;
            out.textContent = window.t("aiThinking");
            const res = await window.CycleLLM.interpret(
              "news",
              {
                title: n.title[lang],
                summary: n.summary[lang],
                country: n.country,
              },
              lang
            );
            out.textContent = res.text;
          });
        });
      });
    }

    paint();
  }

  return { render };
})();
