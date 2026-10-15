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

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function seriesDelta(history, lag) {
    if (!history || history.length < lag + 1) return null;
    const cur = history[history.length - 1].v;
    const prev = history[history.length - 1 - lag].v;
    if (cur == null || prev == null) return null;
    return cur - prev;
  }

  /**
   * 用宏观指标估计「增长脉冲」与「通胀压力」∈[-1,1]
   * growth↑ + inflation↓ → 复苏；双升 → 繁荣；growth↓ inflation↑ → 滞胀；双降 → 萧条
   */
  function macroScores(macro, fg) {
    const cpi = macro && macro.cpiYoY != null ? Number(macro.cpiYoY) : null;
    const infl =
      macro && macro.inflation != null ? Number(macro.inflation) : cpi;
    const ppi = macro && macro.ppiYoY != null ? Number(macro.ppiYoY) : null;
    const rate =
      macro && macro.policyRate != null ? Number(macro.policyRate) : null;
    const fgVal = fg && fg.value != null ? Number(fg.value) : null;

    const cpiMom = seriesDelta(macro && macro.cpiHistory, 1);
    const cpiYoyDelta = seriesDelta(macro && macro.cpiHistory, 12);
    const rateMom = seriesDelta(macro && macro.rateHistory, 1);
    const rateYoyDelta = seriesDelta(macro && macro.rateHistory, 12);
    const ppiMom = seriesDelta(macro && macro.ppiHistory, 1);

    // 通胀：相对 2% 目标 + 变化方向
    let inflationScore = 0;
    let inflN = 0;
    if (infl != null && !Number.isNaN(infl)) {
      inflationScore += clamp((infl - 2) / 3, -1, 1);
      inflN += 1;
    }
    if (cpiMom != null) {
      inflationScore += clamp(cpiMom / 0.4, -1, 1);
      inflN += 1;
    }
    if (cpiYoyDelta != null) {
      inflationScore += clamp(cpiYoyDelta / 1.2, -1, 1);
      inflN += 1;
    }
    if (ppi != null && infl != null) {
      inflationScore += clamp((ppi - infl) / 3, -1, 1) * 0.5;
      inflN += 0.5;
    }
    if (ppiMom != null) {
      inflationScore += clamp(ppiMom / 0.5, -1, 1) * 0.5;
      inflN += 0.5;
    }
    inflationScore = inflN ? clamp(inflationScore / inflN, -1, 1) : 0;

    // 增长/风险偏好：恐贪、降息、实际利率放松
    let growthScore = 0;
    let gN = 0;
    if (fgVal != null && !Number.isNaN(fgVal)) {
      growthScore += clamp((fgVal - 50) / 35, -1, 1);
      gN += 1.2;
    }
    if (rateMom != null) {
      growthScore += clamp(-rateMom / 0.35, -1, 1);
      gN += 1;
    }
    if (rateYoyDelta != null) {
      growthScore += clamp(-rateYoyDelta / 1.5, -1, 1) * 0.8;
      gN += 0.8;
    }
    if (rate != null && infl != null) {
      const real = rate - infl;
      growthScore += clamp(-real / 2.5, -1, 1) * 0.7;
      gN += 0.7;
    }
    // 无恐贪时（如中国），用 PPI 相对 CPI 的改善作弱代理
    if (gN < 0.5 && ppiMom != null && cpiMom != null) {
      growthScore += clamp((cpiMom - ppiMom) / 0.5, -1, 1);
      gN += 1;
    }
    growthScore = gN ? clamp(growthScore / gN, -1, 1) : 0;

    return {
      growthScore,
      inflationScore,
      inputs: {
        cpi: infl,
        ppi,
        rate,
        fg: fgVal,
        cpiMom,
        rateMom,
      },
    };
  }

  function phaseFromScores(growthScore, inflationScore) {
    if (growthScore >= 0 && inflationScore < 0) return "spring";
    if (growthScore >= 0 && inflationScore >= 0) return "summer";
    if (growthScore < 0 && inflationScore >= 0) return "autumn";
    return "winter";
  }

  function progressFromPhaseLocal(phaseKey, local) {
    const phase = PHASES.find((p) => p.key === phaseKey) || PHASES[0];
    return phase.start + clamp01(local) * (phase.end - phase.start);
  }

  /** 实时模型：宏观指标驱动阶段；长波主题仍用日历波次作叙事标签 */
  function waveAtRealtime(macro, fg, country) {
    const code =
      country || (window.CycleState && window.CycleState.country) || "US";
    const base = waveAt(new Date(), code);
    const scores = macroScores(macro, fg);
    const phaseKey = phaseFromScores(scores.growthScore, scores.inflationScore);
    const local = clamp01(
      (Math.abs(scores.growthScore) + Math.abs(scores.inflationScore)) / 2
    );
    const progress = progressFromPhaseLocal(phaseKey, local);
    const pos = posOnDial(phaseKey, local);

    // 下一拍：略向顺时针下一象限推一点，表示倾向
    const i = PHASE_ORDER.indexOf(phaseKey);
    const nextKey = PHASE_ORDER[(i + 1) % 4];
    const blend = 0.08 + local * 0.12;
    const nextPos = posOnDial(nextKey, blend);

    return {
      wave: base.wave,
      progress,
      phaseKey,
      local,
      x: pos.x,
      y: pos.y,
      dx: nextPos.x - pos.x,
      dy: nextPos.y - pos.y,
      year: base.year,
      modelYear: base.modelYear,
      level: levelFromProgress(progress),
      slope: slopeFromProgress(progress),
      country: code,
      theme: base.theme,
      mode: "realtime",
      scores,
    };
  }

  function resolveModel(mode, country, macro, fg) {
    if (mode === "realtime") return waveAtRealtime(macro, fg, country);
    const m = waveAt(new Date(), country);
    m.mode = "schematic";
    return m;
  }

  /**
   * 实时模型曲线：用历史 CPI/利率序列逐步估计阶段高度
   * （恐贪只用于最新点，历史用宏观近似）
   */
  function realtimeSeries(macro, fg, country) {
    const code =
      country || (window.CycleState && window.CycleState.country) || "US";
    const cpiH = (macro && macro.cpiHistory) || [];
    const rateH = (macro && macro.rateHistory) || [];
    const ppiH = (macro && macro.ppiHistory) || [];
    if (cpiH.length < 6 && rateH.length < 6) {
      const now = waveAtRealtime(macro, fg, code);
      return [{ d: String(Math.round(now.year)), v: now.level }];
    }

    const byDate = new Map();
    cpiH.forEach((p) => {
      byDate.set(p.d, Object.assign(byDate.get(p.d) || { d: p.d }, { cpi: p.v }));
    });
    rateH.forEach((p) => {
      const row = byDate.get(p.d) || { d: p.d };
      row.rate = p.v;
      byDate.set(p.d, row);
    });
    ppiH.forEach((p) => {
      const row = byDate.get(p.d) || { d: p.d };
      row.ppi = p.v;
      byDate.set(p.d, row);
    });

    const rows = [...byDate.values()].sort((a, b) =>
      String(a.d).localeCompare(String(b.d))
    );
    const pts = [];
    for (let i = 0; i < rows.length; i++) {
      const sliceCpi = rows
        .slice(0, i + 1)
        .filter((r) => r.cpi != null)
        .map((r) => ({ d: r.d, v: r.cpi }));
      const sliceRate = rows
        .slice(0, i + 1)
        .filter((r) => r.rate != null)
        .map((r) => ({ d: r.d, v: r.rate }));
      const slicePpi = rows
        .slice(0, i + 1)
        .filter((r) => r.ppi != null)
        .map((r) => ({ d: r.d, v: r.ppi }));
      const snap = {
        cpiYoY: sliceCpi.length ? sliceCpi[sliceCpi.length - 1].v : null,
        inflation: sliceCpi.length ? sliceCpi[sliceCpi.length - 1].v : null,
        policyRate: sliceRate.length ? sliceRate[sliceRate.length - 1].v : null,
        ppiYoY: slicePpi.length ? slicePpi[slicePpi.length - 1].v : null,
        cpiHistory: sliceCpi,
        rateHistory: sliceRate,
        ppiHistory: slicePpi,
      };
      // 仅最后一点带上当前恐贪，避免历史被单一情绪水平污染
      const fgSnap =
        i === rows.length - 1 && fg ? fg : null;
      const m = waveAtRealtime(snap, fgSnap, code);
      pts.push({ d: rows[i].d, v: m.level });
    }
    return pts.length ? pts : null;
  }

  function seriesForMode(mode, k, macro, fg) {
    if (mode === "realtime") {
      return realtimeSeries(macro, fg, k.country);
    }
    return longWaveSeries(Math.round(k.year), k.country);
  }

  return {
    WAVES,
    PHASES,
    waveAt,
    waveAtRealtime,
    resolveModel,
    longWaveSeries,
    realtimeSeries,
    seriesForMode,
    macroScores,
    shortHeader,
    themeText,
    phaseLabel,
    pillText,
    levelFromProgress,
  };
})();
