/**
 * 多应用账号与会话：凭证存 DynamoDB，不再依赖 Lambda Env。
 * pk=auth#cred#<app> / sk=<email>
 * pk=<app>#session#<token> / sk=v1  ttl=1年
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { dbGet, dbPut, dbDelete } from "./db.mjs";

export const SESSION_DAYS = 365;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

export function normalizeApp(app) {
  const a = String(app || "").trim().toLowerCase();
  if (a === "humanity" || a === "cycle") return a;
  return "";
}

export function credPk(app) {
  return "auth#cred#" + normalizeApp(app);
}

export function sessionPk(app, token) {
  return normalizeApp(app) + "#session#" + token;
}

function bearer(payload) {
  const h = String(payload.authorization || payload.Authorization || "").trim();
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, "").trim();
  return String(payload.token || "").trim() || null;
}

function hashPassword(password, saltBuf) {
  return scryptSync(String(password), saltBuf, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

export function makePasswordRecord(password) {
  const salt = randomBytes(16);
  const hash = hashPassword(password, salt);
  return {
    algo: "scrypt",
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  };
}

export function verifyPassword(password, record) {
  if (!record) return false;
  // 兼容早期明文迁移字段（仅过渡）
  if (record.password != null && record.hash == null) {
    const a = Buffer.from(String(password), "utf8");
    const b = Buffer.from(String(record.password), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
  if (!record.salt || !record.hash) return false;
  const salt = Buffer.from(String(record.salt), "base64");
  const expected = Buffer.from(String(record.hash), "base64");
  const actual = hashPassword(password, salt);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function getCredential(app, email) {
  const a = normalizeApp(app);
  const em = String(email || "").trim().toLowerCase();
  if (!a || !em) return null;
  return dbGet(credPk(a), em);
}

export async function putCredential(app, email, password) {
  const a = normalizeApp(app);
  const em = String(email || "").trim().toLowerCase();
  if (!a || !em || !password) throw new Error("app/email/password required");
  const existing = await getCredential(a, em);
  const rec = makePasswordRecord(password);
  const item = {
    pk: credPk(a),
    sk: em,
    app: a,
    email: em,
    ...rec,
    updatedAt: new Date().toISOString(),
    createdAt:
      (existing && existing.createdAt) || new Date().toISOString(),
  };
  // 不写明文 password
  await dbPut(item);
  return { app: a, email: em };
}

export async function ensureCredential(app, email, password) {
  const existing = await getCredential(app, email);
  if (existing && (existing.hash || existing.password)) return existing;
  return putCredential(app, email, password);
}

export async function requireAppSession(payload, expectedApp) {
  const app = normalizeApp(expectedApp || payload.app);
  if (!app) {
    return { ok: false, __status: 401, error: "app required" };
  }
  const token = bearer(payload);
  if (!token) {
    return { ok: false, __status: 401, error: "login required" };
  }
  const row = await dbGet(sessionPk(app, token), "v1");
  if (!row || !row.email) {
    return { ok: false, __status: 401, error: "session expired" };
  }
  if (row.ttl && Number(row.ttl) * 1000 < Date.now()) {
    await dbDelete(sessionPk(app, token), "v1").catch(() => {});
    return { ok: false, __status: 401, error: "session expired" };
  }
  return { ok: true, email: row.email, token, app };
}

/** @deprecated alias */
export async function requireHumanitySession(payload) {
  return requireAppSession(payload, "humanity");
}

export async function createSession(app, email) {
  const a = normalizeApp(app);
  const em = String(email || "").trim().toLowerCase();
  const token = randomBytes(32).toString("hex");
  const ttl = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  await dbPut({
    pk: sessionPk(a, token),
    sk: "v1",
    email: em,
    app: a,
    createdAt: new Date().toISOString(),
    ttl,
  });
  return {
    token,
    email: em,
    app: a,
    expiresAt: new Date(ttl * 1000).toISOString(),
    ttl,
  };
}

export async function destroySession(app, payload) {
  const a = normalizeApp(app || payload.app);
  const token = bearer(payload);
  if (a && token) await dbDelete(sessionPk(a, token), "v1").catch(() => {});
}

export function fingerprintEmail(email) {
  return createHash("sha256").update(String(email || "").toLowerCase()).digest("hex").slice(0, 12);
}
