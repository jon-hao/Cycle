/**
 * Humanity 聚合搜索。站点基址全部来自 Lambda Env（SRC_*）。
 */

import { fetchJson, fetchText } from "../lib/http.mjs";
import { requireHumanitySession } from "./humanityAuth.mjs";
import {
  srcEpornerSearch,
  srcEpornerSite,
  srcPornhubSearch,
  srcPornhubSite,
  srcXvideosSearch,
  srcXvideosSite,
} from "../lib/sources.mjs";

const UA = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

const PAGE_SIZE = 24;

function clean(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/$/, "");
  if (!path) return b;
  if (/^https?:/i.test(path)) return path;
  return b + (path.startsWith("/") ? path : "/" + path);
}

/** 修复常见坏缩略图：http→https、PH 的 THUMBNUM 占位 */
function normalizeThumb(url) {
  let u = clean(url);
  if (!u || /^javascript:/i.test(u) || u === "(null)" || u === "null") return null;
  if (u.startsWith("//")) u = "https:" + u;
  if (/^http:\/\//i.test(u)) u = "https://" + u.slice(7);
  if (/THUMBNUM/i.test(u)) u = u.replace(/THUMBNUM/gi, "16");
  if (!/^https:\/\//i.test(u)) return null;
  return u;
}

function isMediaPreview(url) {
  return /\.(webm|mp4|gif|webp)(\?|#|$)/i.test(String(url || ""));
}

async function searchEporner(q, page) {
  const searchBase = srcEpornerSearch();
  const site = srcEpornerSite();
  const url =
    searchBase +
    (searchBase.includes("?") ? "&" : "?") +
    new URLSearchParams({
      query: q,
      per_page: String(PAGE_SIZE),
      page: String(page || 1),
      thumbsize: "big",
      order: "latest",
      gay: "0",
      lq: "0",
      format: "json",
    }).toString();
  const d = await fetchJson(url, {
    timeout: 15000,
    headers: { ...UA, accept: "application/json" },
  });
  const rows = (d && d.videos) || [];
  return rows.map((v) => {
    const id = String(v.id || v.idh || "");
    const pageUrl =
      v.url || (id ? joinUrl(site, "/video-" + id + "/") : null);
    const thumb = normalizeThumb(
      (v.default_thumb && v.default_thumb.src) || v.thumb || null
    );
    let preview = null;
    if (Array.isArray(v.thumbs) && v.thumbs.length) {
      const last = v.thumbs[v.thumbs.length - 1];
      preview = normalizeThumb(last && last.src);
    }
    const embed =
      (v.embed && String(v.embed)) ||
      (id ? joinUrl(site, "/embed/" + id + "/") : null);
    return {
      id: "eporner:" + id,
      source: "eporner",
      title: clean(v.title),
      thumb,
      preview: preview || thumb,
      url: pageUrl,
      embed,
      duration: v.length_sec || v.length_min || null,
      views: v.views || null,
    };
  });
}

async function searchPornhub(q, page) {
  const searchBase = srcPornhubSearch();
  const site = srcPornhubSite();
  const url =
    searchBase +
    (searchBase.includes("?") ? "&" : "?") +
    new URLSearchParams({
      search: q,
      page: String(page || 1),
    }).toString();
  const html = await fetchText(url, {
    timeout: 15000,
    headers: {
      ...UA,
      accept: "text/html",
      referer: site + "/",
    },
  });
  const out = [];
  const seen = new Set();
  // embed / view_video 必须用 viewkey（data-video-vkey），数字 data-video-id 会 404 Video not found
  const re =
    /data-video-id="(\d+)"[\s\S]{0,500}?data-video-vkey="([a-zA-Z0-9]+)"([\s\S]{0,3500}?)(?=data-video-id="|$)/gi;
  let m;
  while ((m = re.exec(html)) && out.length < PAGE_SIZE) {
    const vkey = m[2];
    if (!vkey || seen.has(vkey)) continue;
    const chunk = m[3] || "";
    const thumb = normalizeThumb(
      (chunk.match(/data-(?:mediumthumb|image)="([^"]*)"/) || [])[1]
    );
    const preview = normalizeThumb(
      (chunk.match(/data-mediabook="([^"]*)"/) || [])[1]
    );
    const title = clean(
      (chunk.match(/\stitle="([^"]*)"/) ||
        chunk.match(/alt="([^"]*)"/) ||
        [])[1] || "Pornhub video"
    );
    if (!thumb && !preview) continue;
    seen.add(vkey);
    out.push({
      id: "pornhub:" + vkey,
      source: "pornhub",
      title,
      thumb: thumb || preview,
      preview: preview || thumb,
      url: joinUrl(site, "/view_video.php?viewkey=" + vkey),
      embed: joinUrl(site, "/embed/" + vkey),
      duration: null,
      views: null,
    });
  }
  if (!out.length) {
    const loose =
      /href="(\/view_video\.php\?viewkey=([a-zA-Z0-9]+))"[^>]*>[\s\S]{0,500}?(?:data-src|src)="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
    while ((m = loose.exec(html)) && out.length < PAGE_SIZE) {
      const vkey = m[2];
      if (seen.has(vkey)) continue;
      seen.add(vkey);
      const thumb = normalizeThumb(m[3]);
      if (!thumb) continue;
      out.push({
        id: "pornhub:" + vkey,
        source: "pornhub",
        title: "Pornhub " + vkey,
        thumb,
        preview: thumb,
        url: joinUrl(site, m[1]),
        embed: joinUrl(site, "/embed/" + vkey),
        duration: null,
        views: null,
      });
    }
  }
  return out;
}

async function searchXvideos(q, page) {
  const searchBase = srcXvideosSearch();
  const site = srcXvideosSite();
  const sep = searchBase.includes("?") ? "&" : "?";
  const url =
    searchBase +
    sep +
    "k=" +
    encodeURIComponent(q) +
    "&p=" +
    String(Math.max(0, (page || 1) - 1));
  const html = await fetchText(url, {
    timeout: 15000,
    headers: {
      ...UA,
      accept: "text/html",
      referer: site + "/",
    },
  });
  const out = [];
  const seen = new Set();

  // 新版：id="video_<eid>" data-id="<numeric>" … data-src / data-pvv / title
  const blockRe =
    /id="video_([^"]+)"([^>]*)>([\s\S]*?)(?=id="video_|id="footer"|<\/main>|$)/gi;
  let m;
  while ((m = blockRe.exec(html)) && out.length < PAGE_SIZE) {
    const attrs = m[2] || "";
    const body = m[3] || "";
    const chunk = attrs + " " + body;
    const path = (chunk.match(/href="(\/video\.[^"]+)"/) || [])[1];
    // embedframe 必须用 encoded id（路径 /video.<eid>/…），纯数字 data-id 常 404
    const eid =
      clean(m[1]) ||
      (path && (path.match(/^\/video\.([^/]+)/) || [])[1]) ||
      "";
    if (!eid || seen.has(eid)) continue;
    if (!path) continue;
    const thumb = normalizeThumb(
      (chunk.match(/data-src="(https:\/\/[^"]+)"/) ||
        chunk.match(/data-sfwthumb="(https:\/\/[^"]+)"/) ||
        [])[1]
    );
    const preview = normalizeThumb(
      (chunk.match(/data-pvv="(https:\/\/[^"]+)"/) ||
        chunk.match(/data-previewvideo="(https:\/\/[^"]+)"/) ||
        [])[1]
    );
    const title = clean((chunk.match(/title="([^"]*)"/) || [])[1] || "");
    if (!thumb && !preview) continue;
    seen.add(eid);
    out.push({
      id: "xvideos:" + eid,
      source: "xvideos",
      title: title || "XVideos " + eid,
      thumb: thumb || preview,
      preview: preview || thumb,
      url: joinUrl(site, path),
      embed: joinUrl(site, "/embedframe/" + eid),
      duration: null,
      views: null,
    });
  }

  // 旧版兜底：纯数字 id="video_123"
  if (!out.length) {
    const legacy =
      /id="video_(\d+)"[\s\S]*?href="(\/video\.([^/"]+)\/[^"]+)"[\s\S]*?(?:data-src|src)="(https:\/\/[^"]+)"[\s\S]{0,800}?(?:data-previewvideo="([^"]*)")?[\s\S]{0,500}?title="([^"]*)"/gi;
    while ((m = legacy.exec(html)) && out.length < PAGE_SIZE) {
      const eid = m[3] || m[1];
      if (seen.has(eid)) continue;
      seen.add(eid);
      const thumb = normalizeThumb(m[4]);
      const preview = normalizeThumb(m[5]);
      if (!thumb && !preview) continue;
      out.push({
        id: "xvideos:" + eid,
        source: "xvideos",
        title: clean(m[6]) || "XVideos " + eid,
        thumb: thumb || preview,
        preview: preview || thumb,
        url: joinUrl(site, m[2]),
        embed: joinUrl(site, "/embedframe/" + eid),
        duration: null,
        views: null,
      });
    }
  }
  return out;
}

