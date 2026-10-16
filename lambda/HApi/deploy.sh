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
          \"dynamodb:Query\",\"dynamodb:DescribeTable\"
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

ENV_JSON="$(python3 - <<PY
import json
print(json.dumps({
  "Variables": {
    "HAPI_QUOTA_PARAM": "${QUOTA_PARAM}",
    "HAPI_MAX_REQUESTS": "${MAX_REQ}",
    "HAPI_MAX_GB_SECONDS": "${MAX_GB}",
    "HAPI_TABLE": "${TABLE}",
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
    "  // HApi：多应用共用。Cycle 固定 app=cycle。\n"
    f'  apiBase: "{url}",\n'
    '  app: "cycle",\n'
    "};\n",
    encoding="utf-8",
)
print(url)
PY
