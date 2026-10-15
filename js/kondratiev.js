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

  /** 进度 0–1：复苏→繁荣→滞胀→萧条 */
  const PHASES = [
    { key: "spring", start: 0, end: 0.25 },
    { key: "summer", start: 0.25, end: 0.5 },
    { key: "autumn", start: 0.5, end: 0.75 },
    { key: "winter", start: 0.75, end: 1 },
  ];

  /**
   * 数学坐标（+y 向上），与卡片标签一致：
   * 右上复苏 / 左上繁荣 / 左下滞胀 / 右下萧条；顺时针演进。
   */
  const QUAD = {
    spring: { x: 0.7, y: 0.7 },
    summer: { x: -0.7, y: 0.7 },
    autumn: { x: -0.7, y: -0.7 },
    winter: { x: 0.7, y: -0.7 },
  };
  const PHASE_ORDER = ["spring", "summer", "autumn", "winter"];

  /** 相对美国的示意偏移：中国长波切入更晚 → 仍偏 K5 尾声 */
  function countryYearOffset(country) {
    if (country === "CN") return -7.5;
    if (country === "GLOBAL") return -2;
    return 0;
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function toYear(date) {
    if (date instanceof Date) {
      return date.getFullYear() + (date.getMonth() + date.getDate() / 30) / 12;
    }
    return Number(date);
  }

  function themeText(wave, country, lang) {
    const pack =
      country === "CN" && wave.themeCN ? wave.themeCN : wave.theme;
    return pack[lang] || pack.zh || pack.en;
  }

  function findWave(y) {
    let wave = WAVES[WAVES.length - 1];
    for (let i = 0; i < WAVES.length; i++) {
      if (y >= WAVES[i].start && y < WAVES[i].end) {
        wave = WAVES[i];
        break;
      }
    }
    return wave;
  }

  function phaseOf(progress) {
    return (
      PHASES.find((p) => progress >= p.start && progress < p.end) ||
      PHASES[PHASES.length - 1]
    );
  }

  /** 长波示意高度：谷底起步上升（复苏）→ 峰（繁荣末）→ 下行（滞胀/萧条） */
  function levelFromProgress(progress) {
    return -Math.cos(clamp01(progress) * Math.PI * 2);
  }

  function slopeFromProgress(progress) {
    return Math.sin(clamp01(progress) * Math.PI * 2);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function posOnDial(phaseKey, local) {
    const i = PHASE_ORDER.indexOf(phaseKey);
    const cur = QUAD[phaseKey];
    const next = QUAD[PHASE_ORDER[(i + 1) % 4]];
    // 在本象限内略向下一象限挪动，表示顺时针前进
    const t = 0.18 + clamp01(local) * 0.55;
    const x = lerp(cur.x, next.x, t * 0.35);
    const y = lerp(cur.y, next.y, t * 0.35);
    const radius = 0.55 + clamp01(local) * 0.22;
    const len = Math.hypot(x, y) || 1;
    return { x: (x / len) * radius, y: (y / len) * radius };
  }

  function waveAt(date, country) {
    const code =
      country || (window.CycleState && window.CycleState.country) || "US";
    const calendarYear = toYear(date);
    const modelYear = calendarYear + countryYearOffset(code);
    const wave = findWave(modelYear);
    const progress = clamp01(
      (modelYear - wave.start) / Math.max(1, wave.end - wave.start)
    );
    const phase = phaseOf(progress);
    const local =
      (progress - phase.start) / Math.max(0.0001, phase.end - phase.start);

    const pos = posOnDial(phase.key, local);
    const nextProgress = clamp01(progress + 0.03);
    const nextPhase = phaseOf(nextProgress);
    const nextLocal =
      (nextProgress - nextPhase.start) /
      Math.max(0.0001, nextPhase.end - nextPhase.start);
    const nextPos = posOnDial(nextPhase.key, nextLocal);

    return {
      wave,
      progress,
      phaseKey: phase.key,
      local,
      x: pos.x,
      y: pos.y,
      dx: nextPos.x - pos.x,
      dy: nextPos.y - pos.y,
      year: calendarYear,
      modelYear,
      level: levelFromProgress(progress),
      slope: slopeFromProgress(progress),
      country: code,
      theme: themeText(
        wave,
        code,
        (window.CycleState && window.CycleState.lang) || "zh"
      ),
    };
  }

  /** 与阶段模型一致的长波示意序列（按日历年打点，阶段含国家偏移） */
  function longWaveSeries(centerYear, country) {
    const code =
      country || (window.CycleState && window.CycleState.country) || "US";
    const start = Math.floor(centerYear) - 250;
    const end = Math.floor(centerYear) + 250;
    const pts = [];
    for (let y = start; y <= end; y += 1) {
      const m = waveAt(y + 0.5, code);
      pts.push({ d: String(y), v: m.level });
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
    levelFromProgress,
  };
})();
