/** 可折叠 AI 分析块：默认合上，显示「查看AI分析」 */
window.CycleAIUI = (function () {
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

    btn.addEventListener("click", async () => {
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
  }

  return { mount };
})();
