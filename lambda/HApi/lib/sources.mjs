/**
 * 所有上游「源」只读 Lambda 环境变量，禁止写死在业务代码 / 前端。
 * 缺失时在真正用到该源时抛错。
 */

function req(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") {
    throw new Error("missing Lambda env: " + name);
  }
  return String(v).trim();
}

function opt(name, fallback) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") return fallback;
  return String(v).trim();
}

/** Cycle / 共用上游 */
export function srcMacroRadar() {
  return req("SRC_MACRORADAR");
}
export function srcChinaData() {
  return req("SRC_CHINADATA");
}
export function srcEastmoney() {
  return req("SRC_EASTMONEY");
}
export function srcFinanceCalendar() {
  return req("SRC_FINANCECALENDAR");
}
export function srcPipAtlas() {
  return req("SRC_PIPATLAS");
}
export function srcForexFactory() {
  return req("SRC_FOREXFACTORY");
}
export function srcFearGreed() {
  return req("SRC_FEARGREED");
}
export function srcFearGreedCnSnap() {
  return req("SRC_FEARGREED_CN_SNAP");
}
export function srcFearGreedCnStm() {
  return req("SRC_FEARGREED_CN_STM");
}
export function srcDuckDuckGo() {
  return req("SRC_DUCKDUCKGO");
}
export function srcGoogleNewsRss() {
  return req("SRC_GOOGLENEWS_RSS");
}

/** 金十 */
export function srcJin10TopicOrigin() {
  return req("SRC_JIN10_TOPIC_ORIGIN");
}
export function srcJin10TopicPage() {
  return req("SRC_JIN10_TOPIC_PAGE");
}
export function srcJin10FlashBase() {
  return req("SRC_JIN10_FLASH_BASE");
}
export function srcJin10FlashApi() {
  return req("SRC_JIN10_FLASH_API");
}
export function srcJin10DetailBase() {
  return req("SRC_JIN10_DETAIL_BASE");
}
export function srcJin10Site() {
  return req("SRC_JIN10_SITE");
}
export function srcJin10AppIdFallback() {
  return opt("SRC_JIN10_APP_ID", "");
}
export function srcJin10VersionFallback() {
  return opt("SRC_JIN10_VERSION", "1.0.0");
}

/** Humanity 视频源 */
export function srcEpornerSearch() {
  return req("SRC_EPORNER_SEARCH");
}
export function srcEpornerSite() {
  return req("SRC_EPORNER_SITE");
}
export function srcPornhubSearch() {
  return req("SRC_PORNHUB_SEARCH");
}
export function srcPornhubSite() {
  return req("SRC_PORNHUB_SITE");
}
export function srcXvideosSearch() {
  return req("SRC_XVIDEOS_SEARCH");
}
export function srcXvideosSite() {
  return req("SRC_XVIDEOS_SITE");
}

/** Humanity 登录（明文仅存 Lambda Env） */
export function humanityEmail() {
  return req("HUMANITY_EMAIL").toLowerCase();
}
export function humanityPassword() {
  return req("HUMANITY_PASSWORD");
}
