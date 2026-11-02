/**
 * 浏览器端大模型（WebLLM + Qwen）
 * 状态仅存内存（不写 localStorage）。
 */
window.CycleLLM = (function () {
  // 浏览器 WebGPU：偏中文宏观/金融对话（WebLLM MLC 预制）
  const ACTIVE_MODEL = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
  const MODEL_CANDIDATES = [
    ACTIVE_MODEL,
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    "Qwen3-0.6B-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  ];
  // 升到 3B：下次打开清掉旧模型缓存，强制重新下载
  const CACHE_EPOCH = "cycle-llm-v3-qwen25-3b";
  const LEGACY_MODELS = [
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    "Qwen3-0.6B-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  ];

  let engine = null;
  let loading = null;
  let listeners = new Set();
  let purgeOnce = null;
  let memState = {
    status: "idle",
    progress: 0,
    text: "",
    model: ACTIVE_MODEL,
  };

  function settings() {
    return { model: ACTIVE_MODEL };
  }

  async function purgeLegacyCaches(webllm) {
    if (purgeOnce) return purgeOnce;
    purgeOnce = (async () => {
      let prev = "";
      try {
        prev = localStorage.getItem("cycle-llm-cache-epoch") || "";
      } catch (_) {}
      if (prev === CACHE_EPOCH) return;
      writeState({
        status: "downloading",
        progress: 0,
        text: "clearing-old-model",
      });
      for (const id of LEGACY_MODELS) {
        try {
          if (webllm && typeof webllm.deleteModelAllInfoInCache === "function") {
            await webllm.deleteModelAllInfoInCache(id);
          }
        } catch (_) {}
      }
      try {
        if (typeof caches !== "undefined" && caches.keys) {
          const keys = await caches.keys();
          await Promise.all(
            keys.map((k) => {
              if (/webllm|mlc-ai|qwen2\.5-1\.5|qwen3-0\.6|llama-3\.2-1b/i.test(k)) {
                return caches.delete(k);
              }
              return null;
            })
          );
        }
      } catch (_) {}
      try {
        localStorage.setItem("cycle-llm-cache-epoch", CACHE_EPOCH);
      } catch (_) {}
    })();
    return purgeOnce;
  }

  function readState() {
    return Object.assign({}, memState);
  }

  function writeState(partial) {
    memState = Object.assign({}, memState, partial, { updatedAt: Date.now() });
    const next = readState();
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
        await purgeLegacyCaches(webllm);
        const preferred = ACTIVE_MODEL;
        const list = [
          preferred,
          ...MODEL_CANDIDATES.filter((m) => m !== preferred),
        ];
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
      ? "用 Markdown 排版（标题、**加粗**、列表等）；不要输出思考过程；禁止重复同一句话或同一段落。"
      : "Format with Markdown (headings, **bold**, lists). No chain-of-thought. Never repeat the same sentence or paragraph.";
  }

  function colloquialSystem(lang, kind) {
    const net = isZh(lang)
      ? "必须优先结合「联网检索」中的最新信息做判断；看板数据只作背景。禁止复述输入原文/数字清单当分析。"
      : "Prioritize live web-search notes; treat board numbers as background only. Do not recite the input.";
    if (kind === "news") {
      return isZh(lang)
        ? `你是宏观市场分析员。${net}根据新闻与检索判断可能受影响的行业或板块，说明为什么。用 Markdown 分三段：### 市场含义 / ### 可能受益 / ### 可能承压。写完即停。不要喊买卖。${mdHint(lang)}`
        : `You are a macro desk analyst. ${net} Infer affected industries/sectors and why. Markdown sections: ### Implication / ### May benefit / ### May struggle. Stop when done. No trade calls. ${mdHint(lang)}`;
    }
    return isZh(lang)
      ? `你是宏观市场分析员。${net}若有「当前弹窗聚焦」指标，优先解读其水平、趋势与含义。用 Markdown 分三段：### 市场状态判断 / ### 谁可能更舒服 / ### 谁可能更难受。写完即停。不要喊买卖。${mdHint(lang)}`
      : `You are a macro desk analyst. ${net} If a focused metric is given, prioritize it. Markdown sections: ### Regime / ### Who may benefit / ### Who may struggle. Stop when done. No trade calls. ${mdHint(lang)}`;
  }

  /** 掐掉小模型复读循环（连续/交替重复句子） */
  function trimRepetition(text) {
    let s = String(text || "").trim();
    if (!s) return s;
    const parts = s.split(/(?<=[。！？.!?]\s*|\n+)/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 3) return s;
    const out = [];
    const seen = new Map();
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const key = p.replace(/\s+/g, "").slice(0, 36);
      const count = seen.get(key) || 0;
      if (count >= 1) break;
      // 与上一句高度重合也停
      if (out.length) {
        const prev = out[out.length - 1].replace(/\s+/g, "");
        const cur = p.replace(/\s+/g, "");
        if (prev.length > 8 && cur.length > 8) {
          if (prev.includes(cur.slice(0, 16)) || cur.includes(prev.slice(0, 16))) break;
        }
      }
      // 交替两句循环：A B A → 在第二次 A 处停
      if (
        out.length >= 2 &&
        p.replace(/\s+/g, "") === out[out.length - 2].replace(/\s+/g, "")
      ) {
        break;
      }
      seen.set(key, count + 1);
      out.push(p);
    }
    return (out.length ? out.join("") : s).trim();
  }

  async function fetchSearchNotes(query, lang) {
    const q = String(query || "").trim();
    if (!q || !window.CycleAPI || !window.CycleAPI.searchWeb) return "";
    try {
      const data = await window.CycleAPI.searchWeb(q);
      const rows = (data && data.results) || [];
      if (!rows.length) return "";
      const lines = rows.slice(0, 5).map((r, i) => {
        const snip = String(r.snippet || "").slice(0, 140);
        return `${i + 1}. ${r.title || ""}${snip ? " — " + snip : ""}`;
      });
      return isZh(lang)
        ? "联网检索（最新，请综合判断，勿逐条复述）：\n" + lines.join("\n")
        : "Live web search (synthesize, do not recite):\n" + lines.join("\n");
    } catch (_) {
      return "";
    }
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

  async function chat(system, userOrMessages, onProgress, opts) {
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
        temperature: (opts && opts.temperature) != null ? opts.temperature : 0.35,
        top_p: 0.85,
        max_tokens: (opts && opts.max_tokens) != null ? opts.max_tokens : 380,
        frequency_penalty:
          (opts && opts.frequency_penalty) != null ? opts.frequency_penalty : 0.7,
        presence_penalty:
          (opts && opts.presence_penalty) != null ? opts.presence_penalty : 0.4,
        extra_body: { enable_thinking: false },
      });
      let text = stripThinking(
        (reply.choices &&
          reply.choices[0] &&
          reply.choices[0].message &&
          reply.choices[0].message.content) ||
          ""
      );
      text = trimRepetition(text);
      return { ok: !!text, text };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  async function interpret(kind, payload, lang, onProgress) {
    const system = colloquialSystem(lang, kind);
    let searchQ = "";
    let user = "";
    if (kind === "macro") {
      const focus = payload.focus
        ? isZh(lang)
          ? `当前弹窗聚焦：指标=${payload.focus.metric || ""}；标题=${payload.focus.title || ""}；现值=${payload.focus.value ?? "n/a"}；近期变化=${payload.focus.delta ?? "n/a"}。请优先解读该指标。`
          : `Open modal focus: metric=${payload.focus.metric || ""}; title=${payload.focus.title || ""}; value=${payload.focus.value ?? "n/a"}; recent change=${payload.focus.delta ?? "n/a"}. Prioritize this metric.`
        : "";
      searchQ = [
        payload.focus && payload.focus.title,
        payload.focus && payload.focus.metric,
        payload.countryLabel,
        isZh(lang) ? "最新 宏观 市场影响" : "latest macro market impact",
      ]
        .filter(Boolean)
        .join(" ");
      user = isZh(lang)
        ? `${focus}\n背景数据（勿复述）：国家=${payload.countryLabel}；康波=K${payload.waveId} ${payload.phase}；利率=${payload.rate}；通胀=${payload.inflation}；CPI=${payload.cpi}；PPI=${payload.ppi}；恐慌贪婪=${payload.fearGreed}。\n请结合联网检索给出市场状态判断（不要复读）。`
        : `${focus}\nBackground (do not recite): country=${payload.countryLabel}; wave=K${payload.waveId} ${payload.phase}; rate=${payload.rate}; inflation=${payload.inflation}; CPI=${payload.cpi}; PPI=${payload.ppi}; Fear&Greed=${payload.fearGreed}.\nUse live search to judge the regime. No repetition.`;
    } else if (kind === "news") {
      searchQ = `${payload.title || ""} ${isZh(lang) ? "最新影响 板块" : "market impact sectors"}`;
      user = isZh(lang)
        ? `新闻：${payload.title}\n摘要：${payload.summary}\n请结合联网检索分析可能影响哪些行业/板块（不要复述标题）。`
        : `Headline: ${payload.title}\nSummary: ${payload.summary}\nUsing live search, which industries/sectors may be affected? Do not restate the headline.`;
    } else if (kind === "wave") {
      searchQ = isZh(lang)
        ? `康波 ${payload.phase || ""} ${payload.theme || ""} 宏观配置 最新`
        : `Kondratiev ${payload.phase || ""} ${payload.theme || ""} allocation latest`;
      user = isZh(lang)
        ? `背景（勿逐条复述）：模式=${payload.kMode || "realtime"}；阶段=${payload.phase}；倾向→${payload.heading}；主题=${payload.theme}；growth=${payload.growthScore}；inflation=${payload.inflationScore}；组合提示=${payload.portfolio}。\n请结合联网检索用通俗话说明：现在处在什么周期、往哪走、对组合意味着什么。`
        : `Background (do not recite): mode=${payload.kMode || "realtime"}; phase=${payload.phase}; heading→${payload.heading}; theme=${payload.theme}; growth=${payload.growthScore}; inflation=${payload.inflationScore}; portfolio=${payload.portfolio}.\nWith live search, explain where we are, where we're heading, allocation implications.`;
    } else {
      searchQ = `${payload.title || ""} ${isZh(lang) ? "最新 数据公布 市场反应" : "latest data release market reaction"}`;
      user = isZh(lang)
        ? `数据事件：${payload.title}；期望=${payload.forecast}；公布=${payload.actual}；前值=${payload.previous}。\n请结合联网检索判断对市场状态的含义。`
        : `Release: ${payload.title}; forecast=${payload.forecast}; actual=${payload.actual}; previous=${payload.previous}.\nUse live search: what does it imply for market regime?`;
    }

    const notes = await fetchSearchNotes(searchQ, lang);
    if (notes) user = notes + "\n\n" + user;

    const live = await chat(system, user, onProgress, {
      temperature: 0.3,
      max_tokens: 420,
      frequency_penalty: 0.75,
      presence_penalty: 0.45,
    });
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

  /**
   * 把不确定国家的新闻标成 US / CN / GLOBAL。
   * 仅在引擎已就绪时工作；返回 { [id]: "US"|"CN"|"GLOBAL" }。
   */
  async function classifyNewsCountries(items) {
    const list = Array.isArray(items) ? items.slice(0, 24) : [];
    if (!list.length) return {};
    const st = readState();
    if (st.status !== "ready" && !engine) return {};

    const catalog = list
      .map((n, i) => {
        const title = String(n.title || "").slice(0, 80);
        const summary = String(n.summary || "").slice(0, 100);
        return `${i + 1}. id=${n.id}\n标题:${title}\n摘要:${summary}`;
      })
      .join("\n\n");

    const system =
      "你是宏观新闻分拣员。只判断新闻主线国家：US（美国）、CN（中国大陆）、GLOBAL（其它/国际）。" +
      "只输出 JSON 数组，不要其它文字。格式：[{\"id\":\"...\",\"country\":\"US\"}]";
    const user =
      "请标注下列新闻的 country（US/CN/GLOBAL）：\n\n" + catalog;

    const live = await chat(system, user);
    if (!live.ok || !live.text) return {};
    const raw = live.text.trim();
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return {};
    try {
      const arr = JSON.parse(m[0]);
      const out = {};
      (Array.isArray(arr) ? arr : []).forEach((row) => {
        if (!row || row.id == null) return;
        const c = String(row.country || "").toUpperCase();
        if (c === "US" || c === "CN" || c === "GLOBAL" || c === "OTHER") {
          out[String(row.id)] = c === "OTHER" ? "GLOBAL" : c;
        }
      });
      return out;
    } catch (_) {
      return {};
    }
  }

  return {
    settings,
    ping,
    interpret,
    chat,
    classifyNewsCountries,
    warmup,
    ensureEngine,
    hasWebGPU,
    startDownload,
    resumeIfNeeded,
    onState,
    getStatus,
  };
})();
