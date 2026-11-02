/** Cycle Agent 对话弹窗（仅内存，不写 localStorage） */
window.CycleAgent = (function () {
  let memMsgs = [];

  function load() {
    return memMsgs.slice();
  }

  function save(msgs) {
    memMsgs = (msgs || []).slice(-80);
  }

  function clear() {
    memMsgs = [];
  }

  function escapeHtml(s) {
    return window.CycleMD
      ? window.CycleMD.escapeHtml(s)
      : String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
  }

  function formatMsg(m) {
    if (m.role === "assistant" && window.CycleMD) {
      return window.CycleMD.render(m.content);
    }
    return escapeHtml(m.content);
  }

  function contextSnippet() {
    const st = window.CycleState || {};
    const k =
      window.CycleKondratiev && window.CycleKondratiev.waveAt
        ? window.CycleKondratiev.waveAt(new Date(), st.country)
        : null;
    const parts = [
      `country=${st.country}`,
      `lang=${st.lang}`,
      `page=${st.page}`,
    ];
    if (k) {
      parts.push(
        `kondratiev=K${k.wave.id} ${window.CycleKondratiev.phaseLabel(k.phaseKey)}`
      );
      parts.push(`theme=${k.theme}`);
    }
    if (window.CycleBoard && window.CycleBoard.agentContext) {
      parts.push(
        "\n" + window.CycleBoard.agentContext(st.lang || "zh")
      );
    }
    return parts.join("; ");
  }

  function systemPrompt(lang) {
    if (lang === "en") {
      return [
        "You are Cycle Agent, a macro desk assistant.",
        "Prioritize live web-search notes; use board cache only as background.",
        "Answer with 3-5 concrete Markdown bullets. Never repeat a sentence. Never ask confirmation questions.",
        "No trade calls. Keep under ~150 words.",
      ].join(" ");
    }
    if (lang === "zh-TW") {
      return [
        "你是 Cycle Agent，宏觀助手。",
        "優先使用「聯網檢索」最新信息，看板只作背景。",
        "用 Markdown 給出 3–5 條具體要點。禁止重複同一句。禁止反問。不要喊買賣。約 150 字內寫完即停。",
      ].join("");
    }
    return [
      "你是 Cycle Agent，宏观助手。",
      "优先使用「联网检索」最新信息，看板只作背景。",
      "用 Markdown 给出 3–5 条具体要点。禁止重复同一句。禁止反问。不要喊买卖。约 150 字内写完即停。",
    ].join("");
  }

  function needsWebSearch(q) {
    const t = String(q || "").trim();
    if (!t || isAffirmShort(t)) return false;
    // 1.5B 依赖检索；实质问题一律联网
    return t.length >= 2;
  }

  async function searchContext(q, lang) {
    if (!window.CycleAPI || !window.CycleAPI.searchWeb) return "";
    if (isAffirmShort(q)) return "";
    const query = needsWebSearch(q) ? String(q || "").trim() : "";
    if (!query) return "";
    try {
      const data = await window.CycleAPI.searchWeb(query);
      const rows = (data && data.results) || [];
      if (!rows.length) return "";
      const lines = rows.slice(0, 6).map((r, i) => {
        const snip = String(r.snippet || "").slice(0, 160);
        return `${i + 1}. ${r.title || ""}${snip ? " — " + snip : ""}${
          r.url ? " (" + r.url + ")" : ""
        }`;
      });
      if (lang === "en") {
        return "Live web search (synthesize; do not recite):\n" + lines.join("\n");
      }
      return "联网检索（请综合最新信息作答，勿逐条复述）：\n" + lines.join("\n");
    } catch (_) {
      return "";
    }
  }

  function isAffirmShort(text) {
    const t = String(text || "")
      .trim()
      .toLowerCase();
    return /^(需要|要|好|好的|继续|繼續|是|是的|行|可以|嗯|ok|okay|yes|y|more|go on|continue)$/i.test(
      t
    );
  }

  function isLazyReply(text) {
    const t = String(text || "").trim();
    if (!t) return true;
    if (t.length < 12) return true;
    if (/需要更多(信息|資訊)吗？?$|need more (info|information)\??$/i.test(t)) {
      return true;
    }
    // 复读循环判定：同一短句出现 ≥3 次
    const parts = t.split(/(?<=[。！？.!?])/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 4) {
      const counts = {};
      for (const p of parts) {
        const k = p.slice(0, 24);
        counts[k] = (counts[k] || 0) + 1;
        if (counts[k] >= 3) return true;
      }
    }
    return false;
  }

  function buildMessages(msgs, q, lang, webCtx) {
    const history = msgs
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, -1)
      .slice(-6)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 400),
      }));

    const board =
      window.CycleBoard && window.CycleBoard.agentContext
        ? window.CycleBoard.agentContext(lang)
        : contextSnippet();
    // 1.5B 吃不下超长看板；检索优先，看板压缩
    const boardBrief = String(board || "").slice(0, 1600);
    let ask = q;
    if (isAffirmShort(q)) {
      ask =
        lang === "en"
          ? `User wants more. Expand with new concrete points. Do not repeat. Do not ask questions.\nUser said: ${q}`
          : `用户想听更多。请补充新的具体要点，不要重复，不要反问。\n用户说：${q}`;
    }
    const userContent =
      (webCtx ? webCtx + "\n\n" : "") +
      (lang === "en"
        ? "Board background (optional):\n"
        : "看板背景（可选参考，勿复述）：\n") +
      boardBrief +
      "\n\n" +
      (lang === "en" ? "User question:\n" : "用户问题：\n") +
      ask +
      "\n\n" +
      (lang === "en"
        ? "Answer now in Markdown. 3-5 bullets. Stop when done. No repeated sentences."
        : "请立刻用 Markdown 作答：3–5 条要点，写完即停，禁止重复句子。");

    return [...history, { role: "user", content: userContent }];
  }

  function open() {
    const modal = document.getElementById("modal");
    const sheet = document.getElementById("sheet");
    let msgs = load();
    let busy = false;

    function paint() {
      const bodyHtml = msgs.length
        ? msgs
            .map(
              (m) =>
                `<div class="agent-msg ${escapeHtml(m.role)}">${formatMsg(m)}</div>`
            )
            .join("")
        : `<div class="agent-msg system">${escapeHtml(window.t("agentEmpty"))}</div>`;

      sheet.className = "sheet agent-sheet";
      sheet.innerHTML = `
        <div class="agent-head">
          <h2 class="card-title">${window.t("agentTitle")}</h2>
          <div class="agent-actions">
            <button type="button" class="btn tiny" id="agentClear">${window.t(
              "clearChat"
            )}</button>
            <button type="button" class="icon-btn" data-close aria-label="${window.t(
              "close"
            )}">×</button>
          </div>
        </div>
        <div class="agent-body" id="agentBody">${bodyHtml}</div>
        <div class="agent-foot">
          <input type="text" id="agentInput" placeholder="${window.t(
            "agentPlaceholder"
          )}" autocomplete="off" />
          <button type="button" class="agent-mic" id="agentMic" aria-label="mic" title="mic">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
          </button>
        </div>`;

      modal.classList.add("open", "agent-modal");
      modal.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("modal-open");

      const body = sheet.querySelector("#agentBody");
      body.scrollTop = body.scrollHeight;

      sheet.querySelectorAll("[data-close]").forEach((b) => {
        b.addEventListener("click", close);
      });
      sheet.querySelector("#agentClear").addEventListener("click", () => {
        clear();
        msgs = [];
        paint();
      });

      const input = sheet.querySelector("#agentInput");
      const mic = sheet.querySelector("#agentMic");

      async function send(text) {
        const q = String(text || "").trim();
        if (!q || busy) return;
        busy = true;
        msgs.push({ role: "user", content: q, at: Date.now() });
        save(msgs);
        paint();
        msgs.push({ role: "assistant", content: "…", at: Date.now() });
        save(msgs);
        paint();

        const lang = window.CycleState.lang;
        let reply = "";
        try {
          if (window.CycleLLM && window.CycleLLM.chat) {
            const webCtx = await searchContext(q, lang);
            const live = await window.CycleLLM.chat(
              systemPrompt(lang),
              buildMessages(msgs, q, lang, webCtx),
              null,
              {
                temperature: 0.35,
                max_tokens: 320,
                frequency_penalty: 0.8,
                presence_penalty: 0.5,
              }
            );
            reply = (live && live.ok && live.text && live.text.trim()) || "";
            if (isLazyReply(reply)) {
              const retry = await window.CycleLLM.chat(
                systemPrompt(lang),
                [
                  {
                    role: "user",
                    content:
                      (webCtx ? webCtx + "\n\n" : "") +
                      (lang === "en"
                        ? `Question: ${q}\nGive 3 concrete Markdown bullets using the search notes. No repetition. No questions.`
                        : `问题：${q}\n请根据联网检索给出 3 条 Markdown 要点。禁止复读，禁止提问。`),
                  },
                ],
                null,
                {
                  temperature: 0.25,
                  max_tokens: 260,
                  frequency_penalty: 0.9,
                  presence_penalty: 0.6,
                }
              );
              if (retry && retry.ok && retry.text && !isLazyReply(retry.text)) {
                reply = retry.text.trim();
              } else if (!reply || isLazyReply(reply)) {
                reply =
                  lang === "en"
                    ? webCtx
                      ? "Search came back, but the local model looped. Try a narrower question (e.g. US gold ETF flows today)."
                      : "I couldn't form a clean answer (search empty or model looped). Try a more specific question."
                    : webCtx
                      ? "已检索到最新信息，但本地模型陷入复读。请换个更具体的问题（例如：今天美盘黄金为何波动）。"
                      : "这一轮没答好（检索为空或模型复读）。请换个更具体的问题。";
              }
            }
          } else {
            reply = lang === "en" ? "Agent unavailable." : "Agent 暂不可用。";
          }
        } catch (e) {
          reply = String(e && e.message ? e.message : e);
        }

        msgs[msgs.length - 1] = {
          role: "assistant",
          content: reply,
          at: Date.now(),
        };
        save(msgs);
        busy = false;
        paint();
        const inp = document.getElementById("agentInput");
        if (inp) inp.focus();
      }

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = input.value;
          input.value = "";
          send(v);
        }
      });

      let recognition = null;
      mic.addEventListener("click", () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
          input.placeholder =
            window.CycleState.lang === "en"
              ? "Speech not supported — type instead"
              : "当前浏览器不支持语音，请键盘输入";
          input.focus();
          return;
        }
        if (recognition) {
          try {
            recognition.stop();
          } catch (_) {}
          recognition = null;
          mic.classList.remove("listening");
          return;
        }
        recognition = new SR();
        recognition.lang =
          window.CycleState.lang === "en"
            ? "en-US"
            : window.CycleState.lang === "zh-TW"
              ? "zh-TW"
              : "zh-CN";
        recognition.interimResults = false;
        recognition.onresult = (ev) => {
          const text =
            ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript;
          if (text) send(text);
        };
        recognition.onend = () => {
          mic.classList.remove("listening");
          recognition = null;
        };
        recognition.onerror = () => {
          mic.classList.remove("listening");
          recognition = null;
        };
        mic.classList.add("listening");
        recognition.start();
      });

      input.focus();
    }

    paint();
  }

  function close() {
    const modal = document.getElementById("modal");
    const sheet = document.getElementById("sheet");
    const ae = document.activeElement;
    if (ae && modal.contains(ae) && typeof ae.blur === "function") ae.blur();
    modal.classList.remove("open", "agent-modal");
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("modal-open");
    sheet.className = "sheet";
    sheet.innerHTML = "";
  }

  return { open, close, clear, load };
})();
