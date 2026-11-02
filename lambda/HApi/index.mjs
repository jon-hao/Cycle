/**
 * HApi — 账号级共用 HTTP API（Cycle / Humanity）。
 *
 * 约定：
 *   GET/POST Function URL
 *   flow = news | macro | feargreed | calendar | search | quota | catalog | health
 *        | hauth | hsearch | hfav | hplay | hrelated | hmedia
 *   app  = cycle | humanity（除 hauth 登录外，所有 flow 必须带有效会话）
 *
 * CORS 仅由 Function URL 配置注入。
 */

import { handleNews } from "./flows/news.mjs";
import { handleSearch } from "./flows/search.mjs";
import { handleAssets } from "./flows/assets.mjs";
import { handleMacro } from "./flows/macro.mjs";
import { handleFearGreed } from "./flows/feargreed.mjs";
import { handleCalendar } from "./flows/calendar.mjs";
import { handleCatalog, handleHealth } from "./flows/catalog.mjs";
import { handleHumanityAuth } from "./flows/humanityAuth.mjs";
import { handleHumanitySearch } from "./flows/humanitySearch.mjs";
import { handleHumanityFavorites } from "./flows/humanityFavorites.mjs";
import { handleHumanityPlay } from "./flows/humanityPlay.mjs";
import { handleHumanityRelated } from "./flows/humanityRelated.mjs";
import { handleHumanityMeta } from "./flows/humanityMeta.mjs";
import { handleHumanityMedia } from "./lib/humanityMedia.mjs";
import { withQuota, quotaStatus } from "./quota.mjs";
import { normalizeApp, requireAppSession } from "./lib/appAuth.mjs";

const FLOWS = {
  news: handleNews,
  new: handleNews,
  search: handleSearch,
  assets: handleAssets,
  macro: handleMacro,
  feargreed: handleFearGreed,
  calendar: handleCalendar,
  catalog: handleCatalog,
  health: handleHealth,
  quota: async () => quotaStatus(),
  hauth: handleHumanityAuth,
  cauth: handleHumanityAuth,
  hsearch: handleHumanitySearch,
  hfav: handleHumanityFavorites,
  hplay: handleHumanityPlay,
  hrelated: handleHumanityRelated,
  hmeta: handleHumanityMeta,
  hmedia: handleHumanityMedia,
};

/** 仅登录 / 改密免鉴权；check/logout 仍需 token */
const PUBLIC_FLOW_ACTIONS = {
  hauth: new Set(["login", "password", "changepassword"]),
  cauth: new Set(["login", "password", "changepassword"]),
};

function json(statusCode, obj) {
  const noStore =
    statusCode !== 200 ||
    (obj &&
      (obj.flow === "hauth" ||
        obj.flow === "cauth" ||
        obj.flow === "hfav" ||
        obj.flow === "hsearch" ||
        obj.flow === "hplay" ||
        obj.flow === "hrelated" ||
        obj.flow === "hmeta"));
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": noStore ? "no-store" : "private, no-store",
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

function inferApp(flow, payload) {
  const explicit = normalizeApp(payload.app);
  if (explicit) return explicit;
  if (flow === "hauth" || flow === "cauth") {
    return flow === "cauth" ? "cycle" : "humanity";
  }
  if (
    flow === "hsearch" ||
    flow === "hfav" ||
    flow === "hplay" ||
    flow === "hrelated" ||
    flow === "hmeta" ||
    flow === "hmedia"
  ) {
    return "humanity";
  }
  // Cycle 业务流默认 cycle
  if (
    flow === "news" ||
    flow === "new" ||
    flow === "search" ||
    flow === "assets" ||
    flow === "macro" ||
    flow === "feargreed" ||
    flow === "calendar" ||
    flow === "catalog" ||
    flow === "health" ||
    flow === "quota"
  ) {
    return "cycle";
  }
  return "";
}

function functionUrlBase(event) {
  const headers = event?.headers || {};
  const host =
    headers["x-forwarded-host"] ||
    headers["X-Forwarded-Host"] ||
    headers.host ||
    headers.Host;
  if (!host) return "";
  const proto =
    headers["x-forwarded-proto"] ||
    headers["X-Forwarded-Proto"] ||
    "https";
  return (
    String(proto).split(",")[0].trim() +
    "://" +
    String(host).split(",")[0].trim()
  );
}

function isPublicCall(flow, payload) {
  const allowed = PUBLIC_FLOW_ACTIONS[flow];
  if (!allowed) return false;
  const action = String(payload.action || "login").toLowerCase();
  return allowed.has(action);
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
  const payload = Object.assign({}, query, body);

  const flow = resolveFlow(event, payload);
  const run = FLOWS[flow];
  if (!run) {
    return json(400, {
      error: "unknown flow",
      flow: flow || null,
      hint: "POST flow=hauth action=login",
      flows: Object.keys(FLOWS).filter((k) => k !== "new"),
    });
  }

  try {
    const headers = event?.headers || {};
    const authHeader =
      headers.authorization ||
      headers.Authorization ||
      headers.AUTHORIZATION;
    if (authHeader && !payload.authorization) {
      payload.authorization = authHeader;
    }

    const app = inferApp(flow, payload);
    if (app) payload.app = app;

    if (!isPublicCall(flow, payload)) {
      if (!app) {
        return json(401, { flow, error: "app required", login: true });
      }
      const sess = await requireAppSession(payload, app);
      if (!sess.ok) {
        return json(sess.__status || 401, {
          flow,
          error: sess.error || "login required",
          login: true,
        });
      }
      payload.__session = sess;
    }

    // cauth → 强制 cycle
    if (flow === "cauth") payload.app = "cycle";

    // HLS 分片代理：不计配额，返回原始 body（可 base64）
    if (flow === "hmedia") {
      payload.__proxyBase = functionUrlBase(event);
      const raw = await run(payload);
      if (raw && raw.__raw) {
        return {
          statusCode: raw.statusCode || 200,
          headers: raw.headers || { "content-type": "application/octet-stream" },
          body: raw.body == null ? "" : raw.body,
          isBase64Encoded: !!raw.isBase64Encoded,
        };
      }
      return json(502, { flow, error: "media proxy failed" });
    }

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
    const result = gated.result || {};
    const status =
      result.__status && Number(result.__status) >= 400
        ? Number(result.__status)
        : 200;
    if (result.__status) delete result.__status;
    return json(status, result);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/SSM|Parameter|DynamoDB|credentials|AccessDenied|ResourceNotFound/i.test(msg)) {
      return json(503, { flow, error: "store unavailable", detail: msg });
    }
    return json(502, { flow, error: msg });
  }
}
