/** 软翻译：新闻/日历落到当前 UI 语言；失败则原文 */
window.CycleTranslate = (function () {
  const cache = new Map();
  const S2T = {
    国: "國",
    济: "濟",
    历: "曆",
    数据: "數據",
    新闻: "新聞",
    复苏: "復甦",
    繁荣: "繁榮",
    滞胀: "滯脹",
    萧条: "蕭條",
    通胀: "通膨",
    联邦: "聯邦",
    议息: "議息",
    订阅: "訂閱",
    详情: "詳情",
    市场: "市場",
    休市: "休市",
    节假: "節假",
    公布: "公布",
    环比: "環比",
    同比: "同比",
    加载: "載入",
    缺失: "缺失",
    今天: "今天",
    选择: "選擇",
    日期: "日期",
    绿色: "綠色",
    能源: "能源",
    人工: "人工",
    智能: "智慧",
    开始: "開始",
    铺开: "鋪開",
    比较: "比較",
    容易: "容易",
    乐观: "樂觀",
  };

  function uiLang() {
    return (window.CycleState && window.CycleState.lang) || "zh";
  }

  function localeTag(lang) {
    if (lang === "zh-TW") return "zh-TW";
    if (lang === "en") return "en-US";
    return "zh-CN";
  }

  function toTraditional(text) {
    let s = String(text || "");
    Object.entries(S2T).forEach(([a, b]) => {
      s = s.split(a).join(b);
    });
    return s;
  }

  function pairFor(target) {
    if (target === "en") return "zh-CN|en";
    if (target === "zh-TW") return "en|zh-TW";
    return "en|zh-CN";
  }

  function detectSrc(text) {
    const hasCJK = /[\u4e00-\u9fff]/.test(text);
    return hasCJK ? "zh" : "en";
  }

  async function myMemory(text, langpair) {
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text.slice(0, 450)) +
      "&langpair=" +
      encodeURIComponent(langpair);
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const d = await res.json();
      const out = d && d.responseData && d.responseData.translatedText;
      if (!out || /MYMEMORY WARNING/i.test(out)) return null;
      return out;
    } catch (_) {
      return null;
    }
  }

  async function llmTranslate(text, target) {
    if (!window.CycleLLM || !window.CycleLLM.chat || !window.CycleLLM.getStatus) {
      return null;
    }
    const st = window.CycleLLM.getStatus();
    if (!st || st.status !== "ready") return null;
    const langName =
      target === "en"
        ? "English"
        : target === "zh-TW"
          ? "Traditional Chinese"
          : "Simplified Chinese";
    const system =
      "You are a precise translator for macro/finance text. Translate into " +
      langName +
      ". Output ONLY the translation — no quotes, labels, or notes.";
    try {
      const live = await window.CycleLLM.chat(system, String(text || "").slice(0, 900));
      if (live && live.ok && live.text) {
        const t = String(live.text).trim().replace(/^["「『]|["」』]$/g, "");
        return t || null;
      }
    } catch (_) {}
    return null;
  }

  function needsMachine(src, target) {
    if (target === "en") return src === "zh";
    if (target === "zh" || target === "zh-Hans" || target === "zh-TW") {
      return src === "en";
    }
    return false;
  }

  async function translateText(text, targetLang) {
    const raw = String(text || "").trim();
    if (!raw) return raw;
    const target = targetLang || uiLang();
    const key = target + "|" + raw;
    if (cache.has(key)) return cache.get(key);

    const src = detectSrc(raw);
    let out = raw;

    if (target === "zh" || target === "zh-Hans") {
      if (src === "zh") out = raw;
      else {
        out = (await myMemory(raw, "en|zh-CN")) || raw;
      }
    } else if (target === "zh-TW") {
      if (src === "zh") out = toTraditional(raw);
      else {
        const tw = await myMemory(raw, "en|zh-TW");
        out = tw || toTraditional((await myMemory(raw, "en|zh-CN")) || raw);
      }
    } else if (target === "en") {
      if (src === "en") out = raw;
      else {
        out = (await myMemory(raw, "zh-CN|en")) || raw;
      }
    }

    if (needsMachine(src, target) && (out === raw || !out)) {
      const llm = await llmTranslate(raw, target);
      if (llm) out = target === "zh-TW" && src === "zh" ? toTraditional(llm) : llm;
    }

    cache.set(key, out);
    return out;
  }

  async function translateNewsItem(item, targetLang) {
    const target = targetLang || uiLang();
    const title = await translateText(item.title, target);
    const summary = await translateText(item.summary || "", target);
    return Object.assign({}, item, {
      title,
      summary,
      titleRaw: item.title,
      summaryRaw: item.summary,
    });
  }

  return {
    translateText,
    translateNewsItem,
    localeTag,
    uiLang,
    toTraditional,
  };
})();
