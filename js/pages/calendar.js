window.CyclePages = window.CyclePages || {};

window.CyclePages.calendar = (function () {
  let view = "day";
  let cursor = startOfDay(new Date());
  let pickerCursor = new Date();
  let cache = null;

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
    return window.CycleTZ ? window.CycleTZ.locale() : "zh-CN";
  }
  function trTitle(title, meta) {
    return window.CycleCalI18n.translateTitle(
      title,
      window.CycleState.lang,
      meta || null
    );
  }
  function mondayOf(d) {
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    return startOfDay(addDays(d, offset));
  }

  function isDataEvent(e) {
    if (!e) return false;
    if (e.tag === "holiday" || e.tag === "witching") return false;
    const t = String(e.title || "");
    if (/holiday|休市|witching|四巫|closed|bank holiday/i.test(t)) return false;
    const hasNum = (v) =>
      v != null && v !== "" && v !== "—" && v !== "-" && !/^n\/?a$/i.test(String(v));
    return hasNum(e.forecast) || hasNum(e.actual) || hasNum(e.previous);
  }

  function formatHeading(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const wd = d.toLocaleDateString(locale(), { weekday: "short" });
    return `${y}.${m}.${day} ${wd}`;
  }

  function icsForEvent(e) {
    const start = new Date(e.datetime);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const stampLocal = window.CycleTZ.icsLocalStamp;
    const stampUtc = window.CycleTZ.icsUtcStamp;
    const title = trTitle(e.title, e);
    const descParts = [];
    if (isDataEvent(e)) {
      descParts.push(
        `${window.t("forecast")}: ${e.forecast}; ${window.t("actual")}: ${
          e.actual ?? "—"
        }; ${window.t("previous")}: ${e.previous}`
      );
    }
    const desc = descParts.join(" ");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cycle//EN",
      "BEGIN:VEVENT",
      "UID:" + String(e.id).slice(0, 64) + "@cycle",
      "DTSTAMP:" + stampUtc(new Date()),
      "DTSTART:" + stampLocal(start),
      "DTEND:" + stampLocal(end),
      "SUMMARY:" + String(title).replace(/\n/g, " "),
      "DESCRIPTION:" + String(desc).replace(/\n/g, "\\n"),
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
    const time = window.CycleTZ.formatDateTime(e.datetime, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const tag =
      e.tag === "holiday"
        ? window.t("holiday")
        : e.tag === "witching"
          ? window.t("witching")
          : window.t("country" + (e.country || "GLOBAL"));
    const title = trTitle(e.title, e);
    const data = isDataEvent(e);
    const kv = data
      ? `<ul class="kv">
        <li><span class="card-label">${window.t("forecast")}</span><strong class="card-value">${escapeHtml(String(e.forecast))}</strong></li>
        <li><span class="card-label">${window.t("actual")}</span><strong class="card-value">${escapeHtml(String(e.actual ?? "—"))}</strong></li>
        <li><span class="card-label">${window.t("previous")}</span><strong class="card-value">${escapeHtml(String(e.previous))}</strong></li>
      </ul>`
      : "";

    window.CycleUI.openModal(`
      <div class="sheet-head"><h2 class="card-title">${escapeHtml(title)}</h2><button type="button" class="icon-btn" data-close>×</button></div>
      <p class="event-line"><span class="card-date">${time}</span> · <span class="card-label">${tag}</span></p>
      ${kv}
      <button type="button" class="btn" id="subEvent">${window.t("subscribe")}</button>
    `);
    document.getElementById("subEvent").addEventListener("click", () => {
      downloadIcs(e);
    });
  }

  function eventRow(e) {
    const time = window.CycleTZ.formatTime(e.datetime);
    const title = trTitle(e.title, e);
    const nums = isDataEvent(e)
      ? `<span class="cal-nums card-content">${window.t("forecast")} ${escapeHtml(
          String(e.forecast)
        )} · ${window.t("actual")} ${escapeHtml(String(e.actual ?? "—"))}</span>`
      : "";
    return `<div class="cal-item" data-id="${encodeURIComponent(e.id)}">
      <div class="cal-item-main">
        <span class="cal-time card-date">${time}</span>
        <span class="cal-title card-title">${escapeHtml(title)}</span>
        ${nums}
      </div>
      <button type="button" class="btn tiny sub-btn" data-sub="${encodeURIComponent(e.id)}">${window.t("subscribe")}</button>
    </div>`;
  }

  function openDatePicker(onDone) {
    pickerCursor = new Date(cursor);
    function paintPicker() {
      const y = pickerCursor.getFullYear();
      const m = pickerCursor.getMonth();
      const first = new Date(y, m, 1);
      const startPad = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const monthLabel = `${y}.${String(m + 1).padStart(2, "0")}`;
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
      const lang = window.CycleState.lang;
      const weekdays =
        lang === "en"
          ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          : lang === "zh-TW"
            ? ["一", "二", "三", "四", "五", "六", "日"]
            : ["一", "二", "三", "四", "五", "六", "日"];
      return `
        <div class="sheet-head"><h2 class="card-title">${window.t("pickDate")}</h2><button type="button" class="icon-btn" data-close>×</button></div>
        <div class="date-picker in-modal">
          <div class="dp-head">
            <button type="button" class="icon-btn" id="dpPrevY">«</button>
            <button type="button" class="icon-btn" id="dpPrevM">‹</button>
            <strong class="card-title">${monthLabel}</strong>
            <button type="button" class="icon-btn" id="dpNextM">›</button>
            <button type="button" class="icon-btn" id="dpNextY">»</button>
          </div>
          <div class="dp-weekdays">${weekdays.map((w) => `<span>${w}</span>`).join("")}</div>
          <div class="dp-grid">${cells.join("")}</div>
          <p class="dp-hint card-content">${view === "week" ? window.t("pickWeekHint") : window.t("pickDayHint")}</p>
        </div>`;
    }

    function bindPicker() {
      const sheet = document.getElementById("sheet");
      sheet.querySelector("#dpPrevM").onclick = () => {
        pickerCursor = new Date(pickerCursor.getFullYear(), pickerCursor.getMonth() - 1, 1);
        sheet.innerHTML = paintPicker();
        sheet.querySelector("[data-close]").onclick = () => window.CycleUI.closeModal();
        bindPicker();
      };
      sheet.querySelector("#dpNextM").onclick = () => {
        pickerCursor = new Date(pickerCursor.getFullYear(), pickerCursor.getMonth() + 1, 1);
        sheet.innerHTML = paintPicker();
        sheet.querySelector("[data-close]").onclick = () => window.CycleUI.closeModal();
        bindPicker();
      };
      sheet.querySelector("#dpPrevY").onclick = () => {
        pickerCursor = new Date(pickerCursor.getFullYear() - 1, pickerCursor.getMonth(), 1);
        sheet.innerHTML = paintPicker();
        sheet.querySelector("[data-close]").onclick = () => window.CycleUI.closeModal();
        bindPicker();
      };
      sheet.querySelector("#dpNextY").onclick = () => {
        pickerCursor = new Date(pickerCursor.getFullYear() + 1, pickerCursor.getMonth(), 1);
        sheet.innerHTML = paintPicker();
        sheet.querySelector("[data-close]").onclick = () => window.CycleUI.closeModal();
        bindPicker();
      };
      sheet.querySelectorAll("[data-pick]").forEach((btn) => {
        btn.onclick = () => {
          const [yy, mm, dd] = btn.dataset.pick.split("-").map(Number);
          cursor = startOfDay(new Date(yy, mm - 1, dd));
          window.CycleUI.closeModal();
          onDone();
        };
      });
    }

    window.CycleUI.openModal(paintPicker());
    bindPicker();
  }

  async function render(root, opts) {
    const soft = opts && opts.soft;

    async function paint(forceFetch) {
      let from;
      let to;
      let heading;

      if (view === "day") {
        from = startOfDay(cursor);
        to = addDays(from, 1);
        heading = formatHeading(cursor);
      } else {
        from = mondayOf(cursor);
        to = addDays(from, 7);
        heading =
          formatHeading(from).slice(0, 10) + " — " + formatHeading(addDays(to, -1)).slice(0, 10);
      }

      const cacheKey =
        view +
        "|" +
        from.toISOString().slice(0, 10) +
        "|" +
        window.CycleState.country +
        "|" +
        window.CycleState.lang;

      root.innerHTML = `
        <section class="panel">
          <div class="panel-head cal-toolbar">
            <div class="seg seg-compact">
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
          <div id="calBody"><div class="skel-block skel-list"></div></div>
        </section>
      `;

      let events;
      if (
        !forceFetch &&
        soft &&
        cache &&
        cache.key === cacheKey &&
        Array.isArray(cache.events)
      ) {
        events = cache.events;
      } else {
        events =
          (await window.CycleAPI.fetchCalendar(
            from.toISOString(),
            to.toISOString(),
            window.CycleState.country
          )) || [];

        if (window.CycleState.country === "US") {
          window.CycleAPI.witchingDates(cursor.getFullYear()).forEach((d) => {
            const dt = new Date(d + "T13:00:00");
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
        cache = { key: cacheKey, events };
      }

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
            <div class="w-head card-date">${dayDate.getMonth() + 1}.${dayDate.getDate()} ${dayDate.toLocaleDateString(locale(), { weekday: "short" })}</div>
            ${
              dayEvents.length
                ? dayEvents
                    .map(
                      (e) =>
                        `<button type="button" class="w-item" data-id="${encodeURIComponent(
                          e.id
                        )}"><span class="card-date">${window.CycleTZ.formatTime(
                          e.datetime
                        )}</span> <span class="card-title">${escapeHtml(
                          trTitle(e.title, e)
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

      const calBody = root.querySelector("#calBody");
      if (calBody) calBody.innerHTML = body;

      root.querySelectorAll("[data-view]").forEach((b) => {
        b.addEventListener("click", () => {
          view = b.dataset.view;
          paint(true);
        });
      });
      root.querySelector("#prev").addEventListener("click", () => {
        cursor = view === "day" ? addDays(cursor, -1) : addDays(cursor, -7);
        paint(true);
      });
      root.querySelector("#next").addEventListener("click", () => {
        cursor = view === "day" ? addDays(cursor, 1) : addDays(cursor, 7);
        paint(true);
      });
      root.querySelector("#todayBtn").addEventListener("click", () => {
        cursor = startOfDay(new Date());
        paint(true);
      });
      root.querySelector("#openPicker").addEventListener("click", () => {
        openDatePicker(() => paint(true));
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
          if (e) downloadIcs(e);
        });
      });
    }

    await paint(!(soft && cache));
  }

  return { render };
})();
