/**
 * 全量看板缓存：刷新时预拉数据/新闻/日历，供 Agent 总体分析。
 */
window.CycleBoard = (function () {
  const KEY = "cycle-board-v1";
  let mem = null;

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      return raw && typeof raw === "object" ? raw : null;
    } catch (_) {
      return null;
    }
  }

  function saveLocal(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function rangeForCalendar() {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 3);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setDate(to.getDate() + 14);
    to.setHours(23, 59, 59, 999);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }

  function snapshotMacro(m) {
    if (!m) return null;
    return {
      country: m.country,
      policyRate: m.policyRate,
      inflation: m.inflation,
      cpiYoY: m.cpiYoY,
      coreCpiYoY: m.coreCpiYoY,
      ppiYoY: m.ppiYoY,
      unrate: m.unrate,
      payrollsYoY: m.payrollsYoY,
      indproYoY: m.indproYoY,
      retailYoY: m.retailYoY,
      gdpYoY: m.gdpYoY,
      yieldCurve: m.yieldCurve,
      m2YoY: m.m2YoY,
      creditYoY: m.creditYoY,
      housingYoY: m.housingYoY,
      claims: m.claims,
      pmi: m.pmi,
      nextMeeting: m.nextMeeting || null,
      source: m.source || null,
    };
  }

  function snapshotNews(list) {
    return (list || []).slice(0, 12).map((n, i) => ({
      rank: i + 1,
      title: n.title,
      time: n.time,
      countryGuess: n.countryGuess,
    }));
  }

  function snapshotCal(events) {
    return (events || []).slice(0, 40).map((e) => ({
      title: e.title,
      datetime: e.datetime,
      country: e.country,
      importance: e.importance,
      forecast: e.forecast,
      actual: e.actual,
      previous: e.previous,
      tag: e.tag,
    }));
  }

  async function preload() {
    const country = (window.CycleState && window.CycleState.country) || "US";
    const lang = (window.CycleState && window.CycleState.lang) || "zh";
    const { from, to } = rangeForCalendar();
    const api = window.CycleAPI;
    if (!api) return get();

    const [macroUS, macroCN, fgUS, newsUS, newsCN, calUS, calCN] =
      await Promise.all([
        api.fetchMacro("US").catch(() => null),
        api.fetchMacro("CN").catch(() => null),
        api.fetchFearGreed("US").catch(() => null),
        api.fetchImportantNews("US").catch(() => null),
        api.fetchImportantNews("CN").catch(() => null),
        api.fetchCalendar(from, to, "US").catch(() => null),
        api.fetchCalendar(from, to, "CN").catch(() => null),
      ]);

    mem = {
      at: Date.now(),
      lang,
      country,
      calRange: { from, to },
      macroUS: snapshotMacro(macroUS),
      macroCN: snapshotMacro(macroCN),
      fearGreedUS:
        fgUS && fgUS.value != null
          ? { value: fgUS.value, labelKey: fgUS.labelKey, asOf: fgUS.asOf }
          : null,
      newsUS: snapshotNews(newsUS),
      newsCN: snapshotNews(newsCN),
      calendarUS: snapshotCal(calUS),
      calendarCN: snapshotCal(calCN),
      // 原始对象供页面 soft 复用（不写 localStorage）
      _raw: {
        macroUS,
        macroCN,
        fgUS,
        newsUS,
        newsCN,
        calUS,
        calCN,
      },
    };
    const persist = Object.assign({}, mem);
    delete persist._raw;
    saveLocal(persist);
    return mem;
  }

  function get() {
    if (mem) return mem;
    mem = loadLocal();
    return mem;
  }

  function rawFor(country) {
    const b = get();
    if (!b || !b._raw) return null;
    const code = country === "CN" ? "CN" : "US";
    return {
      macro: code === "CN" ? b._raw.macroCN : b._raw.macroUS,
      fg: code === "CN" ? null : b._raw.fgUS,
      news: code === "CN" ? b._raw.newsCN : b._raw.newsUS,
      calendar: code === "CN" ? b._raw.calendarCN : b._raw.calendarUS,
    };
  }

  function agentContext(lang) {
    const b = get();
    if (!b) return lang === "en" ? "No board cache yet." : "看板缓存尚未就绪。";
    const zh = lang !== "en";
    const lines = [
      zh
        ? `缓存时间=${new Date(b.at || Date.now()).toISOString()}；当前国家=${b.country}`
        : `cachedAt=${new Date(b.at || Date.now()).toISOString()}; country=${b.country}`,
      "US macro: " + JSON.stringify(b.macroUS || {}),
      "CN macro: " + JSON.stringify(b.macroCN || {}),
      "US fearGreed: " + JSON.stringify(b.fearGreedUS || null),
      "US news: " + JSON.stringify(b.newsUS || []),
      "CN news: " + JSON.stringify(b.newsCN || []),
      `calendar ${b.calRange && b.calRange.from}-${b.calRange && b.calRange.to} US: ` +
        JSON.stringify(b.calendarUS || []),
      `calendar CN: ` + JSON.stringify(b.calendarCN || []),
    ];
    return lines.join("\n");
  }

  return { preload, get, rawFor, agentContext };
})();
