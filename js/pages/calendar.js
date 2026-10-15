window.CyclePages = window.CyclePages || {};

window.CyclePages.calendar = (function () {
  let view = "week";
  let cursor = new Date();

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
  function locale() {
    return window.CycleState.lang === "zh" ? "zh-CN" : "en-US";
  }

  function icsForEvent(e) {
    const start = new Date(e.datetime);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const stamp = (d) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const desc = `${window.t("forecast")}: ${e.forecast}; ${window.t("actual")}: ${e.actual ?? "—"}; ${window.t("previous")}: ${e.previous}`;
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cycle//EN",
      "BEGIN:VEVENT",
      "UID:" + String(e.id).slice(0, 64) + "@cycle",
      "DTSTAMP:" + stamp(new Date()),
      "DTSTART:" + stamp(start),
      "DTEND:" + stamp(end),
      "SUMMARY:" + String(e.title).replace(/\n/g, " "),
      "DESCRIPTION:" + desc.replace(/\n/g, "\\n"),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  function downloadIcs(e) {
    const blob = new Blob([icsForEvent(e)], {
      type: "text/calendar;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cycle-event.ics";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function openEvent(e) {
    const time = new Date(e.datetime).toLocaleString(locale(), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const tag =
      e.tag === "holiday"
        ? window.t("holiday")
        : e.tag === "witching"
          ? window.t("witching")
          : window.t("country" + (e.country || "GLOBAL"));

    window.CycleUI.openModal(`
      <div class="sheet-head"><h2>${escapeHtml(e.title)}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      <p class="event-line"><strong>${time}</strong> · ${tag}</p>
      <ul class="kv">
        <li><span>${window.t("forecast")}</span><strong>${escapeHtml(String(e.forecast))}</strong></li>
        <li><span>${window.t("actual")}</span><strong>${escapeHtml(String(e.actual ?? "—"))}</strong></li>
        <li><span>${window.t("previous")}</span><strong>${escapeHtml(String(e.previous))}</strong></li>
      </ul>
      <button type="button" class="btn" id="subEvent">${window.t("subscribe")}</button>
      <pre class="ai-box" id="aiEventOut"></pre>
    `);
    document.getElementById("subEvent").addEventListener("click", () => {
      downloadIcs(e);
      document.getElementById("subEvent").textContent = window.t("subscribed");
    });
    const out = document.getElementById("aiEventOut");
    out.textContent = window.t("askAI");
    const res = await window.CycleLLM.interpret(
      "event",
      {
        title: e.title,
        forecast: e.forecast,
        actual: e.actual,
        previous: e.previous,
      },
      window.CycleState.lang
    );
    out.textContent = res.text;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function eventRow(e) {
    const time = new Date(e.datetime).toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `<div class="cal-item" data-id="${encodeURIComponent(e.id)}">
      <div class="cal-item-main">
        <span class="cal-time">${time}</span>
        <span class="cal-title">${escapeHtml(e.title)}</span>
        <span class="cal-nums">${window.t("forecast")} ${escapeHtml(String(e.forecast))} · ${window.t("actual")} ${escapeHtml(String(e.actual ?? "—"))}</span>
      </div>
      <button type="button" class="btn tiny sub-btn" data-sub="${encodeURIComponent(e.id)}">${window.t("subscribe")}</button>
    </div>`;
  }

  async function render(root) {
    async function paint() {
      root.innerHTML = `<div class="loading">${window.t("loading")}</div>`;
      let from;
      let to;
      let heading;

      if (view === "day") {
        from = startOfDay(cursor);
        to = addDays(from, 1);
        heading = cursor.toLocaleDateString(locale(), {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "short",
        });
      } else {
        const day = cursor.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        from = startOfDay(addDays(cursor, mondayOffset));
        to = addDays(from, 7);
        heading =
          from.toLocaleDateString(locale(), { month: "short", day: "numeric" }) +
          " – " +
          addDays(to, -1).toLocaleDateString(locale(), {
            month: "short",
            day: "numeric",
          });
      }

      let events =
        (await window.CycleAPI.fetchCalendar(
          from.toISOString(),
          to.toISOString(),
          window.CycleState.country
        )) || [];

      // 美国四巫日
      if (window.CycleState.country === "US") {
        const year = cursor.getFullYear();
        window.CycleAPI.witchingDates(year).forEach((d, i) => {
          const dt = new Date(d + "T18:00:00Z");
          if (dt >= from && dt < to) {
            events.push({
              id: "witch-" + d,
              country: "US",
              datetime: dt.toISOString(),
              title: window.t("witching"),
              forecast: "—",
              actual: null,
              previous: "—",
              importance: 3,
              tag: "witching",
            });
          }
        });
      }

      // 全球不展示节假日：已在 API 层仅 US holidays；CN holidays 暂无稳定源 → 不硬编码

      events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
      const byId = Object.fromEntries(events.map((e) => [String(e.id), e]));

      let body = "";
      if (view === "week") {
        const days = [];
        for (let i = 0; i < 7; i++) {
          const dayDate = addDays(from, i);
          const dayEvents = events.filter((e) =>
            sameDay(new Date(e.datetime), dayDate)
          );
          days.push(`<div class="w-col ${sameDay(dayDate, new Date()) ? "today" : ""}">
            <div class="w-head">${dayDate.toLocaleDateString(locale(), {
              weekday: "short",
              month: "numeric",
              day: "numeric",
            })}</div>
            ${
              dayEvents.length
                ? dayEvents
                    .map(
                      (e) =>
                        `<button type="button" class="w-item" data-id="${encodeURIComponent(
                          e.id
                        )}">${new Date(e.datetime).toLocaleTimeString(locale(), {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} ${escapeHtml(e.title)}</button>`
                    )
                    .join("")
                : `<div class="muted tiny">${window.t("noEvents")}</div>`
            }
          </div>`);
        }
        body = `<div class="week-grid">${days.join("")}</div>`;
      } else {
        body = events.length
          ? `<div class="cal-list">${events.map(eventRow).join("")}</div>`
          : `<div class="empty">${window.t("noEvents")}</div>`;
      }

      root.innerHTML = `
        <section class="panel">
          <div class="panel-head cal-toolbar">
            <div class="seg">
              <button type="button" data-view="day" class="${view === "day" ? "active" : ""}">${window.t("day")}</button>
              <button type="button" data-view="week" class="${view === "week" ? "active" : ""}">${window.t("week")}</button>
            </div>
            <div class="cal-nav">
              <button type="button" class="icon-btn" id="prev">‹</button>
              <strong>${heading}</strong>
              <button type="button" class="icon-btn" id="next">›</button>
            </div>
          </div>
          ${body}
        </section>
      `;

      root.querySelectorAll("[data-view]").forEach((b) => {
        b.addEventListener("click", () => {
          view = b.dataset.view;
          paint();
        });
      });
      root.querySelector("#prev").addEventListener("click", () => {
        cursor = view === "day" ? addDays(cursor, -1) : addDays(cursor, -7);
        paint();
      });
      root.querySelector("#next").addEventListener("click", () => {
        cursor = view === "day" ? addDays(cursor, 1) : addDays(cursor, 7);
        paint();
      });
      root.querySelectorAll("[data-id]").forEach((el) => {
        el.addEventListener("click", (ev) => {
          if (ev.target.closest("[data-sub]")) return;
          const e = byId[decodeURIComponent(el.dataset.id)];
          if (e) openEvent(e);
        });
      });
      root.querySelectorAll("[data-sub]").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const e = byId[decodeURIComponent(btn.dataset.sub)];
          if (e) {
            downloadIcs(e);
            btn.textContent = window.t("subscribed");
          }
        });
      });
    }

    await paint();
  }

  return { render };
})();
