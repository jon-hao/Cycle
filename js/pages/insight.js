window.CyclePages = window.CyclePages || {};

window.CyclePages.insight = (function () {
  let tab = "news";

  async function render(root, opts) {
    const soft = opts && opts.soft;
    const force = opts && opts.force;

    root.innerHTML = `
      <section class="panel insight-panel">
        <div class="panel-head insight-toolbar">
          <div class="seg seg-compact" id="insightTabs">
            <button type="button" data-tab="news" class="${tab === "news" ? "active" : ""}">${window.t("insightNews")}</button>
            <button type="button" data-tab="calendar" class="${tab === "calendar" ? "active" : ""}">${window.t("insightCalendar")}</button>
          </div>
        </div>
        <div id="insightBody"></div>
      </section>`;

    const body = root.querySelector("#insightBody");
    root.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab = btn.dataset.tab;
        render(root, { soft: true });
      });
    });

    if (tab === "calendar") {
      await window.CyclePages.calendar.render(body, {
        soft,
        force,
        embedded: true,
        allCountries: true,
      });
    } else {
      await window.CyclePages.news.render(body, {
        soft,
        force,
        embedded: true,
      });
    }
  }

  return { render };
})();
