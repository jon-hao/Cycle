/**
 * Humanity 单用户登录（不支持注册）。
 * DynamoDB：pk=humanity#user / sk=<email>；pk=humanity#session#<token> / sk=v1
 * 密码只存 scrypt 哈希，仓库内无明文。
 */

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { dbGet, dbPut, dbDelete } from "../lib/db.mjs";

const APP = "humanity";
const EMAIL = "jondd4418@gmail.com";
/** 引导写入 DynamoDB 的固定哈希（对应部署时设定的单用户密码） */
const BOOT_SALT = "ea188191fbda80435cf07905cb1c0c02";
const BOOT_HASH =
  "c4b483eb79598611d87e9dc610c79030bfa0bbafcf118cb77fcd95a9a8b668436dc7b7e9c12b917d1338dbf893f5367b028dfef7986069914cf9cfa425fc0810";

const SESSION_DAYS = 365;

function userPk() {
  return APP + "#user";
}

function sessionPk(token) {
  return APP + "#session#" + token;
}

function hashPassword(password, saltHex) {
  return scryptSync(String(password), saltHex, 64).toString("hex");
}

function safeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), "hex");
    const bb = Buffer.from(String(b), "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

async function ensureUser() {
  const existing = await dbGet(userPk(), EMAIL);
  if (existing && existing.passwordHash && existing.passwordSalt) return existing;
  const item = {
    pk: userPk(),
    sk: EMAIL,
    email: EMAIL,
    passwordSalt: BOOT_SALT,
    passwordHash: BOOT_HASH,
    createdAt: new Date().toISOString(),
    app: APP,
  };
  await dbPut(item);
  return item;
}

function bearer(payload) {
  const h = String(payload.authorization || payload.Authorization || "").trim();
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, "").trim();
  return String(payload.token || "").trim() || null;
}

export async function requireHumanitySession(payload) {
  const token = bearer(payload);
  if (!token) {
    return { ok: false, __status: 401, error: "login required" };
  }
  const row = await dbGet(sessionPk(token), "v1");
  if (!row || !row.email) {
    return { ok: false, __status: 401, error: "session expired" };
  }
  if (row.ttl && Number(row.ttl) * 1000 < Date.now()) {
    await dbDelete(sessionPk(token), "v1").catch(() => {});
    return { ok: false, __status: 401, error: "session expired" };
  }
  return { ok: true, email: row.email, token };
}

export async function handleHumanityAuth(payload) {
  const action = String(payload.action || "login").toLowerCase();

  if (action === "me" || action === "check") {
    const sess = await requireHumanitySession(payload);
    if (!sess.ok) return sess;
    return { flow: "hauth", ok: true, email: sess.email, app: APP };
  }

  if (action === "logout") {
    const token = bearer(payload);
    if (token) await dbDelete(sessionPk(token), "v1").catch(() => {});
    return { flow: "hauth", ok: true, loggedOut: true };
  }

  // login
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!email || !password) {
    return { flow: "hauth", ok: false, __status: 400, error: "email and password required" };
  }
  if (email !== EMAIL) {
    return { flow: "hauth", ok: false, __status: 401, error: "invalid credentials" };
  }

  const user = await ensureUser();
  const got = hashPassword(password, user.passwordSalt);
  if (!safeEqualHex(got, user.passwordHash)) {
    return { flow: "hauth", ok: false, __status: 401, error: "invalid credentials" };
  }

  const token = randomBytes(32).toString("hex");
  const ttl = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  await dbPut({
    pk: sessionPk(token),
    sk: "v1",
    email: EMAIL,
    app: APP,
    createdAt: new Date().toISOString(),
    ttl,
  });

  return {
    flow: "hauth",
    ok: true,
    email: EMAIL,
    token,
    expiresAt: new Date(ttl * 1000).toISOString(),
  };
}
