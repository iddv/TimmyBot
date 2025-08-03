#!/bin/bash

# Validate Discord.js deployment functionality and performance
# Usage: ./scripts/validate-deployment.sh [environment]

set -e

# Configuration
AWS_REGION="eu-central-1"
ENVIRONMENT="${1:-dev}"
PROJECT_NAME="timmybot"

# Derived values
CLUSTER_NAME="${PROJECT_NAME}-${ENVIRONMENT}-cluster"
SERVICE_NAME="${PROJECT_NAME}-${ENVIRONMENT}-service"
LOG_GROUP="/ecs/${PROJECT_NAME}-${ENVIRONMENT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Validating TimmyBot Discord.js deployment...${NC}"
echo "Environment: $ENVIRONMENT"
echo "Cluster: $CLUSTER_NAME"
echo "Service: $SERVICE_NAME"
echo ""

# Function to check service status
check_service_status() {
    echo -e "${BLUE}📊 Checking ECS service status...${NC}"
    
    SERVICE_STATUS=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $AWS_REGION \
        --query 'services[0].{
            ServiceName: serviceName,
            Status: status,
            RunningCount: runningCount,
            PendingCount: pendingCount,
            DesiredCount: desiredCount,
            TaskDefinition: taskDefinition,
            LastDeployment: deployments[0].{
                Status: status,
                TaskDefinition: taskDefinition,
                CreatedAt: createdAt,
                RolloutState: rolloutState
            }
        }' \
        --output table)
    
    echo "$SERVICE_STATUS"
    
    # Check if service is stable
    ROLLOUT_STATE=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $AWS_REGION \
        --query 'services[0].deployments[0].rolloutState' \
        --output text)
    
    if [ "$ROLLOUT_STATE" = "COMPLETED" ]; then
        echo -e "${GREEN}✅ Service deployment completed successfully${NC}"
        return 0
    elif [ "$ROLLOUT_STATE" = "IN_PROGRESS" ]; then
        echo -e "${YELLOW}⏳ Service deployment still in progress${NC}"
        return 1
    else
        echo -e "${RED}❌ Service deployment failed or in unknown state: $ROLLOUT_STATE${NC}"
        return 2
    fi
}

# Function to check task health
check_task_health() {
    echo -e "${BLUE}🏥 Checking task health status...${NC}"
    
    # Get running tasks
    TASK_ARNS=$(aws ecs list-tasks \
        --cluster $CLUSTER_NAME \
        --service-name $SERVICE_NAME \
        --desired-status RUNNING \
        --region $AWS_REGION \
        --query 'taskArns' \
        --output text)
    
    if [ -z "$TASK_ARNS" ] || [ "$TASK_ARNS" = "None" ]; then
        echo -e "${RED}❌ No running tasks found${NC}"
        return 1
    fi
    
    # Check task details
    aws ecs describe-tasks \
        --cluster $CLUSTER_NAME \
        --tasks $TASK_ARNS \
        --region $AWS_REGION \
        --query 'tasks[0].{
            TaskArn: taskArn,
            LastStatus: lastStatus,
            HealthStatus: healthStatus,
            CreatedAt: createdAt,
            Containers: containers[*].{
                Name: name,
                LastStatus: lastStatus,
                HealthStatus: healthStatus
            }
        }' \
        --output table
    
    # Check if all containers are healthy
    UNHEALTHY_CONTAINERS=$(aws ecs describe-tasks \
        --cluster $CLUSTER_NAME \
        --tasks $TASK_ARNS \
        --region $AWS_REGION \
        --query 'tasks[0].containers[?healthStatus!=`HEALTHY`].name' \
        --output text)
    
    if [ -z "$UNHEALTHY_CONTAINERS" ] || [ "$UNHEALTHY_CONTAINERS" = "None" ]; then
        echo -e "${GREEN}✅ All containers are healthy${NC}"
        return 0
    else
        echo -e "${RED}❌ Unhealthy containers found: $UNHEALTHY_CONTAINERS${NC}"
        return 1
    fi
}

# Function to check recent logs
check_logs() {
    echo -e "${BLUE}📋 Checking recent application logs...${NC}"
    
    # Get Discord.js container logs (last 10 minutes)
    echo -e "${YELLOW}Discord.js Container Logs:${NC}"
    aws logs filter-log-events \
        --log-group-name $LOG_GROUP \
        --log-stream-name-prefix "timmybot-discordjs" \
        --start-time $(date -d '10 minutes ago' +%s)000 \
        --region $AWS_REGION \
        --query 'events[*].[timestamp,message]' \
        --output text | tail -20
    
    echo ""
    
    # Get Lavalink container logs (last 10 minutes)
    echo -e "${YELLOW}Lavalink Container Logs:${NC}"
    aws logs filter-log-events \
        --log-group-name $LOG_GROUP \
        --log-stream-name-prefix "lavalink" \
        --start-time $(date -d '10 minutes ago' +%s)000 \
        --region $AWS_REGION \
        --query 'events[*].[timestamp,message]' \
        --output text | tail -20
    
    echo ""
}

