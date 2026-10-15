window.CyclePages = window.CyclePages || {};

window.CyclePages.calendar = (function () {
  let view = "week";
  let cursor = new Date();

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function locale() {
    return window.CycleState.lang === "zh" ? "zh-CN" : "en-US";
  }

  function eventsForRange(from, to) {
    const country = window.CycleState.country;
    const seed = window.CycleState.seed;
    const events = (seed.calendar || []).filter((e) => {
      const t = new Date(e.datetime);
      if (t < from || t > to) return false;
      if (country === "GLOBAL") return true;
      if (e.country === country || e.country === "GLOBAL") return true;
      if (country === "US" && e.tag === "witching") return true;
      return false;
    });

    // inject witching for US
    if (country === "US") {
      (seed.witchingDates2026 || []).forEach((d, i) => {
        const dt = new Date(d + "T14:30:00Z");
        if (dt >= from && dt <= to) {
          events.push({
            id: "witch-" + i,
            country: "US",
            datetime: dt.toISOString(),
            title: { zh: "四巫日", en: "Quadruple Witching" },
            forecast: "—",
            actual: null,
            previous: "—",
            importance: 2,
            tag: "witching",
          });
        }
      });
    }

    // holidays (not for GLOBAL)
    const holidays = [];
    if (country !== "GLOBAL") {
      (seed.holidays[country] || []).forEach((h, i) => {
        const dt = new Date(h.d + "T00:00:00");
        if (dt >= from && dt <= to) {
          holidays.push({
            id: "hol-" + i,
            country,
            datetime: dt.toISOString(),
            title: { zh: h.zh, en: h.en },
            forecast: "—",
            actual: "—",
            previous: "—",
            importance: 1,
            tag: "holiday",
          });
        }
      });
    }

    return events.concat(holidays).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }

  function icsForEvent(e) {
    const lang = window.CycleState.lang;
    const start = new Date(e.datetime);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    function stamp(d) {
      return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    }
    const title = e.title[lang];
    const desc = `${window.t("forecast")}: ${e.forecast}; ${window.t("actual")}: ${e.actual ?? "—"}; ${window.t("previous")}: ${e.previous}`;
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cycle//Economic Calendar//EN",
      "BEGIN:VEVENT",
      "UID:" + e.id + "@cycle.local",
      "DTSTAMP:" + stamp(new Date()),
      "DTSTART:" + stamp(start),
      "DTEND:" + stamp(end),
      "SUMMARY:" + title.replace(/\n/g, " "),
      "DESCRIPTION:" + desc.replace(/\n/g, "\\n"),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  function downloadIcs(e) {
    const blob = new Blob([icsForEvent(e)], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (e.title.en || e.id).replace(/\s+/g, "_") + ".ics";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openEvent(e) {
    const lang = window.CycleState.lang;
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
          : e.country;

    window.CycleUI.openModal(`
      <div class="sheet-head">
        <h2>${e.title[lang]}</h2>
        <button type="button" class="icon-btn" data-close>×</button>
      </div>
      <p class="event-line"><strong>${time}</strong> · ${tag}</p>
      <ul class="kv">
        <li><span>${window.t("forecast")}</span><strong>${e.forecast}</strong></li>
        <li><span>${window.t("actual")}</span><strong>${e.actual ?? "—"}</strong></li>
        <li><span>${window.t("previous")}</span><strong>${e.previous}</strong></li>
      </ul>
      <div class="row-actions">
        <button type="button" class="btn" id="subEvent">${window.t("subscribe")}</button>
        <button type="button" class="btn ghost" id="aiEvent">${window.t("askAI")}</button>
      </div>
      <pre class="ai-box" id="aiEventOut" hidden></pre>
    `);

    document.getElementById("subEvent").addEventListener("click", () => {
      downloadIcs(e);
      document.getElementById("subEvent").textContent = window.t("subscribed");
    });
    document.getElementById("aiEvent").addEventListener("click", async () => {
      const out = document.getElementById("aiEventOut");
      out.hidden = false;
      out.textContent = window.t("aiThinking");
      const res = await window.CycleLLM.interpret(
        "event",
        {
          title: e.title[lang],
          forecast: e.forecast,
          actual: e.actual,
          previous: e.previous,
          country: e.country,
        },
        lang
      );
      out.textContent = res.text;
    });
  }

  function eventRow(e) {
    const lang = window.CycleState.lang;
    const time = new Date(e.datetime).toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit",
    });
    const badge =
      e.tag === "holiday"
        ? window.t("holiday")
        : e.tag === "witching"
          ? window.t("witching")
          : e.country;
    return `<div class="cal-item" data-id="${e.id}">
      <div class="cal-item-main">
        <span class="cal-time">${time}</span>
        <span class="tag">${badge}</span>
        <span class="cal-title">${e.title[lang]}</span>
        <span class="cal-nums">${window.t("forecast")} ${e.forecast} · ${window.t("actual")} ${e.actual ?? "—"}</span>
      </div>
      <button type="button" class="btn tiny sub-btn" data-sub="${e.id}">${window.t("subscribe")}</button>
    </div>`;
  }

  function render(root) {
    function paint() {
      const lang = window.CycleState.lang;
      let from;
      let to;
      let heading = "";

      if (view === "day") {
        from = startOfDay(cursor);
        to = addDays(from, 1);
        heading = cursor.toLocaleDateString(locale(), {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "short",
        });
      } else if (view === "week") {
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
      } else {
        from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        heading = cursor.toLocaleDateString(locale(), {
          year: "numeric",
          month: "long",
        });
      }

      const events = eventsForRange(from, to);

      let body = "";
      if (view === "month") {
        const first = new Date(from);
        const startPad = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(
          cursor.getFullYear(),
          cursor.getMonth() + 1,
          0
        ).getDate();
        const cells = [];
        for (let i = 0; i < startPad; i++) cells.push(`<div class="m-cell empty"></div>`);
        for (let d = 1; d <= daysInMonth; d++) {
          const dayDate = new Date(cursor.getFullYear(), cursor.getMonth(), d);
          const dayEvents = events.filter((e) => sameDay(new Date(e.datetime), dayDate));
          cells.push(`<div class="m-cell ${sameDay(dayDate, new Date()) ? "today" : ""}">
            <div class="m-day">${d}</div>
            <div class="m-dots">${dayEvents
              .slice(0, 3)
              .map(
                (e) =>
                  `<button type="button" class="m-pill" data-id="${e.id}">${e.title[lang].slice(0, 10)}</button>`
              )
              .join("")}</div>
          </div>`);
        }
        body = `<div class="month-grid">${cells.join("")}</div>`;
      } else if (view === "week") {
        const days = [];
        for (let i = 0; i < 7; i++) {
          const dayDate = addDays(from, i);
          const dayEvents = events.filter((e) => sameDay(new Date(e.datetime), dayDate));
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
                        `<button type="button" class="w-item" data-id="${e.id}">${new Date(
                          e.datetime
                        ).toLocaleTimeString(locale(), {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} ${e.title[lang]}</button>`
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
            <div class="seg" role="tablist">
              <button type="button" data-view="day" class="${view === "day" ? "active" : ""}">${window.t("day")}</button>
              <button type="button" data-view="week" class="${view === "week" ? "active" : ""}">${window.t("week")}</button>
              <button type="button" data-view="month" class="${view === "month" ? "active" : ""}">${window.t("month")}</button>
            </div>
            <div class="cal-nav">
              <button type="button" class="icon-btn" id="prev">‹</button>
              <strong>${heading}</strong>
              <button type="button" class="icon-btn" id="next">›</button>
              <button type="button" class="btn tiny" id="today">Today</button>
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
        if (view === "day") cursor = addDays(cursor, -1);
        else if (view === "week") cursor = addDays(cursor, -7);
        else cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
        paint();
      });
      root.querySelector("#next").addEventListener("click", () => {
        if (view === "day") cursor = addDays(cursor, 1);
        else if (view === "week") cursor = addDays(cursor, 7);
        else cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        paint();
      });
      root.querySelector("#today").addEventListener("click", () => {
        cursor = new Date();
        paint();
      });

      const byId = Object.fromEntries(events.map((e) => [e.id, e]));
      root.querySelectorAll("[data-id]").forEach((el) => {
        el.addEventListener("click", (ev) => {
          if (ev.target.closest("[data-sub]")) return;
          const e = byId[el.dataset.id];
          if (e) openEvent(e);
        });
      });
      root.querySelectorAll("[data-sub]").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const e = byId[btn.dataset.sub];
          if (e) {
            downloadIcs(e);
            btn.textContent = window.t("subscribed");
          }
        });
      });
    }

    paint();
  }

  return { render };
})();
