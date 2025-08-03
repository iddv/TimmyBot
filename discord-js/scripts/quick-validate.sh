#!/bin/bash

# Quick validation of Discord.js deployment
set -e

AWS_REGION="eu-central-1"
CLUSTER_NAME="timmybot-dev-cluster"
SERVICE_NAME="timmybot-dev-service"
LOG_GROUP="/ecs/timmybot-dev"

echo "🔍 Quick deployment validation..."

# Check service status
echo "📊 Service Status:"
aws ecs describe-services \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME \
    --region $AWS_REGION \
    --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,TaskDef:taskDefinition}' \
    --output table

# Check task status
echo ""
echo "🏥 Task Status:"
TASK_ARN=$(aws ecs list-tasks \
    --cluster $CLUSTER_NAME \
    --service-name $SERVICE_NAME \
    --region $AWS_REGION \
    --query 'taskArns[0]' \
    --output text)

if [ "$TASK_ARN" != "None" ] && [ -n "$TASK_ARN" ]; then
    aws ecs describe-tasks \
        --cluster $CLUSTER_NAME \
        --tasks $TASK_ARN \
        --region $AWS_REGION \
        --query 'tasks[0].containers[*].{Name:name,Status:lastStatus,Health:healthStatus}' \
        --output table
else
    echo "❌ No running tasks found"
fi

# Check recent logs for errors
echo ""
echo "📋 Recent Error Logs:"
aws logs filter-log-events \
    --log-group-name $LOG_GROUP \
    --start-time $(date -d '10 minutes ago' +%s)000 \
    --filter-pattern "ERROR" \
    --region $AWS_REGION \
    --query 'events[*].message' \
    --output text | tail -5

# Check for Lavalink connection issues
echo ""
echo "🎵 Lavalink Connection Status:"
aws logs filter-log-events \
    --log-group-name $LOG_GROUP \
    --start-time $(date -d '5 minutes ago' +%s)000 \
    --filter-pattern "Lavalink" \
    --region $AWS_REGION \
    --query 'events[*].message' \
    --output text | grep -E "(ready|error|failed|timeout|connected|disconnected)" | tail -5

# Test Lavalink connectivity if task is running
if [ "$TASK_ARN" != "None" ] && [ -n "$TASK_ARN" ]; then
    echo ""
    echo "🧪 Testing Lavalink Connectivity:"
    aws ecs execute-command \
        --cluster $CLUSTER_NAME \
        --task $TASK_ARN \
        --container "timmybot-container" \
        --interactive \
        --command "/app/scripts/test-lavalink-connection.sh" \
        --region $AWS_REGION || echo "⚠️ Could not execute connection test (ECS Exec may not be enabled)"
fi

echo ""
echo "✅ Validation complete"
echo "💡 To debug manually:"
echo "aws ecs execute-command --cluster $CLUSTER_NAME --task $TASK_ARN --container timmybot-container --interactive --command \"/bin/bash\" --region $AWS_REGION"