/**
 * 应用登录（不支持注册）。凭证读 DynamoDB auth#cred#<app>。
 * flow=hauth，payload.app=humanity|cycle
 */

import {
  normalizeApp,
  requireAppSession,
  requireHumanitySession,
  getCredential,
  putCredential,
  verifyPassword,
  createSession,
  destroySession,
  SESSION_DAYS,
} from "../lib/appAuth.mjs";

export { requireHumanitySession, requireAppSession };

export async function handleHumanityAuth(payload) {
  const app = normalizeApp(payload.app) || "humanity";
  const action = String(payload.action || "login").toLowerCase();

  if (action === "me" || action === "check") {
    const sess = await requireAppSession(payload, app);
    if (!sess.ok) return sess;
    return {
      flow: "hauth",
      ok: true,
      email: sess.email,
      app,
      sessionDays: SESSION_DAYS,
    };
  }

  if (action === "logout") {
    await destroySession(app, payload);
    return { flow: "hauth", ok: true, loggedOut: true, app };
  }

  if (action === "password" || action === "changepassword") {
    // 登录页改密：email + 旧密码即可，无需会话
    let email = String(payload.email || "").trim().toLowerCase();
    if (!email) {
      const sess = await requireAppSession(payload, app);
      if (sess.ok) email = sess.email;
    }
    const current = String(
      payload.currentPassword || payload.oldPassword || ""
    );
    const next = String(payload.newPassword || "");
    if (!email || !current || !next) {
      return {
        flow: "hauth",
        ok: false,
        __status: 400,
        error: "email, current and new password required",
      };
    }
    if (next.length < 8) {
      return {
        flow: "hauth",
        ok: false,
        __status: 400,
        error: "password too short",
      };
    }
    if (current === next) {
      return {
        flow: "hauth",
        ok: false,
        __status: 400,
        error: "password unchanged",
      };
    }
    const cred = await getCredential(app, email);
    if (!cred || !verifyPassword(current, cred)) {
      return {
        flow: "hauth",
        ok: false,
        __status: 400,
        error: "invalid credentials",
      };
    }
    await putCredential(app, email, next);
    return { flow: "hauth", ok: true, changed: true, app, email };
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

  const cred = await getCredential(app, email);
  if (!cred || !verifyPassword(password, cred)) {
    return { flow: "hauth", ok: false, __status: 401, error: "invalid credentials" };
  }

  const sess = await createSession(app, email);
  return {
    flow: "hauth",
    ok: true,
    email: sess.email,
    app,
    token: sess.token,
    expiresAt: sess.expiresAt,
    sessionDays: SESSION_DAYS,
  };
}
