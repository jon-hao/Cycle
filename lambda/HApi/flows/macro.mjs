/**
 * 宏观数据包：?flow=macro&country=US|CN&app=cycle
 * 服务端聚合 MacroRadar / ChinaData / 东财，浏览器只打一次 HApi。
 */

import { fetchJson, last, toPoints } from "../lib/http.mjs";

const MR = "https://www.macroradar.io/api/v1";
const CD = "https://chinadata.live/api/v2";
const EM = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const FC = "https://www.financecalendar.com/wp-json/fc/v1";

async function macroRadarSeries(id, limit) {
  const d = await fetchJson(
    `${MR}/series/${encodeURIComponent(id)}?limit=${limit || 48}`,
    { timeout: 20000 }
  );
  if (!d || !d.data) return null;
  return toPoints(d.data.observations);
}

async function macroRadarCompute(expr, limit) {
  const d = await fetchJson(`${MR}/compute?expr=${encodeURIComponent(expr)}`, {
    timeout: 20000,
  });
  if (!d || !d.data) return null;
  const obs = d.data.observations || d.data;
  const pts = toPoints(obs);
  return pts ? pts.slice(-(limit || 48)) : null;
}

async function chinaDataSeries(slug, opts = {}) {
  const d = await fetchJson(`${CD}/data/${encodeURIComponent(slug)}`, {
    timeout: 20000,
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
  if (opts.indexToYoY) pts = pts.map((p) => ({ d: p.d, v: p.v - 100 }));
  pts.sort((a, b) => String(a.d).localeCompare(String(b.d)));
  if (opts.limit) pts = pts.slice(-opts.limit);
  return pts.length ? pts : null;
}

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

async function fetchChinaLPR(limit = 500) {
  const url =
    `${EM}?reportName=RPTA_WEB_RATE&columns=ALL` +
    `&sortColumns=TRADE_DATE&sortTypes=-1&pageNumber=1&pageSize=${limit}` +
    `&token=894050c76af8597a853f5b408b759f5d&source=WEB&client=WEB`;
  const d = await fetchJson(url, { timeout: 20000 });
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

async function buildUS() {
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
    macroRadarSeries("FEDFUNDS", 480).catch(() => null),
    macroRadarCompute("CPIAUCSL.yoy", 480).catch(() => null),
    macroRadarCompute("PPIACO.yoy", 480).catch(() => null),
    macroRadarCompute("CPILFESL.yoy", 480).catch(() => null),
    macroRadarSeries("UNRATE", 480).catch(() => null),
    macroRadarCompute("PAYEMS.yoy", 480).catch(() => null),
    macroRadarCompute("INDPRO.yoy", 480).catch(() => null),
    macroRadarCompute("RSAFS.yoy", 480).catch(() => null),
    macroRadarSeries("T10Y2Y", 10000).catch(() => null),
    macroRadarCompute("M2SL.yoy", 480).catch(() => null),
    macroRadarCompute("GDPC1.yoy", 160).catch(() => null),
    macroRadarCompute("HOUST.yoy", 480).catch(() => null),
    macroRadarCompute("TOTALSL.yoy", 480).catch(() => null),
    macroRadarSeries("ICSA", 2100).catch(() => null),
    fetchJson(`${FC}/next?series=fomc`, { timeout: 15000 }).catch(() => null),
  ]);
  return {
    flow: "macro",
    country: "US",
    rateHistory: rate,
    policyRate: last(rate),
    cpiHistory: cpi,
    cpiYoY: last(cpi),
    ppiHistory: ppi,
    ppiYoY: last(ppi),
    coreCpiHistory: coreCpi,
    coreCpiYoY: last(coreCpi),
    inflationHistory: cpi,
    inflation: last(cpi),
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
            date:
              nextFomc.next.date ||
              String(nextFomc.next.time_utc || "").slice(0, 10),
            title: {
              zh: "美联储议息会议（FOMC）",
              en: "FOMC Rate Decision",
            },
          }
        : null,
    dotPlot: null,
    source: "MacroRadar / FinanceCalendar via HApi",
  };
}

async function buildCN() {
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
    fetchChinaLPR(500).catch(() => null),
    chinaDataSeries("china-cpi-index-yoy", { indexToYoY: true, limit: 480 }).catch(() => null),
    chinaDataSeries("china-ppi", { limit: 480 }).catch(() => null),
    chinaDataSeries("china-unemployment", { limit: 480 }).catch(() => null),
    chinaDataSeries("china-industrial-output", { limit: 480 }).catch(() => null),
    chinaDataSeries("china-retail-sales-yoy", { limit: 480 }).catch(() => null),
    chinaDataSeries("china-m2-money-supply-yoy", { limit: 480 }).catch(() => null),
    chinaDataSeries("china-gdp-index", { indexToYoY: true, limit: 160 }).catch(() => null),
    chinaDataSeries("china-housing-starts", { limit: 480 }).catch(() => null),
    chinaDataSeries("china-rmb-loans-balance-yoy", { limit: 480 }).catch(() => null),
    chinaDataSeries("china-pmi", { limit: 480 }).catch(() => null),
  ]);
  const housing = yoyFromSameMonth(housingLvl);
  return {
    flow: "macro",
    country: "CN",
    rateHistory: rate,
    policyRate: last(rate),
    cpiHistory: cpiIdx,
    cpiYoY: last(cpiIdx),
    ppiHistory: ppi,
    ppiYoY: last(ppi),
    coreCpiHistory: null,
    coreCpiYoY: null,
    inflationHistory: cpiIdx,
    inflation: last(cpiIdx),
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
    gdpYoYHistory: gdpIdx,
    gdpYoY: last(gdpIdx),
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
    source: "ChinaData / Eastmoney LPR via HApi",
  };
}

export async function handleMacro(payload) {
  const country = String(payload.country || "US").toUpperCase() === "CN" ? "CN" : "US";
  return country === "CN" ? await buildCN() : await buildUS();
}
