window.CyclePages = window.CyclePages || {};

window.CyclePages.news = (function () {
  let cache = null;

  function formatTime(iso) {
    const lang = window.CycleState.lang;
    try {
      const d = new Date(iso);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hm = d.toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${y}.${m}.${day} ${hm}`;
    } catch (_) {
      return String(iso || "").replace(/-/g, ".");
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function render(root, opts) {
    const soft = opts && opts.soft;
    const country = window.CycleState.country;

    root.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2 class="card-title">${window.t("navNews")}</h2></div>
        <div class="news-list" id="newsList">
          <div class="skel-block skel-list"></div>
        </div>
      </section>`;

    let list;
    if (soft && cache && cache.country === country) {
      list = cache.list;
    } else {
      list = await window.CycleAPI.fetchImportantNews(country);
      cache = { country, list };
    }

    const box = root.querySelector("#newsList");
    if (!list || !list.length) {
      box.innerHTML = `<div class="empty">${window.t("noNews")}</div>`;
      return;
    }

    box.innerHTML = list
      .map(
        (n) => `<article class="news-card" data-id="${encodeURIComponent(n.id)}">
          <div class="news-meta"><time class="card-date">${formatTime(n.time)}</time></div>
          <h3 class="card-title">${escapeHtml(n.title)}</h3>
        </article>`
      )
      .join("");

    const byId = Object.fromEntries(list.map((n) => [n.id, n]));
    root.querySelectorAll(".news-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = decodeURIComponent(card.dataset.id);
        const n = byId[id];
        if (!n) return;
        window.CycleUI.openModal(`
          <div class="sheet-head"><h2 class="card-title">${escapeHtml(n.title)}</h2><button type="button" class="icon-btn" data-close>×</button></div>
          <p class="card-date">${formatTime(n.time)}</p>
          <p class="card-content">${escapeHtml(n.summary || "")}</p>
          <div class="ai-host" id="aiNewsHost"></div>
        `);
        window.CycleAIUI.mount(document.getElementById("aiNewsHost"), "news", {
          title: n.title,
          summary: n.summary,
        });
      });
    });
  }

  return { render };
})();
