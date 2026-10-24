# Teardown, 2026-10-24

TimmyBot's two ECR repositories, **`timmybot`** and **`timmybot-discordjs`** (AWS account `164859598862`, eu-central-1), were **deleted on 2026-10-24** at the owner's request. Nothing in the account ran them any more: no ECS service or task was left. Their image tags and push dates are listed in the backup's `ec2/timmybot-images.txt`. The images can be rebuilt from this repo's `Dockerfile` and `discord-js/`.

## To spin it up again

Recreate the two repositories in eu-central-1 and the ECS/Fargate setup in `cdk/`, then let `.github/workflows/deploy.yml` push the images. It assumes `secrets.AWS_ROLE_ARN`, and that role no longer exists, so recreate it. The workflow `🚀 TimmyBot CI/CD Pipeline` is still enabled.

## Where the backups are

Everything was backed up before deletion to the owner's laptop, at `~/workspace/backups/aws-164859598862-2026-10-24/`, with a copy on the homelab at the same path. That folder has its own `README.md`. It is **not** in this repo, because some of it holds user records. What it contains:

| Folder | What |
|---|---|
| `cfn/` | each stack's template as deployed, its parameters and its resource list |
| `s3/` | every object of every non-empty bucket |
| `dynamodb/` | each table's schema and every item (scan) |
| `lambda/`, `amplify/` | function and app configuration, **environment variable names only** (no values) |
| `apigw/` | OpenAPI exports of the REST APIs |
| `route53/` | every record of every hosted zone |
| `iam/`, `secrets/` | removed users' policies, secret and parameter **names** only |
| `ec2/` | instances, Elastic IPs, ECR and log groups as they were |

No secret value was read or saved. To spin it up again you will need to create fresh secrets and keys.
