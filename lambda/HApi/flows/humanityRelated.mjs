/**
 * 解析播放页「相关推荐」列表。
 */

import { fetchText } from "../lib/http.mjs";
import { requireHumanitySession } from "./humanityAuth.mjs";
import {
  srcEpornerSite,
  srcPornhubSite,
  srcXvideosSite,
} from "../lib/sources.mjs";
import {
  toInternalSource,
  publicizeItem,
  toPublicChannel,
} from "../lib/humanitySources.mjs";

const UA = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

const LIMIT = 24;

function pick(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

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

function normalizeThumb(url) {
  let u = clean(url);
  if (!u || /^javascript:/i.test(u) || u === "(null)" || u === "null") return null;
  if (u.startsWith("//")) u = "https:" + u;
  if (/^http:\/\//i.test(u)) u = "https://" + u.slice(7);
  if (/THUMBNUM/i.test(u)) u = u.replace(/THUMBNUM/gi, "16");
  if (!/^https:\/\//i.test(u)) return null;
  return u;
}

function formatDuration(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v).trim())) {
    const sec = Math.floor(Number(v));
    if (!Number.isFinite(sec) || sec < 0) return null;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }
    return m + ":" + String(s).padStart(2, "0");
  }
  const str = clean(v);
  const minOnly = str.match(/^(\d+)\s*mins?$/i);
  if (minOnly) return Number(minOnly[1]) + ":00";
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) return str;
  return str || null;
}

function normalizeQuality(raw) {
  if (raw == null || raw === "") return null;
  const s = clean(String(raw));
  if (!s) return null;
  if (/4k|uhd|2160/i.test(s)) return "4K";
  const m = s.match(/(\d{3,4})\s*p?/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 2160) return "4K";
    if (n >= 144) return n + "p";
  }
  if (/^hd$/i.test(s)) return "HD";
  if (/^sd$/i.test(s)) return "SD";
  return null;
}

function guessSource(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("xvideos")) return "xvideos";
  if (u.includes("pornhub")) return "pornhub";
  if (u.includes("eporner")) return "eporner";
  return "";
}

