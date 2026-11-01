/**
 * MissAV / surrit HLS 同源代理：Chrome 指纹拉取 + 改写 playlist，绕过 CF/CORS。
 */

import { Impit } from "impit";
import { srcMissavSite } from "./sources.mjs";

const ALLOW_HOSTS = new Set(["surrit.com", "www.surrit.com", "fourhoi.com", "www.fourhoi.com"]);

let impitClient = null;

function client() {
  if (!impitClient) {
    const proxyUrl =
      process.env.MISSAV_PROXY ||
      process.env.SRC_MISSAV_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      undefined;
    impitClient = new Impit({
      browser: "chrome",
      ...(proxyUrl ? { proxyUrl } : {}),
    });
  }
  return impitClient;
}

function missavOrigin() {
  try {
    return new URL(srcMissavSite()).origin;
  } catch (_) {
    return "https://missav.live";
  }
}

function isAllowedUpstream(raw) {
  try {
    const u = new URL(String(raw || ""));
    if (u.protocol !== "https:") return false;
    return ALLOW_HOSTS.has(u.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

function proxyBaseFromPayload(payload) {
  const explicit = String(payload && payload.__proxyBase ? payload.__proxyBase : "").replace(
    /\/$/,
    ""
  );
  if (explicit) return explicit;
  return "";
}

function buildProxyUrl(base, token, upstream) {
  const q = new URLSearchParams({
    flow: "hmedia",
    app: "humanity",
    u: upstream,
  });
  if (token) q.set("token", token);
  return base + "?" + q.toString();
}

function rewriteM3u8(text, playlistUrl, base, token) {
  const lines = String(text || "").split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        // EXT-X-KEY / MAP URI=
        if (/URI="/i.test(line)) {
          return line.replace(/URI="([^"]+)"/gi, (_, uri) => {
            try {
              const abs = new URL(uri, playlistUrl).href;
              if (!isAllowedUpstream(abs)) return 'URI="' + uri + '"';
              return 'URI="' + buildProxyUrl(base, token, abs) + '"';
            } catch (_) {
              return 'URI="' + uri + '"';
            }
          });
        }
        return line;
      }
      try {
        const abs = new URL(trimmed, playlistUrl).href;
        if (!isAllowedUpstream(abs)) return line;
        return buildProxyUrl(base, token, abs);
      } catch (_) {
        return line;
      }
    })
    .join("\n");
}

function contentTypeFor(url, fallback) {
  if (/\.m3u8(\?|#|$)/i.test(url)) {
    return "application/vnd.apple.mpegurl";
  }
  if (/\.(ts|m4s|mp4)(\?|#|$)/i.test(url)) return "video/mp2t";
  if (/\.jpe?g(\?|#|$)/i.test(url)) return fallback || "application/octet-stream";
  if (/\.png(\?|#|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|#|$)/i.test(url)) return "image/webp";
  if (/\.mp4(\?|#|$)/i.test(url)) return "video/mp4";
  return fallback || "application/octet-stream";
}

/**
 * @returns {{ __raw: true, statusCode: number, headers: object, body: string, isBase64Encoded?: boolean }}
 */
export async function handleHumanityMedia(payload) {
  const upstream = String(payload.u || payload.url || "").trim();
  if (!isAllowedUpstream(upstream)) {
    return {
      __raw: true,
      statusCode: 400,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      body: "invalid upstream",
    };
  }

  const base = proxyBaseFromPayload(payload);
  if (!base) {
    return {
      __raw: true,
      statusCode: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      body: "proxy base missing",
    };
  }

  const origin = missavOrigin();
  const token = String(payload.token || "").trim();
  const isPlaylist = /\.m3u8(\?|#|$)/i.test(upstream);

  try {
    const res = await client().fetch(upstream, {
      headers: {
        accept: isPlaylist
          ? "application/vnd.apple.mpegurl,application/x-mpegURL,*/*"
          : "*/*",
        referer: origin + "/",
        origin: origin,
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      return {
        __raw: true,
        statusCode: res.status || 502,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        body: "upstream " + res.status,
      };
    }

    const upstreamCt = res.headers.get("content-type") || "";
    if (isPlaylist) {
      const text = await res.text();
      if (!text.includes("#EXTM3U")) {
        return {
          __raw: true,
          statusCode: 502,
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
          body: "invalid playlist",
        };
      }
      const rewritten = rewriteM3u8(text, upstream, base, token);
      return {
        __raw: true,
        statusCode: 200,
        headers: {
          "content-type": "application/vnd.apple.mpegurl",
          "cache-control": "private, max-age=30",
          "access-control-allow-origin": "*",
        },
        body: rewritten,
      };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    // surrit 分片伪装成 jpeg，实际是 MPEG-TS
    let ct = contentTypeFor(upstream, upstreamCt);
    if (buf.length >= 1 && buf[0] === 0x47) ct = "video/mp2t";
    return {
      __raw: true,
      statusCode: 200,
      headers: {
        "content-type": ct,
        "cache-control": "private, max-age=120",
        "access-control-allow-origin": "*",
      },
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      __raw: true,
      statusCode: 502,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      body: String((err && err.message) || err),
    };
  }
}

export function mediaProxyUrl(apiBase, token, upstream) {
  return buildProxyUrl(String(apiBase || "").replace(/\/$/, ""), token, upstream);
}
