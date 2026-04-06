import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

export async function handler(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "ok",
      version: process.env.BUILD_VERSION || "unknown",
      commit: process.env.BUILD_COMMIT || "unknown",
    }),
  };
}
