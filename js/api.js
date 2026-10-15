/**
 * 实时数据层（浏览器直连公开 CORS API）。
 * 失败统一返回 null / missing，禁止回退静态假数据。
 */
window.CycleAPI = (function () {
  const MR = "https://www.macroradar.io/api/v1";
  const FG = "https://fearandgreedgraph.com/api/fear-greed";
  const FC = "https://www.financecalendar.com/wp-json/fc/v1";
  const PA = "https://pipatlas.com/api/calendar";
  const IMF = "https://www.imf.org/external/datamapper/api/v1";
  const JIN10_RSS = "https://rsshub.rssforever.com/jin10/important";

  async function getJSON(url, opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 12000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: (opts && opts.headers) || {},
      });
      clearTimeout(t);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      return null;
    }
  }

  async function getText(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (_) {
      clearTimeout(t);
      return null;
    }
  }

  function toPoints(obs) {
    if (!Array.isArray(obs)) return null;
    const pts = obs
      .filter((o) => o && o.value != null && o.value !== "." && !Number.isNaN(Number(o.value)))
      .map((o) => ({ d: String(o.date).slice(0, 7), v: Number(o.value) }));
    return pts.length ? pts : null;
  }

  async function macroRadarSeries(id, limit) {
    const d = await getJSON(
      `${MR}/series/${encodeURIComponent(id)}?limit=${limit || 48}`
    );
    if (!d || !d.data) return null;
    return toPoints(d.data.observations);
  }

  async function macroRadarCompute(expr, limit) {
    const d = await getJSON(`${MR}/compute?expr=${encodeURIComponent(expr)}`);
    if (!d || !d.data) return null;
    const obs = d.data.observations || d.data;
    const pts = toPoints(obs);
    if (!pts) return null;
    return pts.slice(-(limit || 48));
  }

  async function imfInflation(code) {
    const d = await getJSON(`${IMF}/PCPIPCH/${code}`);
    const series =
      d && d.values && d.values.PCPIPCH && d.values.PCPIPCH[code];
    if (!series) return null;
    const years = Object.keys(series)
      .map(Number)
      .filter((y) => y <= new Date().getFullYear() + 1)
      .sort((a, b) => a - b);
    const pts = years
      .filter((y) => series[String(y)] != null)
      .map((y) => ({ d: String(y), v: Number(series[String(y)]) }));
    return pts.length ? pts : null;
  }

  function last(pts) {
    return pts && pts.length ? pts[pts.length - 1].v : null;
  }

  /** 美国宏观 */
  async function fetchUS() {
    const [rate, cpi, ppi, nextFomc] = await Promise.all([
      macroRadarSeries("FEDFUNDS", 60),
      macroRadarCompute("CPIAUCSL.yoy", 60),
      macroRadarCompute("PPIACO.yoy", 60),
      getJSON(`${FC}/next?series=fomc`),
    ]);
    const inflation = cpi; // 用 CPI 同比代表通胀
    return {
      country: "US",
      rateHistory: rate,
      policyRate: last(rate),
      cpiHistory: cpi,
      cpiYoY: last(cpi),
      ppiHistory: ppi,
      ppiYoY: last(ppi),
      inflationHistory: inflation,
      inflation: last(inflation),
      nextMeeting:
        nextFomc && nextFomc.next
          ? {
              date: nextFomc.next.date || (nextFomc.next.time_utc || "").slice(0, 10),
              title: {
                zh: "美联储议息会议（FOMC）",
                en: "FOMC Rate Decision",
              },
            }
          : null,
      dotPlot: null, // 无稳定公开 CORS 点阵图源
      source: "MacroRadar / FinanceCalendar",
    };
  }

  /** 中国：IMF 通胀；利率/CPI月/PPI 若无公开 CORS 源则缺失 */
  async function fetchCN() {
    const inflation = await imfInflation("CHN");
    // 尝试 World Bank 年通胀作为校验
    return {
      country: "CN",
      rateHistory: null,
      policyRate: null,
      cpiHistory: inflation, // 年频示意为可得通胀路径；标注来源
      cpiYoY: last(inflation),
      ppiHistory: null,
      ppiYoY: null,
      inflationHistory: inflation,
      inflation: last(inflation),
      nextMeeting: null,
      dotPlot: null,
      source: "IMF DataMapper PCPIPCH",
      notes: {
        zh: "中国月度 LPR/CPI/PPI 暂无稳定浏览器端公开接口，利率与 PPI 显示缺失；通胀取 IMF 年度预测/历史。",
        en: "No stable browser CORS feed for China monthly LPR/CPI/PPI; rate & PPI show missing. Inflation from IMF annual series.",
      },
    };
  }

  /** 全球：美+中通胀平均示意 + 美国利率参考；缺失则诚实标注 */
  async function fetchGlobal() {
    const [us, cnInfl] = await Promise.all([fetchUS(), imfInflation("CHN")]);
    const usInfl = await imfInflation("USA");
    let inflationHistory = null;
    let inflation = null;
    if (usInfl && cnInfl) {
      const map = {};
      usInfl.forEach((p) => {
        map[p.d] = { us: p.v };
      });
      cnInfl.forEach((p) => {
        map[p.d] = Object.assign(map[p.d] || {}, { cn: p.v });
      });
      inflationHistory = Object.keys(map)
        .sort()
        .filter((y) => map[y].us != null && map[y].cn != null)
        .map((y) => ({ d: y, v: (map[y].us + map[y].cn) / 2 }));
      inflation = last(inflationHistory);
    }
    return {
      country: "GLOBAL",
      rateHistory: us.rateHistory,
      policyRate: us.policyRate,
      cpiHistory: us.cpiHistory,
      cpiYoY: us.cpiYoY,
      ppiHistory: us.ppiHistory,
      ppiYoY: us.ppiYoY,
      inflationHistory,
      inflation,
      nextMeeting: us.nextMeeting,
      dotPlot: null,
      source: "MacroRadar + IMF",
    };
  }

  async function fetchMacro(country) {
    if (country === "CN") return fetchCN();
    if (country === "GLOBAL") return fetchGlobal();
    return fetchUS();
  }

  async function fetchFearGreed() {
    const d = await getJSON(FG);
    if (!d || !Array.isArray(d.values) || !d.values.length) return null;
    const dates = d.dates || [];
    const values = d.values;
    const history = dates.map((day, i) => ({
      d: String(day).slice(0, 10),
      v: Number(values[i]),
    }));
    const value = Number(values[values.length - 1]);
    let labelKey = "fgNeutral";
    if (value < 25) labelKey = "fgExtremeFear";
    else if (value < 45) labelKey = "fgFear";
    else if (value < 55) labelKey = "fgNeutral";
    else if (value < 75) labelKey = "fgGreed";
    else labelKey = "fgExtremeGreed";
    return {
      value,
      labelKey,
      label: window.t(labelKey),
      history,
      asOf: d.asOf || null,
    };
  }

  function parseRssItems(xml) {
    if (!xml) return [];
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    return [...doc.querySelectorAll("item")].map((item, i) => {
      const title = (item.querySelector("title") || {}).textContent || "";
      const description =
        (item.querySelector("description") || {}).textContent || "";
      const pubDate = (item.querySelector("pubDate") || {}).textContent || "";
      const guid = (item.querySelector("guid") || {}).textContent || String(i);
      return {
        id: guid,
        title,
        summary: description.replace(/<[^>]+>/g, ""),
        time: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        important: true,
        countryGuess: guessCountry(title + description),
      };
    });
  }

  function guessCountry(text) {
    const t = text || "";
    if (/中国|人民银行|LPR|人民币|北京|上海|沪深/.test(t)) return "CN";
    if (/美国|美联储|FOMC|非农|纳斯达克|标普|华尔街|美元/.test(t)) return "US";
    if (/U\.?S\.|Fed|Federal Reserve|Wall Street|CPI|NFP/i.test(t) && !/中国/.test(t))
      return "US";
    return "GLOBAL";
  }

  async function fetchImportantNews(country) {
    const xml = await getText(JIN10_RSS);
    let items = parseRssItems(xml);
    if (!items.length) return null;
    if (country && country !== "GLOBAL") {
      const filtered = items.filter(
        (n) => n.countryGuess === country || n.countryGuess === "GLOBAL"
      );
      // 若过滤后太少，仍返回全部重要（金十 important 源本身已筛选）
      items = filtered.length ? filtered : items;
    }
    return items.slice(0, 40);
  }

  function mapCalendarEvent(e, source) {
    const impact = String(e.impact || e.importance || "").toLowerCase();
    const high =
      impact === "high" ||
      impact === "3" ||
      impact.includes("high");
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
    return {
      id: e.url || e.id || titleRaw + (e.date || e.time_utc || ""),
      country,
      datetime: e.time_utc || e.date || e.datetime,
      title: titleRaw,
      forecast: e.forecast || e.consensus || "—",
      actual: e.actual == null || e.actual === "" ? null : e.actual,
      previous: e.previous || e.prior || "—",
      importance: high ? 3 : 1,
      tag: e.impact === "Holiday" ? "holiday" : e.tag || null,
      source,
    };
  }

  async function fetchCalendar(fromISO, toISO, country) {
    const from = fromISO.slice(0, 10);
    const to = toISO.slice(0, 10);
    const [fc, pa, holidays] = await Promise.all([
      getJSON(`${FC}/calendar?from=${from}&to=${to}&impact=high&limit=200`),
      getJSON(PA),
      country === "US"
        ? getJSON(`${FC}/holidays?year=${from.slice(0, 4)}`)
        : Promise.resolve(null),
    ]);

    const out = [];
    const fcEvents = Array.isArray(fc)
      ? fc
      : (fc && (fc.events || fc.data)) || [];
    fcEvents.forEach((e) => {
      const m = mapCalendarEvent(e, "financecalendar");
      if (m) out.push(m);
    });

    const paEvents = (pa && pa.events) || [];
    paEvents.forEach((e) => {
      const m = mapCalendarEvent(e, "pipatlas");
      if (!m) return;
      const t = new Date(m.datetime).getTime();
      if (t >= new Date(from).getTime() && t <= new Date(to).getTime() + 86400000)
        out.push(m);
    });

    if (holidays && Array.isArray(holidays.holidays || holidays)) {
      (holidays.holidays || holidays).forEach((h, i) => {
        const d = h.date || h.d;
        if (!d) return;
        if (d < from || d > to) return;
        out.push({
          id: "hol-" + d + "-" + i,
          country: "US",
          datetime: d + "T00:00:00Z",
          title: h.name || h.title || "Market Holiday",
          forecast: "—",
          actual: "—",
          previous: "—",
          importance: 1,
          tag: "holiday",
          source: "financecalendar",
        });
      });
    }

    // 去重
    const seen = new Set();
    const uniq = [];
    out.forEach((e) => {
      const key = (e.datetime || "") + "|" + e.title;
      if (seen.has(key)) return;
      seen.add(key);
      uniq.push(e);
    });

    let filtered = uniq;
    if (country && country !== "GLOBAL") {
      filtered = uniq.filter(
        (e) => e.country === country || e.tag === "holiday" || e.tag === "witching"
      );
    }

    filtered.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    return filtered.length ? filtered : null;
  }

  /** 四巫日：3/6/9/12 月第三个周五 */
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

  return {
    fetchMacro,
    fetchFearGreed,
    fetchImportantNews,
    fetchCalendar,
    witchingDates,
  };
})();
