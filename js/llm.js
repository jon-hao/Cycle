/**
 * 浏览器端大模型（WebLLM + Qwen）
 * 下载状态写入 localStorage，刷新页面可续传/续显进度。
 */
window.CycleLLM = (function () {
  // 浏览器 WebGPU：偏中文宏观/金融对话的体积与质量折中（WebLLM MLC 预制）
  const MODEL_CANDIDATES = [
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    "Qwen3-0.6B-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  ];
  const STATE_KEY = "cycle-llm-dl";

  let engine = null;
  let loading = null;
  let listeners = new Set();

  function settings() {
    try {
      const raw = localStorage.getItem("cycle-llm");
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function readState() {
    try {
      return (
        JSON.parse(localStorage.getItem(STATE_KEY) || "null") || {
          status: "idle",
          progress: 0,
          text: "",
          model: MODEL_CANDIDATES[0],
        }
      );
    } catch (_) {
      return { status: "idle", progress: 0, text: "", model: MODEL_CANDIDATES[0] };
    }
  }

  function writeState(partial) {
    const next = Object.assign(readState(), partial, { updatedAt: Date.now() });
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    listeners.forEach((fn) => {
      try {
        fn(next);
      } catch (_) {}
    });
    return next;
  }

  function onState(fn) {
    listeners.add(fn);
    fn(readState());
    return () => listeners.delete(fn);
  }

  function hasWebGPU() {
    return typeof navigator !== "undefined" && !!navigator.gpu;
  }

  function getStatus() {
    return readState();
  }

  async function ensureEngine(onProgress) {
    if (engine) {
      writeState({ status: "ready", progress: 1, text: "ready" });
      return engine;
    }
    if (loading) return loading;
    if (!hasWebGPU()) {
      writeState({
        status: "error",
        progress: 0,
        text: "no-webgpu",
      });
      return null;
    }

    loading = (async () => {
      writeState({ status: "downloading", progress: 0, text: "starting" });
      try {
        const webllm = await import("https://esm.run/@mlc-ai/web-llm@0.2.79");
        const preferred = settings().model || readState().model;
        const list = preferred
          ? [preferred, ...MODEL_CANDIDATES.filter((m) => m !== preferred)]
          : MODEL_CANDIDATES.slice();
        let lastErr = null;
        for (const modelId of list) {
          try {
            writeState({
              status: "downloading",
              model: modelId,
              progress: 0,
              text: modelId,
            });
            if (onProgress) onProgress(0, modelId);
            engine = await webllm.CreateMLCEngine(modelId, {
              initProgressCallback: (p) => {
                const progress = typeof p.progress === "number" ? p.progress : 0;
                const text = p.text || modelId;
                writeState({
                  status: "downloading",
                  model: modelId,
                  progress,
                  text,
                });
                if (onProgress) onProgress(progress, text);
              },
            });
            writeState({
              status: "ready",
              model: modelId,
              progress: 1,
              text: "ready",
            });
            return engine;
          } catch (e) {
            lastErr = e;
            engine = null;
          }
        }
        writeState({
          status: "error",
          progress: 0,
          text: String(lastErr && lastErr.message ? lastErr.message : lastErr),
        });
        return null;
      } catch (e) {
        writeState({
          status: "error",
          progress: 0,
          text: String(e && e.message ? e.message : e),
        });
        return null;
      } finally {
        loading = null;
      }
    })();

    return loading;
  }

  /** 用户点击「下载模型」 */
  function startDownload() {
    if (engine) {
      writeState({ status: "ready", progress: 1, text: "ready" });
      return Promise.resolve(engine);
    }
    const st = readState();
    if (st.status === "downloading" && loading) return loading;
    return ensureEngine();
  }

  /** 刷新后若上次在下载中 / 已就绪，自动续上 */
  function resumeIfNeeded() {
    const st = readState();
    if (st.status === "downloading" || st.status === "ready") {
      return ensureEngine();
    }
    return Promise.resolve(null);
  }

  function isZh(lang) {
    return lang === "zh" || lang === "zh-TW" || lang === "zh-Hans" || lang === "zh-Hant";
  }

  function mdHint(lang) {
    return isZh(lang)
      ? "用 Markdown 排版（标题、**加粗**、列表等），结构清晰可读；不要输出思考过程。"
      : "Format with Markdown (headings, **bold**, lists). Keep it scannable. No chain-of-thought.";
  }

  function colloquialSystem(lang, kind) {
    if (kind === "news") {
      return isZh(lang)
        ? `你是宏观市场分析员。根据新闻判断可能受影响的行业或板块（如银行、地产、科技、能源、消费、出口等），说明为什么。用 Markdown 分三段：### 市场含义 / ### 可能受益 / ### 可能承压。可加粗关键词、用列表。不要复述标题，不要喊买卖。${mdHint(lang)}`
        : `You are a macro desk analyst. Infer which industries/sectors may be affected and why. Use Markdown with three sections: ### Implication / ### May benefit / ### May struggle. Bold key terms and use lists. Do not restate the headline. No trade calls. ${mdHint(lang)}`;
    }
    return isZh(lang)
      ? `你是宏观市场分析员。根据给出的数据判断当前市场状态（偏紧/偏松、风险偏好、通胀压力等）。用 Markdown 分三段：### 市场状态判断 / ### 谁可能更舒服 / ### 谁可能更难受。可加粗关键词、用列表。不要把数字复述一遍当分析，不要喊买卖。${mdHint(lang)}`
      : `You are a macro desk analyst. Infer the market regime (tight/loose, risk appetite, inflation pressure). Use Markdown with three sections: ### Regime / ### Who may benefit / ### Who may struggle. Bold key terms and use lists. Do not recite input numbers. No trade calls. ${mdHint(lang)}`;
  }

  function fallback(kind, payload, lang) {
    const zh = isZh(lang);
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
        ? `### 市场状态判断\n利率在 **${rate}%** 附近、物价相关约 **${cpi}%**，更像“政策边走边看、风险偏好不高不低”的过渡市。\n\n### 谁可能更舒服\n- 现金流稳、负债轻的防御\n- 高股息方向\n\n### 谁可能更难受\n- 高杠杆成长\n- 估值已经很贵的题材`
        : `### Regime\nRates near **${rate}%**, prices near **${cpi}%** — wait-and-see with middling risk appetite.\n\n### Who may benefit\n- Steady cashflow, lighter leverage\n- Defensives / dividends\n\n### Who may struggle\n- Highly levered growth\n- Rich valuations`;
    }
    if (kind === "news") {
      return zh
        ? `### 市场含义\n这条快讯更可能先扰动 **利率预期 / 风险偏好**，再传导到板块。\n\n### 可能受益\n- 防御、红利\n- 现金流稳的行业\n\n### 可能承压\n- 拥挤的高估值成长\n- 利率敏感板块`
        : `### Implication\nThis flash may first move **rate expectations / risk appetite**.\n\n### May benefit\n- Defensives, dividends\n- Steady-cashflow sectors\n\n### May struggle\n- Crowded high-valuation growth\n- Rate-sensitive names`;
    }
    if (kind === "wave") {
      return zh
        ? `### 现在怎么看\n长波大致在 **K${payload.waveId} · ${payload.phase}** 附近（进度约 **${payload.progress}%**），更像气候而不是天气预报。\n\n### 谁可能舒服\n- 能熬周期、资产负债表健康的一方\n\n### 谁可能难受\n- 杠杆高、叙事过热的方向`
        : `### Takeaway\nAround **K${payload.waveId} · ${payload.phase}** (~**${payload.progress}%**) — climate, not a trade call.\n\n### May benefit\n- Strong balance sheets\n\n### May struggle\n- High leverage / crowded narratives`;
    }
    return zh
      ? `### 现在怎么看\n关注公布值相对期望偏强还是偏弱。\n\n### 谁可能舒服\n- 若偏弱且政策更松：成长和利率敏感方向可能松口气\n\n### 谁可能难受\n- 若偏强：对利率敏感的资产可能更紧张`
      : `### Takeaway\nCompare actual vs forecast.\n\n### May benefit\n- If soft + dovish: growth / rate-sensitive\n\n### May struggle\n- If hot: rate-sensitive assets`;
  }

  function stripThinking(text) {
    return String(text || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^[\s\S]*?<\/think>/i, "")
      .trim();
  }

  async function chat(system, userOrMessages, onProgress) {
    const eng = await ensureEngine(onProgress);
    if (!eng) return { ok: false, error: readState().text || "engine" };
    try {
      const messages = Array.isArray(userOrMessages)
        ? [{ role: "system", content: system }, ...userOrMessages]
        : [
            { role: "system", content: system },
            { role: "user", content: userOrMessages },
          ];
      const reply = await eng.chat.completions.create({
        messages,
        temperature: 0.45,
        max_tokens: 700,
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
    const system = colloquialSystem(lang, kind);
    let user = "";
    if (kind === "macro") {
      user = isZh(lang)
        ? `背景数据（勿复述，只用来判断状态）：国家=${payload.countryLabel}；康波=K${payload.waveId} ${payload.phase}；利率=${payload.rate}；通胀=${payload.inflation}；CPI=${payload.cpi}；PPI=${payload.ppi}；恐慌贪婪=${payload.fearGreed}。请判断市场状态。`
        : `Background (do not recite): country=${payload.countryLabel}; wave=K${payload.waveId} ${payload.phase}; rate=${payload.rate}; inflation=${payload.inflation}; CPI=${payload.cpi}; PPI=${payload.ppi}; Fear&Greed=${payload.fearGreed}. Infer the market regime.`;
    } else if (kind === "news") {
      user = isZh(lang)
        ? `新闻：${payload.title}\n摘要：${payload.summary}\n请分析可能影响哪些行业/板块。`
        : `Headline: ${payload.title}\nSummary: ${payload.summary}\nWhich industries/sectors may be affected?`;
    } else if (kind === "wave") {
      user = isZh(lang)
        ? `背景（勿逐条复述）：模式=${payload.kMode || "realtime"}；阶段=${payload.phase}；倾向→${payload.heading}；主题=${payload.theme}；${payload.phaseDesc || ""}；growth=${payload.growthScore}；inflation=${payload.inflationScore}；组合提示=${payload.portfolio}。请用通俗话说明：现在处在什么周期、正在往哪走、对组合意味着什么。`
        : `Background (do not recite): mode=${payload.kMode || "realtime"}; phase=${payload.phase}; heading→${payload.heading}; theme=${payload.theme}; ${payload.phaseDesc || ""}; growth=${payload.growthScore}; inflation=${payload.inflationScore}; portfolio tilt=${payload.portfolio}. Explain in plain language: where we are, where we're heading, and what it means for allocation.`;
    } else {
      user = isZh(lang)
        ? `数据事件：${payload.title}；期望=${payload.forecast}；公布=${payload.actual}；前值=${payload.previous}。判断对市场状态的含义。`
        : `Release: ${payload.title}; forecast=${payload.forecast}; actual=${payload.actual}; previous=${payload.previous}. What does it imply for market regime?`;
    }

    const live = await chat(system, user, onProgress);
    if (live.ok && live.text.trim())
      return { ok: true, text: live.text.trim(), source: "webllm" };
    return {
      ok: false,
      text: fallback(kind, payload, lang),
      source: "fallback",
      error: live.error,
    };
  }

  function warmup() {
    resumeIfNeeded();
  }

  function ping() {
    const st = readState();
    return Promise.resolve({
      ok: st.status === "ready" || hasWebGPU(),
      webgpu: hasWebGPU(),
      ready: !!engine || st.status === "ready",
      progress: st.progress,
    });
  }

  return {
    settings,
    ping,
    interpret,
    chat,
    warmup,
    ensureEngine,
    hasWebGPU,
    startDownload,
    resumeIfNeeded,
    onState,
    getStatus,
  };
})();
