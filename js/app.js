window.CycleState = {
  country: localStorage.getItem("cycle-country") || "US",
  lang: localStorage.getItem("cycle-lang") || "zh",
  theme: localStorage.getItem("cycle-theme") || "light",
  page: "data",
  seed: null,
};

window.CycleUI = {
  openModal(html) {
    const modal = document.getElementById("modal");
    const sheet = document.getElementById("sheet");
    sheet.innerHTML = html;
    modal.classList.add("open");
    document.body.classList.add("modal-open");
    sheet.querySelectorAll("[data-close]").forEach((b) => {
      b.addEventListener("click", () => window.CycleUI.closeModal());
    });
  },
  closeModal() {
    document.getElementById("modal").classList.remove("open");
    document.body.classList.remove("modal-open");
  },
};

(function () {
  const els = {
    country: document.getElementById("countrySelect"),
    kBadge: document.getElementById("kBadge"),
    themeBtn: document.getElementById("themeBtn"),
    langBtn: document.getElementById("langBtn"),
    main: document.getElementById("main"),
    modal: document.getElementById("modal"),
    llmStatus: document.getElementById("llmStatus"),
  };

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", window.CycleState.theme);
    els.themeBtn.textContent =
      window.CycleState.theme === "dark" ? window.t("themeLight") : window.t("themeDark");
  }

  function applyLang() {
    document.documentElement.lang = window.CycleState.lang === "zh" ? "zh-CN" : "en";
    els.langBtn.textContent = window.CycleState.lang === "zh" ? "EN" : "中文";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      node.textContent = window.t(key);
    });
    refreshHeader();
  }

  function refreshHeader() {
    const info = window.CycleKondratiev.shortHeader(window.CycleState.lang);
    els.kBadge.textContent = info.text;
    els.kBadge.title = info.detail;
    els.country.value = window.CycleState.country;
  }

  async function renderPage() {
    const page = window.CycleState.page;
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.page === page);
    });
    els.main.innerHTML = `<div class="loading">${window.t("loading")}</div>`;
    const view = window.CyclePages[page];
    if (view && view.render) await view.render(els.main);
  }

  function setPage(page) {
    window.CycleState.page = page;
    location.hash = page;
    renderPage();
  }

  async function checkLLM() {
    const ping = await window.CycleLLM.ping();
    if (ping.ok) {
      els.llmStatus.textContent = "Ollama ✓";
      els.llmStatus.classList.add("ok");
      const cfg = window.CycleLLM.settings();
      if (ping.models && ping.models.length && !ping.models.some((m) => m.startsWith(cfg.model))) {
        // keep configured model; status still ok
      }
    } else {
      els.llmStatus.textContent = "Ollama ✗";
      els.llmStatus.classList.remove("ok");
      els.llmStatus.title = window.t("aiOffline");
    }
  }

  function wire() {
    els.country.addEventListener("change", () => {
      window.CycleState.country = els.country.value;
      localStorage.setItem("cycle-country", window.CycleState.country);
      renderPage();
    });
    els.themeBtn.addEventListener("click", () => {
      window.CycleState.theme =
        window.CycleState.theme === "dark" ? "light" : "dark";
      localStorage.setItem("cycle-theme", window.CycleState.theme);
      applyTheme();
    });
    els.langBtn.addEventListener("click", () => {
      window.CycleState.lang = window.CycleState.lang === "zh" ? "en" : "zh";
      localStorage.setItem("cycle-lang", window.CycleState.lang);
      applyLang();
      renderPage();
    });
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.addEventListener("click", () => setPage(b.dataset.page));
    });
    els.modal.addEventListener("click", (e) => {
      if (e.target === els.modal) window.CycleUI.closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") window.CycleUI.closeModal();
    });
    window.addEventListener("hashchange", () => {
      const h = (location.hash || "#data").replace("#", "");
      if (["data", "news", "calendar"].includes(h)) {
        window.CycleState.page = h;
        renderPage();
      }
    });
  }

  async function init() {
    applyTheme();
    wire();
    const res = await fetch("./data/seed.json", { cache: "no-cache" });
    window.CycleState.seed = await res.json();
    applyLang();
    const h = (location.hash || "#data").replace("#", "");
    window.CycleState.page = ["data", "news", "calendar"].includes(h) ? h : "data";
    await renderPage();
    checkLLM();
  }

  init().catch((err) => {
    els.main.innerHTML =
      '<div class="empty">Failed to load Cycle: ' +
      String(err && err.message ? err.message : err) +
      "</div>";
  });
})();
