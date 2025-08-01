# 🚀 TimmyBot Deployment Guide

*AWS deployment guide and infrastructure setup*

## 🎯 **Deployment Overview**

### Architecture Components
- **ECS Fargate Service** - Single service handling Discord Gateway and music streaming
- **DynamoDB Tables** - Guild queues, user preferences, track cache
- **AWS Secrets Manager** - OAuth token storage (AWS security best practice)
- **S3 Buckets** - Track metadata and user data caching
- **CloudWatch** - Monitoring, logging, and auto-scaling metrics

### Deployment Options
1. **Self-Deployment** - Full control, your AWS account and costs
2. **Managed Instance** - Request access to central instance (limited slots)

## 🛠️ **Prerequisites**

### AWS Account Setup
```bash
# 1. Create AWS account if you don't have one
# 2. Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# 3. Configure AWS credentials
aws configure
# AWS Access Key ID: [Your access key]
# AWS Secret Access Key: [Your secret key]  
# Default region name: us-east-1
# Default output format: json
```

### Required IAM Permissions
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ecs:*",
                "dynamodb:*",
                "secretsmanager:*",
                "s3:*",
                "cloudwatch:*",
                "logs:*",
                "iam:CreateRole",
                "iam:AttachRolePolicy",
                "iam:PassRole"
            ],
            "Resource": "*"
        }
    ]
}
```

### Discord Bot Setup
```yaml
Step 1: Create Discord Application
  - Go to https://discord.com/developers/applications
  - Click "New Application"
  - Name: "TimmyBot" (or your custom name)
  - Save Application ID

Step 2: Create Bot User
  - Go to "Bot" section
  - Click "Add Bot"
  - Save Bot Token (keep secure!)
  - Enable "Message Content Intent"
  - Enable "Server Members Intent"

Step 3: Set Bot Permissions
  - Go to "OAuth2" > "URL Generator"
  - Scopes: "bot", "applications.commands"
  - Bot Permissions:
    * Connect
    * Speak
    * Use Voice Activity
    * Send Messages
    * Use Slash Commands
    * Embed Links
    * Attach Files
```

### Music Service OAuth Setup

#### YouTube API Setup
```yaml
Step 1: Google Cloud Console
  - Go to https://console.cloud.google.com/
  - Create new project or select existing
  - Enable "YouTube Data API v3"

Step 2: Create OAuth 2.0 Credentials
  - Go to "Credentials" section
  - Click "Create Credentials" > "OAuth 2.0 Client IDs"
  - Application type: "Web application"
  - Authorized redirect URIs: 
    * https://your-api-gateway-url/oauth/youtube/callback
  - Save Client ID and Client Secret

Step 3: Configure OAuth Consent Screen
  - User Type: External
  - App name: "TimmyBot"
  - Scopes: youtube.readonly, youtubepartner
```

#### Spotify API Setup
```yaml
Step 1: Spotify Developer Dashboard
  - Go to https://developer.spotify.com/dashboard/
  - Click "Create App"
  - App name: "TimmyBot"
  - App description: "Discord music bot"
  - Redirect URI: https://your-api-gateway-url/oauth/spotify/callback

Step 2: Get Credentials
  - Save Client ID and Client Secret
  - Add redirect URI in app settings
```

## 📦 **Infrastructure Deployment**

### Option 1: AWS CloudFormation (Recommended)
```yaml
# Clone repository
git clone https://github.com/iddv/timmybot
cd timmybot

# Deploy infrastructure
aws cloudformation create-stack \
    --stack-name timmybot-infrastructure \
    --template-body file://cloudformation/infrastructure.yml \
    --parameters \
        ParameterKey=DiscordBotToken,ParameterValue=YOUR_DISCORD_BOT_TOKEN \
        ParameterKey=YouTubeClientId,ParameterValue=YOUR_YOUTUBE_CLIENT_ID \
        ParameterKey=YouTubeClientSecret,ParameterValue=YOUR_YOUTUBE_CLIENT_SECRET \
        ParameterKey=SpotifyClientId,ParameterValue=YOUR_SPOTIFY_CLIENT_ID \
        ParameterKey=SpotifyClientSecret,ParameterValue=YOUR_SPOTIFY_CLIENT_SECRET \
    --capabilities CAPABILITY_IAM

