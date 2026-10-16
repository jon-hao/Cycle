/**
 * 金十「重要事件」专题（sort=priority 的数组顺序即榜单排名）。
 * https://topic17z2k407.jin10.com/topic/jin10_important_news.html
 */

const UPSTREAM =
  "https://1b8d6028d99849668a6d8755c79e650f.z3c.jin10.com/top/flashsByTime?time_type=time&sort=priority";

let cache = { at: 0, payload: null };

function guessCountry(text) {
  const t = text || "";
  if (/中国|人民银行|LPR|人民币|北京|上海|沪深|央行|国务院|国常会/.test(t)) return "CN";
  if (/美国|美联储|FOMC|非农|纳斯达克|标普|华尔街|美元/.test(t)) return "US";
  if (/U\.?S\.|Fed|Federal Reserve|Wall Street|NFP/i.test(t) && !/中国/.test(t)) return "US";
  return "GLOBAL";
}

function cleanText(s) {
  return String(s || "")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/点击查看\.\.\./g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

/** 从 data.title / data.content 拆标题与正文 */
function parseTitleContent(body) {
  let title = cleanText(body && body.title);
  let content = cleanText(body && body.content);
  if (!title) {
    const m = content.match(/^【([^】]+)】/);
    if (m) {
      title = m[1].trim();
      content = content.replace(/^【[^】]+】/, "").trim();
    } else {
      title = content.slice(0, 100);
      content = content.slice(title.length).trim();
    }
  } else {
    content = content.replace(/^【[^】]+】/, "").trim();
    if (content.startsWith(title)) {
      content = content.slice(title.length).replace(/^[\s：:]+/, "").trim();
    }
  }
  return { title, content };
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
  let rank = 0;
  for (const row of rows) {
    const flash = row && row.data;
    const body = flash && flash.data;
    if (!flash || !body || (flash.extras && flash.extras.ad)) continue;
    const { title, content } = parseTitleContent(body);
    if (!title) continue;
    rank += 1;
    const id = String(row.item_id || flash.id || title);
    const link =
      (body.source_link && /^https?:/i.test(body.source_link) && body.source_link) ||
      "https://flash.jin10.com/detail/" + id;
    const text = title + " " + content;
    out.push({
      id,
      rank,
      title,
      summary: content,
      content,
      time: toISO(flash.time),
      link,
      important: true,
      countryGuess: guessCountry(text),
    });
  }
  return out;
}

async function loadItems() {
  const now = Date.now();
  if (cache.payload && now - cache.at < 60_000) return cache.payload;
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
  const payload = { flow: "news", items: mapFlashes(data.data) };
  cache = { at: now, payload };
  return payload;
}

/** @param {Record<string, unknown>} [_payload] */
export async function handleNews(_payload) {
  return loadItems();
}
