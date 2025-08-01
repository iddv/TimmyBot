#!/bin/bash

# 🔄 GitHub Actions CI/CD Setup Script
# This script automates the AWS IAM setup for GitHub Actions

set -e

echo "🚀 Setting up GitHub Actions CI/CD for TimmyBot..."
echo ""

# Get AWS Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "📋 AWS Account ID: $ACCOUNT_ID"

# Create IAM user
echo "👤 Creating IAM user: github-actions-timmybot"
if aws iam get-user --user-name github-actions-timmybot >/dev/null 2>&1; then
    echo "   ⚠️  User already exists, skipping creation"
else
    aws iam create-user --user-name github-actions-timmybot
    echo "   ✅ User created successfully"
fi

# Create policy document
echo "📄 Creating IAM policy document..."
cat > /tmp/github-actions-policy.json << EOF
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
            "Resource": "arn:aws:ecr:eu-central-1:${ACCOUNT_ID}:repository/timmybot"
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
                "arn:aws:ecs:eu-central-1:${ACCOUNT_ID}:service/timmybot-dev-cluster/timmybot-dev-service",
                "arn:aws:ecs:eu-central-1:${ACCOUNT_ID}:task-definition/timmybot-dev-task:*",
                "arn:aws:ecs:eu-central-1:${ACCOUNT_ID}:cluster/timmybot-dev-cluster"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "iam:PassRole"
            ],
            "Resource": [
                "arn:aws:iam::${ACCOUNT_ID}:role/timmybot-dev-ecs-TaskRole*",
                "arn:aws:iam::${ACCOUNT_ID}:role/timmybot-dev-ecs-ExecutionRole*"
            ]
        }
    ]
}
EOF

# Create or update policy
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/GitHubActionsTimmyBotPolicy"
echo "🔐 Creating IAM policy..."

if aws iam get-policy --policy-arn $POLICY_ARN >/dev/null 2>&1; then
    echo "   ⚠️  Policy already exists, updating..."
    aws iam create-policy-version \
        --policy-arn $POLICY_ARN \
        --policy-document file:///tmp/github-actions-policy.json \
        --set-as-default
else
    aws iam create-policy \
        --policy-name GitHubActionsTimmyBotPolicy \
        --policy-document file:///tmp/github-actions-policy.json
    echo "   ✅ Policy created successfully"
fi

# Attach policy to user
echo "🔗 Attaching policy to user..."
aws iam attach-user-policy \
    --user-name github-actions-timmybot \
    --policy-arn $POLICY_ARN
echo "   ✅ Policy attached successfully"

# Create access key (check if one exists first)
echo "🔑 Managing access keys..."
EXISTING_KEYS=$(aws iam list-access-keys --user-name github-actions-timmybot --query 'AccessKeyMetadata[].AccessKeyId' --output text)

if [ -n "$EXISTING_KEYS" ]; then
    echo "   ⚠️  Access keys already exist:"
    for key in $EXISTING_KEYS; do
        echo "      - $key"
    done
    echo "   💡 Use existing keys or delete them first: aws iam delete-access-key --user-name github-actions-timmybot --access-key-id KEY_ID"
else
    echo "   🔐 Creating new access key..."
    ACCESS_KEY_OUTPUT=$(aws iam create-access-key --user-name github-actions-timmybot)
    
    ACCESS_KEY_ID=$(echo $ACCESS_KEY_OUTPUT | jq -r '.AccessKey.AccessKeyId')
    SECRET_ACCESS_KEY=$(echo $ACCESS_KEY_OUTPUT | jq -r '.AccessKey.SecretAccessKey')
    
    echo ""
    echo "🎉 SUCCESS! GitHub Actions IAM setup complete!"
    echo ""
    echo "📋 Add these secrets to your GitHub repository:"
    echo "   Go to: Settings → Secrets and variables → Actions"
    echo ""
    echo "   AWS_ACCESS_KEY_ID = $ACCESS_KEY_ID"
    echo "   AWS_SECRET_ACCESS_KEY = $SECRET_ACCESS_KEY"
    echo ""
    echo "⚠️  IMPORTANT: Save these credentials securely!"
    echo "   The secret access key will not be shown again."
fi

# Cleanup
rm -f /tmp/github-actions-policy.json

echo ""
echo "🔗 Next steps:"
echo "   1. Add the credentials above to GitHub Secrets"
echo "   2. Push code to main branch to trigger the pipeline"
echo "   3. Watch GitHub Actions tab for automated deployment"
echo ""
echo "📖 Full documentation: docs/GITHUB_ACTIONS_SETUP.md"