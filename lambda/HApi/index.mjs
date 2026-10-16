/**
 * HApi 入口：按 flow 分流（账号级共用 API）。
 *
 * 调用方式（任选其一）：
 *   GET  ?flow=news
 *   POST {"flow":"news", ...}
 *   路径 /news  （Function URL 会把 path 带进来）
 *
 * CORS 只由 Function URL 配置注入，响应里不再写 ACAO，避免重复头。
 * `new` 视为 `news` 的别名。后续在 flows/ 下加模块，并注册到 FLOWS 即可。
 */

import { handleNews } from "./flows/news.mjs";
import { handleSearch } from "./flows/search.mjs";
import { withQuota, quotaStatus } from "./quota.mjs";

const FLOWS = {
  news: handleNews,
  new: handleNews,
  search: handleSearch,
  quota: async () => quotaStatus(),
};

function json(statusCode, obj, extraHeaders) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": statusCode === 200 ? "public, max-age=60" : "no-store",
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(obj),
  };
}

function parseBody(event) {
  if (!event || event.body == null || event.body === "") return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : String(event.body);
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function normalizeFlow(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

/** 从 query / path / JSON body 解析 flow */
function resolveFlow(event, payload) {
  const q = event?.queryStringParameters || {};
  const fromQuery = normalizeFlow(q.flow || q.type || q.action);
  if (fromQuery) return fromQuery;

  const fromBody = normalizeFlow(payload.flow || payload.type || payload.action);
  if (fromBody) return fromBody;

  const rawPath =
    event?.rawPath ||
    event?.requestContext?.http?.path ||
    event?.path ||
    "/";
  const seg = String(rawPath)
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .pop();
  return normalizeFlow(seg);
}

export async function handler(event) {
  const method =
    event?.requestContext?.http?.method || event?.httpMethod || "GET";
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: { "cache-control": "no-store" }, body: "" };
  }
  if (method !== "GET" && method !== "POST") {
    return json(405, { error: "method not allowed" });
  }

  const payload = method === "POST" ? parseBody(event) : {};
  const flow = resolveFlow(event, payload);
  const run = FLOWS[flow];
  if (!run) {
    return json(400, {
      error: "unknown flow",
      flow: flow || null,
      flows: Object.keys(FLOWS).filter((k) => k !== "new"),
    });
  }

  try {
    const gated = await withQuota(() => run(payload));
    if (!gated.ok) {
      return json(429, {
        error: "monthly quota exceeded",
        flow,
        reset: gated.reset,
        usage: gated.usage,
        limits: gated.limits,
      });
    }
    return json(200, gated.result);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/SSM|Parameter|credentials|AccessDenied/i.test(msg)) {
      return json(503, { flow, error: "quota store unavailable", detail: msg });
    }
    return json(502, { flow, error: msg });
  }
}
