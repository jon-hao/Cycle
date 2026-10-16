#!/bin/bash
# 创建/更新 Lambda「HApi」（按 flow 分流），并写回 js/config.js 的 apiBase。
# 不要把账号密码交给任何人。用 IAM 访问密钥或 aws login / SSO。
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
FUNC="${HAPI_FUNC:-HApi}"
ROLE="${HAPI_ROLE:-HApi-role}"
OLD_FUNCS="${HAPI_OLD_FUNCS:-Cycle cycle-news}"
QUOTA_PARAM="${HAPI_QUOTA_PARAM:-/HApi/quota}"
# 软上限：低于账号 Always Free，给 429 与其它函数留余量
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

# SSM Standard Parameter 存月度用量（免费）；仅限本参数
aws iam put-role-policy \
  --role-name "$ROLE" \
  --policy-name HApiQuotaSSM \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{
      \"Effect\":\"Allow\",
      \"Action\":[\"ssm:GetParameter\",\"ssm:PutParameter\"],
      \"Resource\":\"arn:aws:ssm:${REGION}:${ACCOUNT}:parameter${QUOTA_PARAM}\"
    }]
  }" >/dev/null

echo "npm install..."
(cd "$DIR" && npm install --omit=dev --no-fund --no-audit >/dev/null)

ZIP="$(mktemp -t HApi).zip"
rm -f "$ZIP"
(cd "$DIR" && zip -q -r "$ZIP" index.mjs quota.mjs flows package.json package-lock.json node_modules)

ENV_JSON="$(python3 - <<PY
import json
print(json.dumps({
  "Variables": {
    "HAPI_QUOTA_PARAM": "${QUOTA_PARAM}",
    "HAPI_MAX_REQUESTS": "${MAX_REQ}",
    "HAPI_MAX_GB_SECONDS": "${MAX_GB}",
  }
}))
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
    --timeout 20 \
    --memory-size 256 \
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
    --timeout 20 \
    --memory-size 256 \
    --environment "$ENV_JSON" \
    --region "$REGION" >/dev/null
fi
rm -f "$ZIP"

# CORS 只配在 Function URL；handler 不再返回 ACAO，避免重复头
if ! aws lambda get-function-url-config --function-name "$FUNC" --region "$REGION" >/dev/null 2>&1; then
  aws lambda create-function-url-config \
    --function-name "$FUNC" \
    --auth-type NONE \
    --cors '{
      "AllowOrigins":["*"],
      "AllowMethods":["GET","POST"],
      "AllowHeaders":["content-type"],
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
      "AllowHeaders":["content-type"],
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
    "  // HApi Lambda Function URL。按 ?flow= 分流，如 news。\n"
    f'  apiBase: "{url}",\n'
    "};\n",
    encoding="utf-8",
)
print(url)
PY
