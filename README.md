# Cycle

全球宏观看板（静态 SPA）：经济周期体制 · 美/中宏观 · 恐慌贪婪 · 新闻 · 日历 · 浏览器端 LLM 通俗解读。

**在线：** https://jon-hao.github.io/Cycle/

## 功能

- **Header**：国家（美 / 中）、语言（简中 / 繁中 / EN）、浅深色
- **Footer**：数据 · 新闻 · 日历
- **数据页**
  - **经济周期**：默认「实时体制」（增长 × 通胀四象限 + 方向箭头）；可切「长波示意」
  - 弹窗：历史曲线 + 跨度（默认 **3 年·月**）；阶段 / 倾向 / 组合由 **AI 分析**说明
  - 恐慌贪婪仪表；利率 / 通胀 / CPI / PPI；美、中增长与信用指标
- **新闻页**：金十重要快讯（按所选国家过滤，保留金十榜单名次）
- **日历页**：日 / 周；高/中影响数据；美股休市 / 四巫日（多源聚合）
- **Agent**：底部 AI 对话（WebLLM + 可选 HApi 联网检索）

## 架构原则

**所有业务数据经 [HApi](#hapilambda--dynamodb)**（AWS Lambda Function URL）。  
静态页只负责 UI / WebLLM；即使删掉整个 Cycle 前端，只要调用同一套 `flow`，仍可拿到宏观、日历、新闻、检索等完整能力。

| 页面加载（`app=cycle`） | Lambda 次数 |
|-------------------------|------------|
| 打开 **数据** | **2**（`macro` + `feargreed`） |
| 打开 **新闻** | **1**（`news`） |
| 打开 **日历** | **1**（`calendar`） |
| 三个页各刷一遍 | **4** |
| Agent 触发联网问答 | **+1**（`search`，按需） |

（浏览器本地 WebLLM 不经过 Lambda。）

## 实时体制怎么读

1. 用宏观指标打出 **growth / inflation** 分，落入复苏 / 繁荣 / 滞胀 / 萧条  
2. 拨盘箭头表示倾向下一象限  
3. 弹窗曲线是体制高度（约 -1～+1）；数据线**穿过 0** 时高亮零轴  

长波示意仅作背景，**调仓主信号以实时体制为准**。

## 本地大模型

默认 **WebLLM + Qwen2.5-1.5B-Instruct**（WebGPU）。无 WebGPU 时回退通俗简版。  
Agent 遇「最新 / 美联储 / 金价…」等会先打 HApi `search` 再回答。

## HApi（Lambda + DynamoDB）

账号级共用 API，服务 **Cycle 及其他应用**。按 `flow` 分流，用可选 `app` 做租户/缓存命名空间。

### 调用约定

```
GET|POST {apiBase}?flow=<name>&app=<tenant>&...
POST JSON 可带同样字段（覆盖 query）
```

| flow | 参数 | 返回 |
|------|------|------|
| `catalog` | — | 能力目录（给其他应用发现接口） |
| `health` | — | 存活检查 |
| `macro` | `country=US\|CN` | 宏观数据包（利率/物价/增长/信用…） |
| `feargreed` | `country=US\|CN` | 美股恐贪（CN 为空） |
| `calendar` | `from`,`to`,`country` | 事件列表 + `witching`（FC / PipAtlas / Forex Factory / 假日） |
| `news` | — | 金十重要事件（`rank` / `countryGuess`） |
| `search` | `q` | 联网检索摘要 |
| `quota` | — | 月度软配额用量 |

Cycle 前端配置见 `js/config.js`：`apiBase` + `app: "cycle"`。

### 永久免费数据库（选用 DynamoDB）

AWS 与「长期免费」相关的库：

| 服务 | 是否 Always Free | 说明 |
|------|------------------|------|
| **DynamoDB** | **是** | 每区每月 **25 GB + 25 RCU + 25 WCU**（**provisioned** Standard） |
| Aurora DSQL | 有每月免费额度 | 100k DPU + 1 GB；偏 SQL |
| Aurora PostgreSQL Serverless | 偏 Free Plan / 学分 | **非**永久 Always Free |

HApi 使用 **DynamoDB 表 `HApi`（provisioned 5/5）** 存：

- 月度软配额（`pk=quota#global`）
- 各 flow 响应缓存（`pk=cache#…`，TTL）

SSM Parameter 仍作配额回退。

### 防费用软上限

UTC 自然月默认 **90 万次**请求 / **36 万 GB-秒**（低于账号 Lambda Always Free）。超额 `429`，跨月清零。环境变量：`HAPI_MAX_REQUESTS` / `HAPI_MAX_GB_SECONDS`。

### 上游数据（均由 HApi 服务端拉取）

| 能力 | 上游 |
|------|------|
| 美国宏观 | MacroRadar（FRED 系） |
| 中国宏观 | ChinaData + 东财 LPR |
| 恐贪 | fearandgreedgraph.com |
| 日历 | FinanceCalendar + PipAtlas + Forex Factory 周历 JSON + 假日/四巫 |
| 新闻 | 金十重要事件专题 API |
| 检索 | Google News RSS + DuckDuckGo |

### 部署

不要把 AWS 登录密码交给任何人。本机 AWS CLI 登录后：

```bash
chmod +x lambda/HApi/deploy.sh
./lambda/HApi/deploy.sh
```

脚本会：创建/更新函数 `HApi`、DynamoDB 表、IAM，并把 Function URL 写入 `js/config.js`。

发现接口：`GET {apiBase}?flow=catalog`

## 本地预览

```bash
python3 -m http.server 5174
# http://localhost:5174
```

需已配置 `apiBase`。推送到 `main` 即由 GitHub Pages 发布。
