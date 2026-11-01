/**
 * 解析可直链播放地址（优先 <video>），失败则返回可用 embed。
 * 源站基址来自 Lambda Env。
 */

import { fetchText } from "../lib/http.mjs";
import { requireHumanitySession } from "./humanityAuth.mjs";
import {
  srcEpornerSite,
  srcPornhubSite,
  srcXvideosSite,
} from "../lib/sources.mjs";

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

async function resolveXvideos(page) {
  const html = await fetchText(page, {
    timeout: 18000,
    headers: { ...UA, accept: "text/html", referer: srcXvideosSite() + "/" },
  });
  const high = (html.match(/setVideoUrlHigh\('([^']+)'\)/) || [])[1];
  const low = (html.match(/setVideoUrlLow\('([^']+)'\)/) || [])[1];
  const hls = (html.match(/setVideoHLS\('([^']+)'\)/) || [])[1];
  const stream = high || low || null;
  return {
    stream,
    hls: hls || null,
    embed: xvEmbedFromPage(page),
  };
}

async function resolvePornhub(page) {
  const html = await fetchText(page, {
    timeout: 18000,
    headers: { ...UA, accept: "text/html", referer: srcPornhubSite() + "/" },
  });
  let stream = null;
  const defs = html.match(/mediaDefinitions\s*[:=]\s*(\[[\s\S]*?\])\s*[,;]/);
  if (defs) {
    try {
      const arr = JSON.parse(defs[1]);
      const mp4 = (arr || [])
        .filter((x) => x && x.videoUrl && /mp4/i.test(String(x.format || x.videoUrl)))
        .sort(
          (a, b) =>
            Number(b.quality || b.height || 0) - Number(a.quality || a.height || 0)
        );
      if (mp4.length) stream = mp4[0].videoUrl;
      if (!stream) {
        const any = (arr || []).find((x) => x && x.videoUrl);
        if (any) stream = any.videoUrl;
      }
    } catch (_) {}
  }
  if (!stream) {
    stream =
      (html.match(/"videoUrl"\s*:\s*"(https:[^"]+\.mp4[^"]*)"/i) || [])[1] || null;
    if (stream) stream = stream.replace(/\\u0026/g, "&").replace(/\\+/g, "");
  }
  return {
    stream,
    hls: null,
    embed: phEmbedFromPage(page),
  };
}

async function resolveEporner(page, embed) {
  const target = embed || epEmbedFromPage(page) || page;
  try {
    const html = await fetchText(target, {
      timeout: 15000,
      headers: { ...UA, accept: "text/html", referer: srcEpornerSite() + "/" },
    });
    const stream =
      (html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/i) || [])[0] || null;
    return { stream, hls: null, embed: target };
  } catch (_) {
    return { stream: null, hls: null, embed: target };
  }
}

export async function handleHumanityPlay(payload) {
  const sess = await requireHumanitySession(payload);
  if (!sess.ok) return sess;

  const page = pick(payload.page, payload.url);
  const embedIn = pick(payload.embed);
  const source = String(
    payload.source || guessSource(page) || guessSource(embedIn) || ""
  ).toLowerCase();

  if (!page && !embedIn) {
    return { flow: "hplay", ok: false, __status: 400, error: "page or embed required" };
  }

  try {
    let resolved = { stream: null, hls: null, embed: embedIn || null };
    if (source === "xvideos" || /xvideos/i.test(page + embedIn)) {
      if (page) resolved = await resolveXvideos(page);
      else resolved.embed = embedIn;
    } else if (source === "pornhub" || /pornhub/i.test(page + embedIn)) {
      if (page) resolved = await resolvePornhub(page);
      else resolved.embed = embedIn;
    } else if (source === "eporner" || /eporner/i.test(page + embedIn)) {
      resolved = await resolveEporner(page, embedIn);
    } else if (page) {
      // 未知源：尽量纠正 embed
      resolved.embed =
        embedIn || xvEmbedFromPage(page) || phEmbedFromPage(page) || epEmbedFromPage(page);
    }

    if (!resolved.embed && embedIn) resolved.embed = embedIn;

    return {
      flow: "hplay",
      ok: true,
      app: "humanity",
      source: source || null,
      page: page || null,
      stream: resolved.stream || null,
      hls: resolved.hls || null,
      embed: resolved.embed || null,
    };
  } catch (e) {
    return {
      flow: "hplay",
      ok: true,
      app: "humanity",
      source: source || null,
      page: page || null,
      stream: null,
      hls: null,
      embed: embedIn || xvEmbedFromPage(page) || phEmbedFromPage(page) || null,
      warning: String(e && e.message ? e.message : e),
    };
  }
}
