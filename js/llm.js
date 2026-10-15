/**
 * 浏览器端大模型（WebLLM + Qwen），无需本机 Ollama。
 * 首次解读时懒加载；无 WebGPU 时回退通俗简版。
 */
window.CycleLLM = (function () {
  const MODEL_CANDIDATES = [
    "Qwen3-0.6B-q4f16_1-MLC",
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  ];

  let engine = null;
  let loading = null;
  let progressText = "";
  let lastError = "";

  function settings() {
    try {
      const raw = localStorage.getItem("cycle-llm");
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function hasWebGPU() {
    return typeof navigator !== "undefined" && !!navigator.gpu;
  }

  async function ensureEngine(onProgress) {
    if (engine) return engine;
    if (loading) return loading;
    if (!hasWebGPU()) {
      lastError = "no-webgpu";
      return null;
    }

    loading = (async () => {
      try {
        const webllm = await import("https://esm.run/@mlc-ai/web-llm@0.2.79");
        const preferred = settings().model;
        const list = preferred
          ? [preferred, ...MODEL_CANDIDATES]
          : MODEL_CANDIDATES.slice();
        let lastErr = null;
        for (const modelId of list) {
          try {
            progressText = modelId;
            if (onProgress) onProgress(0, modelId);
            engine = await webllm.CreateMLCEngine(modelId, {
              initProgressCallback: (p) => {
                progressText = p.text || modelId;
                if (onProgress) onProgress(p.progress || 0, progressText);
              },
            });
            lastError = "";
            return engine;
          } catch (e) {
            lastErr = e;
            engine = null;
          }
        }
        lastError = String(lastErr && lastErr.message ? lastErr.message : lastErr);
        return null;
      } catch (e) {
        lastError = String(e && e.message ? e.message : e);
        return null;
      } finally {
        loading = null;
      }
    })();

    return loading;
  }

  function colloquialSystem(lang) {
    return lang === "zh"
      ? "你是接地气的宏观解说员。用大白话讲清楚，少用术语；必须分三小段：现在怎么看、谁可能舒服、谁可能难受。不要编造没给的数字，不要喊买卖口号。不要输出思考过程。"
      : "You are a plain-spoken macro guide. Everyday English, light jargon. Reply in 3 short parts: the takeaway, who may benefit, who may struggle. Do not invent numbers. No trade calls. No chain-of-thought.";
  }

  function fallback(kind, payload, lang) {
    const zh = lang === "zh";
    const rate =
      payload.rate == null || Number.isNaN(Number(payload.rate))
        ? zh
          ? "未知"
          : "n/a"
        : Number(payload.rate).toFixed(2);
    const cpi =
      payload.cpi == null || Number.isNaN(Number(payload.cpi))
        ? zh
          ? "未知"
          : "n/a"
        : Number(payload.cpi).toFixed(1);

    if (kind === "macro") {
      return zh
        ? `现在怎么看：利率大约 ${rate}%，物价相关读数大约 ${cpi}%。整体更像“边走边看”。\n谁可能舒服：现金流稳、负债不重的公司更抗造。\n谁可能难受：靠借钱扩张、估值已经很贵的方向更敏感。`
        : `Takeaway: rate ~${rate}%, CPI-like ~${cpi}%. Wait-and-see mood.\nMay benefit: steady cashflow, lighter leverage.\nMay struggle: highly levered, rich-valuation stories.`;
    }
    if (kind === "news") {
      return zh
        ? `现在怎么看：这是一条重要快讯，先看它会不会改变“利率/风险偏好”两件事。\n谁可能舒服：防御和红利类往往更稳。\n谁可能难受：拥挤的高估值交易更容易晃。`
        : `Takeaway: an important flash — watch rates and risk appetite.\nMay benefit: defensives/dividends.\nMay struggle: crowded high-valuation trades.`;
    }
    if (kind === "wave") {
      return zh
        ? `现在怎么看：长波大致在 K${payload.waveId} 的${payload.phase}附近（进度约 ${payload.progress}%），更像气候而不是天气预报。\n谁可能舒服：能熬周期、资产负债表健康的一方。\n谁可能难受：杠杆高、叙事过热的方向更容易被出清。`
        : `Takeaway: around K${payload.waveId} ${payload.phase} (~${payload.progress}%) — climate, not a trade call.\nMay benefit: strong balance sheets.\nMay struggle: high leverage / crowded narratives.`;
    }
    return zh
      ? `现在怎么看：关注公布值相对期望偏强还是偏弱。\n谁可能舒服：若偏弱且政策更松，成长和利率敏感方向可能松口气。\n谁可能难受：若偏强，对利率敏感的资产可能更紧张。`
      : `Takeaway: compare actual vs forecast.\nMay benefit if soft+dovish: growth/rate-sensitive.\nMay struggle if hot: rate-sensitive assets.`;
  }

  function stripThinking(text) {
    return String(text || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^[\s\S]*?<\/think>/i, "")
      .trim();
  }

  async function chat(system, user, onProgress) {
    const eng = await ensureEngine(onProgress);
    if (!eng) return { ok: false, error: lastError || "engine" };
    try {
      const reply = await eng.chat.completions.create({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.6,
        max_tokens: 420,
        extra_body: { enable_thinking: false },
      });
      const text = stripThinking(
        (reply.choices &&
          reply.choices[0] &&
          reply.choices[0].message &&
          reply.choices[0].message.content) ||
          ""
      );
      return { ok: !!text, text };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  async function interpret(kind, payload, lang, onProgress) {
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
          ? `康波当前位置：K${payload.waveId}，阶段=${payload.phase}，进度=${payload.progress}%。用大白话讲气候。`
          : `Kondratiev now: K${payload.waveId}, phase=${payload.phase}, progress=${payload.progress}%. Plain words.`;
    } else {
      user =
        lang === "zh"
          ? `经济数据事件：${payload.title}；期望=${payload.forecast}；公布=${payload.actual}；前值=${payload.previous}。通俗解说。`
          : `Release: ${payload.title}; forecast=${payload.forecast}; actual=${payload.actual}; previous=${payload.previous}. Plain language.`;
    }

    const live = await chat(system, user, onProgress);
    if (live.ok && live.text.trim())
      return { ok: true, text: live.text.trim(), source: "webllm" };
    return {
      ok: false,
      text: fallback(kind, payload, lang),
      source: "fallback",
      error: live.error || lastError,
    };
  }

  /** 预热：页面空闲时开始下模型（不阻塞 UI） */
  function warmup() {
    if (!hasWebGPU()) return;
    const run = () => {
      ensureEngine().catch(() => {});
    };
    if ("requestIdleCallback" in window) {
      requestIdleCallback(run, { timeout: 4000 });
    } else {
      setTimeout(run, 1200);
    }
  }

  function ping() {
    return Promise.resolve({
      ok: !!engine || hasWebGPU(),
      webgpu: hasWebGPU(),
      ready: !!engine,
      progress: progressText,
    });
  }

  return { settings, ping, interpret, warmup, ensureEngine, hasWebGPU };
})();
