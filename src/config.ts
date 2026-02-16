import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secretsClient = new SecretsManagerClient({});

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Cache the API key across warm Lambda invocations
let cachedApiKey: string | undefined;
let apiKeyLoaded = false;

async function loadApiKey(): Promise<string | undefined> {
  if (apiKeyLoaded) return cachedApiKey;

  const secretArn = process.env.API_KEY_SECRET_ARN;
  if (!secretArn) {
    apiKeyLoaded = true;
    return undefined;
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  cachedApiKey = response.SecretString || undefined;
  apiKeyLoaded = true;
  return cachedApiKey;
}

export const config = {
  get kmsKeyArn(): string {
    return required("KMS_KEY_ARN");
  },
  get sqsQueueUrl(): string {
    return required("SQS_QUEUE_URL");
  },
  get arweaveGatewayUrl(): string {
    return process.env.ARWEAVE_GATEWAY_URL ?? "https://arweave.net";
  },
  getApiKey: loadApiKey,
  get dryRun(): boolean {
    return process.env.DRY_RUN === "true";
  },
  get rateLimitPerHour(): number | undefined {
    const v = process.env.RATE_LIMIT_PER_HOUR;
    return v ? parseInt(v, 10) : undefined;
  },
  get rateLimitTable(): string | undefined {
    return process.env.RATE_LIMIT_TABLE || undefined;
  },
};
