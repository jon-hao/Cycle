import { fetchJson } from "../lib/http.mjs";

const FG = "https://fearandgreedgraph.com/api/fear-greed";
const CN_SNAP = "https://api.fusionintel.net/v1/public/feargreed/a_stock_macro/latest";
const CN_STM = "https://stock-stm.asia/api/data?days=90";

function labelFor(value) {
  if (value < 25) return "fgExtremeFear";
  if (value < 50) return "fgFear";
  if (value < 75) return "fgGreed";
  return "fgExtremeGreed";
}

/** 用涨跌家数+涨跌停估算 0–100 情绪分（补历史曲线） */
function stmScore(series, i) {
  const up = Number(series.adv_count && series.adv_count[i]) || 0;
  const down = Number(series.dec_count && series.dec_count[i]) || 0;
  const lu =
    (Number(series.first_board && series.first_board[i]) || 0) +
    (Number(series.cont_board && series.cont_board[i]) || 0);
  const ld = Number(series.limit_down && series.limit_down[i]) || 0;
  const breadth = up + down > 0 ? (up / (up + down)) * 100 : 50;
  const limit = lu + ld > 0 ? (lu / (lu + ld)) * 100 : 50;
  return Math.round(0.65 * breadth + 0.35 * limit);
}

async function buildCN() {
  const [snap, stm] = await Promise.all([
    fetchJson(CN_SNAP, { timeout: 12000 }).catch(() => null),
    fetchJson(CN_STM, { timeout: 12000 }).catch(() => null),
  ]);

  const dates = (stm && stm.dates_iso) || [];
  const series = (stm && stm.series) || {};
  let history = dates.map((day, i) => ({
    d: String(day).slice(0, 10),
    v: stmScore(series, i),
  }));

  let value =
    snap && snap.feargreed_index != null ? Number(snap.feargreed_index) : null;
  if (value == null && history.length) {
    value = history[history.length - 1].v;
  }
  if (value == null) {
    return { flow: "feargreed", country: "CN", value: null, history: null };
  }

  // 用公开恐贪最新值覆盖最后一点，曲线仍来自短线情绪
  if (history.length) {
    history = history.slice();
    history[history.length - 1] = {
      d: (snap && snap.latest_date) || history[history.length - 1].d,
      v: value,
    };
  } else {
    history = [
      {
        d: (snap && snap.latest_date) || new Date().toISOString().slice(0, 10),
        v: value,
      },
    ];
  }

  return {
    flow: "feargreed",
    country: "CN",
    value,
    labelKey: labelFor(value),
    labelText: (snap && snap.sentiment_label) || null,
    history,
    asOf: (snap && snap.latest_date) || null,
    source: "fusionintel A-share macro FG + stock-stm breadth via HApi",
    kind: "cnSentiment",
  };
}

export async function handleFearGreed(payload) {
  const country = String(payload.country || "US").toUpperCase();
  if (country === "CN") return buildCN();

  const d = await fetchJson(FG, { timeout: 15000 });
  if (!d || !Array.isArray(d.values) || !d.values.length) {
    return { flow: "feargreed", country: "US", value: null, history: null };
  }
  const dates = d.dates || [];
  const values = d.values;
  const history = dates.map((day, i) => ({
    d: String(day).slice(0, 10),
    v: Number(values[i]),
  }));
  const value = Number(values[values.length - 1]);

  return {
    flow: "feargreed",
    country: "US",
    value,
    labelKey: labelFor(value),
    history,
    asOf: d.asOf || null,
    source: "fearandgreedgraph via HApi",
    kind: "usFearGreed",
  };
}
