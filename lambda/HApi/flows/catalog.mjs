/**
 * 能力目录：多应用发现 HApi 有哪些 flow。
 * GET ?flow=catalog
 */

export async function handleCatalog() {
  return {
    flow: "catalog",
    name: "HApi",
    version: 2,
    description:
      "Account-shared HTTP API for Cycle and other apps. Route by flow (+ optional app).",
    auth: "none (Function URL)",
    database: {
      engine: "DynamoDB",
      table: process.env.HAPI_TABLE || "HApi",
      alwaysFree:
        "25 GB + 25 RCU + 25 WCU / region / month (provisioned Standard)",
      uses: ["quota", "response cache TTL"],
    },
    convention: {
      invoke: "GET|POST Function URL",
      flow: "query/body/path: flow | type | action",
      app: "optional tenant/namespace for cache keys (default public)",
      examples: [
        "?flow=macro&country=US&app=cycle",
        "?flow=calendar&from=2026-10-01&to=2026-10-31&country=US&app=cycle",
        "?flow=news&app=cycle",
        "?flow=search&q=FOMC&app=cycle",
        "POST {\"flow\":\"macro\",\"country\":\"CN\",\"app\":\"other-app\"}",
      ],
    },
    flows: [
      {
        id: "macro",
        method: ["GET", "POST"],
        params: { country: "US|CN", app: "string?" },
        returns: "macro bundle (rates, CPI/PPI, growth, credit, …)",
      },
      {
        id: "feargreed",
        method: ["GET", "POST"],
        params: { country: "US|CN", app: "string?" },
        returns: "CNN-style fear & greed (US only)",
      },
      {
        id: "calendar",
        method: ["GET", "POST"],
        params: {
          from: "YYYY-MM-DD",
          to: "YYYY-MM-DD",
          country: "US|CN",
          app: "string?",
        },
        returns: "events[] + witching dates (FC/PA/FF/holidays)",
      },
      {
        id: "news",
        aliases: ["new"],
        method: ["GET", "POST"],
        params: { app: "string?" },
        returns: "Jin10 important flashes with rank + countryGuess",
      },
      {
        id: "search",
        method: ["GET", "POST"],
        params: { q: "string", app: "string?" },
        returns: "web search snippets for agents",
      },
      {
        id: "quota",
        method: ["GET", "POST"],
        params: {},
        returns: "monthly soft quota usage",
      },
      {
        id: "catalog",
        method: ["GET", "POST"],
        params: {},
        returns: "this document",
      },
      {
        id: "health",
        method: ["GET", "POST"],
        params: {},
        returns: "liveness",
      },
    ],
  };
}

export async function handleHealth() {
  return {
    flow: "health",
    ok: true,
    ts: new Date().toISOString(),
    table: process.env.HAPI_TABLE || "HApi",
  };
}
