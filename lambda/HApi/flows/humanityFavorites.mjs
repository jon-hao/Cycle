/**
 * Humanity 收藏：
 *  - 影片 pk=humanity#fav#<email> sk=<videoId>
 *  - 演员 pk=humanity#actor#<email> sk=<normalizedName>
 */

import { dbGet, dbPut, dbDelete, dbQueryPk } from "../lib/db.mjs";
import { requireHumanitySession } from "./humanityAuth.mjs";
import {
  publicizeItem,
  toInternalItemId,
  toInternalSource,
} from "../lib/humanitySources.mjs";

function favPk(email) {
  return "humanity#fav#" + email;
}

function actorPk(email) {
  return "humanity#actor#" + email;
}

function normalizeActorName(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function actorSk(name) {
  return normalizeActorName(name).toLowerCase();
}

function normalizeItem(raw) {
  const pubId = String(raw.id || "").trim();
  if (!pubId) return null;
  const id = toInternalItemId(pubId);
  const internalSource =
    toInternalSource(raw.source) ||
    (id.includes(":") ? id.split(":")[0] : "") ||
    String(raw.source || "");
  return {
    id,
    source: internalSource.slice(0, 32),
    title: String(raw.title || "").slice(0, 300),
    thumb: raw.thumb ? String(raw.thumb).slice(0, 800) : null,
    preview: raw.preview ? String(raw.preview).slice(0, 800) : null,
    url: raw.url ? String(raw.url).slice(0, 800) : null,
    embed: raw.embed ? String(raw.embed).slice(0, 800) : null,
    duration: raw.duration != null ? String(raw.duration).slice(0, 32) : null,
    quality: raw.quality != null ? String(raw.quality).slice(0, 16) : null,
  };
}

export async function handleHumanityFavorites(payload) {
  const sess = await requireHumanitySession(payload);
  if (!sess.ok) return sess;

  const action = String(payload.action || "list").toLowerCase();
  const pk = favPk(sess.email);
  const apk = actorPk(sess.email);

  if (action === "list") {
    const [rows, actorRows] = await Promise.all([
      dbQueryPk(pk, { limit: 200 }),
      dbQueryPk(apk, { limit: 200 }),
    ]);
    const items = rows
      .map((r) =>
        publicizeItem({
          id: r.sk,
          source: r.source,
          title: r.title,
          thumb: r.thumb,
          preview: r.preview,
          url: r.url,
          embed: r.embed,
          duration: r.duration,
          quality: r.quality,
          savedAt: r.savedAt,
        })
      )
      .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
    const actors = actorRows
      .map((r) => ({
        id: r.sk,
        name: r.name || r.sk,
        savedAt: r.savedAt || null,
      }))
      .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
    return {
      flow: "hfav",
      ok: true,
      count: items.length,
      actorCount: actors.length,
      items,
      actors,
    };
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
    const pub = publicizeItem(item);
    return { flow: "hfav", ok: true, saved: pub.id };
  }

  if (action === "remove" || action === "delete") {
    const rawId = String((payload.item && payload.item.id) || payload.id || "").trim();
    if (!rawId) {
      return { flow: "hfav", ok: false, __status: 400, error: "id required" };
    }
    const internalId = toInternalItemId(rawId);
    await dbDelete(pk, internalId);
    if (internalId !== rawId) await dbDelete(pk, rawId).catch(() => {});
    return {
      flow: "hfav",
      ok: true,
      removed: publicizeItem({
        id: internalId,
        source: internalId.split(":")[0],
      }).id,
    };
  }

  if (action === "has") {
    const rawId = String(payload.id || "").trim();
    if (!rawId) {
      return { flow: "hfav", ok: false, __status: 400, error: "id required" };
    }
    const internalId = toInternalItemId(rawId);
    const row =
      (await dbGet(pk, internalId)) ||
      (internalId !== rawId ? await dbGet(pk, rawId) : null);
    return { flow: "hfav", ok: true, saved: !!row };
  }

  if (action === "addactor" || action === "add_actor") {
    const name = normalizeActorName(payload.name || payload.actor || "");
    if (!name) {
      return { flow: "hfav", ok: false, __status: 400, error: "name required" };
    }
    const sk = actorSk(name);
    await dbPut({
      pk: apk,
      sk,
      name,
      email: sess.email,
      app: "humanity",
      type: "actor",
      savedAt: new Date().toISOString(),
    });
    return { flow: "hfav", ok: true, actor: { id: sk, name } };
  }

  if (
    action === "removeactor" ||
    action === "remove_actor" ||
    action === "deleteactor"
  ) {
    const name = normalizeActorName(
      payload.name || payload.actor || payload.id || ""
    );
    if (!name) {
      return { flow: "hfav", ok: false, __status: 400, error: "name required" };
    }
    const sk = actorSk(name);
    await dbDelete(apk, sk);
    return { flow: "hfav", ok: true, removed: sk };
  }

  return { flow: "hfav", ok: false, __status: 400, error: "unknown action" };
}
