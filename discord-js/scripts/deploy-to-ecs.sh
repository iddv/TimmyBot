#!/bin/bash

# Deploy Discord.js container to ECS
# Usage: ./scripts/deploy-to-ecs.sh [environment] [image-tag]

set -e

# Configuration
AWS_REGION="eu-central-1"
AWS_ACCOUNT_ID="164859598862"
ECR_REPOSITORY="timmybot-discordjs"
ENVIRONMENT="${1:-dev}"
IMAGE_TAG="${2:-latest}"
PROJECT_NAME="timmybot"

# Derived values
CLUSTER_NAME="${PROJECT_NAME}-${ENVIRONMENT}-cluster"
SERVICE_NAME="${PROJECT_NAME}-${ENVIRONMENT}-service"
TASK_FAMILY="${PROJECT_NAME}-${ENVIRONMENT}-task"
ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Deploying TimmyBot Discord.js to ECS...${NC}"
echo "Environment: $ENVIRONMENT"
echo "Image: $ECR_URI"
echo "Cluster: $CLUSTER_NAME"
echo "Service: $SERVICE_NAME"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: AWS CLI not configured or no permissions${NC}"
    exit 1
fi

# Get current task definition
echo -e "${YELLOW}📋 Getting current task definition...${NC}"
CURRENT_TASK_DEF=$(aws ecs describe-task-definition --task-definition $TASK_FAMILY --region $AWS_REGION --query 'taskDefinition' --output json)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to get current task definition${NC}"
    exit 1
fi

# Create new task definition with updated image
echo -e "${YELLOW}🔄 Creating new task definition...${NC}"
NEW_TASK_DEF=$(echo $CURRENT_TASK_DEF | jq --arg IMAGE "$ECR_URI" '
  # Remove fields that should not be included in new task definition
  del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .placementConstraints, .compatibilities, .registeredAt, .registeredBy) |
  
  # Update the TimmyBot container image
  .containerDefinitions |= map(
    if .name | contains("container") then
      .image = $IMAGE |
      # Update health check for Discord.js
      .healthCheck.command = ["CMD-SHELL", "node dist/health-check-standalone.js || exit 1"] |
      # Ensure port mapping for health check
      .portMappings = [{"containerPort": 3000, "protocol": "tcp"}] |
      # Update log stream prefix
      .logConfiguration.options."awslogs-stream-prefix" = "timmybot-discordjs"
    else
      .
    end
  )
')

# Register new task definition
echo -e "${YELLOW}📝 Registering new task definition...${NC}"
NEW_TASK_DEF_ARN=$(echo $NEW_TASK_DEF | aws ecs register-task-definition --region $AWS_REGION --cli-input-json file:///dev/stdin --query 'taskDefinition.taskDefinitionArn' --output text)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to register new task definition${NC}"
    exit 1
fi

echo -e "${GREEN}✅ New task definition registered: $NEW_TASK_DEF_ARN${NC}"

# Update ECS service to use new task definition
echo -e "${YELLOW}🔄 Updating ECS service...${NC}"
aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --task-definition $NEW_TASK_DEF_ARN \
    --region $AWS_REGION \
    --query 'service.serviceName' \
    --output text

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to update ECS service${NC}"
    exit 1
fi

echo -e "${GREEN}✅ ECS service updated successfully${NC}"

# Wait for deployment to complete
echo -e "${YELLOW}⏳ Waiting for deployment to complete...${NC}"
aws ecs wait services-stable \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME \
    --region $AWS_REGION

if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
    
    # Get service status
    echo -e "${YELLOW}📊 Service Status:${NC}"
    aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $AWS_REGION \
        --query 'services[0].{
            ServiceName: serviceName,
            Status: status,
            RunningCount: runningCount,
            PendingCount: pendingCount,
            DesiredCount: desiredCount,
            TaskDefinition: taskDefinition
        }' \
        --output table
else
    echo -e "${RED}❌ Deployment failed or timed out${NC}"
    echo -e "${YELLOW}📋 Check ECS console for details${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Discord.js deployment completed!${NC}"

# Test Lavalink connectivity after deployment
echo ""
echo -e "${YELLOW}🔍 Testing Lavalink connectivity in deployed container...${NC}"

# Get the task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster "$CLUSTER_NAME" \
  --service-name "$SERVICE_NAME" \
  --region "$AWS_REGION" \
  --query 'taskArns[0]' \
  --output text)

if [ "$TASK_ARN" != "None" ] && [ "$TASK_ARN" != "" ]; then
  echo "Found running task: $TASK_ARN"
  
  # Execute the connection test script in the container
  echo -e "${YELLOW}🧪 Running Lavalink connection test in container...${NC}"
  aws ecs execute-command \
    --cluster "$CLUSTER_NAME" \
    --task "$TASK_ARN" \
    --container "timmybot-container" \
    --interactive \
    --command "/app/scripts/test-lavalink-connection.sh" \
    --region "$AWS_REGION" || echo -e "${YELLOW}⚠️ Connection test failed or ECS Exec not available${NC}"
    
  echo ""
  echo -e "${YELLOW}💡 To manually test WebSocket connectivity, run:${NC}"
  echo "aws ecs execute-command --cluster $CLUSTER_NAME --task $TASK_ARN --container timmybot-container --interactive --command \"/bin/bash\" --region $AWS_REGION"
  echo "Then inside the container run: /app/scripts/test-lavalink-connection.sh"
else
  echo -e "${YELLOW}⚠️ No running tasks found for connectivity test${NC}"
fi

echo ""
echo -e "${YELLOW}🔍 Monitor the deployment:${NC}"
echo "- ECS Console: https://console.aws.amazon.com/ecs/home?region=$AWS_REGION#/clusters/$CLUSTER_NAME/services/$SERVICE_NAME"
echo "- CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#logsV2:log-groups/log-group/%252Fecs%252F${PROJECT_NAME}-${ENVIRONMENT}"