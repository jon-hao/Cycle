/**
 * 经济日历：FinanceCalendar + PipAtlas + Forex Factory 周历 + 美股假日 + 四巫日
 * ?flow=calendar&from=YYYY-MM-DD&to=YYYY-MM-DD&country=US|CN&rich=1
 */

import { cacheGet, cacheSet, cacheKey } from "../lib/cache.mjs";
import { fetchJson } from "../lib/http.mjs";

const FC = "https://www.financecalendar.com/wp-json/fc/v1";
const PA = "https://pipatlas.com/api/calendar";
const FF = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

function witchingDates(year) {
  const out = [];
  [2, 5, 8, 11].forEach((month) => {
    let count = 0;
    for (let day = 1; day <= 31; day++) {
      const d = new Date(Date.UTC(year, month, day));
      if (d.getUTCMonth() !== month) break;
      if (d.getUTCDay() === 5) {
        count += 1;
        if (count === 3) {
          out.push(d.toISOString().slice(0, 10));
          break;
        }
      }
    }
  });
  return out;
}

function mapEvent(e, source) {
  const impact = String(e.impact || e.importance || "").toLowerCase();
  const high =
    impact === "high" ||
    impact === "3" ||
    impact.includes("high") ||
    impact === "medium" ||
    impact === "2" ||
    impact.includes("med");
  if (!high && e.impact !== "Holiday" && e.tag !== "witching") return null;

  const currency = e.currency || e.country || "";
  let country = "GLOBAL";
  if (currency === "USD" || /US|United States|America/i.test(e.name || e.title || ""))
    country = "US";
  if (currency === "CNY" || currency === "CNH" || /China|中国/i.test(e.name || e.title || ""))
    country = "CN";
  if (e.impact === "Holiday") {
    country =
      currency === "USD" ? "US" : currency === "CNY" || currency === "CNH" ? "CN" : "GLOBAL";
  }

  const titleRaw = e.title || e.name || "";
  const isHol = e.impact === "Holiday" || e.tag === "holiday";
  const impNum =
    impact.includes("high") || impact === "3"
      ? 3
      : impact.includes("med") || impact === "2"
        ? 2
        : 1;

  return {
    id: e.url || e.id || titleRaw + (e.date || e.time_utc || e.dateUtc || ""),
    country,
    datetime: e.time_utc || e.dateUtc || e.date || e.datetime,
    title: titleRaw,
    holidayName: isHol ? titleRaw : null,
    market: isHol ? country : null,
    forecast: e.forecast || e.consensus || "—",
    actual: e.actual == null || e.actual === "" ? null : e.actual,
    previous: e.previous || e.prior || "—",
    importance: isHol ? 1 : impNum,
    tag: isHol ? "holiday" : e.tag || null,
    currency: currency || null,
    source,
  };
}

function mapFf(e) {
  const impact = String(e.impact || "").toLowerCase();
  if (impact !== "high" && impact !== "medium") return null;
  const currency = e.country || "";
  let country = "GLOBAL";
  if (currency === "USD") country = "US";
  if (currency === "CNY" || currency === "CNH") country = "CN";
  const date = e.date || "";
  const time = e.time && e.time !== "All Day" ? e.time : "00:00";
  // FF dates are often "10-16-2026" or ISO-ish
  let datetime = date;
  if (/^\d{2}-\d{2}-\d{4}/.test(date)) {
    const [mm, dd, yyyy] = date.split("-");
    datetime = `${yyyy}-${mm}-${dd}T${time.length === 5 ? time + ":00" : "12:00:00"}Z`;
  } else if (date) {
    datetime = `${String(date).slice(0, 10)}T${time.length === 5 ? time + ":00" : "12:00:00"}Z`;
  }
  return {
    id: "ff-" + (e.title || "") + datetime,
    country,
    datetime,
    title: e.title || "",
    holidayName: null,
    market: null,
    forecast: e.forecast || "—",
    actual: e.actual == null || e.actual === "" ? null : e.actual,
    previous: e.previous || "—",
    importance: impact === "high" ? 3 : 2,
    tag: null,
    currency: currency || null,
    source: "forexfactory",
  };
}

function dedupeKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 64);
}

function score(e) {
  let s = 0;
  if (e.source === "financecalendar") s += 20;
  if (e.source === "forexfactory") s += 12;
  if (e.source === "pipatlas") s += 5;
  if (e.forecast != null && e.forecast !== "" && e.forecast !== "—") s += 8;
  if (e.actual != null && e.actual !== "" && e.actual !== "—") s += 10;
  if (e.previous != null && e.previous !== "" && e.previous !== "—") s += 3;
  if (e.datetime && String(e.datetime).includes("T")) s += 2;
  if (e.importance === 3) s += 4;
  return s;
}

