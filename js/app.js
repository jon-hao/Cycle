window.CycleState = {
  country: localStorage.getItem("cycle-country") || "US",
  lang: localStorage.getItem("cycle-lang") || "zh",
  theme: localStorage.getItem("cycle-theme") || "light",
  page: "data",
};

window.CycleUI = {
  openModal(html) {
    const modal = document.getElementById("modal");
    const sheet = document.getElementById("sheet");
    sheet.innerHTML = html;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("modal-open");
    sheet.querySelectorAll("[data-close]").forEach((b) => {
      b.addEventListener("click", () => window.CycleUI.closeModal());
    });
  },
  closeModal() {
    const modal = document.getElementById("modal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("modal-open");
  },
};

/** 方形自定义下拉 */
window.CycleSelect = (function () {
  function mount(root, options, value, onChange) {
    root.classList.add("sq-select");
    root.innerHTML = "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sq-select-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    const list = document.createElement("div");
    list.className = "sq-select-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;

    function labelOf(v) {
      const opt = options.find((o) => o.value === v);
      return opt ? opt.label : v;
    }

    function setValue(v, silent) {
      root.dataset.value = v;
      btn.innerHTML = `<span>${labelOf(v)}</span><span class="sq-caret" aria-hidden="true"></span>`;
      list.querySelectorAll(".sq-option").forEach((el) => {
        el.classList.toggle("active", el.dataset.value === v);
      });
      if (!silent && typeof onChange === "function") onChange(v);
    }

    options.forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "sq-option";
      item.dataset.value = opt.value;
      item.setAttribute("role", "option");
      item.textContent = opt.label;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        list.hidden = true;
        root.classList.remove("open");
        setValue(opt.value);
      });
      list.appendChild(item);
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".sq-select.open").forEach((el) => {
        if (el !== root) {
          el.classList.remove("open");
          const l = el.querySelector(".sq-select-list");
          if (l) l.hidden = true;
        }
      });
      const open = list.hidden;
      list.hidden = !open;
      root.classList.toggle("open", open);
    });

    root.appendChild(btn);
    root.appendChild(list);
    setValue(value, true);

    return {
      setValue: (v) => setValue(v, true),
      refresh(opts, v) {
        options = opts;
        list.innerHTML = "";
        options.forEach((opt) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "sq-option";
          item.dataset.value = opt.value;
          item.setAttribute("role", "option");
          item.textContent = opt.label;
          item.addEventListener("click", (e) => {
            e.stopPropagation();
            list.hidden = true;
            root.classList.remove("open");
            setValue(opt.value);
          });
          list.appendChild(item);
        });
        setValue(v != null ? v : root.dataset.value, true);
      },
    };
  }

  document.addEventListener("click", () => {
    document.querySelectorAll(".sq-select.open").forEach((el) => {
      el.classList.remove("open");
      const l = el.querySelector(".sq-select-list");
      if (l) l.hidden = true;
    });
  });

  return { mount };
})();

(function () {
  const els = {
    country: document.getElementById("countrySelect"),
    themeBtn: document.getElementById("themeBtn"),
    langBtn: document.getElementById("langBtn"),
    main: document.getElementById("main"),
    modal: document.getElementById("modal"),
    footer: document.getElementById("siteFooter"),
    indicator: document.getElementById("navIndicator"),
  };

  let countryCtl = null;

  function countryOptions() {
    return [
      { value: "US", label: window.t("countryUS") },
      { value: "CN", label: window.t("countryCN") },
      { value: "GLOBAL", label: window.t("countryGLOBAL") },
    ];
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", window.CycleState.theme);
    const dark = window.CycleState.theme === "dark";
    const sun = els.themeBtn.querySelector(".theme-sun");
    const moon = els.themeBtn.querySelector(".theme-moon");
    if (sun) sun.hidden = dark;
    if (moon) moon.hidden = !dark;
  }

  function applyLang() {
    document.documentElement.lang =
      window.CycleState.lang === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = window.t(node.getAttribute("data-i18n"));
    });
    if (countryCtl) {
      countryCtl.refresh(countryOptions(), window.CycleState.country);
    }
    moveIndicator(false);
  }

  function moveIndicator(animate) {
    const active = document.querySelector(".nav-btn.active");
    if (!active || !els.indicator) return;
    const pill = active.parentElement;
    const pr = pill.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    els.indicator.style.width = ar.width + "px";
    els.indicator.style.transform = `translateX(${ar.left - pr.left}px)`;
    els.indicator.classList.toggle("no-anim", !animate);
  }

  async function renderPage(withFx) {
    const page = window.CycleState.page;
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.page === page);
    });
    moveIndicator(true);

    if (withFx) {
      els.main.classList.remove("page-enter");
      els.main.classList.add("page-exit");
      await new Promise((r) => setTimeout(r, 160));
    }

    els.main.innerHTML = `<div class="loading">${window.t("loading")}</div>`;
    els.main.classList.remove("page-exit");
    els.main.classList.add("page-enter");

    const view = window.CyclePages[page];
    if (view && view.render) await view.render(els.main);
  }

  function setPage(page) {
    if (window.CycleState.page === page) return;
    window.CycleState.page = page;
    location.hash = page;
    renderPage(true);
  }

  function wire() {
    countryCtl = window.CycleSelect.mount(
      els.country,
      countryOptions(),
      window.CycleState.country,
      (v) => {
        window.CycleState.country = v;
        localStorage.setItem("cycle-country", v);
        renderPage(false);
      }
    );

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
      renderPage(false);
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
        if (window.CycleState.page !== h) {
          window.CycleState.page = h;
          renderPage(true);
        }
      }
    });

    window.addEventListener("resize", () => moveIndicator(false));

    // 锁住外壳：禁止 body 橡皮筋；仅 main 滚动
    document.addEventListener(
      "touchmove",
      (e) => {
        if (document.documentElement.classList.contains("modal-open")) {
          if (!e.target.closest(".sheet")) e.preventDefault();
          return;
        }
        if (!e.target.closest(".site-main") && !e.target.closest(".sheet")) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
  }

  async function init() {
    // 预热本地大模型（不等待）
    window.CycleLLM.ping();

    applyTheme();
    wire();
    applyLang();

    const h = (location.hash || "#data").replace("#", "");
    window.CycleState.page = ["data", "news", "calendar"].includes(h)
      ? h
      : "data";
    await renderPage(false);
    requestAnimationFrame(() => moveIndicator(false));
  }

  init().catch((err) => {
    els.main.innerHTML =
      '<div class="empty">Failed to load Cycle: ' +
      String(err && err.message ? err.message : err) +
      "</div>";
  });
})();
