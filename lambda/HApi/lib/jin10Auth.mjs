/**
 * 从金十「重要事件」专题页解析最新鉴权头 / API 基址。
 * 专题页 / 兜底基址全部来自 Lambda Env。
 */

import {
  srcJin10TopicOrigin,
  srcJin10TopicPage,
  srcJin10FlashBase,
  srcJin10AppIdFallback,
  srcJin10VersionFallback,
} from "./sources.mjs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** @type {{ at: number, auth: ReturnType<typeof buildAuth> } | null} */
let memo = null;
const MEMO_MS = 3 * 60 * 1000;

function fallbackAuthParts() {
  return {
    appId: srcJin10AppIdFallback(),
    version: srcJin10VersionFallback(),
    baseUrl: srcJin10FlashBase(),
  };
}

function buildAuth({ appId, version, baseUrl }) {
  const fb = fallbackAuthParts();
  const id = appId || fb.appId;
  const ver = version || fb.version;
  const base = baseUrl || fb.baseUrl;
  const TOPIC_ORIGIN = srcJin10TopicOrigin();
  const TOPIC_PAGE = srcJin10TopicPage();
  return {
    appId: id,
    version: ver,
    baseUrl: base,
    headers: {
      "x-app-id": id,
      "x-version": ver,
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      origin: TOPIC_ORIGIN,
      referer: TOPIC_PAGE,
      "user-agent": UA,
    },
  };
}

async function fetchText(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": UA,
        referer: srcJin10TopicOrigin() + "/",
      },
    });
    if (!res.ok) throw new Error("fetch " + res.status + " " + url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** 执行专题页内联脚本，取出 __JIN10_TOPIC_ENV__ */
export function parseTopicEnv(html) {
  const full = String(html || "").match(
    /function _0x2a7b[\s\S]*?window\['__JIN10_TOPIC_ENV__'\]=\{[\s\S]*?\}\);/
  );
  const fb = fallbackAuthParts();
  if (!full) {
    const ver = (html.match(/importantNewsXVersion['"]?\s*:\s*['"]([^'"]+)['"]/) || [])[1];
    const base = (html.match(/importantNewsApiBaseUrl['"]?\s*:\s*['"](https?:[^'"]+)['"]/) || [])[1];
    if (ver || base) {
      return {
        importantNewsXVersion: ver || fb.version,
        importantNewsApiBaseUrl: base || fb.baseUrl,
      };
    }
    return null;
  }
  const sandbox = {};
  new Function("window", full[0])(sandbox);
  return sandbox.__JIN10_TOPIC_ENV__ || null;
}

/** 从打包 JS 解码 API_CONFIG.appId（offset 0x354） */
export function parseAppIdFromBundle(js) {
  const s = String(js || "");
  const a0 = s.indexOf("function _0x5357()");
  if (a0 < 0) return null;
  const a1 = s.indexOf("return _0x5357();}", a0);
  if (a1 < 0) return null;
  const arrayFn = s.slice(a0, a1 + "return _0x5357();}".length);

  const d0 = s.indexOf("function _0x1763(");
  if (d0 < 0) return null;
  let depth = 0;
  let started = false;
  let d1 = d0;
  for (let i = d0; i < s.length; i++) {
    if (s[i] === "{") {
      depth++;
      started = true;
    } else if (s[i] === "}") {
      depth--;
      if (started && depth === 0) {
        d1 = i + 1;
        break;
      }
    }
  }
  const decoderFn = s.slice(d0, d1);

  const sh = s.match(/\}\((_0x5357),(0x[0-9a-f]+)\)\);/);
  if (!sh) return null;
  const shAt = s.indexOf(sh[0]);
  const shStart = s.lastIndexOf("(function", shAt);
  if (shStart < 0) return null;
  const shuffle = s.slice(shStart, shAt + sh[0].length);

  const appIdOff = (s.match(/'appId':(_0x1763)\((0x[0-9a-f]+)\)/) || [])[2] || "0x354";

  try {
    const prog = `${arrayFn}\n${decoderFn}\n${shuffle}\nreturn _0x1763(${appIdOff});`;
    const appId = new Function(prog)();
    if (typeof appId === "string" && /^[A-Za-z0-9]{8,32}$/.test(appId)) {
      return appId;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function newsJsName(html) {
  const m = String(html || "").match(/jin10_important_news\.[a-f0-9]+\.js/);
  return m ? m[0] : null;
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function resolveJin10Auth(opts = {}) {
  const force = !!opts.force;
  if (!force && memo && Date.now() - memo.at < MEMO_MS) {
    return memo.auth;
  }

  const TOPIC_ORIGIN = srcJin10TopicOrigin();
  const TOPIC_PAGE = srcJin10TopicPage();
  const fb = fallbackAuthParts();

  try {
    const html = await fetchText(TOPIC_PAGE, 12000);
    const env = parseTopicEnv(html) || {};
    let appId = fb.appId;
    const jsName = newsJsName(html);
    if (jsName) {
      try {
        const js = await fetchText(`${TOPIC_ORIGIN}/topic/js/${jsName}`, 15000);
        appId = parseAppIdFromBundle(js) || appId;
      } catch {
        /* keep fallback appId */
      }
    }

    const auth = buildAuth({
      appId,
      version: env.importantNewsXVersion || fb.version,
      baseUrl: env.importantNewsApiBaseUrl || fb.baseUrl,
    });
    memo = { at: Date.now(), auth };
    return auth;
  } catch {
    const auth = buildAuth(fb);
    memo = { at: Date.now(), auth };
    return auth;
  }
}

export function clearJin10AuthMemo() {
  memo = null;
}
