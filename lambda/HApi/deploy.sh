#!/bin/bash
# 创建/更新 Lambda「HApi」+ DynamoDB 表，并写回 js/config.js 的 apiBase。
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
FUNC="${HAPI_FUNC:-HApi}"
ROLE="${HAPI_ROLE:-HApi-role}"
TABLE="${HAPI_TABLE:-HApi}"
OLD_FUNCS="${HAPI_OLD_FUNCS:-Cycle cycle-news}"
QUOTA_PARAM="${HAPI_QUOTA_PARAM:-/HApi/quota}"
MAX_REQ="${HAPI_MAX_REQUESTS:-900000}"
MAX_GB="${HAPI_MAX_GB_SECONDS:-360000}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$(cd "$(dirname "$0")" && pwd)"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"

if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role \
    --role-name "$ROLE" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{
        "Effect":"Allow",
        "Principal":{"Service":"lambda.amazonaws.com"},
        "Action":"sts:AssumeRole"
      }]
    }' >/dev/null
  aws iam attach-role-policy \
    --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "waiting for role..."
  sleep 10
fi

# DynamoDB Always Free：provisioned 25 RCU/WCU；本表用 5/5 留余量
if ! aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "creating DynamoDB table $TABLE ..."
  aws dynamodb create-table \
    --table-name "$TABLE" \
    --attribute-definitions \
      AttributeName=pk,AttributeType=S \
      AttributeName=sk,AttributeType=S \
    --key-schema \
      AttributeName=pk,KeyType=HASH \
      AttributeName=sk,KeyType=RANGE \
    --billing-mode PROVISIONED \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region "$REGION" >/dev/null
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  aws dynamodb update-time-to-live \
    --table-name "$TABLE" \
    --time-to-live-specification Enabled=true,AttributeName=ttl \
    --region "$REGION" >/dev/null || true
fi

aws iam put-role-policy \
  --role-name "$ROLE" \
  --policy-name HApiDataAccess \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {
        \"Effect\":\"Allow\",
        \"Action\":[\"ssm:GetParameter\",\"ssm:PutParameter\"],
        \"Resource\":\"arn:aws:ssm:${REGION}:${ACCOUNT}:parameter${QUOTA_PARAM}\"
      },
      {
        \"Effect\":\"Allow\",
        \"Action\":[
          \"dynamodb:GetItem\",\"dynamodb:PutItem\",\"dynamodb:UpdateItem\",
          \"dynamodb:DeleteItem\",\"dynamodb:Query\",\"dynamodb:DescribeTable\"
        ],
        \"Resource\":\"arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${TABLE}\"
      }
    ]
  }" >/dev/null

echo "npm install..."
(cd "$DIR" && npm install --omit=dev --no-fund --no-audit >/dev/null)

ZIP="$(mktemp -t HApi).zip"
rm -f "$ZIP"
(cd "$DIR" && zip -q -r "$ZIP" index.mjs quota.mjs lib flows package.json package-lock.json node_modules)

# 上游源 / 密钥只进 Lambda Env：默认值 + 可选 .env.secrets（gitignored）
ENV_JSON="$(
  QUOTA_PARAM="$QUOTA_PARAM" MAX_REQ="$MAX_REQ" MAX_GB="$MAX_GB" TABLE="$TABLE" DIR="$DIR" \
  python3 - <<'PY'
import json, os, pathlib
dir_ = pathlib.Path(os.environ["DIR"])
vars_ = {
  "HAPI_QUOTA_PARAM": os.environ["QUOTA_PARAM"],
  "HAPI_MAX_REQUESTS": os.environ["MAX_REQ"],
  "HAPI_MAX_GB_SECONDS": os.environ["MAX_GB"],
  "HAPI_TABLE": os.environ["TABLE"],
  # Cycle sources
  "SRC_MACRORADAR": "https://www.macroradar.io/api/v1",
  "SRC_CHINADATA": "https://chinadata.live/api/v2",
  "SRC_EASTMONEY": "https://datacenter-web.eastmoney.com/api/data/v1/get",
  "SRC_FINANCECALENDAR": "https://www.financecalendar.com/wp-json/fc/v1",
  "SRC_PIPATLAS": "https://pipatlas.com/api/calendar",
  "SRC_FOREXFACTORY": "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "SRC_FEARGREED": "https://fearandgreedgraph.com/api/fear-greed",
  "SRC_FEARGREED_CN_SNAP": "https://api.fusionintel.net/v1/public/feargreed/a_stock_macro/latest",
  "SRC_FEARGREED_CN_STM": "https://stock-stm.asia/api/data?days=90",
  "SRC_DUCKDUCKGO": "https://api.duckduckgo.com/",
  "SRC_GOOGLENEWS_RSS": "https://news.google.com/rss/search",
  # Jin10
  "SRC_JIN10_TOPIC_ORIGIN": "https://topic17z2k407.jin10.com",
  "SRC_JIN10_TOPIC_PAGE": "https://topic17z2k407.jin10.com/topic/jin10_important_news.html",
  "SRC_JIN10_FLASH_BASE": "https://1b8d6028d99849668a6d8755c79e650f.z3c.jin10.com/top/flashsByTime",
  "SRC_JIN10_FLASH_API": "https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1",
  "SRC_JIN10_DETAIL_BASE": "https://flash.jin10.com/detail",
  "SRC_JIN10_SITE": "https://www.jin10.com",
  "SRC_JIN10_APP_ID": "EzF2s2HxxU0U5bYa",
  "SRC_JIN10_VERSION": "1.0.0",
  "SRC_JIN10_FLASH_APP_ID": "bVBF4FyRTn5NJF5n",
  "SRC_JIN10_FLASH_VERSION": "1.0.0",
  # Humanity video sources
  "SRC_EPORNER_SEARCH": "https://www.eporner.com/api/v2/video/search/",
  "SRC_EPORNER_SITE": "https://www.eporner.com",
  "SRC_PORNHUB_SEARCH": "https://www.pornhub.com/video/search",
  "SRC_PORNHUB_SITE": "https://www.pornhub.com",
  "SRC_XVIDEOS_SEARCH": "https://www.xvideos.com/",
  "SRC_XVIDEOS_SITE": "https://www.xvideos.com",
}
# overlay secrets / overrides（不进 git）
sec = dir_ / ".env.secrets"
if sec.exists():
  for line in sec.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    k, _, v = line.partition("=")
    vars_[k.strip()] = v.strip().strip('"').strip("'")
