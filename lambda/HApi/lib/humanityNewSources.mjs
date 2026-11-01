/**
 * MissAV / XNXX / Hanime1 搜索、播放、相关推荐适配。
 */

import { fetchText, fetchTextResilient } from "./http.mjs";
import {
  srcHanimeSearch,
  srcHanimeSite,
  srcMissavSearch,
  srcMissavSite,
  srcXnxxSearch,
  srcXnxxSite,
} from "./sources.mjs";

const UA = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
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

function normalizeThumb(url) {
  let u = clean(url);
  if (!u || /^javascript:/i.test(u) || u === "(null)" || u === "null") return null;
  if (u.startsWith("//")) u = "https:" + u;
  if (/^http:\/\//i.test(u)) u = "https://" + u.slice(7);
  if (!/^https:\/\//i.test(u)) return null;
  if (/^data:/i.test(u)) return null;
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

function qualityHeight(q) {
  if (q == null) return 0;
  if (typeof q === "number" && Number.isFinite(q)) return q;
  const s = String(q);
  if (/4k|2160|uhd/i.test(s)) return 2160;
  const m = s.match(/(\d{3,4})/);
  return m ? Number(m[1]) : 0;
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

function pickHighestHlsVariant(masterUrl, masterText) {
  const lines = String(masterText || "").split(/\r?\n/);
  let best = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const res = (line.match(/RESOLUTION=(\d+)x(\d+)/i) || [])[2];
    const name = (line.match(/NAME="([^"]+)"/i) || [])[1];
    const height = Number(res) || Number((name || "").replace(/\D/g, "")) || 0;
    const next = (lines[i + 1] || "").trim();
    if (!next || next.startsWith("#")) continue;
    let url = next;
    if (!/^https?:/i.test(url)) {
      try {
        url = new URL(url, masterUrl).href;
      } catch (_) {
        continue;
      }
    }
    if (!best || height > best.height) {
      best = { url, height, name: name || height + "p" };
    }
  }
  return best;
}

function isMissavCode(code) {
  const c = String(code || "").toLowerCase();
  if (!c || !/\d/.test(c)) return false;
  if (
    /^(english-subtitle|uncensored-leak|today-hot|weekly-hot|monthly-hot|new|release|search|login|genres?|makers?|actresses?)$/i.test(
      c
    )
  ) {
    return false;
  }
  return true;
}

function missavAsset(code, kind) {
  const c = String(code || "").toLowerCase();
  if (!c) return null;
  if (kind === "preview") return "https://fourhoi.com/" + c + "/preview.mp4";
  if (kind === "cover") return "https://fourhoi.com/" + c + "/cover-n.jpg";
  return "https://fourhoi.com/" + c + "/cover-t.jpg";
}

function parseMissavCards(html, site) {
  const out = [];
  const seen = new Set();
  // 以 cover-t.jpg 为准（旧正则会先吃到 preview.mp4，导致封面全挂）
  const re =
    /https:\/\/fourhoi\.com\/([a-z0-9]+(?:-[a-z0-9]+)+)\/cover-t\.jpg/gi;
  let m;
  while ((m = re.exec(html)) && out.length < PAGE_SIZE) {
    const code = m[1];
    if (!isMissavCode(code) || seen.has(code)) continue;
    seen.add(code);
    const around = html.slice(Math.max(0, m.index - 900), m.index + 900);
    const title = clean(
      (around.match(/alt="([^"]*)"/) || [])[1] || code
    );
    const duration = formatDuration(
      (around.match(/bg-opacity-75">\s*([^<]+?)\s*</i) || [])[1]
    );
    const thumb = missavAsset(code, "thumb");
    const preview = missavAsset(code, "preview");
    out.push({
      id: "missav:" + code,
      source: "missav",
      title: title || code,
      thumb,
      preview,
      url: joinUrl(site, "/en/" + code),
      embed: null,
      duration,
      quality: null,
    });
  }
  if (out.length) return out;
  // 兜底：仅有番号链接时仍构造 fourhoi 资源
  const loose =
    /href="(?:https?:\/\/[^"]+)?\/(?:dm\d+\/)?en\/([a-z0-9]+(?:-[a-z0-9]+)+)"/gi;
  while ((m = loose.exec(html)) && out.length < PAGE_SIZE) {
    const code = m[1];
    if (!isMissavCode(code) || seen.has(code)) continue;
    seen.add(code);
    out.push({
      id: "missav:" + code,
      source: "missav",
      title: code,
      thumb: missavAsset(code, "thumb"),
      preview: missavAsset(code, "preview"),
      url: joinUrl(site, "/en/" + code),
      embed: null,
      duration: null,
      quality: null,
    });
  }
  return out;
}

export async function searchMissav(q, page) {
  const site = srcMissavSite().replace(/\/$/, "");
  const searchBase = srcMissavSearch().replace(/\/$/, "");
  const pg = Math.max(1, page || 1);
  const url =
    searchBase +
    "/" +
    encodeURIComponent(q) +
    (pg > 1 ? "?page=" + pg : "");
  const html = await fetchTextResilient(url, {
    timeout: 18000,
    referer: site + "/dm265/en",
  });
  return parseMissavCards(html, site);
}

export async function browseMissav(page) {
  const site = srcMissavSite().replace(/\/$/, "");
  const pg = Math.max(1, page || 1);
  const url =
    site +
    "/dm301/en/today-hot" +
    (pg > 1 ? "?page=" + pg : "");
  const html = await fetchTextResilient(url, {
    timeout: 18000,
    referer: site + "/dm265/en",
  });
  return parseMissavCards(html, site);
}

function missavDictsFromHtml(html) {
  const out = [];
  const re = /'(m3u8\|[^']+)'\.split\('\|'\)/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1].split("|"));
  return out;
}

function missavUuidFromWords(words) {
  const hex = (words || []).filter((w) => /^[0-9a-f]+$/i.test(w));
  const a = hex.find((w) => w.length === 8);
  const fours = hex.filter((w) => w.length === 4);
  const e = hex.find((w) => w.length === 12);
  if (a && fours.length >= 3 && e) {
    return (
      a +
      "-" +
      fours[2] +
      "-" +
      fours[1] +
      "-" +
      fours[0] +
      "-" +
      e
    ).toLowerCase();
  }
  return "";
}

function missavUuidFromHtml(html) {
  for (const words of missavDictsFromHtml(html)) {
    const uid = missavUuidFromWords(words);
    if (uid) return uid;
  }
  const seek = html.match(/surrit\.com\/([0-9a-f-]{36})/i);
  return seek ? seek[1].toLowerCase() : "";
}

function missavQualitiesFromHtml(html) {
  const fromDict = [];
  for (const words of missavDictsFromHtml(html)) {
    for (const w of words) {
      if (/^\d{3,4}p$/i.test(w)) fromDict.push(w.toLowerCase());
    }
  }
  return [
    ...new Set([...fromDict, "1080p", "720p", "480p", "360p"]),
  ];
}

export async function resolveMissav(page) {
  const site = srcMissavSite().replace(/\/$/, "");
  const html = await fetchTextResilient(page, {
    timeout: 18000,
    referer: site + "/dm265/en",
  });
  const uuid = missavUuidFromHtml(html);
  if (!uuid) {
    return { stream: null, hls: null, quality: null, embed: null };
  }
  const quals = missavQualitiesFromHtml(html)
    .map((q) => ({ q, h: qualityHeight(q) }))
    .sort((a, b) => b.h - a.h);
  // 机房 IP 常被 surrit CF 拦截；仍返回直链，由前端经 hmedia（impit）同源代理播放
  const best = quals[0];
  const q = (best && best.q) || "1080p";
  const h = (best && best.h) || qualityHeight(q);
  const label = h >= 2160 ? "4K" : h ? h + "p" : null;
  const url = "https://surrit.com/" + uuid + "/" + q + "/video.m3u8";
  const master = "https://surrit.com/" + uuid + "/playlist.m3u8";
  return {
    stream: url,
    hls: master,
    quality: label,
    embed: null,
    proxy: true,
  };
}

export function parseMissavRelated(html, site, selfCode) {
  const out = [];
  const seen = new Set([String(selfCode || "").toLowerCase()]);
  const items = parseMissavCards(html, site);
  for (const it of items) {
    const code = String(it.id || "").split(":")[1] || "";
    if (!code || seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    out.push(it);
    if (out.length >= PAGE_SIZE) break;
  }
  return out;
}

export async function relatedMissav(page) {
  const site = srcMissavSite().replace(/\/$/, "");
  const html = await fetchTextResilient(page, {
    timeout: 18000,
    referer: site + "/",
  });
  const self = ((page.match(/\/en\/([a-z0-9]+(?:-[a-z0-9]+)+)/i) || [])[1] || "");
  let items = parseMissavRelated(html, site, self);
  if (items.length < 6) {
    try {
      const more = await browseMissav(1);
      const seen = new Set(items.map((x) => x.id));
      for (const it of more) {
        if (seen.has(it.id) || it.id === "missav:" + self) continue;
        items.push(it);
        if (items.length >= PAGE_SIZE) break;
      }
    } catch (_) {}
  }
  return items;
}

function parseXnxxHtml(html, site, seen) {
  const out = [];
  const blockRe =
    /id="video_([^"]+)"([^>]*)>([\s\S]*?)(?=id="video_|id="footer"|<\/main>|$)/gi;
  let m;
  while ((m = blockRe.exec(html)) && out.length < PAGE_SIZE * 2) {
    const attrs = m[2] || "";
    const body = m[3] || "";
    const chunk = attrs + " " + body;
    const path = (chunk.match(/href="(\/video-[^"]+)"/) || [])[1];
    const eid =
      clean(m[1]) ||
      (path && (path.match(/^\/video-([^/]+)/) || [])[1]) ||
      "";
    if (!eid || seen.has(eid) || !path) continue;
    const thumb = normalizeThumb(
      (chunk.match(/data-src="(https:\/\/[^"]+)"/) ||
        chunk.match(/data-src-avif="(https:\/\/[^"]+)"/) ||
        [])[1]
    );
    const preview = normalizeThumb(
      (chunk.match(/data-pvv="(https:\/\/[^"]+)"/) ||
        chunk.match(/data-previewvideo="(https:\/\/[^"]+)"/) ||
        [])[1]
    );
    const title = clean((chunk.match(/title="([^"]*)"/) || [])[1] || "");
    if (!thumb && !preview) continue;
    const meta = (chunk.match(/<p class="metadata">([\s\S]*?)<\/p>/i) || [])[1] || "";
    const minMatch = meta.match(/(\d+)\s*min/i);
    const duration = minMatch
      ? formatDuration(Number(minMatch[1]) * 60)
      : formatDuration((meta.match(/(\d+:\d{2}(?::\d{2})?)/) || [])[1]);
    const quality = normalizeQuality((meta.match(/(\d{3,4}\s*p)/i) || [])[1]);
    seen.add(eid);
    out.push({
      id: "xnxx:" + eid,
      source: "xnxx",
      title: title || "XNXX " + eid,
      thumb: thumb || preview,
      preview: preview || thumb,
      url: joinUrl(site, path),
      embed: joinUrl(site, "/embedframe/" + eid),
      duration,
      quality,
    });
  }
  return out;
}

