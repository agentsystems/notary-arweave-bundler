import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { config } from "../config";

const client = new DynamoDBClient({});

export async function checkRateLimit(): Promise<
  { allowed: true } | { allowed: false; count: number; limit: number }
> {
  const limit = config.rateLimitPerHour;
  const table = config.rateLimitTable;
  if (!limit || !table) return { allowed: true };

  const now = new Date();
  const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const ttl = Math.floor(now.getTime() / 1000) + 7200; // +2 hours

  const result = await client.send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: hourKey } },
      UpdateExpression: "ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl)",
      ExpressionAttributeNames: { "#count": "count", "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":one": { N: "1" },
        ":ttl": { N: String(ttl) },
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  const count = parseInt(result.Attributes!.count.N!, 10);
  if (count > limit) return { allowed: false, count, limit };
  return { allowed: true };
}