# also allow process env override（账号已迁 DynamoDB，不再要求 HUMANITY_* 进 Lambda Env）
for k in list(vars_.keys()):
  if os.environ.get(k):
    vars_[k] = os.environ[k]
# 若 secrets 里仍有 HUMANITY_*，不要注入 Lambda Env
vars_.pop("HUMANITY_EMAIL", None)
vars_.pop("HUMANITY_PASSWORD", None)
vars_.pop("CYCLE_EMAIL", None)
vars_.pop("CYCLE_PASSWORD", None)
print(json.dumps({"Variables": vars_}))
PY
)"

if aws lambda get-function --function-name "$FUNC" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code \
    --function-name "$FUNC" \
    --zip-file "fileb://${ZIP}" \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNC" --region "$REGION"
  aws lambda update-function-configuration \
    --function-name "$FUNC" \
    --runtime nodejs22.x \
    --timeout 60 \
    --memory-size 512 \
    --environment "$ENV_JSON" \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNC" --region "$REGION"
else
  aws lambda create-function \
    --function-name "$FUNC" \
    --runtime nodejs22.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://${ZIP}" \
    --timeout 60 \
    --memory-size 512 \
    --environment "$ENV_JSON" \
    --region "$REGION" >/dev/null
fi
rm -f "$ZIP"

if ! aws lambda get-function-url-config --function-name "$FUNC" --region "$REGION" >/dev/null 2>&1; then
  aws lambda create-function-url-config \
    --function-name "$FUNC" \
    --auth-type NONE \
    --cors '{
      "AllowOrigins":["*"],
      "AllowMethods":["GET","POST"],
      "AllowHeaders":["content-type","authorization"],
      "MaxAge":60
    }' \
    --region "$REGION" >/dev/null
  aws lambda add-permission \
    --function-name "$FUNC" \
    --statement-id FunctionURLAllowPublic \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "$REGION" >/dev/null || true
else
  aws lambda update-function-url-config \
    --function-name "$FUNC" \
    --auth-type NONE \
    --cors '{
      "AllowOrigins":["*"],
      "AllowMethods":["GET","POST"],
      "AllowHeaders":["content-type","authorization"],
      "MaxAge":60
    }' \
    --region "$REGION" >/dev/null || true
fi

aws lambda add-permission \
  --function-name "$FUNC" \
  --statement-id FunctionURLAllowInvokeFunction \
  --action lambda:InvokeFunction \
  --principal "*" \
  --region "$REGION" >/dev/null 2>&1 || true

for OLD_FUNC in $OLD_FUNCS; do
  if [ -n "$OLD_FUNC" ] && [ "$OLD_FUNC" != "$FUNC" ] && \
    aws lambda get-function --function-name "$OLD_FUNC" --region "$REGION" >/dev/null 2>&1; then
    aws lambda delete-function-url-config --function-name "$OLD_FUNC" --region "$REGION" >/dev/null 2>&1 || true
    aws lambda delete-function --function-name "$OLD_FUNC" --region "$REGION" >/dev/null
    echo "deleted old function: $OLD_FUNC"
  fi
done

URL="$(aws lambda get-function-url-config --function-name "$FUNC" --region "$REGION" --query FunctionUrl --output text)"
python3 - "$ROOT/js/config.js" "$URL" <<'PY'
import pathlib, sys
path, url = sys.argv[1], sys.argv[2].rstrip("/")
pathlib.Path(path).write_text(
    "window.CycleConfig = {\n"
    "  // HApi：多应用共用。Cycle 固定 app=cycle。\n"
    f'  apiBase: "{url}",\n'
    '  app: "cycle",\n'
    "};\n",
    encoding="utf-8",
)
print(url)
PY

# Humanity 同账号 HApi；若本机旁有仓库则同步 apiBase
HUM_CFG="$(cd "$ROOT/.." && pwd)/Humanity/js/config.js"
if [ -f "$HUM_CFG" ]; then
  python3 - "$HUM_CFG" "$URL" <<'PY'
import pathlib, sys
path, url = sys.argv[1], sys.argv[2].rstrip("/")
pathlib.Path(path).write_text(
    "window.HumanityConfig = {\n"
    f'  apiBase: "{url}",\n'
    '  app: "humanity",\n'
    "};\n",
    encoding="utf-8",
)
print("wrote", path)
PY
fi

# 账号写入 DynamoDB（Humanity 从 .env.secrets；Cycle 默认 capitalism4418@gmail.com）
echo "seeding app credentials into DynamoDB..."
(cd "$DIR" && node scripts/seed-auth.mjs)
