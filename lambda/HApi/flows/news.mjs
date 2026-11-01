/**
 * 金十「重要事件」专题。
 * 鉴权头 / baseUrl 从专题页动态解析；失败则强制刷新请求头后重试。
 */

import { resolveJin10Auth, clearJin10AuthMemo } from "../lib/jin10Auth.mjs";

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

/** 早餐/周报类汇总，不是事件快讯 */
export function isDigestNoise(title, content) {
  const t = String(title || "") + " " + String(content || "");
  return /财经早餐|一周展望|本周展望|下周展望|周末复盘|每日复盘|一周复盘/.test(t);
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
    if (isDigestNoise(title, content)) continue;
    rank += 1;
    const id = String(row.item_id || flash.id || title);
    const originLink =
      body.source_link && /^https?:/i.test(body.source_link) ? body.source_link : null;
    const jin10Link = "https://flash.jin10.com/detail/" + id;
    const text = title + " " + content;
    const geo = guessNewsCountry(text);
    out.push({
      id,
      rank,
      title,
      summary: content,
      content,
      time: toISO(flash.time),
      sourceName: cleanText(body.source) || null,
      originLink,
      jin10Link,
      // 阅读原文优先源头媒体；无源头时回退金十详情
      link: originLink || jin10Link,
      important: true,
      countryGuess: geo.country,
      countryConfidence: geo.confidence,
      countrySource: geo.countrySource,
    });
  }
  return out;
}

function unescapeJin(s) {
  return String(s || "")
    .replace(/\\u002F/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003D/g, "=")
    .replace(/\\u003F/g, "?")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/** 从金十详情页 SSR __NUXT__ 抽出标题/正文/源头链接 */
export function parseDetailHtml(html) {
  const raw = String(html || "");
  const m = raw.match(
    /data:\{content:"((?:\\.|[^"\\])*)"[\s\S]*?source:"((?:\\.|[^"\\])*)",source_link:"((?:\\.|[^"\\])*)",title:"((?:\\.|[^"\\])*)"/
  );
  if (!m) {
    const desc = raw.match(
      /name="description"\s+content="([^"]*)"/i
    );
    if (!desc) return null;
    const { title, content } = parseTitleContent({ content: desc[1] });
    return { title, content, source: null, source_link: null };
  }
  return {
    content: cleanText(unescapeJin(m[1])),
    source: cleanText(unescapeJin(m[2])) || null,
    source_link: unescapeJin(m[3]) || null,
    title: cleanText(unescapeJin(m[4])),
  };
}

/**
 * 同一次 Lambda 内并行打开详情页补全（不计额外 Lambda 调用）。
 * 限流：最多 24 条、并发 6、单页 4.5s，避免触顶超时/内存。
 */
async function enrichWithDetails(items) {
  const list = Array.isArray(items) ? items.slice(0, 24) : [];
  if (!list.length) return list;
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const item = list[idx];
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetch(item.jin10Link || "https://flash.jin10.com/detail/" + item.id, {
          signal: ctrl.signal,
          headers: {
            accept: "text/html",
            "user-agent": UA,
            referer: "https://flash.jin10.com/",
          },
        });
        if (!res.ok) continue;
        const parsed = parseDetailHtml(await res.text());
        if (!parsed) continue;
        if (parsed.title) item.title = parsed.title;
        if (parsed.content) {
          item.content = parsed.content;
          item.summary = parsed.content;
        }
        if (parsed.source) item.sourceName = parsed.source;
        if (parsed.source_link && /^https?:/i.test(parsed.source_link)) {
          item.originLink = parsed.source_link;
          item.link = parsed.source_link;
        }
      } catch (_) {
        /* 详情失败保留 list 字段 */
      } finally {
        clearTimeout(timer);
      }
    }
  }
  const n = Math.min(6, list.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return list;
}

/** flash-api 备用：重要快讯（鉴权头不同） */
export function mapFlashApiList(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  let rank = 0;
  for (const item of rows) {
    if (!item || item.type === 1) continue;
    if (!(item.important === 1 || item.important === true)) continue;
    const data = item.data || {};
    let content = cleanText(data.content || "");
    let title = cleanText(data.title || data.vip_title || "");
    if (!title) {
      const m = content.match(/^【([^】]+)】/);
      if (m) {
        title = m[1].trim();
        content = content.replace(/^【[^】]+】/, "").trim();
      } else {
        title = content.slice(0, 100);
      }
    }
    if (!title) continue;
    if (isDigestNoise(title, content)) continue;
    rank += 1;
    const id = String(item.id || title);
    const text = title + " " + content;
    const geo = guessNewsCountry(text);
    out.push({
      id,
      rank,
      title,
      summary: content,
      content,
      time: toISO(item.time),
      link: data.link || "https://www.jin10.com/flash",
      important: true,
      countryGuess: geo.country,
      countryConfidence: geo.confidence,
      countrySource: geo.countrySource,
    });
  }
  return out;
}

async function fetchUpstreamOnce(auth) {
  const url = new URL(auth.baseUrl);
  url.searchParams.set("time_type", "time");
  url.searchParams.set("sort", "priority");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: auth.headers,
    });
    if (!res.ok) throw new Error("upstream " + res.status);
    const data = await res.json();
    if (!data || data.status !== 200) {
      throw new Error("upstream status " + (data && data.status));
    }
    const items = mapFlashes(data.data);
    if (!items.length) throw new Error("upstream empty");
    const enriched = await enrichWithDetails(items);
    return {
      flow: "news",
      source: "jin10",
      fetchedAt: new Date().toISOString(),
      appId: auth.appId,
      version: auth.version,
      items: enriched,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFlashApiFallback() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(
      "https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1",
      {
        signal: ctrl.signal,
        headers: {
          "x-app-id": "bVBF4FyRTn5NJF5n",
          "x-version": "1.0.0",
          accept: "application/json",
          referer: "https://www.jin10.com/",
          origin: "https://www.jin10.com",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      }
    );
    if (!res.ok) throw new Error("flash-api " + res.status);
    const data = await res.json();
    const items = mapFlashApiList(data && data.data);
    if (!items.length) throw new Error("flash-api empty");
    // flash-api 条目补上 jin10Link，便于同请求内拉详情/源头
    items.forEach((it) => {
      if (!it.jin10Link) it.jin10Link = "https://flash.jin10.com/detail/" + it.id;
      if (!it.link) it.link = it.jin10Link;
    });
    const enriched = await enrichWithDetails(items);
    return {
      flow: "news",
      source: "jin10-flash-api",
      fetchedAt: new Date().toISOString(),
      items: enriched,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** @param {Record<string, unknown>} [_payload] */
export async function handleNews(_payload) {
  let lastErr;

  // 1) 当前（或缓存的）动态请求头
  try {
    const auth = await resolveJin10Auth({ force: false });
    return await fetchUpstreamOnce(auth);
  } catch (e) {
    lastErr = e;
  }

  await sleep(150);

  // 2) 金十可能轮换了头：强制从专题页重新解析后再打
  try {
    clearJin10AuthMemo();
    const auth = await resolveJin10Auth({ force: true });
    return await fetchUpstreamOnce(auth);
  } catch (e) {
    lastErr = e;
  }

  await sleep(150);

  // 3) 专题接口仍失败 → flash-api 重要快讯兜底
  try {
    return await fetchFlashApiFallback();
  } catch (e) {
    lastErr = e;
  }

  return {
    flow: "news",
    source: "jin10",
    items: [],
    degraded: true,
    error: String(lastErr && lastErr.message ? lastErr.message : lastErr),
  };
}
