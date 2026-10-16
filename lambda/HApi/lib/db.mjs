/**
 * DynamoDB Always Free：按区域每月 25GB + 25 RCU + 25 WCU（需 provisioned）。
 * 表结构：pk (S) + sk (S)，可选 ttl (N, epoch 秒)。
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
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