# Monitor deployment
aws cloudformation describe-stacks --stack-name timmybot-infrastructure
```

### Option 2: AWS SAM (Serverless Application Model)
```bash
# Install SAM CLI
pip install aws-sam-cli

# Build application
sam build

# Deploy with guided setup
sam deploy --guided \
    --parameter-overrides \
    DiscordBotToken=$DISCORD_BOT_TOKEN \
    YouTubeClientId=$YOUTUBE_CLIENT_ID \
    YouTubeClientSecret=$YOUTUBE_CLIENT_SECRET \
    SpotifyClientId=$SPOTIFY_CLIENT_ID \
    SpotifyClientSecret=$SPOTIFY_CLIENT_SECRET
```

### CloudFormation Template Structure
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: TimmyBot Infrastructure

Parameters:
  DiscordBotToken:
    Type: String
    NoEcho: true
  YouTubeClientId:
    Type: String  
    NoEcho: true
  YouTubeClientSecret:
    Type: String
    NoEcho: true
  SpotifyClientId:
    Type: String
    NoEcho: true
  SpotifyClientSecret:
    Type: String
    NoEcho: true

Resources:
  # ECS Cluster
  TimmyBotCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: timmybot-cluster
      CapacityProviders:
        - FARGATE
        - FARGATE_SPOT

  # ECS Task Definition
  TimmyBotTaskDefinition:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: timmybot-service
      NetworkMode: awsvpc
      RequiresCompatibilities:
        - FARGATE
      Cpu: 512  # 0.5 vCPU
      Memory: 1024  # 1 GB
      ExecutionRoleArn: !Ref ECSExecutionRole
      TaskRoleArn: !Ref ECSTaskRole
      ContainerDefinitions:
        - Name: timmybot
          Image: !Sub "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/timmybot:latest"
          PortMappings:
            - ContainerPort: 8080
          Environment:
            - Name: DISCORD_BOT_TOKEN
              Value: !Ref DiscordBotToken
            - Name: YOUTUBE_CLIENT_ID
              Value: !Ref YouTubeClientId
            - Name: YOUTUBE_CLIENT_SECRET
              Value: !Ref YouTubeClientSecret
            - Name: SPOTIFY_CLIENT_ID
              Value: !Ref SpotifyClientId
            - Name: SPOTIFY_CLIENT_SECRET
              Value: !Ref SpotifyClientSecret
          LogConfiguration:
            LogDriver: awslogs
            Options:
              awslogs-group: !Ref TimmyBotLogGroup
              awslogs-region: !Ref AWS::Region
              awslogs-stream-prefix: ecs

  # ECS Service with Auto-Scaling
  TimmyBotService:
    Type: AWS::ECS::Service
    Properties:
      Cluster: !Ref TimmyBotCluster
      TaskDefinition: !Ref TimmyBotTaskDefinition
      LaunchType: FARGATE
      DesiredCount: 1
      NetworkConfiguration:
        AwsvpcConfiguration:
          AssignPublicIp: ENABLED
          SecurityGroups:
            - !Ref TimmyBotSecurityGroup
          Subnets:
            - !Ref PublicSubnet

  # Auto Scaling
  AutoScalingTarget:
    Type: AWS::ApplicationAutoScaling::ScalableTarget
    Properties:
      MaxCapacity: 5
      MinCapacity: 0  # Scale to zero for cost optimization
      ResourceId: !Sub "service/${TimmyBotCluster}/${TimmyBotService.Name}"
      RoleARN: !Sub "arn:aws:iam::${AWS::AccountId}:role/application-autoscaling-ecs-service"
      ScalableDimension: ecs:service:DesiredCount
      ServiceNamespace: ecs

  # DynamoDB Tables
  GuildQueuesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: timmybot-guild-queues
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: guildId
          AttributeType: S
      KeySchema:
        - AttributeName: guildId
          KeyType: HASH
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  UserPreferencesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: timmybot-user-preferences
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
      KeySchema:
        - AttributeName: userId
          KeyType: HASH
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  TrackCacheTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: timmybot-track-cache
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: trackId
          AttributeType: S
        - AttributeName: platform
          AttributeType: S
      KeySchema:
        - AttributeName: trackId
          KeyType: HASH
        - AttributeName: platform
          KeyType: RANGE
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  # S3 Buckets
  TimmyBotCacheBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "timmybot-cache-${AWS::AccountId}"
      LifecycleConfiguration:
        Rules:
          - Status: Enabled
            ExpirationInDays: 7
            Id: DeleteOldCache

Outputs:
  ClusterName:
    Description: ECS Cluster Name
    Value: !Ref TimmyBotCluster
    Export:
      Name: !Sub "${AWS::StackName}-ClusterName"
  
  ServiceName:
    Description: ECS Service Name  
    Value: !Ref TimmyBotService
    Export:
      Name: !Sub "${AWS::StackName}-ServiceName"
```

