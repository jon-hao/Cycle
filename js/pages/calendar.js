window.CyclePages = window.CyclePages || {};

window.CyclePages.calendar = (function () {
  let view = "day";
  let cursor = startOfDay(new Date());
  let pickerOpen = false;
  let pickerCursor = new Date();

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
  function trTitle(title) {
    return window.CycleCalI18n.translateTitle(title, window.CycleState.lang);
  }
  function mondayOf(d) {
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    return startOfDay(addDays(d, offset));
  }

  function icsForEvent(e) {
    const start = new Date(e.datetime);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const stamp = (d) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const title = trTitle(e.title);
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
      "SUMMARY:" + String(title).replace(/\n/g, " "),
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

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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
    const title = trTitle(e.title);

    window.CycleUI.openModal(`
      <div class="sheet-head"><h2 class="card-title">${escapeHtml(title)}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      <p class="event-line"><span class="card-date">${time}</span> · <span class="card-label">${tag}</span></p>
      <ul class="kv">
        <li><span class="card-label">${window.t("forecast")}</span><strong class="card-value">${escapeHtml(String(e.forecast))}</strong></li>
        <li><span class="card-label">${window.t("actual")}</span><strong class="card-value">${escapeHtml(String(e.actual ?? "—"))}</strong></li>
        <li><span class="card-label">${window.t("previous")}</span><strong class="card-value">${escapeHtml(String(e.previous))}</strong></li>
      </ul>
      <button type="button" class="btn" id="subEvent">${window.t("subscribe")}</button>
      <div class="ai-host" id="aiEventHost"></div>
    `);
    document.getElementById("subEvent").addEventListener("click", () => {
      downloadIcs(e);
      document.getElementById("subEvent").textContent = window.t("subscribed");
    });
    window.CycleAIUI.mount(document.getElementById("aiEventHost"), "event", {
      title,
      forecast: e.forecast,
      actual: e.actual,
      previous: e.previous,
    });
  }

  function eventRow(e) {
    const time = new Date(e.datetime).toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit",
    });
    const title = trTitle(e.title);
    return `<div class="cal-item" data-id="${encodeURIComponent(e.id)}">
      <div class="cal-item-main">
        <span class="cal-time card-date">${time}</span>
        <span class="cal-title card-title">${escapeHtml(title)}</span>
        <span class="cal-nums card-content">${window.t("forecast")} ${escapeHtml(String(e.forecast))} · ${window.t("actual")} ${escapeHtml(String(e.actual ?? "—"))}</span>
      </div>
      <button type="button" class="btn tiny sub-btn" data-sub="${encodeURIComponent(e.id)}">${window.t("subscribe")}</button>
    </div>`;
  }

  function pickerHtml() {
    const y = pickerCursor.getFullYear();
    const m = pickerCursor.getMonth();
    const first = new Date(y, m, 1);
    const startPad = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const monthLabel = pickerCursor.toLocaleDateString(locale(), {
      year: "numeric",
      month: "long",
    });

    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(`<div class="dp-cell empty"></div>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const isToday = sameDay(date, new Date());
      const isSelected =
        view === "day"
          ? sameDay(date, cursor)
          : date >= mondayOf(cursor) && date < addDays(mondayOf(cursor), 7);
      cells.push(
        `<button type="button" class="dp-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}" data-pick="${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}">${d}</button>`
      );
    }

    const weekHint =
      view === "week"
        ? `<p class="dp-hint card-content">${window.t("pickWeekHint")}</p>`
        : `<p class="dp-hint card-content">${window.t("pickDayHint")}</p>`;

    return `
      <div class="date-picker" id="datePicker">
        <div class="dp-head">
          <button type="button" class="icon-btn" id="dpPrevY" title="year">«</button>
          <button type="button" class="icon-btn" id="dpPrevM">‹</button>
          <strong class="card-title">${monthLabel}</strong>
          <button type="button" class="icon-btn" id="dpNextM">›</button>
          <button type="button" class="icon-btn" id="dpNextY">»</button>
        </div>
        <div class="dp-weekdays">
          ${["一", "二", "三", "四", "五", "六", "日"]
            .map((w, i) => {
              const en = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i];
              return `<span>${window.CycleState.lang === "zh" ? w : en}</span>`;
            })
            .join("")}
        </div>
        <div class="dp-grid">${cells.join("")}</div>
        ${weekHint}
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
        from = mondayOf(cursor);
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

      if (window.CycleState.country === "US") {
        const year = cursor.getFullYear();
        window.CycleAPI.witchingDates(year).forEach((d) => {
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
              source: "local",
            });
          }
        });
      }

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
            <div class="w-head card-date">${dayDate.toLocaleDateString(locale(), {
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
                        )}"><span class="card-date">${new Date(
                          e.datetime
                        ).toLocaleTimeString(locale(), {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}</span> <span class="card-title">${escapeHtml(
                          trTitle(e.title)
                        )}</span></button>`
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
              <button type="button" class="cal-heading card-title" id="openPicker">${heading}</button>
              <button type="button" class="icon-btn" id="next">›</button>
              <button type="button" class="btn tiny today-btn" id="todayBtn">${window.t("today")}</button>
            </div>
          </div>
          ${pickerOpen ? pickerHtml() : ""}
          ${body}
        </section>
      `;

      root.querySelectorAll("[data-view]").forEach((b) => {
        b.addEventListener("click", () => {
          view = b.dataset.view;
          pickerOpen = false;
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
      root.querySelector("#todayBtn").addEventListener("click", () => {
        cursor = startOfDay(new Date());
        pickerOpen = false;
        paint();
      });
      root.querySelector("#openPicker").addEventListener("click", () => {
        pickerOpen = !pickerOpen;
        pickerCursor = new Date(cursor);
        paint();
      });

      if (pickerOpen) {
        root.querySelector("#dpPrevM").addEventListener("click", () => {
          pickerCursor = new Date(
            pickerCursor.getFullYear(),
            pickerCursor.getMonth() - 1,
            1
          );
          paint();
        });
        root.querySelector("#dpNextM").addEventListener("click", () => {
          pickerCursor = new Date(
            pickerCursor.getFullYear(),
            pickerCursor.getMonth() + 1,
            1
          );
          paint();
        });
        root.querySelector("#dpPrevY").addEventListener("click", () => {
          pickerCursor = new Date(
            pickerCursor.getFullYear() - 1,
            pickerCursor.getMonth(),
            1
          );
          paint();
        });
        root.querySelector("#dpNextY").addEventListener("click", () => {
          pickerCursor = new Date(
            pickerCursor.getFullYear() + 1,
            pickerCursor.getMonth(),
            1
          );
          paint();
        });
        root.querySelectorAll("[data-pick]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const [yy, mm, dd] = btn.dataset.pick.split("-").map(Number);
            cursor = startOfDay(new Date(yy, mm - 1, dd));
            pickerOpen = false;
            paint();
          });
        });
      }

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
