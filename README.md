# notary-arweave-bundler

Self-hosted Arweave bundler for [agentsystems-notary](https://github.com/agentsystems/notary). Receives signed ANS-104 DataItems from SDK clients, batches them via SQS, and submits multi-item bundles as L1 Arweave transactions.

The operator pays for Arweave storage (AR tokens) and AWS compute. Clients submit DataItems for free — the operator subsidizes the uploads.

## Architecture

```
Client (SDK) → API Gateway → Lambda (verify) → SQS → Lambda (bundle + submit)
                                                  ↓ (on repeated failure)
                                                 DLQ
```

## Prerequisites

- AWS account
- GitHub account

## Deploy

### Step 1: AWS Console Setup (~10 min)

**Create a deployer IAM user:**

1. Go to **IAM > Users > Create user**. Name it `notary-arweave-bundler-deployer`.
2. Open the user, go to **Permissions > Add permissions > Create inline policy**. Switch to the **JSON** tab, paste the policy below, and name it `deployer`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KMS",
      "Effect": "Allow",
      "Action": [
        "kms:CreateKey",
        "kms:CreateAlias",
        "kms:DescribeKey",
        "kms:GetPublicKey"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SecretsManager",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": [
        "ecr:CreateRepository",
        "ecr:DeleteRepository",
        "ecr:DescribeRepositories",
        "ecr:TagResource",
        "ecr:SetRepositoryPolicy",
        "ecr:GetRepositoryPolicy",
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:*:*:repository/notary*"
    },
    {
      "Sid": "STS",
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    },
    {
      "Sid": "SAMDeploy",
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "lambda:*",
        "apigateway:*",
        "sqs:*",
        "logs:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMRoles",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:UpdateRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:ListRoleTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMPassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    }
  ]
}
```

3. Go to **Security credentials > Create access key**. Select **Application running outside AWS**. Note the access key ID and secret.

**Create a KMS key (your Arweave wallet):**

4. Go to **KMS > Customer managed keys > Create key**.
5. Key type: **Asymmetric**. Key spec: **RSA_4096**. Key usage: **Sign and verify**. Click through to create.
6. Note the key ARN (e.g. `arn:aws:kms:us-east-1:123456789012:key/abcd-1234-...`).

**Create an API key (optional):**

7. Go to **Secrets Manager > Store a new secret**. Secret type: **Other type of secret**. Switch to **Plaintext** and paste a random string (e.g. generate one at random.org). Click through to create.
8. Note the secret ARN. Skip this step to leave the endpoint open (anyone with the URL can submit DataItems and spend your AR).

### Step 2: Fork & Configure (~2 min)

1. Fork this repo on GitHub.
2. In your fork, go to **Settings > Secrets and variables > Actions**.
3. Add these repository secrets:

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | From step 1.3 |
| `AWS_SECRET_ACCESS_KEY` | From step 1.3 |
| `AWS_REGION` | Your AWS region (e.g. `us-east-1`) |
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID |
| `KMS_KEY_ARN` | From step 1.6 |
| `API_KEY_SECRET_ARN` | From step 1.8 (optional — leave out for open access) |

### Step 3: Deploy

1. Go to **Actions > Release > Run workflow**.
2. Enter a version (e.g. `0.1.0`) and click **Run workflow**.
3. The workflow builds the image, pushes to GHCR + ECR, runs `sam deploy` to create the full stack, and creates a GitHub release.
4. When complete, check the **workflow summary** for your API Gateway endpoint URL and wallet address.

### Step 4: Fund & Go Live

Send AR to the wallet address shown in the workflow summary. You can acquire AR from an exchange and transfer it, or fund from an existing wallet. The bundler needs AR to pay for L1 transaction storage. See [arweave.net](https://arweave.net) for current pricing.

Check your balance at `https://arweave.net/wallet/<ADDRESS>/balance`.

### Step 5: Configure SDK

Configure the agentsystems-notary SDK (>= 0.2.0) to use your bundler:

```python
from agentsystems_notary import NotaryCore

notary = NotaryCore(
    bundler_url="https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com",  # from workflow summary
    bundler_api_key="...",  # the value you stored in Secrets Manager; omit if no API key
)
```

## Building from Source

If you prefer to build the image yourself instead of pulling from GHCR:

```bash
git clone https://github.com/agentsystems/notary-arweave-bundler.git
cd notary-arweave-bundler
npm ci
npm run build
docker build -t notary-arweave-bundler .
```

Then push to ECR and deploy by triggering the Release workflow as shown in Step 3, or push to ECR manually and run `sam deploy` with your own `ImageUri`.

## Environment Variables

These are set automatically by the SAM template. Listed here for reference.

| Variable | Lambda | Description |
|---|---|---|
| `SQS_QUEUE_URL` | verify | SQS queue URL |
| `API_KEY_SECRET_ARN` | verify | Optional Secrets Manager ARN for API key (default: empty/open) |
| `KMS_KEY_ARN` | bundle | KMS key ARN for signing L1 transactions |
| `ARWEAVE_GATEWAY_URL` | bundle | Arweave gateway (default: `https://arweave.net`) |
| `DRY_RUN` | bundle | Skip Arweave submission when `true` (default: `false`) |
