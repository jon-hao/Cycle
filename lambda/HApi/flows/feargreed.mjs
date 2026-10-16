import { cacheGet, cacheSet, sourceCacheKey } from "../lib/cache.mjs";
import { fetchJson } from "../lib/http.mjs";

const FG = "https://fearandgreedgraph.com/api/fear-greed";

export async function handleFearGreed(payload) {
  const country = String(payload.country || "US").toUpperCase();
  if (country === "CN") {
    return { flow: "feargreed", country: "CN", value: null, history: null };
  }
  const key = sourceCacheKey("feargreed", ["US"]);
  const hit = await cacheGet(key);
  if (hit) return hit;

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
  let labelKey = "fgFear";
  if (value < 25) labelKey = "fgExtremeFear";
  else if (value < 50) labelKey = "fgFear";
  else if (value < 75) labelKey = "fgGreed";
  else labelKey = "fgExtremeGreed";

  const data = {
    flow: "feargreed",
    country: "US",
    value,
    labelKey,
    history,
    asOf: d.asOf || null,
    source: "fearandgreedgraph via HApi",
  };
  await cacheSet(key, data, { freshSec: 180, softSec: 3600 });
  return data;
}