async function fetchXnxxList(url, site, seen, out) {
  const html = await fetchText(url, {
    timeout: 15000,
    headers: { ...UA, accept: "text/html", referer: site + "/" },
  });
  const batch = parseXnxxHtml(html, site, seen);
  for (const item of batch) {
    out.push(item);
    if (out.length >= PAGE_SIZE) break;
  }
  return batch.length;
}

export async function searchXnxx(q, page) {
  const searchBase = srcXnxxSearch().replace(/\/$/, "");
  const site = srcXnxxSite().replace(/\/$/, "");
  const out = [];
  const seen = new Set();
  const startPage = Math.max(1, page || 1);
  for (let p = startPage; p < startPage + 3 && out.length < PAGE_SIZE; p++) {
    const url =
      searchBase +
      "/" +
      encodeURIComponent(q) +
      "/" +
      String(Math.max(0, p - 1));
    const n = await fetchXnxxList(url, site, seen, out);
    if (!n && !out.length) break;
  }
  return out;
}

export async function browseXnxx(page) {
  const site = srcXnxxSite().replace(/\/$/, "");
  const out = [];
  const seen = new Set();
  const startPage = Math.max(1, page || 1);
  for (let p = startPage; p < startPage + 3 && out.length < PAGE_SIZE; p++) {
    const url = site + (p <= 1 ? "/" : "/?p=" + String(p - 1));
    const n = await fetchXnxxList(url, site, seen, out);
    if (!n && !out.length) break;
  }
  return out;
}