async function safe(name, fn) {
  try {
    const items = await fn();
    return { source: name, items: items || [], error: null };
  } catch (e) {
    return {
      source: name,
      items: [],
      error: String(e && e.message ? e.message : e),
    };
  }
}

export async function handleHumanitySearch(payload) {
  const sess = await requireHumanitySession(payload);
  if (!sess.ok) return sess;

  const q = String(payload.q || payload.query || "").trim();
  if (!q) {
    return { flow: "hsearch", ok: false, __status: 400, error: "q required" };
  }
  const source = String(payload.source || "all").toLowerCase();
  const page = Math.max(1, Number(payload.page) || 1);

  const jobs = [];
  if (source === "all" || source === "eporner") {
    jobs.push(safe("eporner", () => searchEporner(q, page)));
  }
  if (source === "all" || source === "pornhub") {
    jobs.push(safe("pornhub", () => searchPornhub(q, page)));
  }
  if (source === "all" || source === "xvideos") {
    jobs.push(safe("xvideos", () => searchXvideos(q, page)));
  }
  if (!jobs.length) {
    return { flow: "hsearch", ok: false, __status: 400, error: "unknown source" };
  }

  const parts = await Promise.all(jobs);
  const items = parts.flatMap((p) => p.items);
  const errors = Object.fromEntries(
    parts.filter((p) => p.error).map((p) => [p.source, p.error])
  );
  const maxPerSource = Math.max(0, ...parts.map((p) => (p.items || []).length));
  const hasMore =
    source === "all"
      ? parts.some((p) => (p.items || []).length >= PAGE_SIZE)
      : maxPerSource >= PAGE_SIZE;

  return {
    flow: "hsearch",
    ok: true,
    app: "humanity",
    q,
    source,
    page,
    pageSize: PAGE_SIZE,
    hasMore,
    count: items.length,
    items,
    errors: Object.keys(errors).length ? errors : null,
  };
}

export { isMediaPreview, normalizeThumb, PAGE_SIZE };
