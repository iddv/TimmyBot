#!/bin/bash

# Deploy Discord.js TimmyBot with Enhanced Lavalink Debugging
# This script builds, deploys, and tests the enhanced debugging version

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="eu-central-1"
AWS_ACCOUNT_ID="164859598862"
ECR_REPOSITORY="timmybot-discordjs"
ENVIRONMENT="dev"
PROJECT_NAME="timmybot"
IMAGE_TAG="debug-$(date +%Y%m%d-%H%M%S)"

echo -e "${BLUE}🚀 Deploying TimmyBot Discord.js with Enhanced Lavalink Debugging${NC}"
echo "Environment: $ENVIRONMENT"
echo "Image Tag: $IMAGE_TAG"
echo "Debugging Features:"
echo "  ✅ Enhanced WebSocket connection logging"
echo "  ✅ Connection testing tools"
echo "  ✅ Diagnostic report generation"
echo "  ✅ Container monitoring alarms"
echo ""

# Step 1: Build and push Docker image
echo -e "${YELLOW}📦 Building Docker image with debugging tools...${NC}"
./scripts/build-and-push.sh $ENVIRONMENT $IMAGE_TAG

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

# Step 2: Deploy to ECS
echo -e "${YELLOW}🚀 Deploying to ECS...${NC}"
./scripts/deploy-to-ecs.sh $ENVIRONMENT $IMAGE_TAG

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ ECS deployment failed${NC}"
    exit 1
fi

# Step 3: Wait for deployment to stabilize
echo -e "${YELLOW}⏳ Waiting for deployment to stabilize...${NC}"
sleep 30

# Step 4: Run validation with debugging
echo -e "${YELLOW}🔍 Running enhanced validation...${NC}"
./scripts/quick-validate.sh

# Step 5: Check for Lavalink connection issues
echo -e "${YELLOW}🎵 Checking Lavalink connection status...${NC}"
aws logs filter-log-events \
  --log-group-name "/ecs/timmybot-dev" \
  --start-time $(date -d '5 minutes ago' +%s)000 \
  --filter-pattern "Lavalink" \
  --region $AWS_REGION \
  --query 'events[*].message' \
  --output text | grep -E "(ready|error|failed|timeout|connected|disconnected)" | tail -10

# Step 6: Display debugging information
echo ""
echo -e "${GREEN}✅ Deployment completed with debugging enhancements!${NC}"
echo ""
echo -e "${BLUE}🔍 Debugging Resources:${NC}"
echo "1. Debugging Guide: discord-js/LAVALINK_DEBUGGING_GUIDE.md"
echo "2. Connection Test Script: /app/scripts/test-lavalink-connection.sh (inside container)"
echo "3. CloudWatch Logs: /ecs/timmybot-dev"
echo ""

# Get task ARN for manual debugging
TASK_ARN=$(aws ecs list-tasks \
  --cluster "${PROJECT_NAME}-${ENVIRONMENT}-cluster" \
  --service-name "${PROJECT_NAME}-${ENVIRONMENT}-service" \
  --region $AWS_REGION \
  --query 'taskArns[0]' \
  --output text)

if [ "$TASK_ARN" != "None" ] && [ "$TASK_ARN" != "" ]; then
    echo -e "${BLUE}🛠️ Manual Debugging Commands:${NC}"
    echo ""
    echo "Access container shell:"
    echo "aws ecs execute-command --cluster ${PROJECT_NAME}-${ENVIRONMENT}-cluster --task $TASK_ARN --container timmybot-container --interactive --command \"/bin/bash\" --region $AWS_REGION"
    echo ""
    echo "Run connection test:"
    echo "aws ecs execute-command --cluster ${PROJECT_NAME}-${ENVIRONMENT}-cluster --task $TASK_ARN --container timmybot-container --interactive --command \"/app/scripts/test-lavalink-connection.sh\" --region $AWS_REGION"
    echo ""
    echo "View real-time logs:"
    echo "aws logs tail /ecs/timmybot-dev --follow --region $AWS_REGION"
fi

echo ""
echo -e "${BLUE}📊 Monitoring:${NC}"
echo "- ECS Console: https://console.aws.amazon.com/ecs/home?region=$AWS_REGION#/clusters/${PROJECT_NAME}-${ENVIRONMENT}-cluster/services/${PROJECT_NAME}-${ENVIRONMENT}-service"
echo "- CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#logsV2:log-groups/log-group/%252Fecs%252F${PROJECT_NAME}-${ENVIRONMENT}"
echo "- CloudWatch Alarms: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#alarmsV2:"

echo ""
echo -e "${GREEN}🎉 Enhanced debugging deployment complete!${NC}"
echo -e "${YELLOW}💡 Check the logs for detailed Lavalink connection information${NC}"