/**
 * 资产搜索 / 历史行情：代理 Yahoo Finance 非官方 JSON（服务端无 CORS 限制）
 * ?flow=assets&action=search&q=...
 * ?flow=assets&action=history&symbol=GC=F&range=1y|10y|30y
 */

const UA = "Mozilla/5.0 (compatible; HApi/1.0; +https://cycle.app)";

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
  if (!res.ok) {
    throw new Error("yahoo " + res.status);
  }
  return res.json();
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
    const url =
      "https://query1.finance.yahoo.com/v1/finance/search?q=" +
      encodeURIComponent(q) +
      "&quotesCount=16&newsCount=0&listsCount=0";
    const data = await yahooGet(url);
    const results = (data.quotes || [])
      .map(mapQuote)
      .filter(Boolean)
      .slice(0, 16);
    return { flow: "assets", action: "search", q, results };
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
    const data = await yahooGet(url);
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
