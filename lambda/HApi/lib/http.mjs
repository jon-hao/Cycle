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
  } catch (_) {
    if (opts.method && opts.method !== "GET") throw _;
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