## 🐳 **Container Deployment**

### Docker Build & Push
```bash
# Build Docker image
docker build -t timmybot .

# Create ECR repository
aws ecr create-repository --repository-name timmybot

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Tag and push image
docker tag timmybot:latest $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/timmybot:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/timmybot:latest
```

### Dockerfile
```dockerfile
FROM openjdk:17-jdk-slim

# Install dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy application JAR
COPY build/libs/timmybot-*.jar app.jar

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run application
ENTRYPOINT ["java", "-jar", "app.jar"]
```

## 🔧 **Configuration Management**

### Environment Variables
```yaml
Required:
  DISCORD_BOT_TOKEN: "Bot token from Discord Developer Portal"
  YOUTUBE_CLIENT_ID: "OAuth client ID from Google Cloud Console"
  YOUTUBE_CLIENT_SECRET: "OAuth client secret from Google Cloud Console"
  SPOTIFY_CLIENT_ID: "OAuth client ID from Spotify Developer Dashboard"
  SPOTIFY_CLIENT_SECRET: "OAuth client secret from Spotify Developer Dashboard"

Optional:
  AWS_REGION: "us-east-1" (default)
  LOG_LEVEL: "INFO" (default)
  GUILD_ALLOWLIST: "server1,server2,server3" (comma-separated)
  MAX_CONCURRENT_STREAMS: "5" (default)
  SCALE_DOWN_TIMEOUT_MINUTES: "5" (default)
```

### Server Allowlist Configuration
```yaml
# application.yml
timmybot:
  access:
    approval-enabled: true
    max-allowed-guilds: 50
    allowed-guilds:
      - "123456789012345678"  # Your Discord Server 1
      - "987654321098765432"  # Your Discord Server 2
      # Add approved server IDs here

  scaling:
    min-tasks: 0
    max-tasks: 5
    scale-down-timeout-minutes: 5
    target-cpu-utilization: 70
```

## 🔄 **CI/CD Pipeline**

### GitHub Actions Workflow
```yaml
name: Deploy TimmyBot to AWS

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: timmybot

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'corretto'
      - name: Run tests
        run: ./gradlew test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          role-session-name: GitHubActions
          aws-region: ${{ env.AWS_REGION }}
          
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
        
      - name: Build application
        run: ./gradlew build
        
      - name: Build, tag, and push image to Amazon ECR
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT
          
      - name: Update ECS service
        env:
          SERVICE_NAME: timmybot-service
          CLUSTER_NAME: timmybot-cluster
        run: |
          aws ecs update-service \
            --cluster $CLUSTER_NAME \
            --service $SERVICE_NAME \
            --force-new-deployment
```

