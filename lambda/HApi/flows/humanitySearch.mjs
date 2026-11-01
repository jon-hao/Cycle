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

function clean(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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

async function searchEporner(q, page) {
  const searchBase = srcEpornerSearch();
  const site = srcEpornerSite();
  const url =
    searchBase +
    (searchBase.includes("?") ? "&" : "?") +
    new URLSearchParams({
      query: q,
      per_page: "24",
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
    const thumb =
      v.default_thumb && v.default_thumb.src ? v.default_thumb.src : v.thumb || null;
    let preview = null;
    if (Array.isArray(v.thumbs) && v.thumbs.length) {
      const last = v.thumbs[v.thumbs.length - 1];
      preview = last && last.src ? last.src : null;
    }
    return {
      id: "eporner:" + id,
      source: "eporner",
      title: clean(v.title),
      thumb,
      preview: preview || thumb,
      url: pageUrl,
      embed: pageUrl ? String(pageUrl).replace(/\/?$/, "/") + "embed/" : null,
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
  const re =
    /data-video-id="(\d+)"[\s\S]*?(?:data-mediumthumb|data-image)="([^"]+)"[\s\S]*?(?:data-mediabook="([^"]*)")?[\s\S]*?(?:alt="([^"]*)"|class="title"[^>]*>[\s\S]*?title="([^"]*)")/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) && out.length < 24) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const thumb = clean(m[2]);
    const preview = clean(m[3]) || null;
    const title = clean(m[4] || m[5] || "Pornhub video");
    out.push({
      id: "pornhub:" + id,
      source: "pornhub",
      title,
      thumb,
      preview: preview || thumb,
      url: joinUrl(site, "/view_video.php?viewkey=" + id),
      embed: joinUrl(site, "/embed/" + id),
      duration: null,
      views: null,
    });
  }
  if (!out.length) {
    const loose =
      /href="(\/view_video\.php\?viewkey=([a-zA-Z0-9]+))"[^>]*>[\s\S]{0,400}?src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
    while ((m = loose.exec(html)) && out.length < 24) {
      const id = m[2];
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id: "pornhub:" + id,
        source: "pornhub",
        title: "Pornhub " + id,
        thumb: clean(m[3]),
        preview: clean(m[3]),
        url: joinUrl(site, m[1]),
        embed: joinUrl(site, "/embed/" + id),
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
  const blockRe =
    /id="video_(\d+)"[\s\S]*?href="(\/video\.[^"]+\/[^"]+)"[\s\S]*?(?:data-src|src)="(https:\/\/[^"]+)"[\s\S]{0,600}?(?:data-previewvideo="([^"]*)")?[\s\S]{0,400}?title="([^"]*)"/gi;
  let m;
  while ((m = blockRe.exec(html)) && out.length < 24) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const path = m[2];
    const thumb = clean(m[3]);
    const preview = clean(m[4]) || null;
    const title = clean(m[5]);
    out.push({
      id: "xvideos:" + id,
      source: "xvideos",
      title,
      thumb,
      preview: preview || thumb,
      url: joinUrl(site, path),
      embed: joinUrl(site, "/embedframe/" + id),
      duration: null,
      views: null,
    });
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

  return {
    flow: "hsearch",
    ok: true,
    app: "humanity",
    q,
    source,
    page,
    count: items.length,
    items,
    errors: Object.keys(errors).length ? errors : null,
  };
}