export async function resolveXnxx(page) {
  const site = srcXnxxSite().replace(/\/$/, "");
  const html = await fetchText(page, {
    timeout: 18000,
    headers: { ...UA, accept: "text/html", referer: site + "/" },
  });
  const high = (html.match(/setVideoUrlHigh\('([^']+)'\)/) || [])[1];
  const low = (html.match(/setVideoUrlLow\('([^']+)'\)/) || [])[1];
  const hlsMaster = (html.match(/setVideoHLS\('([^']+)'\)/) || [])[1];
  let hls = null;
  let quality = null;
  if (hlsMaster) {
    try {
      const masterText = await fetchText(hlsMaster, {
        timeout: 12000,
        headers: {
          ...UA,
          accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
          referer: site + "/",
        },
      });
      const best = pickHighestHlsVariant(hlsMaster, masterText);
      if (best) {
        hls = best.url;
        quality = best.name || best.height + "p";
      } else {
        hls = hlsMaster;
      }
    } catch (_) {
      hls = hlsMaster;
    }
  }
  const eid = (page.match(/\/video-([a-z0-9]+)/i) || [])[1];
  return {
    stream: hls || high || low || null,
    hls: hls || hlsMaster || null,
    quality: quality || (high ? "HQ" : null),
    embed: eid ? site + "/embedframe/" + eid : null,
  };
}

export function parseXnxxRelated(html, site) {
  const out = [];
  const seen = new Set();
  const arr = extractJsonArrayAfter(html, "video_related") || [];
  for (const row of arr) {
    if (out.length >= PAGE_SIZE) break;
    if (!row || typeof row !== "object") continue;
    const path = String(row.u || "");
    const eid =
      clean(row.eid) ||
      (path.match(/\/video-([a-z0-9]+)/i) || [])[1] ||
      "";
    if (!eid || seen.has(eid) || !path) continue;
    seen.add(eid);
    const thumb = normalizeThumb(row.i || row.ip || null);
    out.push({
      id: "xnxx:" + eid,
      source: "xnxx",
      title: clean(row.tf || row.t || "") || "XNXX " + eid,
      thumb,
      preview: thumb,
      url: joinUrl(site, path),
      embed: joinUrl(site, "/embedframe/" + eid),
      duration: formatDuration(row.d),
      quality: null,
    });
  }
  return out;
}

export async function relatedXnxx(page) {
  const site = srcXnxxSite().replace(/\/$/, "");
  const html = await fetchText(page, {
    timeout: 18000,
    headers: { ...UA, accept: "text/html", referer: site + "/" },
  });
  return parseXnxxRelated(html, site);
}

function parseHanimeCards(html, site) {
  const out = [];
  const seen = new Set();
  const re =
    /(?:title="([^"]*)"[^>]*class="video-item-container"|class="video-item-container"[^>]*title="([^"]*)")[\s\S]{0,1200}?href="((?:https?:\/\/[^"]+)?\/watch\?v=(\d+))"[\s\S]{0,1000}?(?:src|data-src)="(https:\/\/[^"]+)"[\s\S]{0,600}?class="duration">\s*([^<]+)/gi;
  let m;
  while ((m = re.exec(html)) && out.length < PAGE_SIZE) {
    const id = m[4];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = clean(m[1] || m[2] || "");
    out.push({
      id: "hanime1:" + id,
      source: "hanime1",
      title: title || "Hanime " + id,
      thumb: normalizeThumb(m[5]),
      preview: normalizeThumb(m[5]),
      url: joinUrl(site, "/watch?v=" + id),
      embed: null,
      duration: formatDuration(m[6]),
      quality: null,
    });
  }
  if (out.length) return out;
  const loose =
    /href="((?:https?:\/\/[^"]+)?\/watch\?v=(\d+))"[\s\S]{0,900}?(?:src|data-src)="(https:\/\/[^"]*thumbnail[^"]+)"[\s\S]{0,500}?class="duration">\s*([^<]+)/gi;
  while ((m = loose.exec(html)) && out.length < PAGE_SIZE) {
    const id = m[2];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const around = html.slice(Math.max(0, m.index - 300), m.index + 200);
    const title = clean(
      (around.match(/title="([^"]+)"/) || [])[1] || "Hanime " + id
    );
    out.push({
      id: "hanime1:" + id,
      source: "hanime1",
      title,
      thumb: normalizeThumb(m[3]),
      preview: normalizeThumb(m[3]),
      url: joinUrl(site, "/watch?v=" + id),
      embed: null,
      duration: formatDuration(m[4]),
      quality: null,
    });
  }
  return out;
}

