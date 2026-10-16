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

  function rankClass(rank) {
    const r = Number(rank) || 0;
    if (r === 1) return "news-rank top-1";
    if (r === 2) return "news-rank top-2";
    if (r === 3) return "news-rank top-3";
    return "news-rank";
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
      let raw = null;
      const board = window.CycleBoard && window.CycleBoard.rawFor(country);
      if (soft && board && board.news && board.news.length) {
        raw = board.news;
      } else {
        raw = await window.CycleAPI.fetchImportantNews(country);
      }
      if (!raw || !raw.length) {
        list = [];
      } else {
        const box = root.querySelector("#newsList");
        if (box) {
          box.innerHTML = `<div class="empty">${window.t("translating")}</div>`;
        }
        // 国家列表内重新编号 1..n
        const numbered = raw.slice(0, 40).map((item, idx) =>
          Object.assign({}, item, {
            displayRank: idx + 1,
            jin10Rank: item.rank,
          })
        );
        list = await mapPool(numbered, 4, async (item) => {
          if (!window.CycleTranslate) return item;
          const title = await window.CycleTranslate.translateText(
            item.title,
            lang
          );
          return Object.assign({}, item, {
            title,
            titleRaw: item.titleRaw || item.title,
            summaryRaw: item.summary || item.content || "",
            contentRaw: item.content || item.summary || "",
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
      .map((n) => {
        const r = n.displayRank || n.rank || "·";
        return `<article class="news-card" data-id="${encodeURIComponent(n.id)}">
          <div class="news-meta">
            <span class="${rankClass(r)}" aria-label="#${r}">${r}</span>
            <time class="card-date">${formatTime(n.time)}</time>
          </div>
          <h3 class="card-title">${escapeHtml(n.title)}</h3>
        </article>`;
      })
      .join("");

    const byId = Object.fromEntries(list.map((n) => [n.id, n]));
    root.querySelectorAll(".news-card").forEach((card) => {
      card.addEventListener("click", async () => {
        const id = decodeURIComponent(card.dataset.id);
        const n = byId[id];
        if (!n) return;
        const r = n.displayRank || n.rank || "";

        window.CycleUI.openModal(`
          <div class="sheet-head">
            <h2 class="card-title"><span class="${rankClass(r)}">${r}</span> ${escapeHtml(n.title)}</h2>
            <button type="button" class="icon-btn" data-close>×</button>
          </div>
          <div class="news-modal-meta">
            <time class="card-date">${formatTime(n.time)}</time>
            <span id="newsExtra"></span>
          </div>
          <p class="card-content news-detail-body" id="newsSummary">${window.t("translating")}</p>
          <div class="ai-host" id="aiNewsHost"></div>
        `);

        let body = n.contentRaw || n.summaryRaw || n.content || n.summary || "";
        if (window.CycleTranslate) {
          body = await window.CycleTranslate.translateText(body, lang);
          n.summary = body;
        }

        const sumEl = document.getElementById("newsSummary");
        if (sumEl) sumEl.textContent = body || "";

        const extra = document.getElementById("newsExtra");
        if (extra) {
          if (n.link) {
            extra.innerHTML = `<a class="news-origin-link" href="${escapeHtml(
              n.link
            )}" target="_blank" rel="noopener noreferrer">${window.t(
              "sourceLink"
            )}</a>`;
          } else {
            extra.innerHTML = "";
          }
        }

        window.CycleAIUI.mount(document.getElementById("aiNewsHost"), "news", {
          title: n.title,
          summary: body || "",
          focus: n.title,
        });
      });
    });
  }

  return { render };
})();
