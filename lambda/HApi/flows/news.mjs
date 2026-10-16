/**
 * 金十「重要事件」专题（sort=priority 的数组顺序即榜单排名）。
 * https://topic17z2k407.jin10.com/topic/jin10_important_news.html
 *
 * 鉴权：上游边缘网关要求 x-app-id / x-version（缺头会 502），与 IP 黑名单无关。
 *
 * 缓存（高实时 + 共用表）：
 *   - 键：cache#src#news#jin10（跨 app 单份，不按 cycle/其他应用复制）
 *   - 内存新鲜 ~15s；DDB 新鲜 ~25s；软保留 30min（仅上游失败时返回）
 *   - 软过期时短超时抢刷新（SWR），失败才吐 stale
 */

import { cacheRead, cacheSet, sourceCacheKey } from "../lib/cache.mjs";

const UPSTREAM =
  "https://1b8d6028d99849668a6d8755c79e650f.z3c.jin10.com/top/flashsByTime?time_type=time&sort=priority";

/** 金十专题页鉴权头；缺省会被 CDN 直接 502 */
const UPSTREAM_HEADERS = {
  "x-app-id": "EzF2s2HxxU0U5bYa",
  "x-version": "1.0.0",
  "content-type": "application/json",
  accept: "application/json",
  referer: "https://topic17z2k407.jin10.com/",
  "user-agent":
    "Mozilla/5.0 (compatible; HApi/1.0; +https://github.com/jon-hao/Cycle)",
};

const MEM_FRESH_MS = 15_000;
const DDB_FRESH_SEC = 25;
const DDB_SOFT_SEC = 30 * 60;
const FETCH_QUICK_MS = 4_000;
const FETCH_FULL_MS = 8_000;

const CACHE_PK = sourceCacheKey("news", ["jin10"]);

let mem = { at: 0, payload: null };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 规则国家判断（与前端 CycleAPI.guessNewsCountry 保持同思路） */
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

function annotate(body, meta) {
  const base = body && typeof body === "object" ? body : { flow: "news", items: [] };
  return Object.assign({}, base, {
    flow: "news",
    source: "jin10",
    cache: meta.cache || null,
    fetchedAt: meta.fetchedAt || base.fetchedAt || null,
    ageSec: meta.ageSec != null ? meta.ageSec : null,
    stale: !!meta.stale,
  });
}

async function fetchUpstreamOnce(timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(UPSTREAM, {
      signal: ctrl.signal,
      headers: UPSTREAM_HEADERS,
    });
    if (!res.ok) throw new Error("upstream " + res.status);
    const data = await res.json();
    if (!data || data.status !== 200) throw new Error("upstream status");
    const fetchedAt = new Date().toISOString();
    return {
      flow: "news",
      source: "jin10",
      fetchedAt,
      items: mapFlashes(data.data),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUpstream(timeoutMs) {
  let lastErr;
  const attempts = timeoutMs <= FETCH_QUICK_MS ? 1 : 2;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchUpstreamOnce(timeoutMs);
    } catch (e) {
      lastErr = e;
      if (i + 1 < attempts) await sleep(150 * (i + 1));
    }
  }
  throw lastErr || new Error("upstream failed");
}

async function persist(body) {
  mem = { at: Date.now(), payload: body };
  await cacheSet(CACHE_PK, body, {
    freshSec: DDB_FRESH_SEC,
    softSec: DDB_SOFT_SEC,
  });
}

/** @param {Record<string, unknown>} [_payload] app 参数忽略：新闻源缓存全局共用 */
export async function handleNews(_payload) {
  const now = Date.now();

  if (mem.payload && now - mem.at < MEM_FRESH_MS) {
    return annotate(mem.payload, {
      cache: "memory",
      fetchedAt: mem.payload.fetchedAt,
      ageSec: Math.floor((now - mem.at) / 1000),
      stale: !!mem.payload.stale,
    });
  }

  const hit = await cacheRead(CACHE_PK);
  if (hit && hit.fresh && hit.payload && Array.isArray(hit.payload.items) && hit.payload.items.length) {
    mem = { at: now, payload: hit.payload };
    return annotate(hit.payload, {
      cache: "fresh",
      fetchedAt: hit.updatedAt || hit.payload.fetchedAt,
      ageSec: hit.ageSec,
      stale: false,
    });
  }

  const softOk =
    hit &&
    hit.payload &&
    Array.isArray(hit.payload.items) &&
    hit.payload.items.length;

  // 软过期：短超时抢刷新；失败则立刻返回软缓存（保证实时性与可用性）
  if (softOk) {
    try {
      const body = await fetchUpstream(FETCH_QUICK_MS);
      await persist(body);
      return annotate(body, { cache: "revalidate", fetchedAt: body.fetchedAt, ageSec: 0, stale: false });
    } catch (_) {
      mem = { at: now, payload: hit.payload };
      return annotate(hit.payload, {
        cache: "stale",
        fetchedAt: hit.updatedAt || hit.payload.fetchedAt,
        ageSec: hit.ageSec,
        stale: true,
      });
    }
  }

  try {
    const body = await fetchUpstream(FETCH_FULL_MS);
    await persist(body);
    return annotate(body, { cache: "miss", fetchedAt: body.fetchedAt, ageSec: 0, stale: false });
  } catch (e) {
    if (mem.payload && Array.isArray(mem.payload.items) && mem.payload.items.length) {
      return annotate(mem.payload, {
        cache: "memory-stale",
        fetchedAt: mem.payload.fetchedAt,
        ageSec: Math.floor((now - mem.at) / 1000),
        stale: true,
      });
    }
    return annotate(
      {
        items: [],
        degraded: true,
        error: String(e && e.message ? e.message : e),
      },
      { cache: "empty", fetchedAt: null, ageSec: null, stale: true }
    );
  }
}
