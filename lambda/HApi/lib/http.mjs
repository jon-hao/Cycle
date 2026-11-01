export async function fetchJson(url, opts = {}) {
  const timeout = opts.timeout || 18000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: opts.headers || { accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, opts = {}) {
  const timeout = opts.timeout || 18000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: opts.headers || {},
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** 更像浏览器的 HTML 请求（MissAV 等对裸 UA 易 403） */
export async function fetchTextBrowser(url, opts = {}) {
  const referer = opts.referer || undefined;
  const headers = Object.assign(
    {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "upgrade-insecure-requests": "1",
      "sec-ch-ua":
        '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": referer ? "same-origin" : "none",
      "sec-fetch-user": "?1",
    },
    opts.headers || {}
  );
  if (referer) headers.referer = referer;
  return fetchText(url, { ...opts, headers });
}

/** Follow redirects; return final URL (useful for CDN dload links). */
export async function fetchFinalUrl(url, opts = {}) {
  const timeout = opts.timeout || 12000;
  const headers = opts.headers || {};
  async function once(method) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        headers,
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      // drain tiny body for GET so connection can close
      if (method === "GET") {
        try {
          await res.arrayBuffer();
        } catch (_) {}
      }
      return res.url || url;
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    return await once(opts.method || "HEAD");
  } catch (err) {
    if (opts.noGetFallback || opts.method === "GET") throw err;
    return await once("GET");
  }
}

export function last(pts) {
  return pts && pts.length ? pts[pts.length - 1].v : null;
}

export function toPoints(obs) {
  if (!Array.isArray(obs)) return null;
  const pts = obs
    .filter((o) => o && o.value != null && o.value !== "." && !Number.isNaN(Number(o.value)))
    .map((o) => ({ d: String(o.date).slice(0, 7), v: Number(o.value) }));
  return pts.length ? pts : null;
}