# Function to check performance metrics
check_performance() {
    echo -e "${BLUE}📈 Checking performance metrics...${NC}"
    
    # Get CPU and Memory utilization for the last hour
    END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
    START_TIME=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)
    
    echo -e "${YELLOW}CPU Utilization (last hour):${NC}"
    aws cloudwatch get-metric-statistics \
        --namespace AWS/ECS \
        --metric-name CPUUtilization \
        --dimensions Name=ServiceName,Value=$SERVICE_NAME Name=ClusterName,Value=$CLUSTER_NAME \
        --start-time $START_TIME \
        --end-time $END_TIME \
        --period 300 \
        --statistics Average,Maximum \
        --region $AWS_REGION \
        --query 'Datapoints[*].{Timestamp:Timestamp,Average:Average,Maximum:Maximum}' \
        --output table
    
    echo ""
    
    echo -e "${YELLOW}Memory Utilization (last hour):${NC}"
    aws cloudwatch get-metric-statistics \
        --namespace AWS/ECS \
        --metric-name MemoryUtilization \
        --dimensions Name=ServiceName,Value=$SERVICE_NAME Name=ClusterName,Value=$CLUSTER_NAME \
        --start-time $START_TIME \
        --end-time $END_TIME \
        --period 300 \
        --statistics Average,Maximum \
        --region $AWS_REGION \
        --query 'Datapoints[*].{Timestamp:Timestamp,Average:Average,Maximum:Maximum}' \
        --output table
    
    echo ""
}

# Function to validate Discord.js specific functionality
validate_discord_functionality() {
    echo -e "${BLUE}🤖 Validating Discord.js functionality...${NC}"
    
    # Check for Discord connection in logs
    echo -e "${YELLOW}Checking Discord connection status...${NC}"
    DISCORD_READY=$(aws logs filter-log-events \
        --log-group-name $LOG_GROUP \
        --log-stream-name-prefix "timmybot-discordjs" \
        --start-time $(date -d '30 minutes ago' +%s)000 \
        --filter-pattern "Ready" \
        --region $AWS_REGION \
        --query 'events[*].message' \
        --output text | head -5)
    
    if [ -n "$DISCORD_READY" ]; then
        echo -e "${GREEN}✅ Discord connection established${NC}"
        echo "$DISCORD_READY"
    else
        echo -e "${RED}❌ No Discord ready events found in recent logs${NC}"
    fi
    
    echo ""
    
    # Check for Lavalink connection in logs
    echo -e "${YELLOW}Checking Lavalink connection status...${NC}"
    LAVALINK_READY=$(aws logs filter-log-events \
        --log-group-name $LOG_GROUP \
        --log-stream-name-prefix "timmybot-discordjs" \
        --start-time $(date -d '30 minutes ago' +%s)000 \
        --filter-pattern "Lavalink" \
        --region $AWS_REGION \
        --query 'events[*].message' \
        --output text | head -5)
    
    if [ -n "$LAVALINK_READY" ]; then
        echo -e "${GREEN}✅ Lavalink connection status found in logs${NC}"
        echo "$LAVALINK_READY"
    else
        echo -e "${YELLOW}⚠️  No Lavalink connection events found in recent logs${NC}"
    fi
    
    echo ""
    
    # Check for any error patterns
    echo -e "${YELLOW}Checking for error patterns...${NC}"
    ERROR_LOGS=$(aws logs filter-log-events \
        --log-group-name $LOG_GROUP \
        --log-stream-name-prefix "timmybot-discordjs" \
        --start-time $(date -d '30 minutes ago' +%s)000 \
        --filter-pattern "ERROR" \
        --region $AWS_REGION \
        --query 'events[*].message' \
        --output text | head -10)
    
    if [ -n "$ERROR_LOGS" ]; then
        echo -e "${RED}❌ Error logs found:${NC}"
        echo "$ERROR_LOGS"
    else
        echo -e "${GREEN}✅ No error patterns found in recent logs${NC}"
    fi
}

# Main validation flow
main() {
    echo -e "${YELLOW}Starting deployment validation...${NC}"
    echo ""
    
    # Step 1: Check service status
    if ! check_service_status; then
        echo -e "${YELLOW}⚠️  Service deployment not yet complete, continuing with other checks...${NC}"
    fi
    
    echo ""
    
    # Step 2: Check task health
    if check_task_health; then
        echo -e "${GREEN}✅ Task health check passed${NC}"
    else
        echo -e "${RED}❌ Task health check failed${NC}"
    fi
    
    echo ""
    
    # Step 3: Check logs
    check_logs
    
    # Step 4: Check performance
    check_performance
    
    # Step 5: Validate Discord.js functionality
    validate_discord_functionality
    
    echo ""
    echo -e "${GREEN}🎉 Deployment validation completed!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Summary:${NC}"
    echo "- ECS Service: $SERVICE_NAME"
    echo "- Cluster: $CLUSTER_NAME"
    echo "- Log Group: $LOG_GROUP"
    echo "- Region: $AWS_REGION"
    echo ""
    echo -e "${YELLOW}🔍 Monitor deployment:${NC}"
    echo "- ECS Console: https://console.aws.amazon.com/ecs/home?region=$AWS_REGION#/clusters/$CLUSTER_NAME/services/$SERVICE_NAME"
    echo "- CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#logsV2:log-groups/log-group/%252Fecs%252F${PROJECT_NAME}-${ENVIRONMENT}"
}

# Run main function
main "$@"