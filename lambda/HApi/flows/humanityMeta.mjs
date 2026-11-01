/**
 * Humanity 前端元数据（频道列表等），须登录。
 */

import { requireHumanitySession } from "./humanityAuth.mjs";
import { listPublicSources } from "../lib/humanitySources.mjs";

export async function handleHumanityMeta(payload) {
  const sess = await requireHumanitySession(payload);
  if (!sess.ok) return sess;

  return {
    flow: "hmeta",
    ok: true,
    app: "humanity",
    sources: listPublicSources(),
  };
}
