window.CycleState = {
  country: (function () {
    const raw = localStorage.getItem("cycle-country") || "US";
    if (raw === "GLOBAL" || (raw !== "US" && raw !== "CN")) {
      localStorage.setItem("cycle-country", "US");
      return "US";
    }
    return raw;
  })(),
  lang: (function () {
    const raw = localStorage.getItem("cycle-lang") || "zh";
    if (raw === "zh-Hans" || raw === "zh-CN") return "zh";
    if (raw === "zh-Hant" || raw === "zh-TW") return "zh-TW";
    if (raw === "en" || raw === "zh" || raw === "zh-TW") return raw;
    return "zh";
  })(),
  theme: localStorage.getItem("cycle-theme") || "light",
  kModel: "realtime",
  page: "news",
  autoRefresh: false,
};

/** 只保留国家 / 语言 / 主题；清掉历史杂项 */
(function scrubLocalStorage() {
  const keep = new Set(["cycle-country", "cycle-lang", "cycle-theme"]);
  try {
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("cycle") === 0 && !keep.has(k)) drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
})();

window.CycleUI = {
  openModal(html) {
    const modal = document.getElementById("modal");
    const sheet = document.getElementById("sheet");
    sheet.className = "sheet";
    sheet.innerHTML = html;
    modal.classList.remove("agent-modal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("modal-open");
    sheet.querySelectorAll("[data-close]").forEach((b) => {
      b.addEventListener("click", () => window.CycleUI.closeModal());
    });
  },
  closeModal() {
    if (modalHasAgent()) {
      window.CycleAgent.close();
      return;
    }
    const modal = document.getElementById("modal");
    const ae = document.activeElement;
    if (ae && modal.contains(ae) && typeof ae.blur === "function") ae.blur();
    modal.classList.remove("open", "agent-modal");
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("modal-open");
  },
};

function modalHasAgent() {
  const sheet = document.getElementById("sheet");
  return sheet && sheet.classList.contains("agent-sheet");
}

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

    function labelHtml(opt) {
      if (!opt) return "";
      const flag = opt.flag ? `<span class="flag">${opt.flag}</span>` : "";
      return `${flag}<span class="opt-text">${opt.label}</span>`;
    }

    function labelOf(v) {
      const opt = options.find((o) => o.value === v);
      return labelHtml(opt) || v;
    }

    function setValue(v, silent) {
      root.dataset.value = v;
      btn.innerHTML = `<span class="sq-label">${labelOf(v)}</span><span class="sq-caret" aria-hidden="true"></span>`;
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
      item.innerHTML = labelHtml(opt);
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
          item.innerHTML = labelHtml(opt);
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
    lang: document.getElementById("langSelect"),
    themeBtn: document.getElementById("themeBtn"),
    main: document.getElementById("main"),
    modal: document.getElementById("modal"),
    footer: document.getElementById("siteFooter"),
    indicator: document.getElementById("navIndicator"),
    modelFab: document.getElementById("modelFab"),
    modelFabLabel: document.getElementById("modelFabLabel"),
    modelFabRing: document.getElementById("modelFabRing"),
    refreshFab: document.getElementById("refreshFab"),
    ptr: document.getElementById("ptrIndicator"),
  };

  let countryCtl = null;
  let langCtl = null;
  let refreshing = false;
  let autoTimer = null;
  // 金十快讯近实时；3 分钟兼顾新鲜度与 Lambda 免费额度（开开关约 480 次/页/天）
  const AUTO_MS = 3 * 60 * 1000;

  function countryOptions() {
    return [
      { value: "US", label: window.t("countryUS"), flag: "🇺🇸" },
      { value: "CN", label: window.t("countryCN"), flag: "🇨🇳" },
    ];
  }

  function langOptions() {
    return [
      { value: "zh", label: "简体中文" },
      { value: "zh-TW", label: "繁體中文" },
      { value: "en", label: "English" },
    ];
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", window.CycleState.theme);
    if (els.themeBtn) {
      els.themeBtn.title =
        window.CycleState.theme === "dark" ? "Light" : "Dark";
    }
  }

  function applyLang() {
    const lang = window.CycleState.lang;
    document.documentElement.lang =
      lang === "zh-TW" ? "zh-TW" : lang === "en" ? "en" : "zh-CN";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = window.t(node.getAttribute("data-i18n"));
    });
    if (countryCtl) {
      countryCtl.refresh(countryOptions(), window.CycleState.country);
    }
    if (langCtl) {
      langCtl.refresh(langOptions(), window.CycleState.lang);
    }
    paintModelFab(window.CycleLLM.getStatus());
    paintRefreshFab();
    moveIndicator(false);
  }

  function paintModelFab(st) {
    if (!els.modelFab) return;
    const status = st.status || "idle";
    els.modelFab.dataset.status = status;
    const pct = Math.round((st.progress || 0) * 100);
    if (els.modelFabRing) {
      els.modelFabRing.style.setProperty("--p", String(st.progress || 0));
    }
    els.modelFabLabel.textContent = "AI";
    if (status === "ready") {
      els.modelFab.title = window.t("modelReady");
    } else if (status === "downloading") {
      els.modelFab.title =
        window.t("modelDownloading") + " " + pct + "%" + (st.text ? " · " + st.text : "");
    } else if (status === "error") {
      els.modelFab.title = window.t("modelError") + (st.text ? ": " + st.text : "");
    } else {
      els.modelFab.title = window.t("modelDownload");
    }
  }

  function paintRefreshFab() {
    if (!els.refreshFab) return;
    const on = !!window.CycleState.autoRefresh;
    els.refreshFab.dataset.on = on ? "1" : "0";
    els.refreshFab.setAttribute("aria-pressed", on ? "true" : "false");
    els.refreshFab.title = on
      ? window.t("autoRefreshOn") + " · " + window.t("autoRefreshHint")
      : window.t("autoRefreshOff") + " · " + window.t("autoRefreshHint");
    const lab = els.refreshFab.querySelector(".refresh-fab-label");
    if (lab) lab.textContent = on ? "ON" : "OFF";
  }

  function setAutoRefresh(on) {
    window.CycleState.autoRefresh = !!on;
    paintRefreshFab();
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (window.CycleState.autoRefresh) {
      autoTimer = setInterval(() => {
        if (document.hidden) return;
        renderPage(false, { force: true });
      }, AUTO_MS);
    }
  }

  function wireModelFab() {
    if (!els.modelFab) return;
    window.CycleLLM.onState(paintModelFab);
    els.modelFab.addEventListener("click", () => {
      const st = window.CycleLLM.getStatus();
      if (st.status === "ready") {
        window.CycleAgent.open();
        return;
      }
      if (st.status === "downloading") return;
      window.CycleLLM.startDownload();
    });
  }

  function wireRefreshFab() {
    if (!els.refreshFab) return;
    els.refreshFab.addEventListener("click", () => {
      setAutoRefresh(!window.CycleState.autoRefresh);
    });
    paintRefreshFab();
  }

  function wirePullToRefresh() {
    const main = els.main;
    let startY = 0;
    let pulling = false;

    main.addEventListener(
      "touchstart",
      (e) => {
        if (main.scrollTop > 0 || refreshing) return;
        startY = e.touches[0].clientY;
        pulling = true;
      },
      { passive: true }
    );

    main.addEventListener(
      "touchmove",
      (e) => {
        if (!pulling || refreshing) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 12 && main.scrollTop <= 0) {
          if (els.ptr) {
            els.ptr.hidden = false;
            els.ptr.textContent = window.t("pullRefresh");
            els.ptr.style.setProperty(
              "--ptr-y",
              Math.min(72, dy * 0.4) + "px"
            );
          }
          if (dy > 70 && e.cancelable) e.preventDefault();
        }
      },
      { passive: false }
    );

    main.addEventListener(
      "touchend",
      async (e) => {
        if (!pulling) return;
        pulling = false;
        const dy = (e.changedTouches[0] && e.changedTouches[0].clientY) - startY;
        if (els.ptr) {
          els.ptr.style.setProperty("--ptr-y", "0px");
        }
        if (dy > 70 && main.scrollTop <= 0 && !refreshing) {
          refreshing = true;
          if (els.ptr) {
            els.ptr.hidden = false;
            els.ptr.textContent = window.t("refreshing");
          }
          try {
            await renderPage(false, { force: true });
            if (window.CycleBoard && window.CycleBoard.warmInBackground) {
              window.CycleBoard.warmInBackground();
            }
          } finally {
            refreshing = false;
            if (els.ptr) els.ptr.hidden = true;
          }
        } else if (els.ptr) {
          els.ptr.hidden = true;
        }
      },
      { passive: true }
    );
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

  let pageRenderSeq = 0;

  async function renderPage(withFx, opts) {
    const seq = ++pageRenderSeq;
    const page = window.CycleState.page;
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.page === page);
    });
    moveIndicator(true);

    if (withFx) {
      els.main.classList.remove("page-enter");
      els.main.classList.add("page-exit");
      await new Promise((r) => setTimeout(r, 160));
      if (seq !== pageRenderSeq) return;
    }

    els.main.classList.remove("page-exit");
    els.main.classList.add("page-enter");

    const view = window.CyclePages[page];
    if (view && view.render) {
      try {
        await view.render(els.main, opts || {});
      } catch (e) {
        console.warn("[Cycle] page render", page, e);
        if (seq === pageRenderSeq) {
          const msg = String(e && e.message ? e.message : e);
          els.main.innerHTML =
            `<div class="empty">${window.t("loadError")}<br/><span class="tiny">${msg
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</span></div>`;
        }
      }
    }
  }

  function setPage(page) {
    if (window.CycleState.page === page) return;
    window.CycleState.page = page;
    if (location.hash.replace(/^#/, "") !== page) {
      location.hash = page;
    }
    // footer 切换复用内存，不重复拉网；自动刷新 / 下拉 / 换国家才 force
    renderPage(true, { soft: true });
  }

  function wire() {
    countryCtl = window.CycleSelect.mount(
      els.country,
      countryOptions(),
      window.CycleState.country,
      (v) => {
        window.CycleState.country = v;
        localStorage.setItem("cycle-country", v);
        renderPage(false, { force: true });
      }
    );

    langCtl = window.CycleSelect.mount(
      els.lang,
      langOptions(),
      window.CycleState.lang,
      (v) => {
        window.CycleState.lang = v;
        localStorage.setItem("cycle-lang", v);
        applyLang();
        renderPage(false, { soft: true });
      }
    );

    els.themeBtn.addEventListener("click", () => {
      window.CycleState.theme =
        window.CycleState.theme === "dark" ? "light" : "dark";
      localStorage.setItem("cycle-theme", window.CycleState.theme);
      applyTheme();
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
      const h = (location.hash || "#news").replace("#", "");
      if (["data", "news", "calendar"].includes(h)) {
        if (window.CycleState.page !== h) {
          window.CycleState.page = h;
          renderPage(true, { soft: true });
        }
      }
    });

    window.addEventListener("resize", () => moveIndicator(false));

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
    applyTheme();
    wire();
    wireModelFab();
    wireRefreshFab();
    wirePullToRefresh();
    applyLang();

    if (window.CycleLLM && window.CycleLLM.resumeIfNeeded) {
      window.CycleLLM.resumeIfNeeded();
    }

    const h = (location.hash || "#news").replace("#", "");
    window.CycleState.page = ["data", "news", "calendar"].includes(h)
      ? h
      : "news";
    if (!location.hash || location.hash === "#") {
      location.hash = "news";
    }

    await renderPage(false);
    if (window.CycleBoard && window.CycleBoard.warmInBackground) {
      window.CycleBoard.warmInBackground();
    }
    requestAnimationFrame(() => moveIndicator(false));
  }

  init().catch((err) => {
    els.main.innerHTML =
      '<div class="empty">Failed to load Cycle: ' +
      String(err && err.message ? err.message : err) +
      "</div>";
  });
})();
