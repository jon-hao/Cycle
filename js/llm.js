/**
 * 本地大模型：默认对接 Ollama (http://localhost:11434)
 * 可在设置中改 baseUrl / model；离线时返回规则化示意解读。
 */
window.CycleLLM = (function () {
  const DEFAULTS = {
    baseUrl: "http://localhost:11434",
    model: "llama3.2",
    timeoutMs: 45000,
  };

  function settings() {
    try {
      const raw = localStorage.getItem("cycle-llm");
      return Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {});
    } catch (_) {
      return Object.assign({}, DEFAULTS);
    }
  }

  async function ping() {
    const cfg = settings();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(cfg.baseUrl + "/api/tags", { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return { ok: false };
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name);
      return { ok: true, models };
    } catch (_) {
      return { ok: false, models: [] };
    }
  }

  async function chat(system, user) {
    const cfg = settings();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(cfg.baseUrl + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: cfg.model,
          stream: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      return {
        ok: true,
        text: (data.message && data.message.content) || JSON.stringify(data),
      };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  function fallbackBrief(kind, payload, lang) {
    const zh = lang === "zh";
    if (kind === "macro") {
      return zh
        ? `【示意解读｜本地模型未连接】\n当前政策利率约 ${payload.rate}% ，通胀/CPI 约 ${payload.cpi}% 。\n利好：防御性现金流、短端利率敏感资产（视降息预期）。\n利空：长久期成长股若通胀反复；高杠杆板块。\n请启动 Ollama 以获得完整分析。`
        : `[Offline brief]\nPolicy rate ~${payload.rate}%, CPI ~${payload.cpi}%.\nBullish: defensive cashflows; rate-sensitive assets if cuts priced.\nBearish: long-duration growth if inflation reaccelerates; high leverage.\nStart Ollama for a full brief.`;
    }
    if (kind === "news") {
      return zh
        ? `【示意解读｜本地模型未连接】\n新闻偏向宏观数据/政策表态。短期关注利率路径与风险偏好。\n利好：质量因子、红利；利空：高估值拥挤交易。`
        : `[Offline brief]\nMacro/policy tone. Watch the rate path and risk appetite.\nBullish: quality/dividends; Bearish: crowded high-valuation trades.`;
    }
    if (kind === "event") {
      return zh
        ? `【示意解读｜本地模型未连接】\n事件：${payload.title}\n期望 ${payload.forecast} / 公布 ${payload.actual || "待公布"}。\n利好：若公布弱于预期且央行偏鸽 — 成长/利率敏感板块。\n利空：若强于预期 — 美元与短端利率相关交易。`
        : `[Offline brief]\nEvent: ${payload.title}\nFcst ${payload.forecast} / Act ${payload.actual || "pending"}.\nBullish if soft + dovish: growth/rate-sensitive.\nBearish if hot: USD & front-end rate trades.`;
    }
    return zh ? "本地模型未连接。" : "Local model offline.";
  }

  async function interpret(kind, payload, lang) {
    const langName = lang === "zh" ? "简体中文" : "English";
    const system =
      lang === "zh"
        ? "你是宏观策略助手。结合康波长波与短周期，用简洁中文输出：1) 核心判断 2) 利好板块 3) 利空板块 4) 风险提示。不要编造精确未给出的数字。"
        : "You are a macro strategist. Using Kondratiev context and the given figures, reply in concise English with: 1) Core view 2) Bullish sectors 3) Bearish sectors 4) Risks. Do not invent numbers not provided.";

    let user = "";
    if (kind === "macro") {
      user = `Country=${payload.country}; Wave=${payload.wave}; Phase=${payload.phase}; Rate=${payload.rate}; Inflation=${payload.inflation}; CPI=${payload.cpi}; PPI=${payload.ppi}; FearGreed=${payload.fearGreed}. Respond in ${langName}.`;
    } else if (kind === "news") {
      user = `News title: ${payload.title}\nSummary: ${payload.summary}\nCountry: ${payload.country}\nRespond in ${langName}.`;
    } else {
      user = `Economic calendar event: ${payload.title}; forecast=${payload.forecast}; actual=${payload.actual}; previous=${payload.previous}; country=${payload.country}. Respond in ${langName}.`;
    }

    const live = await chat(system, user);
    if (live.ok) return { ok: true, text: live.text, source: "ollama" };
    return {
      ok: false,
      text: fallbackBrief(kind, payload, lang),
      source: "fallback",
      error: live.error,
    };
  }

  return { settings, ping, chat, interpret };
})();
