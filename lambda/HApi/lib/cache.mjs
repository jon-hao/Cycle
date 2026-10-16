/**
 * HApi 共享表缓存约定：
 *
 *   pk = cache#src#{flow}[#parts...]     — 上游源数据，全应用共用（新闻/宏观/日历等）
 *   pk = cache#app#{app}#{flow}[#parts]  — 仅应用私有状态（极少用）
 *   sk = cache
 *
 * 字段：
 *   payload     业务体
 *   freshUntil  新鲜截止（epoch 秒）— 未过期可直接命中，避免打上游
 *   ttl         DynamoDB TTL（epoch 秒）— 软过期兜底窗口结束后删除，控表体积
 *   updatedAt   ISO
 *
 * 多应用共用同一张表时：能共享的源数据一律走 cache#src#，勿按 app 复制。
 */

import { dbGet, dbPut } from "./db.mjs";

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/** 上游源缓存键（跨 app 共用） */
export function sourceCacheKey(flow, parts) {
  const f = String(flow || "x").toLowerCase();
  const rest = (parts || [])
    .map((p) => String(p ?? "").replace(/#/g, "_"))
    .join("#");
  return `cache#src#${f}${rest ? "#" + rest : ""}`;
}

/** 应用私有缓存键 */
export function appCacheKey(app, flow, parts) {
  const a = String(app || "public").toLowerCase();
  const f = String(flow || "x").toLowerCase();
  const rest = (parts || [])
    .map((p) => String(p ?? "").replace(/#/g, "_"))
    .join("#");
  return `cache#app#${a}#${f}${rest ? "#" + rest : ""}`;
}

/** @deprecated 旧键；新代码请用 sourceCacheKey / appCacheKey */
export function cacheKey(app, flow, parts) {
  return appCacheKey(app, flow, parts);
}

/**
 * @returns {Promise<{
 *   payload: unknown,
 *   fresh: boolean,
 *   soft: boolean,
 *   ageSec: number,
 *   updatedAt: string|null,
 *   freshUntil: number|null,
 *   ttl: number|null
 * }|null>}
 */
export async function cacheRead(pk, sk = "cache") {
  try {
    const item = await dbGet(pk, sk);
    if (!item || item.payload == null) return null;
    const now = nowSec();
    if (item.ttl != null && Number(item.ttl) < now) return null;

    const freshUntil =
      item.freshUntil != null ? Number(item.freshUntil) : null;
    // 旧数据无 freshUntil：整段 ttl 视为新鲜窗口
    const fresh =
      freshUntil != null ? now < freshUntil : true;
    const updatedAt = item.updatedAt || null;
    let ageSec = 0;
    if (updatedAt) {
      const t = Date.parse(updatedAt);
      if (!Number.isNaN(t)) ageSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    }

    return {
      payload: item.payload,
      fresh,
      soft: !fresh,
      ageSec,
      updatedAt,
      freshUntil,
      ttl: item.ttl != null ? Number(item.ttl) : null,
    };
  } catch {
    return null;
  }
}

/** 仅返回仍在新鲜窗口内的 payload */
export async function cacheGet(pk) {
  const meta = await cacheRead(pk);
  if (!meta || !meta.fresh) return null;
  return meta.payload;
}

/** 新鲜或软过期均可；用于上游失败兜底 */
export async function cacheGetSoft(pk) {
  const meta = await cacheRead(pk);
  if (!meta) return null;
  return {
    payload: meta.payload,
    expired: !meta.fresh,
    ageSec: meta.ageSec,
    updatedAt: meta.updatedAt,
  };
}

/**
 * @param {string} pk
 * @param {unknown} payload
 * @param {number|{freshSec?: number, softSec?: number, sk?: string}} ttlOrOpts
 *   - number：兼容旧调用，freshSec = softSec = ttlSec
 *   - object：freshSec 新鲜窗口；softSec 表内保留/软兜底（写入 DynamoDB ttl）
 */
export async function cacheSet(pk, payload, ttlOrOpts = 300) {
  try {
    const opts =
      typeof ttlOrOpts === "number"
        ? { freshSec: ttlOrOpts, softSec: ttlOrOpts }
        : ttlOrOpts || {};
    const freshSec = Math.max(5, Number(opts.freshSec) || 300);
    const softSec = Math.max(freshSec, Number(opts.softSec) || freshSec);
    const sk = opts.sk || "cache";
    const now = nowSec();
    await dbPut({
      pk,
      sk,
      kind: "cache",
      payload,
      updatedAt: new Date().toISOString(),
      freshUntil: now + freshSec,
      ttl: now + softSec,
    });
  } catch {
    /* 缓存失败不影响主流程 */
  }
}
