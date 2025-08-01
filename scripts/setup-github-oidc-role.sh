#!/bin/bash

# =============================================================================
# 🔒 Setup GitHub Actions OIDC Role for TimmyBot
# =============================================================================
# This script creates an IAM Role that GitHub Actions can assume via OIDC
# More secure than storing AWS access keys in GitHub secrets!
#
# Prerequisites:
# - AWS CLI configured with admin permissions
# - GitHub repository: iddv/TimmyBot (adjust if different)
# =============================================================================

set -e

# Configuration
GITHUB_REPO="iddv/TimmyBot"
ROLE_NAME="GitHubActions-TimmyBot-Role"
POLICY_NAME="GitHubActions-TimmyBot-Policy"
OIDC_PROVIDER_URL="token.actions.githubusercontent.com"
REGION="${AWS_DEFAULT_REGION:-eu-central-1}"

echo "🚀 Setting up GitHub Actions OIDC Role for TimmyBot"
echo "📍 Repository: $GITHUB_REPO"
echo "🏷️ Role Name: $ROLE_NAME"
echo "🌍 Region: $REGION"
echo ""

# =============================================================================
# 1. Create/Verify OIDC Identity Provider
# =============================================================================
echo "🔍 Checking for GitHub OIDC Identity Provider..."

OIDC_ARN=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?ends_with(Arn, '$OIDC_PROVIDER_URL')].Arn" --output text 2>/dev/null || echo "")

if [ -z "$OIDC_ARN" ]; then
    echo "➕ Creating GitHub OIDC Identity Provider..."
    
    # Get GitHub's OIDC thumbprint
    THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"
    
    OIDC_ARN=$(aws iam create-open-id-connect-provider \
        --url "https://$OIDC_PROVIDER_URL" \
        --client-id-list "sts.amazonaws.com" \
        --thumbprint-list "$THUMBPRINT" \
        --query "OpenIDConnectProviderArn" \
        --output text)
    
    echo "✅ Created OIDC Provider: $OIDC_ARN"
else
    echo "✅ OIDC Provider already exists: $OIDC_ARN"
fi

# =============================================================================
# 2. Create IAM Policy
# =============================================================================
echo ""
echo "📋 Creating IAM Policy with required permissions..."

POLICY_DOCUMENT=$(cat << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ECRPermissions",
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
            ],
            "Resource": "*"
        },
        {
            "Sid": "ECSPermissions",
            "Effect": "Allow",
            "Action": [
                "ecs:DescribeTaskDefinition",
                "ecs:RegisterTaskDefinition",
                "ecs:UpdateService",
                "ecs:DescribeServices",
                "ecs:ListTasks",
                "ecs:DescribeTasks"
            ],
            "Resource": "*"
        },
        {
            "Sid": "PassRolePermissions",
            "Effect": "Allow",
            "Action": [
                "iam:PassRole"
            ],
            "Resource": [
                "arn:aws:iam::*:role/timmybot-dev-*"
            ]
        },
        {
            "Sid": "SecretsManagerPermissions",
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret"
            ],
            "Resource": [
                "arn:aws:secretsmanager:*:*:secret:timmybot/*"
            ]
        },
        {
            "Sid": "CloudWatchLogsPermissions",
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:DescribeLogStreams",
                "logs:GetLogEvents"
            ],
            "Resource": [
                "arn:aws:logs:*:*:log-group:/ecs/timmybot-*"
            ]
        }
    ]
}
EOF
)

# Delete existing policy if it exists
aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME" 2>/dev/null || true

POLICY_ARN=""
if aws iam get-policy --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/$POLICY_NAME" >/dev/null 2>&1; then
    echo "♻️ Policy already exists, updating..."
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    POLICY_ARN="arn:aws:iam::$ACCOUNT_ID:policy/$POLICY_NAME"
    
    aws iam create-policy-version \
        --policy-arn "$POLICY_ARN" \
        --policy-document "$POLICY_DOCUMENT" \
        --set-as-default >/dev/null
else
    echo "➕ Creating new policy..."
    POLICY_ARN=$(aws iam create-policy \
        --policy-name "$POLICY_NAME" \
        --policy-document "$POLICY_DOCUMENT" \
        --query "Policy.Arn" \
        --output text)
fi

echo "✅ Policy ready: $POLICY_ARN"

# =============================================================================
# 3. Create Trust Policy for GitHub OIDC
# =============================================================================
echo ""
echo "🤝 Creating Trust Policy for GitHub OIDC..."

TRUST_POLICY=$(cat << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "$OIDC_ARN"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": "repo:$GITHUB_REPO:*"
                }
            }
        }
    ]
}
EOF
)

# =============================================================================
# 4. Create IAM Role
# =============================================================================
echo ""
echo "👤 Creating IAM Role..."

# Delete role if it exists
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    echo "♻️ Role already exists, updating trust policy..."
    aws iam update-assume-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-document "$TRUST_POLICY"
else
    echo "➕ Creating new role..."
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY" \
        --description "GitHub Actions OIDC role for TimmyBot deployment"
fi

# Attach policy to role
aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "$POLICY_ARN"

# Get the role ARN
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/$ROLE_NAME"

echo "✅ Role ready: $ROLE_ARN"

# =============================================================================
# 5. Display Setup Instructions
# =============================================================================
echo ""
echo "🎉 SUCCESS! GitHub Actions OIDC Role configured!"
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1. 🔐 Add the Role ARN to GitHub Secrets:"
echo "   • Go to: https://github.com/$GITHUB_REPO/settings/secrets/actions"
echo "   • Click 'New repository secret'"
echo "   • Name: AWS_ROLE_ARN"
echo "   • Value: $ROLE_ARN"
echo ""
echo "2. 🚀 Push code to trigger deployment:"
echo "   • The workflow will now use OIDC instead of access keys"
echo "   • No long-lived credentials stored in GitHub!"
echo "   • More secure and follows AWS best practices"
echo ""
echo "🔒 SECURITY BENEFITS:"
echo "✅ No AWS access keys stored in GitHub"
echo "✅ Temporary credentials that expire automatically"
echo "✅ Granular permissions (only what TimmyBot needs)"
echo "✅ Better audit trail and security posture"
echo ""
echo "Role ARN to add to GitHub Secrets:"
echo "$ROLE_ARN"