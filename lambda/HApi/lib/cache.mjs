import { dbGet, dbPut } from "./db.mjs";

export async function cacheGet(pk) {
  try {
    const item = await dbGet(pk, "cache");
    if (!item || item.payload == null) return null;
    if (item.ttl && item.ttl < Math.floor(Date.now() / 1000)) return null;
    return item.payload;
  } catch {
    return null;
  }
}

/** 允许返回已过期缓存（上游失败时兜底） */
export async function cacheGetSoft(pk) {
  try {
    const item = await dbGet(pk, "cache");
    if (!item || item.payload == null) return null;
    const expired = !!(item.ttl && item.ttl < Math.floor(Date.now() / 1000));
    return { payload: item.payload, expired };
  } catch {
    return null;
  }
}

export async function cacheSet(pk, payload, ttlSec = 300) {
  try {
    const now = Math.floor(Date.now() / 1000);
    await dbPut({
      pk,
      sk: "cache",
      payload,
      updatedAt: new Date().toISOString(),
      ttl: now + Math.max(30, ttlSec),
    });
  } catch {
    /* 缓存失败不影响主流程 */
  }
}

export function cacheKey(app, flow, parts) {
  const a = String(app || "public").toLowerCase();
  const f = String(flow || "x").toLowerCase();
  const rest = (parts || []).map((p) => String(p ?? "").replace(/#/g, "_")).join("#");
  return `cache#${a}#${f}${rest ? "#" + rest : ""}`;
}
