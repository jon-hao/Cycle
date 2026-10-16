export async function fetchJson(url, opts = {}) {
  const timeout = opts.timeout || 18000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: opts.headers || { accept: "application/json" },
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
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
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
