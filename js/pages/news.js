window.CyclePages = window.CyclePages || {};

window.CyclePages.news = (function () {
  let cache = null;

  function formatTime(iso) {
    if (window.CycleTZ) return window.CycleTZ.formatNewsStamp(iso);
    try {
      return new Date(iso).toLocaleString();
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

  async function mapPool(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    async function worker() {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }
    const n = Math.min(limit, items.length) || 1;
    await Promise.all(Array.from({ length: n }, () => worker()));
    return out;
  }

  async function render(root, opts) {
    const soft = opts && opts.soft;
    const country = window.CycleState.country;
    const lang = window.CycleState.lang;

    root.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2 class="card-title">${window.t("navNews")}</h2></div>
        <div class="news-list" id="newsList">
          <div class="skel-block skel-list"></div>
        </div>
      </section>`;

    let list;
    if (soft && cache && cache.country === country && cache.lang === lang) {
      list = cache.list;
    } else {
      const raw = await window.CycleAPI.fetchImportantNews(country);
      if (!raw || !raw.length) {
        list = [];
      } else {
        const box = root.querySelector("#newsList");
        if (box) box.innerHTML = `<div class="empty">${window.t("translating")}</div>`;
        list = await mapPool(raw.slice(0, 40), 4, async (item) => {
          if (!window.CycleTranslate) return item;
          const title = await window.CycleTranslate.translateText(item.title, lang);
          return Object.assign({}, item, {
            title,
            titleRaw: item.title,
            summaryRaw: item.summary,
          });
        });
      }
      cache = { country, lang, list };
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
      card.addEventListener("click", async () => {
        const id = decodeURIComponent(card.dataset.id);
        const n = byId[id];
        if (!n) return;

        window.CycleUI.openModal(`
          <div class="sheet-head"><h2 class="card-title">${escapeHtml(n.title)}</h2><button type="button" class="icon-btn" data-close>×</button></div>
          <p class="card-date">${formatTime(n.time)}</p>
          <p class="card-content" id="newsSummary">${window.t("translating")}</p>
          <div id="newsExtra"></div>
          <div class="ai-host" id="aiNewsHost"></div>
        `);

        let summary = n.summary;
        if (window.CycleTranslate) {
          summary = await window.CycleTranslate.translateText(
            n.summaryRaw || n.summary || "",
            lang
          );
          n.summary = summary;
        }

        const sumEl = document.getElementById("newsSummary");
        if (sumEl) sumEl.textContent = summary || "";

        const extra = document.getElementById("newsExtra");
        if (extra) {
          const img = n.image
            ? `<img class="news-modal-img" src="${escapeHtml(n.image)}" alt="" loading="lazy" />`
            : "";
          const link = n.link
            ? `<a class="news-source-link" href="${escapeHtml(
                n.link
              )}" target="_blank" rel="noopener noreferrer">${window.t("sourceLink")}</a>`
            : "";
          extra.innerHTML = img + link;
        }

        window.CycleAIUI.mount(document.getElementById("aiNewsHost"), "news", {
          title: n.title,
          summary: summary || "",
        });
      });
    });
  }

  return { render };
})();
