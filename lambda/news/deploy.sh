#!/bin/bash
# 在已登录的 AWS CLI 上创建/更新 cycle-news，并写回 js/config.js。
# 不要把账号密码交给任何人。用 IAM 访问密钥或 aws login / SSO。
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
FUNC="${CYCLE_FUNC:-cycle-news}"
ROLE="${CYCLE_ROLE:-cycle-news-role}"
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

ZIP="$(mktemp -t cycle-news).zip"
rm -f "$ZIP"
(cd "$DIR" && zip -q "$ZIP" index.mjs)

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
      "AllowMethods":["GET"],
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
fi

# Function URL AuthType=NONE 还需要对 * 开放 InvokeFunction，否则浏览器会 403
aws lambda add-permission \
  --function-name "$FUNC" \
  --statement-id FunctionURLAllowInvokeFunction \
  --action lambda:InvokeFunction \
  --principal "*" \
  --region "$REGION" >/dev/null 2>&1 || true

URL="$(aws lambda get-function-url-config --function-name "$FUNC" --region "$REGION" --query FunctionUrl --output text)"
python3 - "$ROOT/js/config.js" "$URL" <<'PY'
import pathlib, sys
path, url = sys.argv[1], sys.argv[2].rstrip("/")
file = pathlib.Path(path)
file.write_text(
    "window.CycleConfig = {\n"
    "  // 金十重要事件，经 Lambda Function URL。空字符串则回退 RSS。\n"
    f'  newsProxy: "{url}",\n'
    "};\n",
    encoding="utf-8",
)
print(url)
PY
