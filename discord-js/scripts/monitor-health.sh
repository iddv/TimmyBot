#!/bin/bash

# Monitor health checks and container status
# Usage: ./scripts/monitor-health.sh [environment]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_NAME="timmybot"
REGION="eu-central-1"

echo "🔍 Monitoring health checks for ${PROJECT_NAME}-${ENVIRONMENT}..."

# Function to get service status
get_service_status() {
    aws ecs describe-services \
        --cluster "${PROJECT_NAME}-${ENVIRONMENT}-cluster" \
        --services "${PROJECT_NAME}-${ENVIRONMENT}-service" \
        --region $REGION \
        --query 'services[0].{
            Status: status,
            RunningCount: runningCount,
            PendingCount: pendingCount,
            DesiredCount: desiredCount,
            TaskDefinition: taskDefinition
        }' \
        --output table
}

# Function to get task health
get_task_health() {
    echo "📊 Getting task health status..."
    
    # Get running tasks
    TASK_ARNS=$(aws ecs list-tasks \
        --cluster "${PROJECT_NAME}-${ENVIRONMENT}-cluster" \
        --service-name "${PROJECT_NAME}-${ENVIRONMENT}-service" \
        --region $REGION \
        --query 'taskArns[]' \
        --output text)
    
    if [ -z "$TASK_ARNS" ]; then
        echo "❌ No running tasks found"
        return 1
    fi
    
    # Get task details
    aws ecs describe-tasks \
        --cluster "${PROJECT_NAME}-${ENVIRONMENT}-cluster" \
        --tasks $TASK_ARNS \
        --region $REGION \
        --query 'tasks[0].containers[*].{
            Name: name,
            LastStatus: lastStatus,
            HealthStatus: healthStatus,
            ExitCode: exitCode,
            Reason: reason
        }' \
        --output table
}

# Function to get recent logs
get_recent_logs() {
    echo "📝 Getting recent logs..."
    
    # Get logs from the last 10 minutes
    START_TIME=$(date -d '10 minutes ago' +%s)000
    
    echo "TimmyBot Container Logs:"
    aws logs filter-log-events \
        --log-group-name "/ecs/${PROJECT_NAME}-${ENVIRONMENT}" \
        --log-stream-name-prefix "timmybot-discordjs" \
        --start-time $START_TIME \
        --region $REGION \
        --query 'events[*].[timestamp,message]' \
        --output text | tail -20
    
    echo -e "\nLavalink Container Logs:"
    aws logs filter-log-events \
        --log-group-name "/ecs/${PROJECT_NAME}-${ENVIRONMENT}" \
        --log-stream-name-prefix "lavalink" \
        --start-time $START_TIME \
        --region $REGION \
        --query 'events[*].[timestamp,message]' \
        --output text | tail -20
}

# Function to test health endpoints
test_health_endpoints() {
    echo "🏥 Testing health endpoints..."
    
    # Get task public IP (if available) or use ECS exec
    TASK_ARN=$(aws ecs list-tasks \
        --cluster "${PROJECT_NAME}-${ENVIRONMENT}-cluster" \
        --service-name "${PROJECT_NAME}-${ENVIRONMENT}-service" \
        --region $REGION \
        --query 'taskArns[0]' \
        --output text)
    
    if [ "$TASK_ARN" != "None" ] && [ -n "$TASK_ARN" ]; then
        echo "Testing health endpoint via ECS exec..."
        aws ecs execute-command \
            --cluster "${PROJECT_NAME}-${ENVIRONMENT}-cluster" \
            --task "$TASK_ARN" \
            --container "${PROJECT_NAME}-${ENVIRONMENT}-container" \
            --command "curl -s http://localhost:3000/health | head -20" \
            --interactive \
            --region $REGION || echo "❌ Could not test health endpoint"
    else
        echo "❌ No running tasks to test"
    fi
}

# Main monitoring loop
echo "🚀 Starting health monitoring..."
echo "Press Ctrl+C to stop"

while true; do
    echo "=================================================="
    echo "⏰ $(date)"
    echo "=================================================="
    
    echo "📊 Service Status:"
    get_service_status
    
    echo -e "\n🏥 Task Health:"
    get_task_health
    
    echo -e "\n📝 Recent Activity:"
    get_recent_logs
    
    echo -e "\n⏳ Waiting 30 seconds before next check..."
    sleep 30
done