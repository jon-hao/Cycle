window.CycleLLM = (function () {
  const DEFAULTS = {
    baseUrl: "http://localhost:11434",
    model: "llama3.2",
    timeoutMs: 60000,
  };

  /** 避免 Ollama 未启动时反复 POST 刷红控制台 */
  let cache = { ok: false, checkedAt: 0, models: [] };
  const TTL_OK = 60000;
  const TTL_FAIL = 20000;

  function settings() {
    try {
      const raw = localStorage.getItem("cycle-llm");
      return Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {});
    } catch (_) {
      return Object.assign({}, DEFAULTS);
    }
  }

  async function ping(force) {
    const now = Date.now();
    const ttl = cache.ok ? TTL_OK : TTL_FAIL;
    if (!force && cache.checkedAt && now - cache.checkedAt < ttl) {
      return { ok: cache.ok, models: cache.models, cached: true };
    }
    const cfg = settings();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(cfg.baseUrl + "/api/tags", { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        cache = { ok: false, checkedAt: now, models: [] };
        return { ok: false, models: [] };
      }
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name);
      cache = { ok: true, checkedAt: now, models };
      return { ok: true, models };
    } catch (_) {
      cache = { ok: false, checkedAt: now, models: [] };
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
        text: (data.message && data.message.content) || "",
      };
    } catch (err) {
      clearTimeout(timer);
      cache = { ok: false, checkedAt: Date.now(), models: [] };
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  function colloquialSystem(lang) {
    return lang === "zh"
      ? "你是接地气的宏观解说员。用大白话讲清楚，少用术语；必须分三小段：现在怎么看、谁可能舒服、谁可能难受。不要编造没给的数字，不要喊买卖口号。"
      : "You are a plain-spoken macro guide. Use everyday English, light jargon. Reply in 3 short parts: the takeaway, who may benefit, who may struggle. Do not invent numbers. No trade calls.";
  }

  function fallback(kind, payload, lang) {
    const zh = lang === "zh";
    if (kind === "macro") {
      return zh
        ? `${window.t("aiOffline")}\n\n现在怎么看：利率大约 ${payload.rate ?? "未知"}%，物价相关读数大约 ${payload.cpi ?? "未知"}%。整体更像“边走边看”。\n谁可能舒服：现金流稳、负债不重的公司更抗造。\n谁可能难受：靠借钱扩张、估值已经很贵的方向更敏感。`
        : `${window.t("aiOffline")}\n\nTakeaway: rate ~${payload.rate ?? "n/a"}%, CPI-like ~${payload.cpi ?? "n/a"}. Wait-and-see mood.\nMay benefit: steady cashflow, lighter leverage.\nMay struggle: highly levered, rich-valuation stories.`;
    }
    if (kind === "news") {
      return zh
        ? `${window.t("aiOffline")}\n\n现在怎么看：这是一条重要快讯，先看它会不会改变“利率/风险偏好”两件事。\n谁可能舒服：防御和红利类往往更稳。\n谁可能难受：拥挤的高估值交易更容易晃。`
        : `${window.t("aiOffline")}\n\nTakeaway: an important flash — watch rates and risk appetite.\nMay benefit: defensives/dividends.\nMay struggle: crowded high-valuation trades.`;
    }
    if (kind === "wave") {
      return zh
        ? `${window.t("aiOffline")}\n\n现在怎么看：长波大致在 K${payload.waveId} 的${payload.phase}附近（进度约 ${payload.progress}%），更像气候而不是天气预报。\n谁可能舒服：能熬周期、现金和资产负债表健康的一方。\n谁可能难受：杠杆高、叙事过热的方向更容易被出清。`
        : `${window.t("aiOffline")}\n\nTakeaway: around K${payload.waveId} ${payload.phase} (~${payload.progress}%) — climate, not a trade call.\nMay benefit: strong balance sheets.\nMay struggle: high leverage / crowded narratives.`;
    }
    return zh
      ? `${window.t("aiOffline")}\n\n现在怎么看：关注公布值相对期望偏强还是偏弱。\n谁可能舒服：若偏弱且政策更松，成长和利率敏感方向可能松口气。\n谁可能难受：若偏强，对利率敏感的资产可能更紧张。`
      : `${window.t("aiOffline")}\n\nTakeaway: compare actual vs forecast.\nMay benefit if soft+dovish: growth/rate-sensitive.\nMay struggle if hot: rate-sensitive assets.`;
  }

  async function interpret(kind, payload, lang) {
    const system = colloquialSystem(lang);
    let user = "";
    if (kind === "macro") {
      user =
        lang === "zh"
          ? `国家=${payload.countryLabel}；康波=K${payload.waveId} ${payload.phase}；利率=${payload.rate}；通胀=${payload.inflation}；CPI=${payload.cpi}；PPI=${payload.ppi}；恐慌贪婪=${payload.fearGreed}。请通俗解说。`
          : `Country=${payload.countryLabel}; Wave=K${payload.waveId} ${payload.phase}; rate=${payload.rate}; inflation=${payload.inflation}; CPI=${payload.cpi}; PPI=${payload.ppi}; Fear&Greed=${payload.fearGreed}. Plain language please.`;
    } else if (kind === "news") {
      user =
        lang === "zh"
          ? `重要新闻：${payload.title}\n摘要：${payload.summary}\n请通俗解说。`
          : `Headline: ${payload.title}\nSummary: ${payload.summary}\nPlain language please.`;
    } else if (kind === "wave") {
      user =
        lang === "zh"
          ? `康波当前位置：K${payload.waveId}，阶段=${payload.phase}，进度=${payload.progress}%。用大白话讲我们大概处在什么气候、往后更可能偏向什么。`
          : `Kondratiev now: K${payload.waveId}, phase=${payload.phase}, progress=${payload.progress}%. Explain the climate in plain words.`;
    } else {
      user =
        lang === "zh"
          ? `经济数据事件：${payload.title}；期望=${payload.forecast}；公布=${payload.actual}；前值=${payload.previous}。通俗解说。`
          : `Release: ${payload.title}; forecast=${payload.forecast}; actual=${payload.actual}; previous=${payload.previous}. Plain language.`;
    }

    const alive = await ping(false);
    if (!alive.ok) {
      return { ok: false, text: fallback(kind, payload, lang), source: "fallback" };
    }

    const live = await chat(system, user);
    if (live.ok && live.text.trim())
      return { ok: true, text: live.text.trim(), source: "ollama" };
    return { ok: false, text: fallback(kind, payload, lang), source: "fallback" };
  }

  return { settings, ping, interpret };
})();