function extractJsonArrayAfter(html, key) {
  const idx = String(html || "").indexOf(key);
  if (idx < 0) return null;
  const from = html.indexOf("[", idx);
  if (from < 0) return null;
  let depth = 0;
  const max = Math.min(html.length, from + 800000);
  for (let i = from; i < max; i++) {
    const ch = html[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(from, i + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}

function parsePornhubRelated(html, site) {
  const out = [];
  const seen = new Set();
  const block =
    (html.match(
      /id="relatedVideosListing"([\s\S]*?)(?:id="loadMoreRelated|<\/ul>)/i
    ) || [])[1] || "";
  const re = /<li\b([^>]*data-video-vkey="([a-zA-Z0-9]+)"[^>]*)>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(block || html)) && out.length < LIMIT) {
    const vkey = m[2];
    const body = m[3] || "";
    if (!vkey || seen.has(vkey)) continue;
    seen.add(vkey);
    const thumb = normalizeThumb(
      (body.match(
        /(https:\/\/ei\.phncdn\.com\/[^"'\s]+?\.(?:jpg|jpeg|png|webp)[^"'\s]*)/i
      ) ||
        body.match(/data-(?:mediumthumb|image)="([^"]*)"/) ||
        body.match(
          /(?:data-src|src)="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/
        ) ||
        [])[1]
    );
    const title = clean(
      (body.match(/\stitle="([^"]*)"/) || body.match(/alt="([^"]*)"/) || [])[1] ||
        ""
    );
    if (!thumb && !title) continue;
    const duration = formatDuration(
      (body.match(/class="duration"[^>]*>([^<]+)/i) || [])[1]
    );
    out.push({
      id: "pornhub:" + vkey,
      source: "pornhub",
      title: title || "Video",
      thumb,
      preview: thumb,
      url: joinUrl(site, "/view_video.php?viewkey=" + vkey),
      embed: joinUrl(site, "/embed/" + vkey),
      duration,
      quality: null,
    });
  }
  return out;
}

function parseXvideosRelated(html, site) {
  const out = [];
  const seen = new Set();
  const arr = extractJsonArrayAfter(html, "video_related") || [];
  for (const row of arr) {
    if (out.length >= LIMIT) break;
    if (!row || typeof row !== "object") continue;
    const path = String(row.u || "");
    const eid =
      clean(row.eid) ||
      (path.match(/\/video\.([a-z0-9]+)/i) || [])[1] ||
      "";
    if (!eid || seen.has(eid) || !path) continue;
    seen.add(eid);
    const thumb = normalizeThumb(row.i || row.ip || null);
    const title = clean(row.tf || row.t || "");
    out.push({
      id: "xvideos:" + eid,
      source: "xvideos",
      title: title || "XVideos " + eid,
      thumb,
      preview: thumb,
      url: joinUrl(site, path),
      embed: joinUrl(site, "/embedframe/" + eid),
      duration: formatDuration(row.d),
      quality: normalizeQuality(row.h ? "HD" : row.hp ? null : null),
    });
  }
  return out;
}

function parseEpornerRelated(html, site) {
  const out = [];
  const seen = new Set();
  const idx = html.indexOf('id="relateddiv"');
  const chunk =
    idx >= 0
      ? html.slice(idx, idx + 80000)
      : html;
  const re =
    /href="(\/video-([A-Za-z0-9]+)\/[^"]+)"[\s\S]{0,900}?data-src="(https:\/\/[^"]+)"[\s\S]{0,500}?(?:alt="([^"]*)"|<a[^>]*>([^<]+)<\/a>)/gi;
  let m;
  while ((m = re.exec(chunk)) && out.length < LIMIT) {
    const path = m[1];
    const id = m[2];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const thumb = normalizeThumb(m[3]);
    const title = clean(m[4] || m[5] || "");
    const around = chunk.slice(Math.max(0, m.index - 50), m.index + 1200);
    const duration = formatDuration(
      (around.match(/class="mbtim"[^>]*>([^<]+)/i) || [])[1]
    );
    const quality = normalizeQuality(
      (around.match(/class="mvhdico"[^>]*>[\s\S]*?<span>([^<]+)/i) || [])[1]
    );
    out.push({
      id: "eporner:" + id,
      source: "eporner",
      title: title || "Video " + id,
      thumb,
      preview: thumb,
      url: joinUrl(site, path),
      embed: joinUrl(site, "/embed/" + id + "/"),
      duration,
      quality,
    });
  }
  return out;
}

export async function handleHumanityRelated(payload) {
  const sess = await requireHumanitySession(payload);
  if (!sess.ok) return sess;

  const page = pick(payload.page, payload.url);
  const source =
    toInternalSource(payload.source) || guessSource(page) || "";
  if (!page) {
    return {
      flow: "hrelated",
      ok: false,
      __status: 400,
      error: "page required",
    };
  }

  const pub = source ? toPublicChannel(source) : { value: null, label: null };

  try {
    let items = [];
    if (source === "xvideos" || /xvideos/i.test(page)) {
      const html = await fetchText(page, {
        timeout: 18000,
        headers: { ...UA, accept: "text/html", referer: srcXvideosSite() + "/" },
      });
      items = parseXvideosRelated(html, srcXvideosSite());
    } else if (source === "pornhub" || /pornhub/i.test(page)) {
      const html = await fetchText(page, {
        timeout: 18000,
        headers: { ...UA, accept: "text/html", referer: srcPornhubSite() + "/" },
      });
      items = parsePornhubRelated(html, srcPornhubSite());
    } else if (source === "eporner" || /eporner/i.test(page)) {
      const html = await fetchText(page, {
        timeout: 18000,
        headers: { ...UA, accept: "text/html", referer: srcEpornerSite() + "/" },
      });
      items = parseEpornerRelated(html, srcEpornerSite());
    }

    return {
      flow: "hrelated",
      ok: true,
      app: "humanity",
      source: pub.value,
      sourceLabel: pub.label,
      count: items.length,
      items: items.map(publicizeItem),
    };
  } catch (e) {
    return {
      flow: "hrelated",
      ok: false,
      __status: 502,
      error: String(e && e.message ? e.message : e),
      items: [],
    };
  }
}
