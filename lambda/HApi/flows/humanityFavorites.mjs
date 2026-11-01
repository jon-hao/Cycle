/**
 * Humanity 收藏：DynamoDB pk=humanity#fav#<email> sk=<videoId>
 */

import { dbGet, dbPut, dbDelete, dbQueryPk } from "../lib/db.mjs";
import { requireHumanitySession } from "./humanityAuth.mjs";

function favPk(email) {
  return "humanity#fav#" + email;
}

function normalizeItem(raw) {
  const id = String(raw.id || "").trim();
  if (!id) return null;
  return {
    id,
    source: String(raw.source || "").slice(0, 32),
    title: String(raw.title || "").slice(0, 300),
    thumb: raw.thumb ? String(raw.thumb).slice(0, 800) : null,
    preview: raw.preview ? String(raw.preview).slice(0, 800) : null,
    url: raw.url ? String(raw.url).slice(0, 800) : null,
    embed: raw.embed ? String(raw.embed).slice(0, 800) : null,
    duration: raw.duration != null ? raw.duration : null,
  };
}

export async function handleHumanityFavorites(payload) {
  const sess = await requireHumanitySession(payload);
  if (!sess.ok) return sess;

  const action = String(payload.action || "list").toLowerCase();
  const pk = favPk(sess.email);

  if (action === "list") {
    const rows = await dbQueryPk(pk, { limit: 200 });
    const items = rows
      .map((r) => ({
        id: r.sk,
        source: r.source,
        title: r.title,
        thumb: r.thumb,
        preview: r.preview,
        url: r.url,
        embed: r.embed,
        duration: r.duration,
        savedAt: r.savedAt,
      }))
      .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
    return { flow: "hfav", ok: true, count: items.length, items };
  }

  if (action === "add") {
    const item = normalizeItem(payload.item || payload);
    if (!item) {
      return { flow: "hfav", ok: false, __status: 400, error: "item.id required" };
    }
    await dbPut({
      pk,
      sk: item.id,
      ...item,
      email: sess.email,
      app: "humanity",
      savedAt: new Date().toISOString(),
    });
    return { flow: "hfav", ok: true, saved: item.id };
  }

  if (action === "remove" || action === "delete") {
    const id = String((payload.item && payload.item.id) || payload.id || "").trim();
    if (!id) {
      return { flow: "hfav", ok: false, __status: 400, error: "id required" };
    }
    await dbDelete(pk, id);
    return { flow: "hfav", ok: true, removed: id };
  }

  if (action === "has") {
    const id = String(payload.id || "").trim();
    if (!id) {
      return { flow: "hfav", ok: false, __status: 400, error: "id required" };
    }
    const row = await dbGet(pk, id);
    return { flow: "hfav", ok: true, saved: !!row };
  }

  return { flow: "hfav", ok: false, __status: 400, error: "unknown action" };
}
