# Cycle

全球经济看板（静态 HTML）：康波周期 · 宏观数据 · 重要新闻 · 经济日历 · 本地大模型通俗解读。

**在线：** https://jon-hao.github.io/Cycle/

## 功能

- **Header**：左切国家，中间 Cycle Logo，右切语言（图标）/ 浅深色（日/月）
- **Footer**：悬浮 50% 圆角毛玻璃，数据 · 新闻 · 日历，切换带指示动画
- **数据页**：康波四象限（闪烁节点 + 方向箭头，可点开 500 年波形弹窗）、恐慌贪婪、利率 / 通胀 / CPI / PPI；进入页面自动调用本地 LLM
- **新闻页**：跟随 Header 国家，仅展示重要快讯
- **日历页**：日 / 周（无月历）；高影响数据；订阅按钮文案为「订阅」；美国四巫日

## 本地大模型（Ollama）

```bash
ollama serve
ollama pull llama3.2
# 或 qwen2.5 等：localStorage.cycle-llm = {"model":"qwen2.5"}
```

本机 `http://localhost` 预览时会自动连 Ollama；**GitHub Pages 上默认不探测本机**（避免控制台报错），直接显示通俗简版。若坚持在 Pages 上连本机 Ollama：

```js
localStorage.setItem("cycle-llm", JSON.stringify({ tryRemote: true, model: "llama3.2" }))
```

并设置 `OLLAMA_ORIGINS=*`。

跨域数据优先走 **JSONP**（如 World Bank `format=jsonp&prefix=`、rss2json `callback=`），不依赖 CORS。

## 数据源（实时，无静态假数据）

| 模块 | 来源 |
|------|------|
| 美国利率 / CPI / PPI | [MacroRadar](https://www.macroradar.io) |
| 下次 FOMC / 日历 / 美股假日 | [FinanceCalendar](https://www.financecalendar.com) + [PipAtlas](https://pipatlas.com) |
| 恐慌贪婪 | [fearandgreedgraph.com](https://fearandgreedgraph.com) |
| 中国 / 全球通胀 | [World Bank](https://api.worldbank.org) `FP.CPI.TOTL.ZG`（浏览器 CORS） |
| 重要新闻 | 金十 important RSS → [rss2json](https://api.rss2json.com)（绕过 RSSHub 非法 CORS）；失败回退 Google News RSS |

拿不到的序列统一显示「数据缺失 / Unavailable」。中国月度 LPR / PPI 暂无稳定浏览器 CORS 源，故可能缺失。

## 本地预览

```bash
python3 -m http.server 5174
# http://localhost:5174
```

推送到 `main` 即由 GitHub Pages 发布。
