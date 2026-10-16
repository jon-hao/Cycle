/**
 * HApi — 账号级共用 HTTP API（Cycle 及其他应用）。
 *
 * 约定：
 *   GET/POST Function URL
 *   flow   = news | macro | feargreed | calendar | search | quota | catalog | health
 *   app    = 租户/命名空间（影响 DynamoDB 缓存键，默认 public）
 *
 * CORS 仅由 Function URL 配置注入。
 */

import { handleNews } from "./flows/news.mjs";
import { handleSearch } from "./flows/search.mjs";
import { handleMacro } from "./flows/macro.mjs";
import { handleFearGreed } from "./flows/feargreed.mjs";
import { handleCalendar } from "./flows/calendar.mjs";
import { handleCatalog, handleHealth } from "./flows/catalog.mjs";
import { withQuota, quotaStatus } from "./quota.mjs";

const FLOWS = {
  news: handleNews,
  new: handleNews,
  search: handleSearch,
  macro: handleMacro,
  feargreed: handleFearGreed,
  calendar: handleCalendar,
  catalog: handleCatalog,
  health: handleHealth,
  quota: async () => quotaStatus(),
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": statusCode === 200 ? "public, max-age=30" : "no-store",
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

  const query = event?.queryStringParameters || {};
  const body = method === "POST" ? parseBody(event) : {};
  const payload = Object.assign({ app: "public" }, query, body);
  if (!payload.app) payload.app = "public";

  const flow = resolveFlow(event, payload);
  const run = FLOWS[flow];
  if (!run) {
    return json(400, {
      error: "unknown flow",
      flow: flow || null,
      hint: "GET ?flow=catalog",
      flows: Object.keys(FLOWS).filter((k) => k !== "new"),
    });
  }

  // catalog / health 不计入软配额重活，但仍记账（withQuota 统一）
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
    if (/SSM|Parameter|DynamoDB|credentials|AccessDenied|ResourceNotFound/i.test(msg)) {
      return json(503, { flow, error: "store unavailable", detail: msg });
    }
    return json(502, { flow, error: msg });
  }
}
