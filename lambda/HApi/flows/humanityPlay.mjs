/**
 * 解析可直链播放地址（优先 <video> 最高清），失败则返回可用 embed。
 * 源站基址来自 Lambda Env。
 */

import { fetchText, fetchFinalUrl } from "../lib/http.mjs";
import { requireHumanitySession } from "./humanityAuth.mjs";
import {
  srcEpornerSite,
  srcPornhubSite,
  srcXvideosSite,
} from "../lib/sources.mjs";
import { toInternalSource, toPublicChannel } from "../lib/humanitySources.mjs";

const UA = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

function pick(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function guessSource(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("xvideos")) return "xvideos";
  if (u.includes("pornhub")) return "pornhub";
  if (u.includes("eporner")) return "eporner";
  return "";
}

function xvEmbedFromPage(page) {
  const m = String(page || "").match(/\/video\.([a-z0-9]+)\//i);
  if (!m) return null;
  return srcXvideosSite().replace(/\/$/, "") + "/embedframe/" + m[1];
}

function phEmbedFromPage(page) {
  const m = String(page || "").match(/viewkey=([a-zA-Z0-9]+)/);
  if (!m) return null;
  return srcPornhubSite().replace(/\/$/, "") + "/embed/" + m[1];
}

function epEmbedFromPage(page) {
  const m = String(page || "").match(/\/(?:video-|embed\/|hd-porn\/)([A-Za-z0-9]+)/);
  if (!m) return null;
  return srcEpornerSite().replace(/\/$/, "") + "/embed/" + m[1] + "/";
}

function qualityHeight(q) {
  if (q == null) return 0;
  if (typeof q === "number" && Number.isFinite(q)) return q;
  if (Array.isArray(q)) return 0;
  const s = String(q);
  if (/4k|2160|uhd/i.test(s)) return 2160;
  const m = s.match(/(\d{3,4})/);
  return m ? Number(m[1]) : 0;
}

function labelQuality(h) {
  const n = Number(h) || 0;
  if (n >= 2160) return "4K";
  if (n >= 100) return n + "p";
  return null;
}

function unescapeUrl(u) {
  return String(u || "")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\+/g, "");
}

/** mediaDefinitions 等嵌套数组：用括号平衡提取，避免非贪婪正则截断 */
function extractJsonArrayAfter(html, key) {
  const idx = String(html || "").indexOf(key);
  if (idx < 0) return null;
  const from = html.indexOf("[", idx);
  if (from < 0) return null;
  let depth = 0;
  const max = Math.min(html.length, from + 500000);
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
    if (!best || height > best.height) best = { url, height, name: name || height + "p" };
  }
  return best;
}

