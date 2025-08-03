#!/bin/bash

# TimmyBot ECS Service Management Script
# Usage: ./manage-service.sh [start|stop|status|logs]

set -e

CLUSTER_NAME="timmybot-dev-cluster"
SERVICE_NAME="timmybot-dev-service"
REGION="eu-central-1"

case "$1" in
    "start")
        echo "🚀 Starting TimmyBot service..."
        aws ecs update-service \
            --cluster "$CLUSTER_NAME" \
            --service "$SERVICE_NAME" \
            --desired-count 1 \
            --region "$REGION"
        echo "✅ Service start requested. Use './manage-service.sh status' to check progress."
        ;;
    
    "stop")
        echo "⏹️ Stopping TimmyBot service..."
        aws ecs update-service \
            --cluster "$CLUSTER_NAME" \
            --service "$SERVICE_NAME" \
            --desired-count 0 \
            --region "$REGION"
        echo "✅ Service stop requested. This will prevent further restarts and save money."
        ;;
    
    "status")
        echo "📊 Checking TimmyBot service status..."
        aws ecs describe-services \
            --cluster "$CLUSTER_NAME" \
            --services "$SERVICE_NAME" \
            --region "$REGION" \
            --query 'services[0].{Status:status,DesiredCount:desiredCount,RunningCount:runningCount,PendingCount:pendingCount}' \
            --output table
        ;;
    
    "logs")
        echo "📋 Fetching recent TimmyBot logs..."
        # Get the most recent task
        TASK_ARN=$(aws ecs list-tasks \
            --cluster "$CLUSTER_NAME" \
            --service-name "$SERVICE_NAME" \
            --region "$REGION" \
            --query 'taskArns[0]' \
            --output text)
        
        if [ "$TASK_ARN" != "None" ] && [ "$TASK_ARN" != "" ]; then
            TASK_ID=$(echo "$TASK_ARN" | cut -d'/' -f3)
            echo "📋 Logs for task: $TASK_ID"
            echo ""
            echo "=== TimmyBot Container Logs ==="
            aws logs get-log-events \
                --log-group-name "/ecs/timmybot-dev" \
                --log-stream-name "timmybot-discordjs/timmybot-dev-container/$TASK_ID" \
                --region "$REGION" \
                --query 'events[*].[timestamp,message]' \
                --output text | tail -20
            echo ""
            echo "=== Lavalink Container Logs ==="
            aws logs get-log-events \
                --log-group-name "/ecs/timmybot-dev" \
                --log-stream-name "lavalink/timmybot-dev-lavalink/$TASK_ID" \
                --region "$REGION" \
                --query 'events[*].[timestamp,message]' \
                --output text | tail -20
        else
            echo "❌ No running tasks found."
        fi
        ;;
    
    "restart")
        echo "🔄 Restarting TimmyBot service..."
        echo "⏹️ Stopping service first..."
        aws ecs update-service \
            --cluster "$CLUSTER_NAME" \
            --service "$SERVICE_NAME" \
            --desired-count 0 \
            --region "$REGION" > /dev/null
        
        echo "⏳ Waiting 10 seconds for tasks to stop..."
        sleep 10
        
        echo "🚀 Starting service..."
        aws ecs update-service \
            --cluster "$CLUSTER_NAME" \
            --service "$SERVICE_NAME" \
            --desired-count 1 \
            --region "$REGION" > /dev/null
        
        echo "✅ Service restart requested."
        ;;
    
    *)
        echo "TimmyBot ECS Service Management"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  start    - Start the service (set desired count to 1)"
        echo "  stop     - Stop the service (set desired count to 0) - SAVES MONEY"
        echo "  restart  - Stop then start the service"
        echo "  status   - Show current service status"
        echo "  logs     - Show recent logs from both containers"
        echo ""
        echo "Examples:"
        echo "  $0 stop     # Stop service to prevent endless restarts"
        echo "  $0 start    # Start service when ready to test"
        echo "  $0 logs     # Check what went wrong"
        ;;
esac