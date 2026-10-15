/** 经济日历事件标题：中英合理互译（细粒度优先，避免 CPI 各口径被压成同一条） */
window.CycleCalI18n = (function () {
  const RULES = [
    {
      re: /FOMC\s*(Rate\s*)?(Decision|Meeting|Statement)|Federal\s*Reserve.*Decision|Fed\s*Interest\s*Rate\s*Decision|美联储.*议息|FOMC.*决议/i,
      zh: "美联储议息决议（FOMC）",
      en: "FOMC Rate Decision",
    },
    {
      re: /FOMC\s*Minutes|FOMC.*纪要|联储.*纪要/i,
      zh: "美联储议息会议纪要",
      en: "FOMC Minutes",
    },
    {
      re: /Non[- ]?Farm\s*Payrolls|Nonfarm\s*Payrolls|NFP|非农/i,
      zh: "美国非农就业人数",
      en: "US Nonfarm Payrolls",
    },
    {
      re: /Unemployment\s*Rate|失业率/i,
      zh: "失业率",
      en: "Unemployment Rate",
    },
    {
      re: /Initial\s*Jobless\s*Claims|初请失业金/i,
      zh: "初请失业金人数",
      en: "Initial Jobless Claims",
    },
    // CPI / PPI：先匹配 Core + YoY/MoM，再匹配笼统项
    {
      re: /Core\s*CPI.*(Y\/?Y|YoY|Year)|核心\s*CPI.*同比/i,
      zh: "核心 CPI（同比）",
      en: "Core CPI (YoY)",
    },
    {
      re: /Core\s*CPI.*(M\/?M|MoM|Month)|核心\s*CPI.*环比/i,
      zh: "核心 CPI（环比）",
      en: "Core CPI (MoM)",
    },
    {
      re: /Core\s*CPI|核心\s*CPI|核心消费/i,
      zh: "核心 CPI",
      en: "Core CPI",
    },
    {
      re: /CPI.*(Y\/?Y|YoY|Year)|Consumer\s*Price.*(Y\/?Y|YoY)|CPI.*同比|居民消费价格.*同比/i,
      zh: "消费者物价指数 CPI（同比）",
      en: "CPI (YoY)",
    },
    {
      re: /CPI.*(M\/?M|MoM|Month)|Consumer\s*Price.*(M\/?M|MoM)|CPI.*环比|居民消费价格.*环比/i,
      zh: "消费者物价指数 CPI（环比）",
      en: "CPI (MoM)",
    },
    {
      re: /CPI|Consumer\s*Price\s*Index|消费者物价|居民消费价格/i,
      zh: "消费者物价指数（CPI）",
      en: "Consumer Price Index (CPI)",
    },
    {
      re: /Core\s*PPI.*(Y\/?Y|YoY)|核心\s*PPI.*同比/i,
      zh: "核心 PPI（同比）",
      en: "Core PPI (YoY)",
    },
    {
      re: /Core\s*PPI.*(M\/?M|MoM)|核心\s*PPI.*环比/i,
      zh: "核心 PPI（环比）",
      en: "Core PPI (MoM)",
    },
    {
      re: /PPI.*(Y\/?Y|YoY)|Producer\s*Price.*(Y\/?Y|YoY)|PPI.*同比/i,
      zh: "生产者物价指数 PPI（同比）",
      en: "PPI (YoY)",
    },
    {
      re: /PPI.*(M\/?M|MoM)|Producer\s*Price.*(M\/?M|MoM)|PPI.*环比/i,
      zh: "生产者物价指数 PPI（环比）",
      en: "PPI (MoM)",
    },
    {
      re: /PPI|Producer\s*Price\s*Index|生产者物价|工业生产者/i,
      zh: "生产者物价指数（PPI）",
      en: "Producer Price Index (PPI)",
    },
    {
      re: /GDP|Gross\s*Domestic\s*Product|国内生产总值/i,
      zh: "国内生产总值（GDP）",
      en: "Gross Domestic Product (GDP)",
    },
    {
      re: /Retail\s*Sales|零售销售/i,
      zh: "零售销售",
      en: "Retail Sales",
    },
    {
      re: /ISM\s*Manufacturing|制造业\s*PMI|ISM制造/i,
      zh: "ISM 制造业 PMI",
      en: "ISM Manufacturing PMI",
    },
    {
      re: /ISM\s*Services|服务业\s*PMI|ISM服务/i,
      zh: "ISM 服务业 PMI",
      en: "ISM Services PMI",
    },
    {
      re: /PMI/i,
      zh: "采购经理人指数（PMI）",
      en: "Purchasing Managers' Index (PMI)",
    },
    {
      re: /Interest\s*Rate\s*Decision|Rate\s*Decision|利率决议|议息/i,
      zh: "利率决议",
      en: "Interest Rate Decision",
    },
    {
      re: /Federal\s*Funds\s*Rate|联邦基金利率/i,
      zh: "联邦基金利率",
      en: "Federal Funds Rate",
    },
    {
      re: /Beige\s*Book|褐皮书/i,
      zh: "褐皮书",
      en: "Beige Book",
    },
    {
      re: /Jackson\s*Hole/i,
      zh: "杰克逊霍尔央行年会",
      en: "Jackson Hole Symposium",
    },
    {
      re: /Building\s*Permits|营建许可/i,
      zh: "营建许可",
      en: "Building Permits",
    },
    {
      re: /Housing\s*Starts|新屋开工/i,
      zh: "新屋开工",
      en: "Housing Starts",
    },
    {
      re: /Existing\s*Home\s*Sales|成屋销售/i,
      zh: "成屋销售",
      en: "Existing Home Sales",
    },
    {
      re: /Durable\s*Goods|耐用品订单/i,
      zh: "耐用品订单",
      en: "Durable Goods Orders",
    },
    {
      re: /Trade\s*Balance|贸易帐|贸易差额/i,
      zh: "贸易差额",
      en: "Trade Balance",
    },
    {
      re: /Consumer\s*Confidence|消费者信心/i,
      zh: "消费者信心指数",
      en: "Consumer Confidence",
    },
    {
      re: /Michigan\s*Consumer|密歇根.*信心/i,
      zh: "密歇根大学消费者信心",
      en: "Michigan Consumer Sentiment",
    },
    {
      re: /Crude\s*Oil\s*Inventories|原油库存/i,
      zh: "原油库存",
      en: "Crude Oil Inventories",
    },
    {
      re: /LPR|Loan\s*Prime\s*Rate|贷款市场报价利率/i,
      zh: "贷款市场报价利率（LPR）",
      en: "Loan Prime Rate (LPR)",
    },
    {
      re: /Labour\s*Force|Labor\s*Force|就业人口|劳动力/i,
      zh: "劳动力调查",
      en: "Labour Force",
    },
    {
      re: /PBOC|People'?s\s*Bank\s*of\s*China|中国人民银行/i,
      zh: "中国人民银行相关数据",
      en: "PBOC-related Release",
    },
    {
      re: /^Market\s*Holiday$|^Bank\s*Holiday$|^休市$|^节假日$/i,
      zh: "市场休市",
      en: "Market Holiday",
    },
    {
      re: /Witching|四巫/i,
      zh: "四巫日",
      en: "Quadruple Witching",
    },
  ];

  const HOLIDAY_ZH = {
    "New Year's Day": "元旦",
    "Martin Luther King Jr. Day": "马丁·路德·金日",
    "Martin Luther King": "马丁·路德·金日",
    "Presidents' Day": "总统日",
    "Presidents Day": "总统日",
    "Good Friday": "耶稣受难日",
    "Memorial Day": "阵亡将士纪念日",
    Juneteenth: "六月节",
    "Independence Day": "独立日",
    "Labor Day": "劳工节",
    "Columbus Day": "哥伦布日",
    Thanksgiving: "感恩节",
    "Thanksgiving Day": "感恩节",
    Christmas: "圣诞节",
    "Christmas Day": "圣诞节",
  };

  const HOLIDAY_TW = {
    "New Year's Day": "元旦",
    "Martin Luther King Jr. Day": "馬丁·路德·金日",
    "Presidents' Day": "總統日",
    "Good Friday": "耶穌受難日",
    "Memorial Day": "陣亡將士紀念日",
    Juneteenth: "六月節",
    "Independence Day": "獨立日",
    "Labor Day": "勞工節",
    "Columbus Day": "哥倫布日",
    Thanksgiving: "感恩節",
    Christmas: "聖誕節",
    "Christmas Day": "聖誕節",
  };

  function marketLabel(country, lang) {
    if (country === "US") {
      if (lang === "en") return "US equity market holiday";
      if (lang === "zh-TW") return "美國股市休市";
      return "美国股市休市";
    }
    if (country === "CN") {
      if (lang === "en") return "China market holiday";
      if (lang === "zh-TW") return "中國市場休市";
      return "中国市场休市";
    }
    if (lang === "en") return "Market holiday";
    if (lang === "zh-TW") return "市場休市";
    return "市场休市";
  }

  function holidayDisplay(raw, lang, meta) {
    const title = String(raw || "").trim();
    const country = (meta && (meta.market || meta.country)) || "US";
    let name = (meta && meta.holidayName) || title;
    let named = null;
    const pack = lang === "zh-TW" ? HOLIDAY_TW : HOLIDAY_ZH;
    if (lang !== "en") {
      for (const [en, zh] of Object.entries(pack)) {
        if (name.toLowerCase().includes(en.toLowerCase())) {
          named = zh;
          break;
        }
      }
    } else {
      for (const en of Object.keys(HOLIDAY_ZH)) {
        if (name.toLowerCase().includes(en.toLowerCase())) {
          named = en;
          break;
        }
      }
    }
    const market = marketLabel(country, lang);
    if (named) return `${market} · ${named}`;
    if (/market\s*holiday|bank\s*holiday|休市/i.test(name) && !named) {
      return market;
    }
    if (name && !/market\s*holiday|bank\s*holiday|^休市$/i.test(name)) {
      return `${market} · ${name}`;
    }
    return market;
  }

  /** 用于去重的规范化键（同比/环比/核心 分开） */
  function dedupeKey(title) {
    const t = String(title || "");
    const lower = t.toLowerCase();
    let kind = "other";
    if (/core\s*cpi|核心\s*cpi/i.test(t)) kind = "core_cpi";
    else if (/cpi|consumer\s*price|消费者物价|居民消费/i.test(t)) kind = "cpi";
    else if (/core\s*ppi|核心\s*ppi/i.test(t)) kind = "core_ppi";
    else if (/ppi|producer\s*price|生产者物价/i.test(t)) kind = "ppi";
    else if (/non[- ]?farm|nfp|非农/i.test(t)) kind = "nfp";
    else if (/fomc|fed.*decision|美联储.*议息/i.test(t)) kind = "fomc";
    else if (/unemployment|失业/i.test(t)) kind = "unemp";
    else if (/gdp/i.test(t)) kind = "gdp";
    else kind = lower.replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim().slice(0, 40);

    let period = "";
    if (/y\/?y|yoy|year|同比/i.test(t)) period = "yoy";
    else if (/m\/?m|mom|month|环比/i.test(t)) period = "mom";
    else if (/q\/?q|qoq|季/i.test(t)) period = "qoq";

    return kind + "|" + period;
  }

  function translateTitle(raw, lang, meta) {
    const title = String(raw || "").trim();
    if (!title) return title;
    const L = lang === "zh-TW" ? "zh-TW" : lang === "en" ? "en" : "zh";

    if (
      (meta && meta.tag === "holiday") ||
      /Market\s*Holiday|Bank\s*Holiday|休市|节假日|節假日/i.test(title) ||
      Object.keys(HOLIDAY_ZH).some((k) => title.toLowerCase().includes(k.toLowerCase()))
    ) {
      return holidayDisplay(title, L, meta);
    }

    for (const rule of RULES) {
      if (!rule.re.test(title)) continue;
      if (L === "en") return rule.en || title;
      if (L === "zh-TW") {
        return window.CycleTranslate
          ? window.CycleTranslate.toTraditional(rule.zh || title)
          : rule.zh || title;
      }
      return rule.zh || title;
    }

    const hasCJK = /[\u4e00-\u9fff]/.test(title);
    if (L === "zh" && hasCJK) return title;
    if (L === "zh-TW" && hasCJK) {
      return window.CycleTranslate
        ? window.CycleTranslate.toTraditional(title)
        : title;
    }
    if (L === "en" && !hasCJK) return title;
    return title;
  }

  return { translateTitle, dedupeKey };
})();
