/**
 * Agent 用的轻量看板快照：不挡页面渲染，不参与 soft 复用。
 * 页面数据一律走各自 API 实时拉取。
 */
window.CycleBoard = (function () {
  let mem = null;
  let inflight = null;

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

  async function refresh() {
    if (inflight) return inflight;
    const api = window.CycleAPI;
    if (!api) return null;
    const { from, to } = rangeForCalendar();
    // 新闻不在预热里打，避免与新闻页首屏抢同一请求
    inflight = Promise.all([
      api.fetchMacro("US").catch(() => null),
      api.fetchMacro("CN").catch(() => null),
      api.fetchFearGreed("US").catch(() => null),
      api.fetchCalendar(from, to, "US").catch(() => null),
      api.fetchCalendar(from, to, "CN").catch(() => null),
    ])
      .then(async ([macroUS, macroCN, fgUS, calUS, calCN]) => {
        let newsUS = null;
        let newsCN = null;
        try {
          newsUS = await api.fetchImportantNews("US");
          newsCN = await api.fetchImportantNews("CN");
        } catch (_) {}
        mem = {
          at: Date.now(),
          country: (window.CycleState && window.CycleState.country) || "US",
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
        };
        return mem;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  /** 不阻塞；页面勿 await */
  function warmInBackground() {
    refresh().catch(() => null);
  }

  function get() {
    return mem;
  }

  function agentContext(lang) {
    const b = mem;
    if (!b) {
      warmInBackground();
      return lang === "en"
        ? "Board snapshot still loading; answer from the live question and web search."
        : "看板快照仍在后台拉取；请结合用户问题与联网检索作答。";
    }
    const zh = lang !== "en";
    return [
      zh
        ? `快照时间=${new Date(b.at || Date.now()).toISOString()}；国家=${b.country}`
        : `snapshotAt=${new Date(b.at || Date.now()).toISOString()}; country=${b.country}`,
      "US macro: " + JSON.stringify(b.macroUS || {}),
      "CN macro: " + JSON.stringify(b.macroCN || {}),
      "US fearGreed: " + JSON.stringify(b.fearGreedUS || null),
      "US news: " + JSON.stringify(b.newsUS || []),
      "CN news: " + JSON.stringify(b.newsCN || []),
      `calendar ${b.calRange && b.calRange.from}-${b.calRange && b.calRange.to} US: ` +
        JSON.stringify(b.calendarUS || []),
      "calendar CN: " + JSON.stringify(b.calendarCN || []),
    ].join("\n");
  }

  return {
    warmInBackground,
    refresh,
    get,
    agentContext,
    // 兼容旧调用名，但绝不挡首屏
    preload: warmInBackground,
    rawFor: () => null,
  };
})();
