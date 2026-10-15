/**
 * 实时数据层。
 * 优先 JSONP（无 CORS）；否则 fetch。失败一律 null / 缺失，禁止静态假数据。
 */
window.CycleAPI = (function () {
  const MR = "https://www.macroradar.io/api/v1";
  const FG = "https://fearandgreedgraph.com/api/fear-greed";
  const FC = "https://www.financecalendar.com/wp-json/fc/v1";
  const PA = "https://pipatlas.com/api/calendar";
  const WB = "https://api.worldbank.org/v2";
  // 金十 RSS 直连 CORS 非法；经 rss2json JSONP 转发
  const JIN10_RSS = "https://rsshub.rssforever.com/jin10/important";
  const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";

  let jsonpSeq = 0;

  /** JSONP：用 script 标签绕过 CORS（需服务端支持 callback/prefix） */
  function getJSONP(url, opts) {
    const param = (opts && opts.param) || "callback";
    const timeout = (opts && opts.timeout) || 12000;
    return new Promise((resolve) => {
      const name = "cycleJsonp_" + ++jsonpSeq + "_" + Date.now();
      let settled = false;
      const script = document.createElement("script");
      const finish = (data) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          delete window[name];
        } catch (_) {
          window[name] = undefined;
        }
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(data);
      };
      window[name] = (data) => finish(data);
      const sep = url.indexOf("?") >= 0 ? "&" : "?";
      script.src = url + sep + param + "=" + encodeURIComponent(name);
      script.onerror = () => finish(null);
      const timer = setTimeout(() => finish(null), timeout);
      document.head.appendChild(script);
    });
  }

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

  /** World Bank 年通胀：官方 JSONP（format=jsonP&prefix=…），不依赖 CORS */
  async function wbInflation(code) {
    const url =
      `${WB}/country/${encodeURIComponent(code)}/indicator/FP.CPI.TOTL.ZG` +
      `?format=jsonp&per_page=60`;
    const d = await getJSONP(url, { param: "prefix", timeout: 15000 });
    if (!Array.isArray(d) || !Array.isArray(d[1])) return null;
    const pts = d[1]
      .filter((r) => r && r.value != null && !Number.isNaN(Number(r.value)))
      .map((r) => ({ d: String(r.date), v: Number(r.value) }))
      .sort((a, b) => Number(a.d) - Number(b.d));
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

  /** 中国：World Bank 年通胀；利率/月度 PPI 无稳定 CORS 则缺失 */
  async function fetchCN() {
    const inflation = await wbInflation("CHN");
    return {
      country: "CN",
      rateHistory: null,
      policyRate: null,
      cpiHistory: inflation,
      cpiYoY: last(inflation),
      ppiHistory: null,
      ppiYoY: null,
      inflationHistory: inflation,
      inflation: last(inflation),
      nextMeeting: null,
      dotPlot: null,
      source: "World Bank FP.CPI.TOTL.ZG",
      notes: {
        zh: "中国月度 LPR/PPI 暂无稳定浏览器端公开接口，显示缺失；通胀取世界银行年度 CPI。",
        en: "No stable browser CORS feed for China monthly LPR/PPI; those show missing. Inflation from World Bank annual CPI.",
      },
    };
  }

  /** 全球：美+中通胀平均 + 美国利率参考 */
  async function fetchGlobal() {
    const [us, cnInfl, usInfl] = await Promise.all([
      fetchUS(),
      wbInflation("CHN"),
      wbInflation("USA"),
    ]);
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
      source: "MacroRadar + World Bank",
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
    // 四段：极度恐慌 / 恐慌 / 贪婪 / 极度贪婪
    let labelKey = "fgFear";
    if (value < 25) labelKey = "fgExtremeFear";
    else if (value < 50) labelKey = "fgFear";
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

  function guessCountry(text) {
    const t = text || "";
    if (/中国|人民银行|LPR|人民币|北京|上海|沪深|央行/.test(t)) return "CN";
    if (/美国|美联储|FOMC|非农|纳斯达克|标普|华尔街|美元/.test(t)) return "US";
    if (
      /U\.?S\.|Fed|Federal Reserve|Wall Street|NFP/i.test(t) &&
      !/中国/.test(t)
    )
      return "US";
    return "GLOBAL";
  }

  function stripHtml(s) {
    return String(s || "").replace(/<[^>]+>/g, "").trim();
  }

  function newsFeedFor(country) {
    if (country === "CN") {
      return (
        "https://news.google.com/rss/search?q=" +
        encodeURIComponent("中国 OR 央行 OR LPR OR 人民币 when:2d") +
        "&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"
      );
    }
    if (country === "US") {
      return (
        "https://news.google.com/rss/search?q=" +
        encodeURIComponent("Federal Reserve OR FOMC OR US economy when:2d") +
        "&hl=en-US&gl=US&ceid=US:en"
      );
    }
    return JIN10_RSS;
  }

  async function fetchRssViaJson(feedUrl) {
    const url = RSS2JSON + encodeURIComponent(feedUrl);
    // 先 CORS fetch，失败再用 JSONP callback
    let d = await getJSON(url);
    if (!d) d = await getJSONP(url, { param: "callback" });
    if (!d || d.status !== "ok" || !Array.isArray(d.items)) return [];
    return d.items.map((it, i) => {
      const title = it.title || "";
      const summary = stripHtml(it.description || it.content || "");
      const time = it.pubDate
        ? new Date(it.pubDate).toISOString()
        : new Date().toISOString();
      return {
        id: it.guid || it.link || title + i,
        title,
        summary,
        time,
        important: true,
        countryGuess: guessCountry(title + " " + summary),
      };
    });
  }

  async function fetchImportantNews(country) {
    // 优先：金十重要快讯（经 rss2json）；失败再按国家用 Google News RSS
    let items = await fetchRssViaJson(JIN10_RSS);
    if (!items.length) {
      items = await fetchRssViaJson(newsFeedFor(country || "GLOBAL"));
    }
    if (!items.length) return null;
    if (country && country !== "GLOBAL") {
      const filtered = items.filter(
        (n) => n.countryGuess === country || n.countryGuess === "GLOBAL"
      );
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

    // 去重：同日+同国家+同指标口径，优先 FinanceCalendar，且偏好字段更全的一条
    function score(e) {
      let s = 0;
      if (e.source === "financecalendar") s += 20;
      if (e.source === "pipatlas") s += 5;
      if (e.forecast != null && e.forecast !== "" && e.forecast !== "—") s += 8;
      if (e.actual != null && e.actual !== "" && e.actual !== "—") s += 10;
      if (e.previous != null && e.previous !== "" && e.previous !== "—") s += 3;
      if (e.datetime && String(e.datetime).includes("T")) s += 2;
      return s;
    }
    function dayKey(e) {
      const d = e.datetime ? String(e.datetime).slice(0, 10) : "";
      const kind =
        (window.CycleCalI18n && window.CycleCalI18n.dedupeKey(e.title)) ||
        String(e.title || "").toLowerCase();
      return d + "|" + (e.country || "") + "|" + kind + "|" + (e.tag || "");
    }
    const best = new Map();
    out.forEach((e) => {
      const key = dayKey(e);
      const prev = best.get(key);
      if (!prev || score(e) > score(prev)) best.set(key, e);
    });
    const uniq = [...best.values()];

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
