#!/bin/bash

# Get latest logs from ECS service
echo "🔍 Fetching latest logs from ECS service..."

# Get the latest task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster timmybot-dev-cluster \
  --service-name timmybot-dev-service \
  --region eu-central-1 \
  --query 'taskArns[0]' \
  --output text)

if [ "$TASK_ARN" = "None" ] || [ -z "$TASK_ARN" ]; then
  echo "❌ No running tasks found"
  exit 1
fi

echo "📋 Task ARN: $TASK_ARN"

# Get task definition to find log group
TASK_DEF=$(aws ecs describe-tasks \
  --cluster timmybot-dev-cluster \
  --tasks $TASK_ARN \
  --region eu-central-1 \
  --query 'tasks[0].taskDefinitionArn' \
  --output text)

echo "📋 Task Definition: $TASK_DEF"

# Get the log group name from task definition
LOG_GROUP=$(aws ecs describe-task-definition \
  --task-definition $TASK_DEF \
  --region eu-central-1 \
  --query 'taskDefinition.containerDefinitions[0].logConfiguration.options."awslogs-group"' \
  --output text)

echo "📋 Log Group: $LOG_GROUP"

# Get the log stream name (task ID)
TASK_ID=$(echo $TASK_ARN | cut -d'/' -f3)
LOG_STREAM="timmybot-container/$TASK_ID"

echo "📋 Log Stream: $LOG_STREAM"

# Get the latest logs
echo "📜 Latest logs:"
echo "=================================="

aws logs get-log-events \
  --log-group-name $LOG_GROUP \
  --log-stream-name $LOG_STREAM \
  --region eu-central-1 \
  --start-from-head \
  --query 'events[*].[timestamp,message]' \
  --output text | tail -50

echo "=================================="
echo "✅ Log fetch complete"