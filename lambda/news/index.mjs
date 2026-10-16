/**
 * Cycle 新闻代理。浏览器打到 Function URL，由 Lambda 去拉金十「重要事件」专题接口。
 * 专题页：https://topic17z2k407.jin10.com/topic/jin10_important_news.html
 */

const UPSTREAM =
  "https://1b8d6028d99849668a6d8755c79e650f.z3c.jin10.com/top/flashsByTime?time_type=time&sort=priority";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "public, max-age=60",
};

let cache = { at: 0, body: "" };

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function guessCountry(text) {
  const t = text || "";
  if (/中国|人民银行|LPR|人民币|北京|上海|沪深|央行|国务院|国常会/.test(t)) return "CN";
  if (/美国|美联储|FOMC|非农|纳斯达克|标普|华尔街|美元/.test(t)) return "US";
  if (/U\.?S\.|Fed|Federal Reserve|Wall Street|NFP/i.test(t) && !/中国/.test(t)) return "US";
  return "GLOBAL";
}

function splitFlash(content) {
  const raw = String(content || "").replace(/<br\b[^>]*>/gi, "").replace(/点击查看\.\.\./g, "").trim();
  const m = raw.match(/^【([^】]+)】/);
  if (!m) return { title: raw, summary: "" };
  return {
    title: m[1].trim(),
    summary: raw.replace(/^【[^】]+】/, "").trim(),
  };
}

function toISO(time) {
  const s = String(time || "").trim();
  if (!s) return new Date().toISOString();
  const d = new Date(s.replace(" ", "T") + "+08:00");
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function mapFlashes(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    const flash = row && row.data;
    const body = flash && flash.data;
    if (!flash || !body || (flash.extras && flash.extras.ad)) continue;
    const { title, summary } = splitFlash(body.title || body.content || "");
    if (!title) continue;
    const id = String(row.item_id || flash.id || title);
    const pic = body.pic && /^https?:/i.test(body.pic) ? body.pic : null;
    const link =
      (body.source_link && /^https?:/i.test(body.source_link) && body.source_link) ||
      (flash.type === 0 ? "https://flash.jin10.com/detail/" + id : null);
    const text = title + " " + summary;
    out.push({
      id,
      title,
      summary,
      time: toISO(flash.time),
      link,
      image: pic,
      important: true,
      countryGuess: guessCountry(text),
    });
  }
  return out;
}

async function loadItems() {
  const now = Date.now();
  if (cache.body && now - cache.at < 60_000) return cache.body;
  const res = await fetch(UPSTREAM, {
    headers: {
      "x-app-id": "EzF2s2HxxU0U5bYa",
      "x-version": "1.0.0",
      "content-type": "application/json",
      referer: "https://topic17z2k407.jin10.com/",
    },
  });
  if (!res.ok) throw new Error("upstream " + res.status);
  const data = await res.json();
  if (!data || data.status !== 200) throw new Error("upstream status");
  const body = JSON.stringify({ items: mapFlashes(data.data) });
  cache = { at: now, body };
  return body;
}

export async function handler(event) {
  const method = event?.requestContext?.http?.method || event?.httpMethod || "GET";
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (method !== "GET") return json(405, { items: [] });
  try {
    const body = await loadItems();
    return {
      statusCode: 200,
      headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
      body,
    };
  } catch (err) {
    return json(502, { items: [], error: String(err && err.message ? err.message : err) });
  }
}
