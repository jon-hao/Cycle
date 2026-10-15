/** Cycle Agent 对话弹窗（localStorage 持久化） */
window.CycleAgent = (function () {
  const STORE_KEY = "cycle-agent-chat";

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  function save(msgs) {
    localStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-80)));
  }

  function clear() {
    localStorage.removeItem(STORE_KEY);
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
    return parts.join("; ");
  }

  function systemPrompt(lang) {
    if (lang === "en") {
      return [
        "You are Cycle Agent, a macro desk assistant.",
        "Use the board context. Answer the user's question directly with concrete points.",
        "Never ask 'need more info?' or similar. Never end with a question that only seeks confirmation.",
        "If the user says yes / need / continue / 需要 / 好 / ok, expand the previous topic with new details — do not repeat your last line.",
        "No trade calls. Keep answers under ~180 words unless asked for depth.",
      ].join(" ");
    }
    if (lang === "zh-TW") {
      return [
        "你是 Cycle Agent，宏觀助手。",
        "根據看板上下文直接回答問題，給出具體要點。",
        "禁止問「需要更多資訊嗎」或類似確認句；禁止用反問收尾。",
        "若用戶說「需要/好/繼續/是/ok」，在上一話題上補充新細節，禁止重複上一句。",
        "不要喊買賣。除非用戶要求展開，否則控制在約 180 字內。",
      ].join("");
    }
    return [
      "你是 Cycle Agent，宏观助手。",
      "根据看板上下文直接回答问题，给出具体要点。",
      "禁止问「需要更多信息吗」或类似确认句；禁止用反问收尾。",
      "若用户说「需要/好/继续/是/ok」，在上一话题上补充新细节，禁止重复上一句。",
      "不要喊买卖。除非用户要求展开，否则控制在约 180 字内。",
    ].join("");
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
    return /需要更多(信息|資訊)吗？?$|need more (info|information)\??$/i.test(t);
  }

  function buildMessages(msgs, q, lang) {
    const history = msgs
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, -1)
      .slice(-12)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 1200),
      }));

    const ctx = `看板上下文：${contextSnippet()}`;
    let userContent = q;
    if (isAffirmShort(q)) {
      userContent =
        lang === "en"
          ? `User confirmed they want more. Expand the previous answer with new concrete points. Do not repeat the last sentence. Do not ask a follow-up question.\n\nUser said: ${q}`
          : `用户确认想听更多。请在上一回答基础上补充新的具体要点，不要重复上一句，不要反问。\n\n用户说：${q}`;
    }

    return [
      { role: "user", content: ctx },
      {
        role: "assistant",
        content:
          lang === "en"
            ? "Understood. I will answer using that board context."
            : "收到，我会结合看板上下文直接作答。",
      },
      ...history,
      { role: "user", content: userContent },
    ];
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
            const live = await window.CycleLLM.chat(
              systemPrompt(lang),
              buildMessages(msgs, q, lang)
            );
            reply = (live && live.ok && live.text && live.text.trim()) || "";
            if (isLazyReply(reply)) {
              const retry = await window.CycleLLM.chat(
                systemPrompt(lang),
                buildMessages(msgs, q, lang).concat([
                  {
                    role: "user",
                    content:
                      lang === "en"
                        ? "Your last reply was too thin or only asked a question. Give a substantive answer now with 3 concrete points. No questions."
                        : "上一句太空或只在反问。请立刻给出有实质内容的回答，至少 3 个具体要点，不要提问。",
                  },
                ])
              );
              if (retry && retry.ok && retry.text && !isLazyReply(retry.text)) {
                reply = retry.text.trim();
              } else if (!reply || isLazyReply(reply)) {
                reply =
                  lang === "en"
                    ? "I couldn't expand that turn. Try asking a more specific follow-up (e.g. rates, inflation, or a sector)."
                    : "这一轮没展开好。请换个更具体的追问（例如利率、通胀或某个板块）。";
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
