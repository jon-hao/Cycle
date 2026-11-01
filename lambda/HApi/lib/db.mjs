/**
 * DynamoDB Always Free：按区域每月 25GB + 25 RCU + 25 WCU（需 provisioned）。
 * 表结构：pk (S) + sk (S)，可选 ttl (N, epoch 秒)。
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.HAPI_TABLE || "HApi";
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export function tableName() {
  return TABLE;
}

export async function dbGet(pk, sk = "v1") {
  const out = await client.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk, sk },
    })
  );
  return out.Item || null;
}

export async function dbPut(item) {
  await client.send(
    new PutCommand({
      TableName: TABLE,
      Item: item,
    })
  );
}

export async function dbDelete(pk, sk) {
  await client.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk, sk },
    })
  );
}

/** 同 pk 下列出全部 sk（分页最多约 1MB / 次） */
export async function dbQueryPk(pk, opts) {
  const limit = (opts && opts.limit) || 200;
  const out = await client.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      Limit: limit,
      ScanIndexForward: false,
    })
  );
  return out.Items || [];
}
