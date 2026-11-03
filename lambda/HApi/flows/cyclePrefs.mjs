/**
 * Cycle 用户偏好（跟账号走）
 * ?flow=cprefs&action=get|set&key=relations
 * relations → { pins: [...] }
 */

import { dbGet, dbPut } from "../lib/db.mjs";
import { requireAppSession } from "../lib/appAuth.mjs";

function prefsPk(email) {
  return "cycle#prefs#" + String(email || "").trim().toLowerCase();
}

function normalizePin(raw) {
  if (!raw || typeof raw !== "object") return null;
  const symbol = String(raw.symbol || "").trim().slice(0, 64);
  if (!symbol) return null;
  return {
    id: String(raw.id || symbol).slice(0, 64),
    symbol,
    nameZh: String(raw.nameZh || raw.name || symbol).slice(0, 120),
    nameEn: String(raw.nameEn || raw.name || symbol).slice(0, 120),
    name: String(raw.name || raw.nameZh || raw.nameEn || symbol).slice(0, 120),
    period: ["1y", "10y", "30y"].includes(raw.period) ? raw.period : "1y",
  };
}

export async function handleCyclePrefs(payload) {
  const sess =
    payload.__session && payload.__session.ok
      ? payload.__session
      : await requireAppSession(payload, "cycle");
  if (!sess || !sess.ok) return sess;

  const action = String(payload.action || "get").toLowerCase();
  const key = String(payload.key || "relations").trim().toLowerCase() || "relations";
  const pk = prefsPk(sess.email);
  const sk = key.slice(0, 64);

  if (action === "get") {
    const row = await dbGet(pk, sk);
    if (key === "relations") {
      const pins = Array.isArray(row && row.pins)
        ? row.pins.map(normalizePin).filter(Boolean)
        : [];
      return { flow: "cprefs", ok: true, key, pins, updatedAt: (row && row.updatedAt) || null };
    }
    return {
      flow: "cprefs",
      ok: true,
      key,
      value: row && row.value != null ? row.value : null,
      updatedAt: (row && row.updatedAt) || null,
    };
  }

  if (action === "set") {
    const updatedAt = new Date().toISOString();
    if (key === "relations") {
      const pins = (Array.isArray(payload.pins) ? payload.pins : [])
        .map(normalizePin)
        .filter(Boolean)
        .slice(0, 40);
      await dbPut({
        pk,
        sk,
        app: "cycle",
        email: sess.email,
        key,
        pins,
        updatedAt,
      });
      return { flow: "cprefs", ok: true, key, pins, updatedAt };
    }
    await dbPut({
      pk,
      sk,
      app: "cycle",
      email: sess.email,
      key,
      value: payload.value == null ? null : payload.value,
      updatedAt,
    });
    return { flow: "cprefs", ok: true, key, updatedAt };
  }

  return { flow: "cprefs", ok: false, __status: 400, error: "unknown action" };
}
