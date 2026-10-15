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
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function contextSnippet() {
    const st = window.CycleState || {};
    const k = window.CycleKondratiev && window.CycleKondratiev.waveAt
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

  function open() {
    const modal = document.getElementById("modal");
    const sheet = document.getElementById("sheet");
    let msgs = load();

    function paint() {
      const bodyHtml = msgs.length
        ? msgs
            .map(
              (m) =>
                `<div class="agent-msg ${escapeHtml(m.role)}">${escapeHtml(
                  m.content
                )}</div>`
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
        if (!q) return;
        msgs.push({ role: "user", content: q, at: Date.now() });
        save(msgs);
        paint();
        const thinking = { role: "assistant", content: "…", at: Date.now() };
        msgs.push(thinking);
        save(msgs);
        paint();

        const lang = window.CycleState.lang;
        const system =
          lang === "en"
            ? "You are Cycle Agent, a concise macro desk assistant. Use the provided board context. Answer in plain English. No trade calls."
            : lang === "zh-TW"
              ? "你是 Cycle Agent，簡潔的宏觀助手。根據看板上下文用繁體中文回答。不要喊買賣。"
              : "你是 Cycle Agent，简洁的宏观助手。根据看板上下文用简体中文回答。不要喊买卖。";
        const history = msgs
          .slice(0, -1)
          .slice(-10)
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");
        const user = `上下文：${contextSnippet()}\n对话：\n${history}\nuser: ${q}`;

        let reply = "";
        try {
          if (window.CycleLLM && window.CycleLLM.chat) {
            const live = await window.CycleLLM.chat(system, user);
            reply =
              (live && live.ok && live.text) ||
              (lang === "en"
                ? "Model not ready — download via the AI button first."
                : "模型未就绪，请先通过 AI 按钮下载模型。");
          } else {
            reply =
              lang === "en" ? "Agent unavailable." : "Agent 暂不可用。";
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
          const text = ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript;
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
