/** 经济日历事件标题：中英合理互译（模式匹配，不硬塞生硬直译） */
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
    {
      re: /CPI|Consumer\s*Price\s*Index|消费者物价|居民消费价格/i,
      zh: "消费者物价指数（CPI）",
      en: "Consumer Price Index (CPI)",
    },
    {
      re: /Core\s*CPI|核心\s*CPI|核心消费/i,
      zh: "核心 CPI",
      en: "Core CPI",
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
      re: /PBOC|People'?s\s*Bank\s*of\s*China|中国人民银行|央行/i,
      zh: "中国人民银行相关数据",
      en: "PBOC-related Release",
    },
    {
      re: /Market\s*Holiday|Bank\s*Holiday|休市|节假日/i,
      zh: "市场休市",
      en: "Market Holiday",
    },
    {
      re: /Witching|四巫/i,
      zh: "四巫日",
      en: "Quadruple Witching",
    },
    {
      re: /Thanksgiving/i,
      zh: "感恩节（休市）",
      en: "Thanksgiving (Holiday)",
    },
    {
      re: /Christmas|Independence\s*Day|Memorial\s*Day|Labor\s*Day|New\s*Year/i,
      zh: null, // keep English holiday name for known US holidays; handled below
      en: null,
    },
  ];

  const HOLIDAY_ZH = {
    "New Year's Day": "元旦（休市）",
    "Martin Luther King Jr. Day": "马丁·路德·金日（休市）",
    "Presidents' Day": "总统日（休市）",
    "Good Friday": "耶稣受难日（休市）",
    "Memorial Day": "阵亡将士纪念日（休市）",
    "Juneteenth": "六月节（休市）",
    "Independence Day": "独立日（休市）",
    "Labor Day": "劳工节（休市）",
    "Columbus Day": "哥伦布日（休市）",
    Thanksgiving: "感恩节（休市）",
    Christmas: "圣诞节（休市）",
    "Christmas Day": "圣诞节（休市）",
  };

  function translateTitle(raw, lang) {
    const title = String(raw || "").trim();
    if (!title) return title;

    if (lang === "zh") {
      for (const [en, zh] of Object.entries(HOLIDAY_ZH)) {
        if (title.toLowerCase().includes(en.toLowerCase())) return zh;
      }
    }

    for (const rule of RULES) {
      if (!rule.re.test(title)) continue;
      const out = lang === "zh" ? rule.zh : rule.en;
      if (out) return out;
    }

    // 已是目标语言为主则原样返回
    const hasCJK = /[\u4e00-\u9fff]/.test(title);
    if (lang === "zh" && hasCJK) return title;
    if (lang === "en" && !hasCJK) return title;
    return title;
  }

  return { translateTitle };
})();
