/**
 * 康波（Kondratiev）长波示意模型
 * 参考：约 50–60 年长波 + 四季阶段；学界对拐点年份有分歧。
 * 本实现采用：K5 ≈ 1982–2025（信息科技），K6 ≈ 2025–2055（AI/绿色/生物）。
 * 2026 年大体落在 K6 早春（新技术扩散初期 / 过渡期）。
 */
window.CycleKondratiev = (function () {
  const WAVES = [
    {
      id: 4,
      start: 1945,
      end: 1982,
      theme: { zh: "石油 / 汽车 / 规模制造", en: "Oil / Autos / Mass production" },
    },
    {
      id: 5,
      start: 1982,
      end: 2025,
      theme: { zh: "信息科技 / 互联网 / 金融全球化", en: "IT / Internet / Financial globalization" },
    },
    {
      id: 6,
      start: 2025,
      end: 2055,
      theme: { zh: "人工智能 / 绿色能源 / 生物科技", en: "AI / Green energy / Biotech" },
    },
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
        ? date.getFullYear() + date.getMonth() / 12
        : Number(date);
    let wave = WAVES[WAVES.length - 1];
    for (let i = 0; i < WAVES.length; i++) {
      if (y >= WAVES[i].start && y < WAVES[i].end) {
        wave = WAVES[i];
        break;
      }
      if (y < WAVES[i].start) {
        wave = WAVES[Math.max(0, i - 1)];
        break;
      }
    }
    const progress = clamp01((y - wave.start) / Math.max(1, wave.end - wave.start));
    const phase =
      PHASES.find((p) => progress >= p.start && progress < p.end) ||
      PHASES[PHASES.length - 1];
    // 四象限坐标：春=右上, 夏=左上, 秋=左下, 冬=右下（顺时针四季）
    const angleMap = {
      spring: -Math.PI / 4,
      summer: (-3 * Math.PI) / 4,
      autumn: (3 * Math.PI) / 4,
      winter: Math.PI / 4,
    };
    const local =
      (progress - phase.start) / Math.max(0.0001, phase.end - phase.start);
    const angle = angleMap[phase.key] + (local - 0.5) * (Math.PI / 5);
    const radius = 0.55 + local * 0.25;
    return {
      wave,
      progress,
      phaseKey: phase.key,
      local,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      year: y,
    };
  }

  function label(phaseKey, lang) {
    return window.t ? window.t(phaseKey) : phaseKey;
  }

  function shortHeader(lang) {
    const now = waveAt(new Date());
    const theme = now.wave.theme[lang] || now.wave.theme.zh;
    const phase = label(now.phaseKey, lang);
    return {
      text: `K${now.wave.id} · ${phase}`,
      detail: theme,
      model: now,
    };
  }

  return { WAVES, PHASES, waveAt, label, shortHeader };
})();
