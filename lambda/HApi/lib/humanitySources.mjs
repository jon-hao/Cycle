/**
 * Humanity 对外频道代号（前端不得硬编码源站名）。
 * 内部名仅存 Lambda；对外 value/label 由 hmeta / hsearch 下发。
 */

const CHANNELS = [
  { internal: "pornhub", value: "ch1", label: "Pornhub" },
  { internal: "xvideos", value: "ch2", label: "XVideos" },
  { internal: "eporner", value: "ch3", label: "Eporner" },
];

const byInternal = Object.fromEntries(CHANNELS.map((c) => [c.internal, c]));
const byPublic = Object.fromEntries(CHANNELS.map((c) => [c.value, c]));

export function listPublicSources() {
  return [
    { value: "all", label: "All sources" },
    ...CHANNELS.map((c) => ({ value: c.value, label: c.label })),
  ];
}

/** 前端传来的 source（all|ch1|…|兼容旧 internal 名）→ 内部名 */
export function toInternalSource(pub) {
  const s = String(pub || "all").toLowerCase();
  if (!s || s === "all") return "all";
  if (byPublic[s]) return byPublic[s].internal;
  if (byInternal[s]) return s;
  return "";
}

export function toPublicChannel(internal) {
  const c = byInternal[String(internal || "").toLowerCase()];
  return c ? { value: c.value, label: c.label } : { value: "ch0", label: "Channel" };
}

/** 将单条结果的 source / id 改为对外形态 */
export function publicizeItem(item) {
  if (!item || typeof item !== "object") return item;
  const raw = String(item.source || "");
  const ch = toPublicChannel(raw);
  let id = String(item.id || "");
  // pornhub:xxx → ch1:xxx（兼容已存收藏）
  const m = id.match(/^([a-z0-9]+):(.+)$/i);
  if (m && byInternal[m[1].toLowerCase()]) {
    id = ch.value + ":" + m[2];
  } else if (m && byPublic[m[1].toLowerCase()]) {
    id = m[1].toLowerCase() + ":" + m[2];
  }
  return Object.assign({}, item, {
    id,
    source: ch.value,
    sourceLabel: ch.label,
  });
}

/** 收藏/播放：对外 id → 内部 id */
export function toInternalItemId(pubId) {
  const id = String(pubId || "");
  const m = id.match(/^([a-z0-9]+):(.+)$/i);
  if (!m) return id;
  const head = m[1].toLowerCase();
  if (byPublic[head]) return byPublic[head].internal + ":" + m[2];
  return id;
}

export function publicizeErrorMap(errors) {
  if (!errors || typeof errors !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(errors)) {
    const ch = toPublicChannel(k);
    out[ch.value] = v;
  }
  return Object.keys(out).length ? out : null;
}
