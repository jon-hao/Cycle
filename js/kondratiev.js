window.CycleKondratiev = (function () {
  const WAVES = [
    { id: 1, start: 1780, end: 1845, theme: { zh: "蒸汽 / 纺织", en: "Steam / Textiles" } },
    { id: 2, start: 1845, end: 1895, theme: { zh: "铁路 / 钢铁", en: "Rail / Steel" } },
    { id: 3, start: 1895, end: 1945, theme: { zh: "电力 / 化工", en: "Electricity / Chemicals" } },
    { id: 4, start: 1945, end: 1982, theme: { zh: "汽车 / 石油", en: "Autos / Oil" } },
    { id: 5, start: 1982, end: 2025, theme: { zh: "信息科技 / 互联网", en: "IT / Internet" } },
    { id: 6, start: 2025, end: 2055, theme: { zh: "人工智能 / 绿色能源", en: "AI / Green energy" } },
  ];

  const PHASES = [
    { key: "spring", start: 0, end: 0.25 },
    { key: "summer", start: 0.25, end: 0.5 },
    { key: "autumn", start: 0.5, end: 0.75 },
    { key: "winter", start: 0.75, end: 1 },
  ];

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function waveAt(date) {
    const y =
      date instanceof Date
        ? date.getFullYear() + (date.getMonth() + date.getDate() / 30) / 12
        : Number(date);
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

    // 顺时针：春右上 → 夏左上 → 秋左下 → 冬右下
    const base = {
      spring: -Math.PI / 4,
      summer: (-3 * Math.PI) / 4,
      autumn: (3 * Math.PI) / 4,
      winter: Math.PI / 4,
    }[phase.key];
    const angle = base + (local - 0.5) * (Math.PI / 6);
    const radius = 0.58 + local * 0.22;

    // 方向：沿长波向前（进度增加）
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
    };
  }

  /** 500 年正弦示意长波（用于弹窗波形） */
  function longWaveSeries(centerYear) {
    const start = centerYear - 250;
    const end = centerYear + 250;
    const pts = [];
    for (let y = start; y <= end; y += 1) {
      // 约 54 年周期，叠加缓变趋势
      const v =
        Math.sin(((y - 1780) / 54) * Math.PI * 2) * 0.85 +
        Math.sin(((y - 1780) / 110) * Math.PI * 2) * 0.25;
      pts.push({ d: String(y), v });
    }
    return pts;
  }

  function shortHeader(lang) {
    const now = waveAt(new Date());
    return {
      text: `K${now.wave.id} · ${window.t(now.phaseKey)}`,
      detail: now.wave.theme[lang] || now.wave.theme.zh,
      model: now,
    };
  }

  return { WAVES, PHASES, waveAt, longWaveSeries, shortHeader };
})();
