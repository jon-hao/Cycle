# Cycle

全球经济看板（静态 HTML）：康波周期上下文 · 宏观数据 · 热点新闻 · 经济日历 · **本地大模型解读**。

**在线：** https://jon-hao.github.io/Cycle/

## 功能

- **固定 Header**：国家切换（美国 / 中国 / 全球）+ 当前康波阶段；浅色/深色；中/英
- **固定 Footer**：数据 · 新闻 · 日历
- **数据页**：康波四象限（闪烁当前位置）、恐慌贪婪指数、央行利率（含点阵图/下次议息）、通胀 / CPI / PPI 走势弹窗
- **新闻页**：热点列表，可按国家筛选，支持本地 LLM 解读
- **日历页**：日 / 周 / 月；数据发布项可订阅为 `.ics`；美国显示四巫日；非「全球」显示节假日；事件弹窗含 LLM 利好/利空分析

## 本地大模型（Ollama）

```bash
ollama serve
ollama pull llama3.2
# 或 qwen2.5 等，并在浏览器 localStorage.cycle-llm 中设置 {"model":"qwen2.5"}
```

站点会请求 `http://localhost:11434`。若未启动，界面仍可用，并给出示意解读。

> 注意：GitHub Pages 上的页面访问本机 Ollama 需要你在本机浏览器打开，且 Ollama 允许跨域（新版默认较宽松；若失败可配置 `OLLAMA_ORIGINS=*`）。

## 康波说明

实现为示意模型：K5≈1982–2025（信息科技），K6≈2025–2055（AI/绿色/生物）。2026 年大体落在 **K6 早春 / 过渡期**。学术拐点年份存在分歧，界面会标注阶段而非给出交易信号。

## 数据源

- 恐慌贪婪：优先 [fearandgreedgraph.com API](https://fearandgreedgraph.com/data)，失败回退 `data/seed.json`
- 利率 / CPI / PPI / 日历 / 新闻：当前以 `data/seed.json` 示意（可后续接 FRED / 金十等）

## 本地预览

```bash
python3 -m http.server 5174
# http://localhost:5174
```

## 更新

原 Next.js 代码已移除，本仓库为纯静态站点，推送到 `main` 即可由 GitHub Pages 发布。
