#!/bin/bash

# 🤖 Discord Bot Token Setup Script
# Updates AWS Secrets Manager with your Discord bot token

set -e

echo "🤖 Discord Bot Token Configuration"
echo "=================================="
echo ""

# Check if token is provided as argument
if [ $# -eq 0 ]; then
    echo "📋 You need a Discord bot token from: https://discord.com/developers/applications"
    echo ""
    echo "📖 Complete setup guide: docs/DISCORD_BOT_SETUP.md"
    echo ""
    read -p "🔑 Enter your Discord bot token: " BOT_TOKEN
else
    BOT_TOKEN=$1
fi

# Validate token format (basic check)
if [[ ! "$BOT_TOKEN" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
    echo "❌ Invalid token format!"
    echo "Discord bot tokens have 3 parts separated by dots: XXX.YYY.ZZZ"
    echo "Example: YOUR_BOT_TOKEN.WILL_LOOK.LIKE_THIS_FORMAT"
    exit 1
fi

echo ""
echo "🔒 Storing token in AWS Secrets Manager..."

# Update the secret
aws secretsmanager update-secret \
    --secret-id "timmybot/dev/discord-bot-token" \
    --secret-string "{\"token\":\"$BOT_TOKEN\"}" \
    --region eu-central-1

if [ $? -eq 0 ]; then
    echo "✅ Token stored successfully in AWS Secrets Manager!"
    echo ""
    echo "🚀 Restarting ECS service to apply new token..."
    
    # Force new deployment to pick up the new token
    aws ecs update-service \
        --cluster timmybot-dev-cluster \
        --service timmybot-dev-service \
        --force-new-deployment \
        --region eu-central-1 > /dev/null
        
    echo "✅ ECS service restart initiated!"
    echo ""
    echo "⏱️  Your bot will be online in 1-2 minutes"
    echo "🧪 Test with: ?ping in any Discord channel"
    echo ""
    echo "🔗 Need an invite link? See: docs/DISCORD_BOT_SETUP.md"
    echo "   Your invite URL format:"
    echo "   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3145728&scope=bot"  
else
    echo "❌ Failed to store token in AWS Secrets Manager"
    echo "💡 Make sure you have AWS credentials configured"
    exit 1
fi