#!/bin/bash
# 创建/更新 Lambda「Cycle」（按 flow 分流），并写回 js/config.js 的 apiBase。
# 不要把账号密码交给任何人。用 IAM 访问密钥或 aws login / SSO。
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
FUNC="${CYCLE_FUNC:-Cycle}"
ROLE="${CYCLE_ROLE:-Cycle-role}"
OLD_FUNC="${CYCLE_OLD_FUNC:-cycle-news}"
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

ZIP="$(mktemp -t Cycle).zip"
rm -f "$ZIP"
(cd "$DIR" && zip -q -r "$ZIP" index.mjs flows)

if aws lambda get-function --function-name "$FUNC" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code \
    --function-name "$FUNC" \
    --zip-file "fileb://${ZIP}" \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNC" --region "$REGION"
else
  aws lambda create-function \
    --function-name "$FUNC" \
    --runtime nodejs22.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://${ZIP}" \
    --timeout 10 \
    --memory-size 128 \
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

# 下线旧的单用途函数（若仍存在）
if [ -n "$OLD_FUNC" ] && aws lambda get-function --function-name "$OLD_FUNC" --region "$REGION" >/dev/null 2>&1; then
  aws lambda delete-function-url-config --function-name "$OLD_FUNC" --region "$REGION" >/dev/null 2>&1 || true
  aws lambda delete-function --function-name "$OLD_FUNC" --region "$REGION" >/dev/null
  echo "deleted old function: $OLD_FUNC"
fi

URL="$(aws lambda get-function-url-config --function-name "$FUNC" --region "$REGION" --query FunctionUrl --output text)"
python3 - "$ROOT/js/config.js" "$URL" <<'PY'
import pathlib, sys
path, url = sys.argv[1], sys.argv[2].rstrip("/")
pathlib.Path(path).write_text(
    "window.CycleConfig = {\n"
    "  // Cycle Lambda Function URL。按 ?flow= 分流，如 news。\n"
    f'  apiBase: "{url}",\n'
    "};\n",
    encoding="utf-8",
)
print(url)
PY