function dayKey(e) {
  const d = e.datetime ? String(e.datetime).slice(0, 10) : "";
  if (e.tag === "holiday") {
    return (
      d +
      "|hol|" +
      (e.country || "") +
      "|" +
      String(e.holidayName || e.title || "").toLowerCase().slice(0, 48)
    );
  }
  if (e.tag === "witching") return d + "|witching|" + (e.country || "");
  return d + "|" + (e.country || "") + "|" + dedupeKey(e.title) + "|" + (e.tag || "");
}

export async function handleCalendar(payload) {
  const app = String(payload.app || "public").toLowerCase();
  const from = String(payload.from || "").slice(0, 10);
  const to = String(payload.to || "").slice(0, 10);
  const country = String(payload.country || "US").toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { flow: "calendar", events: [], error: "from/to required YYYY-MM-DD" };
  }

  const key = cacheKey(app, "calendar", [from, to, country]);
  const hit = await cacheGet(key);
  if (hit) return hit;

  const year = from.slice(0, 4);
  const [fc, pa, holidays, ff] = await Promise.all([
    fetchJson(`${FC}/calendar?from=${from}&to=${to}&impact=high&limit=200`, {
      timeout: 18000,
    }).catch(() => null),
    fetchJson(PA, { timeout: 18000 }).catch(() => null),
    country === "US" || country === "CN"
      ? fetchJson(`${FC}/holidays?year=${year}`, { timeout: 15000 }).catch(() => null)
      : Promise.resolve(null),
    fetchJson(FF, { timeout: 12000 }).catch(() => null),
  ]);

  // also try medium impact from FC
  const fcMed = await fetchJson(
    `${FC}/calendar?from=${from}&to=${to}&impact=medium&limit=200`,
    { timeout: 18000 }
  ).catch(() => null);

  const out = [];
  const fcEvents = [
    ...(Array.isArray(fc) ? fc : (fc && (fc.events || fc.data)) || []),
    ...(Array.isArray(fcMed) ? fcMed : (fcMed && (fcMed.events || fcMed.data)) || []),
  ];
  fcEvents.forEach((e) => {
    const m = mapEvent(e, "financecalendar");
    if (m) out.push(m);
  });

  ((pa && pa.events) || []).forEach((e) => {
    const m = mapEvent(e, "pipatlas");
    if (!m) return;
    const t = new Date(m.datetime).getTime();
    if (t >= new Date(from).getTime() && t <= new Date(to).getTime() + 86400000) out.push(m);
  });

  if (Array.isArray(ff)) {
    ff.forEach((e) => {
      const m = mapFf(e);
      if (!m || !m.datetime) return;
      const d = String(m.datetime).slice(0, 10);
      if (d < from || d > to) return;
      out.push(m);
    });
  }

  if (holidays && Array.isArray(holidays.holidays || holidays)) {
    (holidays.holidays || holidays).forEach((h, i) => {
      const d = h.date || h.d;
      if (!d || d < from || d > to) return;
      const name = h.name || h.title || "";
      out.push({
        id: "hol-" + d + "-" + i,
        country: "US",
        datetime: d + "T13:00:00",
        title: name || "US Equity Market Holiday",
        holidayName: name,
        market: "US",
        forecast: "—",
        actual: "—",
        previous: "—",
        importance: 1,
        tag: "holiday",
        currency: "USD",
        source: "financecalendar",
      });
    });
  }

  witchingDates(Number(year)).forEach((d) => {
    if (d < from || d > to) return;
    out.push({
      id: "witch-" + d,
      country: "US",
      datetime: d + "T20:00:00Z",
      title: "Quadruple Witching",
      holidayName: null,
      market: "US",
      forecast: "—",
      actual: "—",
      previous: "—",
      importance: 2,
      tag: "witching",
      currency: "USD",
      source: "computed",
    });
  });

  const best = new Map();
  out.forEach((e) => {
    const k = dayKey(e);
    const prev = best.get(k);
    if (!prev || score(e) > score(prev)) best.set(k, e);
  });
  let events = [...best.values()];
  if (country === "US" || country === "CN") {
    events = events.filter(
      (e) => e.country === country || e.tag === "holiday" || e.tag === "witching"
    );
  }
  events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const data = {
    flow: "calendar",
    from,
    to,
    country,
    events,
    witching: witchingDates(Number(year)),
    source: "FinanceCalendar / PipAtlas / ForexFactory / computed",
  };
  await cacheSet(key, data, 180);
  return data;
}