export async function searchHanime(q, page) {
  const site = srcHanimeSite().replace(/\/$/, "");
  const searchBase = srcHanimeSearch();
  const pg = Math.max(1, page || 1);
  const url =
    searchBase +
    (searchBase.includes("?") ? "&" : "?") +
    new URLSearchParams({
      query: q,
      page: String(pg),
    }).toString();
  const html = await fetchTextResilient(url, {
    timeout: 18000,
    referer: site + "/",
  });
  return parseHanimeCards(html, site);
}

export async function browseHanime(page) {
  const site = srcHanimeSite().replace(/\/$/, "");
  const pg = Math.max(1, page || 1);
  const url = site + "/" + (pg > 1 ? "?page=" + pg : "");
  const html = await fetchTextResilient(url, {
    timeout: 18000,
    referer: site + "/",
  });
  return parseHanimeCards(html, site);
}

export async function resolveHanime(page) {
  const site = srcHanimeSite().replace(/\/$/, "");
  const html = await fetchTextResilient(page, {
    timeout: 18000,
    referer: site + "/",
  });
  const sources = [];
  const re =
    /<source[^>]+src="(https:\/\/[^"]+\.mp4[^"]*)"[^>]*(?:size="(\d+)")?[^>]*>|<source[^>]*(?:size="(\d+)")[^>]*src="(https:\/\/[^"]+\.mp4[^"]*)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = m[1] || m[4];
    const size =
      Number(m[2] || m[3]) ||
      Number((url.match(/-(\d{3,4})p\.mp4/i) || [])[1]) ||
      0;
    if (url) sources.push({ url, h: size });
  }
  if (!sources.length) {
    for (const u of html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/gi) || []) {
      if (/thumbnail|image|\.jpg/i.test(u)) continue;
      const h = Number((u.match(/-(\d{3,4})p\.mp4/i) || [])[1]) || 0;
      sources.push({ url: u, h });
    }
  }
  sources.sort((a, b) => b.h - a.h);
  if (!sources.length) {
    return { stream: null, hls: null, quality: null, embed: null };
  }
  const best = sources[0];
  return {
    stream: best.url,
    hls: null,
    quality: best.h ? best.h + "p" : null,
    embed: null,
  };
}

export function parseHanimeRelated(html, site, selfId) {
  const out = [];
  const seen = new Set([String(selfId || "")]);
  const items = parseHanimeCards(html, site);
  for (const it of items) {
    const id = String(it.id || "").split(":")[1] || "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(it);
    if (out.length >= PAGE_SIZE) break;
  }
  return out;
}

export async function relatedHanime(page) {
  const site = srcHanimeSite().replace(/\/$/, "");
  const html = await fetchTextResilient(page, {
    timeout: 18000,
    referer: site + "/",
  });
  const self = ((page.match(/[?&]v=(\d+)/) || [])[1] || "");
  return parseHanimeRelated(html, site, self);
}
