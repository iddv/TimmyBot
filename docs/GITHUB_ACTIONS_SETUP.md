# 🔄 GitHub Actions CI/CD Setup Guide

This guide sets up **fully automated** deployment from GitHub to AWS ECS - **zero manual AWS commands needed!**

## 🎯 **What This Automates**

✅ **Build**: Compiles Kotlin code and runs all tests on every push  
✅ **Docker**: Builds and tags container images automatically  
✅ **ECR Push**: Pushes images to AWS ECR with git SHA versioning  
✅ **ECS Deploy**: Updates ECS service with new image  
✅ **Rollback**: ECS automatically rolls back failed deployments  
✅ **Security**: Scans for vulnerabilities on pull requests  

## 🔑 **One-Time Setup: AWS Credentials**

### **Step 1: Create GitHub Actions IAM User**

```bash
# Create IAM user for GitHub Actions
aws iam create-user --user-name github-actions-timmybot

# Create access key
aws iam create-access-key --user-name github-actions-timmybot
```

### **Step 2: Create IAM Policy for GitHub Actions**

Create `github-actions-policy.json`:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchDeleteImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
            ],
            "Resource": "arn:aws:ecr:eu-central-1:*:repository/timmybot"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ecs:DescribeTaskDefinition",
                "ecs:DescribeServices",
                "ecs:UpdateService",
                "ecs:RegisterTaskDefinition"
            ],
            "Resource": [
                "arn:aws:ecs:eu-central-1:*:service/timmybot-dev-cluster/timmybot-dev-service",
                "arn:aws:ecs:eu-central-1:*:task-definition/timmybot-dev-task:*",
                "arn:aws:ecs:eu-central-1:*:cluster/timmybot-dev-cluster"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "iam:PassRole"
            ],
            "Resource": [
                "arn:aws:iam::*:role/timmybot-dev-ecs-TaskRole*",
                "arn:aws:iam::*:role/timmybot-dev-ecs-ExecutionRole*"
            ]
        }
    ]
}
```

```bash
# Apply the policy
aws iam create-policy \
  --policy-name GitHubActionsTimmyBotPolicy \
  --policy-document file://github-actions-policy.json

# Attach policy to user
aws iam attach-user-policy \
  --user-name github-actions-timmybot \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/GitHubActionsTimmyBotPolicy
```

### **Step 3: Add GitHub Secrets**

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these **Repository Secrets**:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `AWS_ACCESS_KEY_ID` | `AKIA...` | From step 1 create-access-key output |
| `AWS_SECRET_ACCESS_KEY` | `abc123...` | From step 1 create-access-key output |

## 🚀 **How It Works After Setup**

### **Automatic Deployment Flow**

1. **Push to main/master** → GitHub Actions triggers
2. **🧪 Tests run** → Must pass to continue  
3. **🏗️ Build** → Gradle creates fat JAR
4. **🐳 Docker build** → Creates optimized Alpine image
5. **🏷️ Tag with git SHA** → `guild-isolation-a1b2c3d4`
6. **📤 Push to ECR** → Both SHA and `latest` tags
7. **📝 Update ECS task definition** → New image URI
8. **🚀 Deploy to ECS** → Zero-downtime rolling update
9. **✅ Wait for stability** → Confirms deployment success

### **Branch-Based Behavior**

- **🔀 Pull Requests**: Run tests + security scanning only
- **🚀 Main/Master**: Full build, push, and deploy pipeline  
- **🎯 Other branches**: No deployment (tests only on PR)

### **Image Versioning Strategy**

```
ECR Repository: 164859598862.dkr.ecr.eu-central-1.amazonaws.com/timmybot
├── guild-isolation-latest     ← Always points to newest
├── guild-isolation-a1b2c3d4   ← Git SHA for rollbacks  
├── guild-isolation-f5e6d7c8   ← Previous version
└── guild-isolation-9a8b7c6d   ← Even older version
```

## 🛠️ **Testing the Pipeline**

1. **Make a code change** in `src/main/kotlin/timmybot/`
2. **Commit and push** to main branch
3. **Watch GitHub Actions** tab - full pipeline runs automatically
4. **Check ECS** - new image deployed within 5-10 minutes
5. **Verify logs** - `aws logs get-log-events --log-group-name /ecs/timmybot-dev`

## 🎯 **Benefits of This Approach**

✅ **Zero Manual Commands**: Never run `docker push` or `aws ecs update-service` again  
✅ **Git SHA Versioning**: Easy rollbacks to any previous version  
✅ **Automated Testing**: Code must pass tests before deployment  
✅ **Security Scanning**: Vulnerability detection on pull requests  
✅ **Rolling Deployments**: Zero-downtime updates  
✅ **Deployment History**: Full audit trail in GitHub Actions  

## 🔄 **Next Steps After Setup**

1. **Test the pipeline** with a small code change
2. **Configure Discord bot token** in AWS Secrets Manager
3. **Set up monitoring alerts** for failed deployments
4. **Add integration tests** for music streaming functionality
5. **Configure auto-scaling** based on Discord server load

---

🎉 **After this setup, you'll never need to run manual AWS commands for deployments!**