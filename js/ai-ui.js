/** 可折叠 AI 分析块：模型未就绪时不可点；默认合上 */
window.CycleAIUI = (function () {
  function isModelReady() {
    try {
      return window.CycleLLM.getStatus().status === "ready";
    } catch (_) {
      return false;
    }
  }

  function mount(host, kind, payload) {
    if (!host) return;
    host.classList.add("ai-fold");
    host.innerHTML = `
      <button type="button" class="ai-toggle" aria-expanded="false">${window.t("viewAI")}</button>
      <pre class="ai-box" hidden></pre>
    `;
    const btn = host.querySelector(".ai-toggle");
    const box = host.querySelector(".ai-box");
    let loaded = false;
    let loading = false;

    function syncLock() {
      const ready = isModelReady();
      btn.disabled = !ready;
      btn.classList.toggle("is-locked", !ready);
      btn.title = ready ? "" : window.t("aiNeedModel");
      if (!ready && btn.getAttribute("aria-expanded") === "true") {
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = window.t("viewAI");
        box.hidden = true;
      }
    }

    syncLock();
    const off = window.CycleLLM.onState
      ? window.CycleLLM.onState(syncLock)
      : null;

    btn.addEventListener("click", async () => {
      if (!isModelReady()) return;
      const open = btn.getAttribute("aria-expanded") === "true";
      if (open) {
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = window.t("viewAI");
        box.hidden = true;
        return;
      }
      btn.setAttribute("aria-expanded", "true");
      btn.textContent = window.t("hideAI");
      box.hidden = false;
      if (loaded || loading) return;
      loading = true;
      box.textContent = window.t("askAI");
      const res = await window.CycleLLM.interpret(
        kind,
        payload,
        window.CycleState.lang,
        (p, text) => {
          const pct = Math.round((p || 0) * 100);
          box.textContent =
            window.t("aiLoadingModel") +
            (pct ? ` ${pct}%` : "") +
            (text ? `\n${text}` : "");
        }
      );
      box.textContent = res.text;
      loaded = true;
      loading = false;
    });

    host._aiOff = off;
  }

  return { mount };
})();
