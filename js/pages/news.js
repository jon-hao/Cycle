window.CyclePages = window.CyclePages || {};

window.CyclePages.news = (function () {
  function formatTime(iso) {
    const lang = window.CycleState.lang;
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

  async function render(root) {
    root.innerHTML = `<div class="loading">${window.t("loading")}</div>`;
    const country = window.CycleState.country;
    const list = await window.CycleAPI.fetchImportantNews(country);

    if (!list || !list.length) {
      root.innerHTML = `<section class="panel"><div class="empty">${window.t("noNews")}</div></section>`;
      return;
    }

    root.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2>${window.t("navNews")}</h2></div>
        <div class="news-list">
          ${list
            .map(
              (n) => `<article class="news-card" data-id="${encodeURIComponent(n.id)}">
              <div class="news-meta"><time>${formatTime(n.time)}</time></div>
              <h3>${escapeHtml(n.title)}</h3>
              <p>${escapeHtml((n.summary || "").slice(0, 160))}</p>
            </article>`
            )
            .join("")}
        </div>
      </section>
    `;

    const byId = Object.fromEntries(list.map((n) => [n.id, n]));
    root.querySelectorAll(".news-card").forEach((card) => {
      card.addEventListener("click", async () => {
        const id = decodeURIComponent(card.dataset.id);
        const n = byId[id];
        if (!n) return;
        window.CycleUI.openModal(`
          <div class="sheet-head"><h2>${escapeHtml(n.title)}</h2><button type="button" class="icon-btn" data-close>×</button></div>
          <p class="muted">${formatTime(n.time)}</p>
          <p>${escapeHtml(n.summary || "")}</p>
          <pre class="ai-box" id="aiNewsOut"></pre>
        `);
        const out = document.getElementById("aiNewsOut");
        out.textContent = window.t("askAI");
        const res = await window.CycleLLM.interpret(
          "news",
          { title: n.title, summary: n.summary },
          window.CycleState.lang
        );
        out.textContent = res.text;
      });
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  return { render };
})();