async function resolveXvideos(page) {
  const html = await fetchText(page, {
    timeout: 18000,
    headers: { ...UA, accept: "text/html", referer: srcXvideosSite() + "/" },
  });
  const high = (html.match(/setVideoUrlHigh\('([^']+)'\)/) || [])[1];
  const low = (html.match(/setVideoUrlLow\('([^']+)'\)/) || [])[1];
  const hlsMaster = (html.match(/setVideoHLS\('([^']+)'\)/) || [])[1];

  // 渐进式 mp4 通常只有 240/360；HLS master 含 720/1080 — 默认选最高档
  let hls = null;
  let quality = null;
  if (hlsMaster) {
    try {
      const masterText = await fetchText(hlsMaster, {
        timeout: 12000,
        headers: {
          ...UA,
          accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
          referer: srcXvideosSite() + "/",
        },
      });
      const best = pickHighestHlsVariant(hlsMaster, masterText);
      if (best) {
        hls = best.url;
        quality = best.name || labelQuality(best.height);
      } else {
        hls = hlsMaster;
      }
    } catch (_) {
      hls = hlsMaster;
    }
  }

  const stream = hls || high || low || null;
  if (!quality && high) quality = "HQ";
  return {
    stream,
    hls: hls || hlsMaster || null,
    quality,
    embed: xvEmbedFromPage(page),
  };
}

async function resolvePornhub(page) {
  const html = await fetchText(page, {
    timeout: 18000,
    headers: { ...UA, accept: "text/html", referer: srcPornhubSite() + "/" },
  });
  const embed = phEmbedFromPage(page);
  const arr = extractJsonArrayAfter(html, "mediaDefinitions") || [];

  const entries = (arr || [])
    .filter((x) => x && x.videoUrl)
    .map((x) => {
      const url = unescapeUrl(x.videoUrl);
      const h =
        Number(x.height) ||
        qualityHeight(x.quality) ||
        qualityHeight(url) ||
        0;
      const fmt = String(x.format || "").toLowerCase();
      const isHls = fmt === "hls" || /\.m3u8(\?|#|$)/i.test(url);
      const isGetMedia = /\/video\/get_media\?/i.test(url);
      return { url, h, isHls, isGetMedia, raw: x };
    });

  // 1) 直接选最高清 HLS（每档已是独立 master）
  const hlsList = entries.filter((e) => e.isHls && e.url).sort((a, b) => b.h - a.h);
  if (hlsList.length) {
    const best = hlsList[0];
    return {
      stream: best.url,
      hls: best.url,
      quality: labelQuality(best.h) || "HD",
      embed,
    };
  }

  // 2) get_media → 多档 progressive mp4
  const gm = entries.find((e) => e.isGetMedia);
  if (gm) {
    try {
      const body = await fetchText(gm.url, {
        timeout: 12000,
        headers: {
          ...UA,
          accept: "application/json,*/*",
          referer: page,
        },
      });
      const list = JSON.parse(body);
      if (Array.isArray(list) && list.length) {
        const ranked = list
          .filter((x) => x && x.videoUrl)
          .map((x) => ({
            url: unescapeUrl(x.videoUrl),
            h: Number(x.height) || qualityHeight(x.quality) || 0,
          }))
          .sort((a, b) => b.h - a.h);
        if (ranked.length) {
          return {
            stream: ranked[0].url,
            hls: null,
            quality: labelQuality(ranked[0].h) || "HD",
            embed,
          };
        }
      }
    } catch (_) {}
  }

  // 3) 其它 mp4 直链
  const mp4 = entries
    .filter((e) => !e.isHls && !e.isGetMedia && /\.mp4/i.test(e.url))
    .sort((a, b) => b.h - a.h);
  if (mp4.length) {
    return {
      stream: mp4[0].url,
      hls: null,
      quality: labelQuality(mp4[0].h) || null,
      embed,
    };
  }

  const fallback =
    (html.match(/"videoUrl"\s*:\s*"(https:[^"]+\.m3u8[^"]*)"/i) ||
      html.match(/"videoUrl"\s*:\s*"(https:[^"]+\.mp4[^"]*)"/i) ||
      [])[1] || null;
  return {
    stream: fallback ? unescapeUrl(fallback) : null,
    hls: fallback && /\.m3u8/i.test(fallback) ? unescapeUrl(fallback) : null,
    quality: null,
    embed,
  };
}

async function resolveEporner(page, embed) {
  const site = srcEpornerSite().replace(/\/$/, "");
  const target = page || embed || epEmbedFromPage(page);
  const embedOut = embed || epEmbedFromPage(page) || (target && /\/embed\//i.test(target) ? target : null);

  try {
    const html = await fetchText(target || embedOut, {
      timeout: 15000,
      headers: { ...UA, accept: "text/html", referer: site + "/" },
    });

    // /dload/<id>/<quality>/... — 从高到低尝试，跳过需登录的 1080/4K
    const id =
      ((target || "").match(/\/(?:video-|embed\/|dload\/)([A-Za-z0-9]+)/) ||
        [])[1] ||
      ((html.match(/\/dload\/([A-Za-z0-9]+)\//) || [])[1] || "");
    const quals = [
      ...new Set(
        [...String(html).matchAll(/\/dload\/[A-Za-z0-9]+\/(\d{3,4})\//g)].map(
          (m) => Number(m[1])
        )
      ),
    ]
      .filter((n) => n > 0)
      .sort((a, b) => b - a);

    if (id && quals.length) {
      for (const q of quals) {
        try {
          const finalUrl = await fetchFinalUrl(site + "/dload/" + id + "/" + q + "/", {
            timeout: 10000,
            headers: { ...UA, referer: site + "/" },
          });
          if (
            finalUrl &&
            /\.mp4(\?|#|$)/i.test(finalUrl) &&
            !/\/login\//i.test(finalUrl)
          ) {
            return {
              stream: finalUrl,
              hls: null,
              quality: labelQuality(q),
              embed: embedOut || epEmbedFromPage(page),
            };
          }
        } catch (_) {}
      }
    }

    const stream =
      (html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/i) || [])[0] || null;
    return {
      stream,
      hls: null,
      quality: null,
      embed: embedOut || epEmbedFromPage(page) || target,
    };
  } catch (_) {
    return { stream: null, hls: null, quality: null, embed: embedOut || target };
  }
}

export async function handleHumanityPlay(payload) {
  const sess = await requireHumanitySession(payload);
  if (!sess.ok) return sess;

  const page = pick(payload.page, payload.url);
  const embedIn = pick(payload.embed);
  const source =
    toInternalSource(payload.source) ||
    guessSource(page) ||
    guessSource(embedIn) ||
    "";

  if (!page && !embedIn) {
    return { flow: "hplay", ok: false, __status: 400, error: "page or embed required" };
  }

  const pub = source ? toPublicChannel(source) : { value: null, label: null };

  try {
    let resolved = { stream: null, hls: null, quality: null, embed: embedIn || null };
    if (source === "xvideos" || /xvideos/i.test(page + embedIn)) {
      if (page) resolved = await resolveXvideos(page);
      else resolved.embed = embedIn;
    } else if (source === "pornhub" || /pornhub/i.test(page + embedIn)) {
      if (page) resolved = await resolvePornhub(page);
      else resolved.embed = embedIn;
    } else if (source === "eporner" || /eporner/i.test(page + embedIn)) {
      resolved = await resolveEporner(page, embedIn);
    } else if (page) {
      resolved.embed =
        embedIn || xvEmbedFromPage(page) || phEmbedFromPage(page) || epEmbedFromPage(page);
    }

    if (!resolved.embed && embedIn) resolved.embed = embedIn;

    return {
      flow: "hplay",
      ok: true,
      app: "humanity",
      source: pub.value,
      sourceLabel: pub.label,
      stream: resolved.stream || null,
      hls: resolved.hls || null,
      quality: resolved.quality || null,
      embed: resolved.embed || null,
    };
  } catch (e) {
    return {
      flow: "hplay",
      ok: true,
      app: "humanity",
      source: pub.value,
      sourceLabel: pub.label,
      stream: null,
      hls: null,
      quality: null,
      embed: embedIn || xvEmbedFromPage(page) || phEmbedFromPage(page) || null,
      warning: String(e && e.message ? e.message : e),
    };
  }
}
