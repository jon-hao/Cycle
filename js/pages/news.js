window.CyclePages = window.CyclePages || {};

window.CyclePages.news = (function () {
  let renderSeq = 0;
  let mem = null;

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

  function countryBadge(code) {
    const c = code === "CN" || code === "US" ? code : "GLOBAL";
    const flag = c === "US" ? "🇺🇸" : c === "CN" ? "🇨🇳" : "🌐";
    return `<span class="geo-tag" data-geo="${c}">${flag} ${window.t("country" + c)}</span>`;
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
        const geo = n.countryGuess || n.country || "GLOBAL";
        return `<article class="news-card" data-id="${encodeURIComponent(n.id)}">
          <div class="news-meta">
            <span class="${rankClass(r)}" aria-label="#${r}">${r}</span>
            ${countryBadge(geo)}
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
        const origin =
          n.originLink ||
          (n.link && !/flash\.jin10\.com/i.test(n.link) ? n.link : null) ||
          n.jin10Link ||
          n.link ||
          "";

        const rawBody = n.contentRaw || n.summaryRaw || n.content || n.summary || "";
        const geo = n.countryGuess || n.country || "GLOBAL";
        window.CycleUI.openModal(`
          <div class="sheet-head">
            <h2 class="card-title"><span class="${rankClass(r)}">${r}</span> ${escapeHtml(n.title)}</h2>
            <button type="button" class="icon-btn" data-close>×</button>
          </div>
          <div class="news-modal-meta">
            ${countryBadge(geo)}
            <time class="card-date">${formatTime(n.time)}</time>
            <span id="newsExtra">${
              origin
                ? `<a class="news-origin-link" href="${escapeHtml(
                    origin
                  )}" target="_blank" rel="noopener noreferrer">${window.t(
                    "sourceLink"
                  )}</a>`
                : ""
            }</span>
          </div>
          <p class="card-content news-detail-body" id="newsSummary">${escapeHtml(
            rawBody
          )}</p>
        `);

        let body = rawBody;
        if (window.CycleTranslate) {
          try {
            body = await window.CycleTranslate.translateText(body, lang);
          } catch (_) {}
        }
        const sumEl = document.getElementById("newsSummary");
        if (sumEl) sumEl.textContent = body || "";
      });
    });
  }

  async function render(root, opts) {
    const seq = ++renderSeq;
    const soft = opts && opts.soft;
    const force = opts && opts.force;
    const lang = window.CycleState.lang;
    const embedded = !!(opts && opts.embedded);

    if (!embedded) {
      root.innerHTML = `
        <section class="panel">
          <div class="panel-head"><h2 class="card-title">${window.t("navNews")}</h2></div>
          <div class="news-list" id="newsList">
            <div class="skel-block skel-list"></div>
          </div>
        </section>`;
    } else {
      root.innerHTML = `<div class="news-list" id="newsList"><div class="skel-block skel-list"></div></div>`;
    }

    const box = root.querySelector("#newsList");
    let raw = null;
    if (soft && !force && mem && mem.list) {
      raw = mem.list;
    } else {
      try {
        if (force && window.CycleAPI.clearNewsMemo) {
          window.CycleAPI.clearNewsMemo();
        }
        raw = await window.CycleAPI.fetchImportantNews("ALL");
        mem = { list: raw };
      } catch (e) {
        if (seq !== renderSeq) return;
        box.innerHTML = `<div class="empty">${window.t("loadError")}<br/><span class="tiny">${escapeHtml(
          String(e && e.message ? e.message : e)
        )}</span></div>`;
        return;
      }
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
      if (window.CycleState.page !== "insight" && window.CycleState.page !== "news") return;
      paintList(box, done);
      wireCards(root, done);
    });
  }

  return { render };
})();
