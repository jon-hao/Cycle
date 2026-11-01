/**
 * Humanity 单用户登录（不支持注册）。
 * 邮箱/密码只读 Lambda Env：HUMANITY_EMAIL / HUMANITY_PASSWORD
 * 会话存 DynamoDB：pk=humanity#session#<token>
 */

import { randomBytes, timingSafeEqual } from "crypto";
import { dbGet, dbPut, dbDelete } from "../lib/db.mjs";
import { humanityEmail, humanityPassword } from "../lib/sources.mjs";

const APP = "humanity";
const SESSION_DAYS = 365;

function sessionPk(token) {
  return APP + "#session#" + token;
}

function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
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

  let expectedEmail;
  let expectedPassword;
  try {
    expectedEmail = humanityEmail();
    expectedPassword = humanityPassword();
  } catch (e) {
    return {
      flow: "hauth",
      ok: false,
      __status: 503,
      error: "auth env not configured",
      detail: String(e && e.message ? e.message : e),
    };
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!email || !password) {
    return {
      flow: "hauth",
      ok: false,
      __status: 400,
      error: "email and password required",
    };
  }
  if (!safeEqualStr(email, expectedEmail) || !safeEqualStr(password, expectedPassword)) {
    return { flow: "hauth", ok: false, __status: 401, error: "invalid credentials" };
  }

  const token = randomBytes(32).toString("hex");
  const ttl = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  await dbPut({
    pk: sessionPk(token),
    sk: "v1",
    email: expectedEmail,
    app: APP,
    createdAt: new Date().toISOString(),
    ttl,
  });

  return {
    flow: "hauth",
    ok: true,
    email: expectedEmail,
    token,
    expiresAt: new Date(ttl * 1000).toISOString(),
  };
}
