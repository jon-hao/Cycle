# Cycle

全球宏观看板（静态 SPA）：经济周期体制 · 美/中宏观 · 恐慌贪婪 · 新闻 · 日历 · 浏览器端 LLM 通俗解读。

**在线：** https://jon-hao.github.io/Cycle/

## 功能

- **Header**：国家（美 / 中 / 全球）、语言（简中 / 繁中 / EN）、浅深色
- **Footer**：数据 · 新闻 · 日历
- **数据页**
  - **经济周期**：默认「实时体制」（增长 × 通胀四象限 + 方向箭头）；可切「长波示意」
  - 弹窗：历史曲线 + 跨度（默认 **3 年·月**；另有 1/2/5 年月度，10/20/50 年年度）；阶段 / 倾向 / 组合含义由 **AI 分析**说明
  - 恐慌贪婪仪表；利率 / 通胀 / CPI / PPI；美、中另有增长与信用指标卡
- **新闻页**：重要快讯（随国家）
- **日历页**：日 / 周；高影响数据；美股休市 / 四巫日
- **Agent**：底部 AI 对话（WebLLM）

## 实时体制怎么读

1. 用宏观指标打出 **growth / inflation** 分，落入复苏 / 繁荣 / 滞胀 / 萧条
2. 拨盘箭头表示倾向下一象限
3. 弹窗曲线是体制高度（约 -1～+1）：上偏热、下偏冷；数据线**穿过 0** 时高亮零轴

长波示意仅作技术浪潮背景，**调仓主信号以实时体制为准**。

## 本地大模型

默认浏览器端 **WebLLM + Qwen**（需 WebGPU；首次点「查看AI分析」加载）。无 WebGPU 时回退通俗简版。

## 数据源（实时，无静态假数据）

| 模块 | 来源 |
|------|------|
| 美国利率 / CPI / PPI / 就业 / 工业 / 零售 / M2 / GDP / 曲线 / 信贷等 | [MacroRadar](https://www.macroradar.io)（FRED 系，CORS） |
| 中国 LPR | [东方财富](https://data.eastmoney.com) `RPTA_WEB_RATE`（CORS） |
| 中国 CPI / PPI / 工业 / 社零 / M2 / PMI / 失业率 / GDP / 新开工 / 贷款等 | [ChinaData](https://chinadata.live)（NBS 镜像，CORS） |
| 下次 FOMC / 日历 / 美股假日 | [FinanceCalendar](https://www.financecalendar.com) + [PipAtlas](https://pipatlas.com) |
| 恐慌贪婪（美） | [fearandgreedgraph.com](https://fearandgreedgraph.com)；中国暂无对等源 |
| 全球年通胀兜底 | [World Bank](https://api.worldbank.org) `FP.CPI.TOTL.ZG`（JSONP） |
| 重要新闻 | 金十[重要事件](https://topic17z2k407.jin10.com/topic/jin10_important_news.html)，经自建 Lambda `HApi`（`js/config.js` 的 `apiBase` + `?flow=news`）。未配置时回退金十 RSS + Google News |

拿不到的序列统一显示「数据缺失 / Unavailable」。

## 本地预览

```bash
python3 -m http.server 5174
# http://localhost:5174
```

推送到 `main` 即由 GitHub Pages 发布。

## HApi（Lambda Function URL）

浏览器不能直接打金十等源站。`lambda/HApi` 是账号级共用入口，按 `flow` 分流。Lambda 每月免费额度（约 100 万次请求）是**按账号汇总**的，不是每个函数各一份，所以多项目共用一个 `HApi` 更划算。

| 调用 | 说明 |
|------|------|
| `GET ?flow=news` / `POST {"flow":"news"}` | 金十重要事件（含榜单 `rank`） |
| `flow=new` | `news` 的别名 |
| `GET ?flow=search&q=` | 联网检索（Google News RSS + DuckDuckGo），供 Agent 对话 |
| `GET ?flow=quota` | 查看本月用量 / 软上限 / 下次重置日（UTC） |

**防费用软上限（UTC 自然月）：** 默认最多约 **90 万次**请求、**36 万 GB-秒**（低于账号 Always Free 的 100 万 / 40 万，给 429 与其它 Lambda 留余量）。计数存在免费的 SSM Standard Parameter `/HApi/quota`；超额返回 `429`，跨月自动清零。可用环境变量 `HAPI_MAX_REQUESTS` / `HAPI_MAX_GB_SECONDS` 调整。

后续新能力：在 `lambda/HApi/flows/` 加模块，并在 `index.mjs` 的 `FLOWS` 注册即可。

不要把 AWS 登录密码交给任何人。本机安装 [AWS CLI](https://aws.amazon.com/cli/) 后，用 IAM 访问密钥或 `aws login` / SSO 登录，再执行：

```bash
chmod +x lambda/HApi/deploy.sh
./lambda/HApi/deploy.sh
```

脚本会创建/更新函数 `HApi`（默认区域 `ap-southeast-1`），删除旧的 `Cycle` / `cycle-news`，并把 Function URL 写入 `js/config.js` 的 `apiBase`。
