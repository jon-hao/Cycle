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
  const CD = "https://chinadata.live/api/v2";
  const EM = "https://datacenter-web.eastmoney.com/api/data/v1/get";
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

  /** chinadata.live：无鉴权 + CORS *，中国官方统计镜像 */
  async function chinaDataSeries(slug, opts) {
    const o = opts || {};
    const d = await getJSON(`${CD}/data/${encodeURIComponent(slug)}`, {
      timeout: 18000,
    });
    if (!d || !d.success || !d.data || !Array.isArray(d.data.data)) return null;
    let pts = d.data.data
      .map((r) => {
        if (!r || r.value == null || r.value === "") return null;
        const v = Number(r.value);
        if (Number.isNaN(v)) return null;
        return { d: String(r.date), v };
      })
      .filter(Boolean);
    if (!pts.length) return null;
    if (o.indexToYoY) {
      pts = pts.map((p) => ({ d: p.d, v: p.v - 100 }));
    }
    pts.sort((a, b) => String(a.d).localeCompare(String(b.d)));
    if (o.limit) pts = pts.slice(-o.limit);
    return pts.length ? pts : null;
  }

  /** 累计同比：同月上年水平 → YoY%（固投/新开工等 YTD 序列） */
  function yoyFromSameMonth(pts) {
    if (!pts || pts.length < 13) return null;
    const map = new Map();
    pts.forEach((p) => {
      const d = String(p.d).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(d)) map.set(d, p.v);
    });
    const out = [];
    map.forEach((v, d) => {
      const y = Number(d.slice(0, 4));
      const m = d.slice(5, 7);
      const prev = map.get(`${y - 1}-${m}`);
      if (prev == null || prev === 0) return;
      out.push({ d, v: ((v - prev) / Math.abs(prev)) * 100 });
    });
    out.sort((a, b) => String(a.d).localeCompare(String(b.d)));
    return out.length ? out : null;
  }

  /** 东财 LPR（1 年期），CORS *；列表按日期倒序，同月取最新一次 */
  async function fetchChinaLPR(limit) {
    const n = limit || 500;
    const url =
      `${EM}?reportName=RPTA_WEB_RATE&columns=ALL` +
      `&sortColumns=TRADE_DATE&sortTypes=-1&pageNumber=1&pageSize=${n}` +
      `&token=894050c76af8597a853f5b408b759f5d&source=WEB&client=WEB`;
    const d = await getJSON(url, { timeout: 18000 });
    const rows = d && d.result && d.result.data;
    if (!Array.isArray(rows) || !rows.length) return null;
    const seen = new Map();
    rows.forEach((r) => {
      const v = Number(r.LPR1Y);
      if (Number.isNaN(v) || r.TRADE_DATE == null) return;
      const mk = String(r.TRADE_DATE).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(mk) || seen.has(mk)) return;
      seen.set(mk, v);
    });
    const pts = [...seen.entries()]
      .map(([d, v]) => ({ d, v }))
      .sort((a, b) => String(a.d).localeCompare(String(b.d)));
    return pts.length ? pts : null;
  }

  /** 美国宏观：利率/物价 + 增长/信用（MacroRadar 公开 CORS） */
  async function fetchUS() {
    const [
      rate,
      cpi,
      ppi,
      coreCpi,
      unrate,
      payrolls,
      indpro,
      retail,
      yieldCurve,
      m2,
      gdp,
      housing,
      credit,
      claims,
      nextFomc,
    ] = await Promise.all([
      // ~40 年月度 / 对应频次，便于实时模型看完整周期
      macroRadarSeries("FEDFUNDS", 480),
      macroRadarCompute("CPIAUCSL.yoy", 480),
      macroRadarCompute("PPIACO.yoy", 480),
      macroRadarCompute("CPILFESL.yoy", 480),
      macroRadarSeries("UNRATE", 480),
      macroRadarCompute("PAYEMS.yoy", 480),
      macroRadarCompute("INDPRO.yoy", 480),
      macroRadarCompute("RSAFS.yoy", 480),
      macroRadarSeries("T10Y2Y", 10000),
      macroRadarCompute("M2SL.yoy", 480),
      macroRadarCompute("GDPC1.yoy", 160),
      macroRadarCompute("HOUST.yoy", 480),
      macroRadarCompute("TOTALSL.yoy", 480),
      macroRadarSeries("ICSA", 2100),
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
      coreCpiHistory: coreCpi,
      coreCpiYoY: last(coreCpi),
      inflationHistory: inflation,
      inflation: last(inflation),
      unrateHistory: unrate,
      unrate: last(unrate),
      payrollsYoYHistory: payrolls,
      payrollsYoY: last(payrolls),
      indproYoYHistory: indpro,
      indproYoY: last(indpro),
      retailYoYHistory: retail,
      retailYoY: last(retail),
      yieldCurveHistory: yieldCurve,
      yieldCurve: last(yieldCurve),
      m2YoYHistory: m2,
      m2YoY: last(m2),
      gdpYoYHistory: gdp,
      gdpYoY: last(gdp),
      housingYoYHistory: housing,
      housingYoY: last(housing),
      creditYoYHistory: credit,
      creditYoY: last(credit),
      claimsHistory: claims,
      claims: last(claims),
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
      dotPlot: null,
      source: "MacroRadar / FinanceCalendar",
    };
  }

  /** 中国宏观：chinadata 月度增长/物价 + 东财 LPR（均 CORS *） */
  async function fetchCN() {
    const [
      rate,
      cpiIdx,
      ppi,
      unrate,
      indpro,
      retail,
      m2,
      gdpIdx,
      housingLvl,
      credit,
      pmi,
    ] = await Promise.all([
      fetchChinaLPR(500),
      chinaDataSeries("china-cpi-index-yoy", { indexToYoY: true, limit: 480 }),
      chinaDataSeries("china-ppi", { limit: 480 }),
      chinaDataSeries("china-unemployment", { limit: 480 }),
      chinaDataSeries("china-industrial-output", { limit: 480 }),
      chinaDataSeries("china-retail-sales-yoy", { limit: 480 }),
      chinaDataSeries("china-m2-money-supply-yoy", { limit: 480 }),
      chinaDataSeries("china-gdp-index", { indexToYoY: true, limit: 160 }),
      chinaDataSeries("china-housing-starts", { limit: 480 }),
      chinaDataSeries("china-rmb-loans-balance-yoy", { limit: 480 }),
      chinaDataSeries("china-pmi", { limit: 480 }),
    ]);
    const cpi = cpiIdx;
    const inflation = cpi;
    const housing = yoyFromSameMonth(housingLvl);
    const gdp = gdpIdx;
    return {
      country: "CN",
      rateHistory: rate,
      policyRate: last(rate),
      cpiHistory: cpi,
      cpiYoY: last(cpi),
      ppiHistory: ppi,
      ppiYoY: last(ppi),
      coreCpiHistory: null,
      coreCpiYoY: null,
      inflationHistory: inflation,
      inflation: last(inflation),
      unrateHistory: unrate,
      unrate: last(unrate),
      payrollsYoYHistory: null,
      payrollsYoY: null,
      indproYoYHistory: indpro,
      indproYoY: last(indpro),
      retailYoYHistory: retail,
      retailYoY: last(retail),
      yieldCurveHistory: null,
      yieldCurve: null,
      m2YoYHistory: m2,
      m2YoY: last(m2),
      gdpYoYHistory: gdp,
      gdpYoY: last(gdp),
      housingYoYHistory: housing,
      housingYoY: last(housing),
      creditYoYHistory: credit,
      creditYoY: last(credit),
      claimsHistory: null,
      claims: null,
      pmiHistory: pmi,
      pmi: last(pmi),
      nextMeeting: null,
      dotPlot: null,
      source: "ChinaData / Eastmoney LPR",
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
    if (cycleApiBase()) {
      const code = country === "CN" ? "CN" : "US";
      const d = await hapi("macro", { country: code }, { timeout: 55000 });
      if (d && d.country) return d;
    }
    if (country === "CN") return fetchCN();
    if (country === "GLOBAL") return fetchGlobal();
    return fetchUS();
  }

  async function fetchFearGreed(country) {
    // CNN Fear & Greed 面向美股情绪；中国暂无对等公开源
    if (country === "CN") return null;
    if (cycleApiBase()) {
      const d = await hapi("feargreed", { country: "US" }, { timeout: 20000 });
      if (d && d.value != null) {
        return {
          value: d.value,
          labelKey: d.labelKey,
          label: window.t(d.labelKey || "fgFear"),
          history: d.history,
          asOf: d.asOf || null,
        };
      }
    }
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

  /** 规则国家判断（与 HApi news.guessNewsCountry 对齐） */
  function guessNewsCountry(text) {
    const t = String(text || "");
    let cn = 0;
    let us = 0;
    const add = (re, w, side) => {
      if (re.test(t)) {
        if (side === "cn") cn += w;
        else us += w;
      }
    };
    add(/人民银行|中国人民银行|\bPBOC\b/i, 4, "cn");
    add(/国常会|国务院|商务部|工信部|发改委|证监会|上交所|深交所|沪深|A股/, 3, "cn");
    add(/人民币|\bLPR\b|中国经济|中国股市|内地楼市|尊界/, 2, "cn");
    add(/北京|上海|深圳|中国(?!台湾)/, 1, "cn");
    add(/美联储|Federal Reserve|\bFOMC\b|非农|\bNFP\b|华尔街|纳斯达克|标普|道琼斯|美元指数/, 3, "us");
    add(/特朗普|\bTrump\b|耶伦|\bYellen\b|沃什|鲍威尔|\bPowell\b|哈玛克/, 3, "us");
    add(/\bFed\b|美国(?:总统|经济|股市|CPI|PPI|零售)|U\.?S\.?(?:\s|$)|United States/i, 2, "us");
    add(/美元(?!指数)/, 1, "us");
    if (/印尼|也门|伊朗|乌克兰|俄罗斯|欧央行|\bECB\b|日经|韩股|KOSPI|特斯拉|MSCI|全球财经早餐/i.test(t)) {
      if (cn < 3) cn = Math.max(0, cn - 1);
      if (us < 3) us = Math.max(0, us - 1);
    }
    if (cn === 0 && us === 0) {
      return { country: "GLOBAL", confidence: 0, countrySource: "rules" };
    }
    if (cn > us) {
      return {
        country: "CN",
        confidence: Math.min(1, 0.45 + (cn - us) * 0.15),
        countrySource: "rules",
      };
    }
    if (us > cn) {
      return {
        country: "US",
        confidence: Math.min(1, 0.45 + (us - cn) * 0.15),
        countrySource: "rules",
      };
    }
    return { country: "GLOBAL", confidence: 0.25, countrySource: "rules" };
  }

  function guessCountry(text) {
    return guessNewsCountry(text).country;
  }

  function needsCountryModel(item) {
    const c = item && item.countryGuess;
    const conf = Number(item && item.countryConfidence);
    if (c !== "US" && c !== "CN") return true;
    return !(conf >= 0.6);
  }

  async function refineNewsCountries(items) {
    const list = Array.isArray(items) ? items.slice() : [];
    list.forEach((n) => {
      if (n.countryGuess && n.countryConfidence != null) return;
      const geo = guessNewsCountry(
        (n.title || "") + " " + (n.summary || n.content || "")
      );
      n.countryGuess = geo.country;
      n.countryConfidence = geo.confidence;
      n.countrySource = geo.countrySource;
    });

    const unsure = list.filter(needsCountryModel);
    if (
      unsure.length &&
      window.CycleLLM &&
      typeof window.CycleLLM.classifyNewsCountries === "function"
    ) {
      const st =
        window.CycleLLM.getStatus && window.CycleLLM.getStatus();
      // 仅在模型已就绪时调用，避免新闻页强制下载
      if (st && st.status === "ready") {
        const mapped = await window.CycleLLM.classifyNewsCountries(
          unsure.map((n) => ({
            id: n.id,
            title: n.titleRaw || n.title,
            summary: n.summaryRaw || n.summary || n.content || "",
          }))
        );
        if (mapped && typeof mapped === "object") {
          list.forEach((n) => {
            const c = mapped[n.id];
            if (c === "US" || c === "CN" || c === "GLOBAL") {
              n.countryGuess = c;
              n.countryConfidence = 0.85;
              n.countrySource = "model";
            }
          });
        }
      }
    }
    return list;
  }

  function filterNewsByCountry(items, country) {
    if (country !== "US" && country !== "CN") return items.slice();
    return items
      .filter((n) => n.countryGuess === country)
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }

  function stripHtml(s) {
    return String(s || "").replace(/<[^>]+>/g, "").trim();
  }

  function newsFeedsFor(country) {
    const feeds = [JIN10_RSS];
    if (country === "CN") {
      feeds.push(
        "https://news.google.com/rss/search?q=" +
          encodeURIComponent("中国经济 OR 央行 OR LPR OR 人民币 OR 美联储 when:3d") +
          "&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"
      );
      feeds.push(
        "https://news.google.com/rss/search?q=" +
          encodeURIComponent("PBOC OR China CPI OR yuan when:3d") +
          "&hl=en-US&gl=US&ceid=US:en"
      );
    } else if (country === "US") {
      feeds.push(
        "https://news.google.com/rss/search?q=" +
          encodeURIComponent(
            "Federal Reserve OR FOMC OR US inflation OR nonfarm OR Treasury when:3d"
          ) +
          "&hl=en-US&gl=US&ceid=US:en"
      );
      feeds.push(
        "https://news.google.com/rss/search?q=" +
          encodeURIComponent("forex market OR dollar OR Fed speakers when:3d") +
          "&hl=en-US&gl=US&ceid=US:en"
      );
    } else {
      feeds.push(
        "https://news.google.com/rss/search?q=" +
          encodeURIComponent(
            "central bank OR inflation OR forex OR Federal Reserve OR ECB when:3d"
          ) +
          "&hl=en-US&gl=US&ceid=US:en"
      );
      feeds.push(
        "https://news.google.com/rss/search?q=" +
          encodeURIComponent("全球经济 OR 央行 OR 通胀 when:3d") +
          "&hl=zh-CN&gl=US&ceid=US:zh-Hans"
      );
    }
    return feeds;
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
      let image = null;
      if (it.thumbnail) image = it.thumbnail;
      else if (it.enclosure && it.enclosure.link && /image/i.test(it.enclosure.type || "image"))
        image = it.enclosure.link;
      else if (Array.isArray(it.enclosure) && it.enclosure[0] && it.enclosure[0].link)
        image = it.enclosure[0].link;
      else {
        const m = String(it.description || it.content || "").match(
          /<img[^>]+src=["']([^"']+)["']/i
        );
        if (m) image = m[1];
      }
      return {
        id: it.guid || it.link || title + i,
        title,
        summary,
        time,
        link: it.link || it.url || null,
        image,
        important: true,
        countryGuess: guessCountry(title + " " + summary),
      };
    });
  }

  function cycleApiBase() {
    const cfg = window.CycleConfig || {};
    return String(cfg.apiBase || cfg.newsProxy || "").replace(/\/$/, "");
  }

  function cycleApp() {
    const cfg = window.CycleConfig || {};
    return cfg.app || "cycle";
  }

  /** 统一走 HApi；params 为 query 对象 */
  async function hapi(flow, params, opts) {
    const base = cycleApiBase();
    if (!base) return null;
    const q = Object.assign({ flow, app: cycleApp() }, params || {});
    const qs = Object.keys(q)
      .filter((k) => q[k] != null && q[k] !== "")
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(q[k]))
      .join("&");
    return getJSON(base + "?" + qs, opts || { timeout: 45000 });
  }

  async function fetchNewsProxy() {
    let lastErr = null;
    for (let i = 0; i < 3; i++) {
      try {
        const d = await hapi("news", {}, { timeout: 28000 });
        if (d && Array.isArray(d.items) && d.items.length) return d.items;
      } catch (e) {
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
    if (lastErr) console.warn("[Cycle] news proxy", lastErr);
    return null;
  }

  async function searchWeb(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    const d = await hapi("search", { q }, { timeout: 18000 });
    if (!d || !Array.isArray(d.results)) return null;
    return d;
  }

  async function fetchImportantNews(country) {
    // 已配置 Function URL 时只用金十「重要事件」专题；否则回退 RSS
    if (cycleApiBase()) {
      const proxied = await fetchNewsProxy();
      if (!proxied || !proxied.length) return null;
      const ranked = proxied
        .slice()
        .sort((a, b) => (a.rank || 0) - (b.rank || 0));
      const tagged = await refineNewsCountries(ranked);
      return filterNewsByCountry(tagged, country).slice(0, 60);
    }
    const feeds = newsFeedsFor(country || "GLOBAL");
    const batches = await Promise.all(feeds.map((f) => fetchRssViaJson(f)));
    const seen = new Set();
    let items = [];
    batches.flat().forEach((n) => {
      const key = (n.title || "").slice(0, 80);
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push(n);
    });
    items.sort((a, b) => new Date(b.time) - new Date(a.time));
    if (!items.length) return null;
    items = await refineNewsCountries(items);
    items = filterNewsByCountry(items, country);
    return items.slice(0, 60);
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
    const isHol = e.impact === "Holiday" || e.tag === "holiday";
    return {
      id: e.url || e.id || titleRaw + (e.date || e.time_utc || ""),
      country,
      datetime: e.time_utc || e.date || e.datetime,
      title: titleRaw,
      holidayName: isHol ? titleRaw : null,
      market: isHol ? country : null,
      forecast: e.forecast || e.consensus || "—",
      actual: e.actual == null || e.actual === "" ? null : e.actual,
      previous: e.previous || e.prior || "—",
      importance: high ? 3 : 1,
      tag: isHol ? "holiday" : e.tag || null,
      source,
    };
  }

  async function fetchCalendar(fromISO, toISO, country) {
    const from = fromISO.slice(0, 10);
    const to = toISO.slice(0, 10);
    if (cycleApiBase()) {
      const code = country === "CN" ? "CN" : "US";
      const d = await hapi(
        "calendar",
        { from, to, country: code },
        { timeout: 45000 }
      );
      if (d && Array.isArray(d.events)) {
        return d.events.length ? d.events : null;
      }
    }
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
      if (e.tag === "holiday") {
        return (
          d +
          "|hol|" +
          (e.country || "") +
          "|" +
          String(e.holidayName || e.title || "")
            .toLowerCase()
            .slice(0, 48)
        );
      }
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
    searchWeb,
    fetchCalendar,
    witchingDates,
  };
})();
