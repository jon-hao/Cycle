/**
 * 应用登录（不支持注册）。凭证读 DynamoDB auth#cred#<app>。
 * flow=hauth，payload.app=humanity|cycle
 */

import {
  normalizeApp,
  requireAppSession,
  requireHumanitySession,
  getCredential,
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
