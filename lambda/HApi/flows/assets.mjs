/**
 * 资产搜索 / 历史行情：代理 Yahoo Finance 非官方 JSON（服务端无 CORS 限制）
 * ?flow=assets&action=search&q=...
 * ?flow=assets&action=history&symbol=GC=F&range=1y|10y|30y
 */

const UA = "Mozilla/5.0 (compatible; HApi/1.0; +https://cycle.app)";

/** Yahoo 搜索不接受中文关键词；映射到英文 / 常见代码 */
const CN_ALIASES = [
  ["白银", "silver"],
  ["黄金", "gold"],
  ["比特币", "bitcoin"],
  ["以太", "ethereum"],
  ["原油", "crude oil"],
  ["布伦特", "brent"],
  ["纳斯达克", "nasdaq"],
  ["纳指", "nasdaq"],
  ["标普", "s&p 500"],
  ["标普500", "s&p 500"],
  ["道琼斯", "dow jones"],
  ["道指", "dow jones"],
  ["恒生", "hang seng"],
  ["恒指", "hang seng"],
  ["上证", "shanghai composite"],
  ["沪深", "china a-share"],
  ["美债", "treasury yield"],
  ["国债", "treasury"],
  ["美元", "dollar index"],
  ["欧元", "euro"],
  ["日元", "yen"],
  ["铜", "copper"],
  ["天然气", "natural gas"],
  ["美联储", "fed funds"],
  ["利率", "interest rate"],
  ["期货", "futures"],
  ["指数", "index"],
];

function expandSearchQueries(raw) {
  const q = String(raw || "").trim();
  if (!q) return [];
  const out = [];
  const push = (s) => {
    const t = String(s || "").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  push(q);
  if (/[\u4e00-\u9fff]/.test(q)) {
    CN_ALIASES.forEach(([zh, en]) => {
      if (q.includes(zh)) push(en);
    });
    // 整词命中失败时，用包含关系的别名兜底
    if (out.length === 1) {
      CN_ALIASES.forEach(([zh, en]) => {
        if (zh.includes(q) || q.includes(zh.slice(0, 2))) push(en);
      });
    }
  }
  return out.slice(0, 4);
}

async function yahooSearch(q) {
  const url =
    "https://query1.finance.yahoo.com/v1/finance/search?q=" +
    encodeURIComponent(q) +
    "&quotesCount=16&newsCount=0&listsCount=0&enableFuzzyQuery=false";
  try {
    const data = await yahooGet(url);
    return (data.quotes || []).map(mapQuote).filter(Boolean);
  } catch {
    return [];
  }
}

function rangeToYahoo(range) {
  const r = String(range || "1y").toLowerCase();
  if (r === "10y" || r === "10") return { range: "10y", interval: "1wk" };
  if (r === "30y" || r === "30" || r === "max") {
    const now = Math.floor(Date.now() / 1000);
    const period1 = now - Math.floor(30 * 365.25 * 24 * 3600);
    return { period1, period2: now, interval: "1wk" };
  }
  return { range: "1y", interval: "1d" };
}

async function yahooGet(url) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": UA,
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const desc =
      (data && data.chart && data.chart.error && data.chart.error.description) ||
      (data && data.error && (data.error.description || data.error)) ||
      ("yahoo " + res.status);
    const err = new Error(String(desc));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function mapQuote(q) {
  if (!q || !q.symbol) return null;
  return {
    symbol: q.symbol,
    name: q.shortname || q.longname || q.symbol,
    type: q.quoteType || q.typeDisp || "",
    exchange: q.exchDisp || q.exchange || "",
  };
}

export async function handleAssets(payload) {
  const action = String(payload.action || "search").toLowerCase();

  if (action === "search") {
    const q = String(payload.q || "").trim();
    if (!q) return { flow: "assets", action: "search", results: [] };
    const queries = expandSearchQueries(q);
    const seen = new Set();
    const results = [];
    for (const term of queries) {
      const batch = await yahooSearch(term);
      for (const item of batch) {
        if (!item || seen.has(item.symbol)) continue;
        seen.add(item.symbol);
        results.push(item);
        if (results.length >= 16) break;
      }
      if (results.length >= 16) break;
    }
    return {
      flow: "assets",
      action: "search",
      q,
      queries,
      results,
    };
  }

  if (action === "history") {
    const symbol = String(payload.symbol || "").trim();
    if (!symbol) {
      return { flow: "assets", action: "history", __status: 400, error: "symbol required" };
    }
    const yr = rangeToYahoo(payload.range);
    let url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) +
      "?interval=" +
      encodeURIComponent(yr.interval);
    if (yr.period1 != null) {
      url +=
        "&period1=" +
        yr.period1 +
        "&period2=" +
        yr.period2;
    } else {
      url += "&range=" + encodeURIComponent(yr.range);
    }
    let data = null;
    try {
      data = await yahooGet(url);
    } catch (e) {
      // 无效代码 / Yahoo 限流：返回空序列，避免整页 502
      return {
        flow: "assets",
        action: "history",
        symbol,
        series: [],
        error: String(e && e.message ? e.message : e),
      };
    }
    const result = data && data.chart && data.chart.result && data.chart.result[0];
    if (!result) {
      return {
        flow: "assets",
        action: "history",
        symbol,
        series: [],
        error: (data && data.chart && data.chart.error && data.chart.error.description) || "empty",
      };
    }
    const ts = result.timestamp || [];
    const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
    const closes = quote.close || [];
    const meta = result.meta || {};
    const series = [];
    for (let i = 0; i < ts.length; i++) {
      const v = closes[i];
      if (v == null || Number.isNaN(Number(v))) continue;
      const d = new Date(ts[i] * 1000);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      series.push({ d: `${y}-${m}-${day}`, v: Number(v) });
    }
    return {
      flow: "assets",
      action: "history",
      symbol,
      name: meta.shortName || meta.longName || symbol,
      currency: meta.currency || null,
      series,
    };
  }

  return { flow: "assets", __status: 400, error: "unknown action" };
}
