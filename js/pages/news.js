window.CyclePages = window.CyclePages || {};

window.CyclePages.news = (function () {
  let renderSeq = 0;

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

  function paintList(box, list) {
    if (!box) return;
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
  }

  function wireCards(root, list) {
    const byId = Object.fromEntries(list.map((n) => [n.id, n]));
    root.querySelectorAll(".news-card").forEach((card) => {
      card.addEventListener("click", async () => {
        const id = decodeURIComponent(card.dataset.id);
        const n = byId[id];
        if (!n) return;
        const r = n.displayRank || n.rank || "";
        const lang = window.CycleState.lang;

        window.CycleUI.openModal(`
          <div class="sheet-head">
            <h2 class="card-title"><span class="${rankClass(r)}">${r}</span> ${escapeHtml(n.title)}</h2>
            <button type="button" class="icon-btn" data-close>×</button>
          </div>
          <div class="news-modal-meta">
            <time class="card-date">${formatTime(n.time)}</time>
            <span id="newsExtra"></span>
          </div>
          <p class="card-content news-detail-body" id="newsSummary">${escapeHtml(
            n.contentRaw || n.summaryRaw || n.content || n.summary || ""
          ) || window.t("translating")}</p>
          <div class="ai-host" id="aiNewsHost"></div>
        `);

        let body = n.contentRaw || n.summaryRaw || n.content || n.summary || "";
        if (window.CycleTranslate) {
          try {
            body = await window.CycleTranslate.translateText(body, lang);
          } catch (_) {}
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

  async function render(root) {
    const seq = ++renderSeq;
    const country = window.CycleState.country;
    const lang = window.CycleState.lang;

    root.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2 class="card-title">${window.t("navNews")}</h2></div>
        <div class="news-list" id="newsList">
          <div class="skel-block skel-list"></div>
        </div>
      </section>`;

    const box = root.querySelector("#newsList");
    let raw = null;
    try {
      raw = await window.CycleAPI.fetchImportantNews(country);
    } catch (e) {
      console.warn("[Cycle] news render", e);
      raw = null;
    }
    if (seq !== renderSeq) return;

    if (!raw || !raw.length) {
      paintList(box, []);
      return;
    }

    const list = raw.slice(0, 40).map((item, idx) =>
      Object.assign({}, item, {
        displayRank: idx + 1,
        jin10Rank: item.rank,
        titleRaw: item.title,
        summaryRaw: item.summary || item.content || "",
        contentRaw: item.content || item.summary || "",
      })
    );
    paintList(box, list);
    wireCards(root, list);

    if (!window.CycleTranslate) return;
    // 后台翻标题；不阻塞首屏
    Promise.all(
      list.map(async (item) => {
        try {
          item.title = await window.CycleTranslate.translateText(
            item.titleRaw || item.title,
            lang
          );
        } catch (_) {}
        return item;
      })
    ).then((done) => {
      if (seq !== renderSeq) return;
      if (window.CycleState.page !== "news") return;
      if (window.CycleState.country !== country) return;
      paintList(box, done);
      wireCards(root, done);
    });
  }

  return { render };
})();