## 📊 **Monitoring & Observability**

### CloudWatch Dashboards
```json
{
    "widgets": [
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["AWS/ECS", "CPUUtilization", "ServiceName", "timmybot-service"],
                    ["AWS/ECS", "MemoryUtilization", "ServiceName", "timmybot-service"]
                ],
                "period": 300,
                "stat": "Average",
                "region": "us-east-1",
                "title": "ECS Resource Utilization"
            }
        },
        {
            "type": "metric", 
            "properties": {
                "metrics": [
                    ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", "timmybot-guild-queues"],
                    ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", "timmybot-guild-queues"]
                ],
                "period": 300,
                "stat": "Sum",
                "region": "us-east-1",
                "title": "DynamoDB Operations"
            }
        }
    ]
}
```

### Cost Monitoring Alarms
```bash
# Create billing alarm for total costs
aws cloudwatch put-metric-alarm \
    --alarm-name "TimmyBot-TotalCost" \
    --alarm-description "Alert when TimmyBot costs exceed $75/month" \
    --metric-name EstimatedCharges \
    --namespace AWS/Billing \
    --statistic Maximum \
    --period 86400 \
    --threshold 75 \
    --comparison-operator GreaterThanThreshold \
    --alarm-actions arn:aws:sns:us-east-1:ACCOUNT-ID:billing-alerts

# Create ECS scaling alarm
aws cloudwatch put-metric-alarm \
    --alarm-name "TimmyBot-HighCPU" \
    --alarm-description "Scale up when CPU > 70%" \
    --metric-name CPUUtilization \
    --namespace AWS/ECS \
    --statistic Average \
    --period 300 \
    --threshold 70 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=ServiceName,Value=timmybot-service
```

## 🚀 **Post-Deployment Steps**

### 1. Discord Bot Registration
```bash
# Get your bot invite URL from CloudFormation outputs
aws cloudformation describe-stacks \
    --stack-name timmybot-infrastructure \
    --query 'Stacks[0].Outputs[?OutputKey==`DiscordBotInviteUrl`].OutputValue' \
    --output text

# Invite bot to your Discord server with required permissions
```

### 2. Health Check Verification
```bash
# Check ECS service status
aws ecs describe-services \
    --cluster timmybot-cluster \
    --services timmybot-service

# Check application health endpoint
curl https://your-alb-url/health
```

### 3. Test OAuth Flows
```bash
# Test in Discord:
# 1. /auth-youtube - Should provide device code flow
# 2. /auth-spotify - Should provide authorization URL
# 3. /play test - Should work after authentication
```

## 🔧 **Troubleshooting**

### Common Issues

#### ECS Task Not Starting
```bash
# Check ECS service events
aws ecs describe-services --cluster timmybot-cluster --services timmybot-service

# Check CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix /ecs/timmybot

# Check task definition
aws ecs describe-task-definition --task-definition timmybot-service
```

#### Discord Bot Not Responding
```bash
# Verify bot token is correct
# Check Discord Gateway connection in logs
# Verify bot permissions in Discord server
# Check security group allows outbound HTTPS (443)
```

#### OAuth Authentication Failing
```bash
# Verify OAuth client credentials in environment variables
# Check redirect URIs match exactly
# Verify API endpoints are accessible
# Check Secrets Manager permissions
```

### Log Analysis
```bash
# Stream ECS logs
aws logs tail /ecs/timmybot --follow

# Get specific error patterns
aws logs filter-log-events \
    --log-group-name /ecs/timmybot \
    --filter-pattern "ERROR"

# Check authentication events
aws logs filter-log-events \
    --log-group-name /ecs/timmybot \
    --filter-pattern "OAuth"
```

---

**🔄 Last Updated**: August 2025  
**📖 Related Docs**: [Architecture](architecture.md), [Cost Analysis](cost-analysis.md), [Access Control](access-control.md)