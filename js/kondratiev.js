window.CycleKondratiev = (function () {
  const WAVES = [
    {
      id: 1,
      start: 1780,
      end: 1845,
      theme: {
        zh: "蒸汽 / 纺织",
        "zh-TW": "蒸汽 / 紡織",
        en: "Steam / Textiles",
      },
    },
    {
      id: 2,
      start: 1845,
      end: 1895,
      theme: {
        zh: "铁路 / 钢铁",
        "zh-TW": "鐵路 / 鋼鐵",
        en: "Rail / Steel",
      },
    },
    {
      id: 3,
      start: 1895,
      end: 1945,
      theme: {
        zh: "电力 / 化工",
        "zh-TW": "電力 / 化工",
        en: "Electricity / Chemicals",
      },
    },
    {
      id: 4,
      start: 1945,
      end: 1982,
      theme: {
        zh: "汽车 / 石油",
        "zh-TW": "汽車 / 石油",
        en: "Autos / Oil",
      },
    },
    {
      id: 5,
      start: 1982,
      end: 2025,
      theme: {
        zh: "信息科技 / 互联网",
        "zh-TW": "資訊科技 / 網際網路",
        en: "IT / Internet",
      },
      themeCN: {
        zh: "改革开放 / 制造业升级",
        "zh-TW": "改革開放 / 製造業升級",
        en: "Reform & manufacturing ascent",
      },
    },
    {
      id: 6,
      start: 2025,
      end: 2055,
      theme: {
        zh: "人工智能 / 绿色能源",
        "zh-TW": "人工智慧 / 綠色能源",
        en: "AI / Green energy",
      },
      themeCN: {
        zh: "新能源 / 高端制造 / 数字经济",
        "zh-TW": "新能源 / 高端製造 / 數位經濟",
        en: "NEV / Advanced manufacturing / Digital economy",
      },
    },
  ];

  const PHASES = [
    { key: "spring", start: 0, end: 0.25 },
    { key: "summer", start: 0.25, end: 0.5 },
    { key: "autumn", start: 0.5, end: 0.75 },
    { key: "winter", start: 0.75, end: 1 },
  ];

  /** 相对美国的年份偏移：中国工业化/长波切入更晚 */
  function countryYearOffset(country) {
    if (country === "CN") return -7.5;
    if (country === "GLOBAL") return -2;
    return 0;
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function themeText(wave, country, lang) {
    const pack =
      country === "CN" && wave.themeCN ? wave.themeCN : wave.theme;
    return pack[lang] || pack.zh || pack.en;
  }

  function waveAt(date, country) {
    const code = country || (window.CycleState && window.CycleState.country) || "US";
    const y0 =
      date instanceof Date
        ? date.getFullYear() + (date.getMonth() + date.getDate() / 30) / 12
        : Number(date);
    const y = y0 + countryYearOffset(code);
    let wave = WAVES[WAVES.length - 1];
    for (let i = 0; i < WAVES.length; i++) {
      if (y >= WAVES[i].start && y < WAVES[i].end) {
        wave = WAVES[i];
        break;
      }
    }
    const progress = clamp01((y - wave.start) / Math.max(1, wave.end - wave.start));
    const phase =
      PHASES.find((p) => progress >= p.start && progress < p.end) ||
      PHASES[PHASES.length - 1];
    const local =
      (progress - phase.start) / Math.max(0.0001, phase.end - phase.start);

    const base = {
      spring: -Math.PI / 4,
      summer: (-3 * Math.PI) / 4,
      autumn: (3 * Math.PI) / 4,
      winter: Math.PI / 4,
    }[phase.key];
    const angle = base + (local - 0.5) * (Math.PI / 6);
    const radius = 0.58 + local * 0.22;

    const nextProgress = clamp01(progress + 0.02);
    const nextPhase =
      PHASES.find((p) => nextProgress >= p.start && nextProgress < p.end) ||
      phase;
    const nextLocal =
      (nextProgress - nextPhase.start) /
      Math.max(0.0001, nextPhase.end - nextPhase.start);
    const nextBase = {
      spring: -Math.PI / 4,
      summer: (-3 * Math.PI) / 4,
      autumn: (3 * Math.PI) / 4,
      winter: Math.PI / 4,
    }[nextPhase.key];
    const nextAngle = nextBase + (nextLocal - 0.5) * (Math.PI / 6);
    const nextRadius = 0.58 + nextLocal * 0.22;

    return {
      wave,
      progress,
      phaseKey: phase.key,
      local,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      dx: Math.cos(nextAngle) * nextRadius - Math.cos(angle) * radius,
      dy: Math.sin(nextAngle) * nextRadius - Math.sin(angle) * radius,
      year: y,
      country: code,
      theme: themeText(wave, code, (window.CycleState && window.CycleState.lang) || "zh"),
    };
  }

  function longWaveSeries(centerYear) {
    const start = centerYear - 250;
    const end = centerYear + 250;
    const pts = [];
    for (let y = start; y <= end; y += 1) {
      const v =
        Math.sin(((y - 1780) / 54) * Math.PI * 2) * 0.85 +
        Math.sin(((y - 1780) / 110) * Math.PI * 2) * 0.25;
      pts.push({ d: String(y), v });
    }
    return pts;
  }

  function phaseLabel(phaseKey) {
    return window.t(phaseKey + "Short");
  }

  function pillText(model) {
    const k = model || waveAt(new Date());
    return `K${k.wave.id} · ${phaseLabel(k.phaseKey)}`;
  }

  function shortHeader(lang, country) {
    const now = waveAt(new Date(), country);
    return {
      text: pillText(now),
      detail: themeText(now.wave, now.country, lang || "zh"),
      model: now,
    };
  }

  return {
    WAVES,
    PHASES,
    waveAt,
    longWaveSeries,
    shortHeader,
    themeText,
    phaseLabel,
    pillText,
  };
})();
