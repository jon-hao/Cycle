/**
 * 金十「重要事件」专题（sort=priority 的数组顺序即榜单排名）。
 * 鉴权头必带；不做持久/内存缓存，保证实时。
 */

const UPSTREAM =
  "https://1b8d6028d99849668a6d8755c79e650f.z3c.jin10.com/top/flashsByTime?time_type=time&sort=priority";

const UPSTREAM_HEADERS = {
  "x-app-id": "EzF2s2HxxU0U5bYa",
  "x-version": "1.0.0",
  "content-type": "application/json",
  accept: "application/json",
  referer: "https://topic17z2k407.jin10.com/",
  "user-agent":
    "Mozilla/5.0 (compatible; HApi/1.0; +https://github.com/jon-hao/Cycle)",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function guessNewsCountry(text) {
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

function cleanText(s) {
  return String(s || "")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/点击查看\.\.\./g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

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
    const geo = guessNewsCountry(text);
    out.push({
      id,
      rank,
      title,
      summary: content,
      content,
      time: toISO(flash.time),
      link,
      important: true,
      countryGuess: geo.country,
      countryConfidence: geo.confidence,
      countrySource: geo.countrySource,
    });
  }
  return out;
}

async function fetchUpstreamOnce() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(UPSTREAM, {
      signal: ctrl.signal,
      headers: UPSTREAM_HEADERS,
    });
    if (!res.ok) throw new Error("upstream " + res.status);
    const data = await res.json();
    if (!data || data.status !== 200) throw new Error("upstream status");
    return {
      flow: "news",
      source: "jin10",
      fetchedAt: new Date().toISOString(),
      items: mapFlashes(data.data),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** @param {Record<string, unknown>} [_payload] */
export async function handleNews(_payload) {
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      return await fetchUpstreamOnce();
    } catch (e) {
      lastErr = e;
      await sleep(200 * (i + 1));
    }
  }
  return {
    flow: "news",
    source: "jin10",
    items: [],
    degraded: true,
    error: String(lastErr && lastErr.message ? lastErr.message : lastErr),
  };
}
