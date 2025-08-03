# TimmyBot Discord.js Deployment Guide

## Overview

This document describes the deployment process for the TimmyBot Discord.js implementation, including Docker containerization, GitHub Actions CI/CD, and ECS deployment.

## Architecture

The Discord.js implementation uses the same infrastructure as the Kotlin version:
- **ECS Fargate**: Container orchestration
- **ECR**: Docker image registry
- **Lavalink Sidecar**: Audio processing (shared container)
- **DynamoDB**: Data persistence
- **AWS Secrets Manager**: Configuration management

## Docker Container

### Multi-Stage Build
The Dockerfile uses a multi-stage build for optimization:
1. **Builder Stage**: Installs dependencies and builds TypeScript
2. **Production Stage**: Creates minimal runtime image with Alpine Linux

### Security Features
- Non-root user (`timmybot:1001`)
- Minimal attack surface with Alpine base
- Health check endpoint on port 3000
- Proper signal handling with `dumb-init`

### Image Size
- Optimized image size: ~164MB
- Production dependencies only
- Build artifacts excluded via `.dockerignore`

## GitHub Actions CI/CD

### Workflow Structure
The deployment pipeline consists of multiple jobs:

1. **detect-changes**: Determines which components changed
2. **build-test-deploy-discordjs**: Discord.js specific deployment
3. **build-test-deploy-kotlin**: Legacy Kotlin deployment
4. **deploy-infrastructure**: CDK infrastructure updates
5. **security-scan**: Vulnerability scanning

### Discord.js Deployment Job
Triggered when changes are detected in `discord-js/` directory:

```yaml
# Automatic triggers
on:
  push:
    branches: [ main, master ]
    paths:
      - 'discord-js/**'
```

### Deployment Steps
1. **Build & Test**: Run npm tests and build TypeScript
2. **Docker Build**: Create optimized container image
3. **ECR Push**: Push to `timmybot-discordjs` repository
4. **ECS Update**: Update task definition and deploy

### Environment Variables
The workflow uses these environment variables:
- `ECR_REPOSITORY_DISCORDJS`: `timmybot-discordjs`
- `ECS_SERVICE`: `timmybot-dev-service`
- `ECS_CLUSTER`: `timmybot-dev-cluster`

## Manual Deployment

### Prerequisites
- AWS CLI configured with appropriate permissions
- Docker installed and running
- Access to ECR repository

### Build and Push Image
```bash
cd discord-js
./scripts/build-and-push.sh [environment] [tag]
```

### Deploy to ECS
```bash
cd discord-js
./scripts/deploy-to-ecs.sh [environment] [image-tag]
```

## ECS Task Definition

### Container Configuration
- **Image**: `164859598862.dkr.ecr.eu-central-1.amazonaws.com/timmybot-discordjs:latest`
- **Memory**: 1024 MiB (1GB)
- **CPU**: Shared 1 vCPU with Lavalink
- **Health Check**: HTTP endpoint on port 3000

### Environment Variables
- `NODE_ENV`: production/development
- `HEALTH_CHECK_PORT`: 3000
- `LAVALINK_HOST`: localhost (sidecar)
- `LAVALINK_PORT`: 2333
- AWS and DynamoDB configuration

### Container Dependencies
TimmyBot waits for Lavalink to be healthy before starting:
```yaml
containerDependencies:
  - container: LavalinkContainer
    condition: HEALTHY
```

## Health Monitoring

### Health Check Endpoint
- **URL**: `http://localhost:3000/health`
- **Method**: GET
- **Response**: JSON with service status

### Metrics Endpoint
- **URL**: `http://localhost:3000/metrics`
- **Format**: Prometheus-style metrics
- **Includes**: Memory usage, uptime, Discord connection status

### ECS Health Check
```bash
# Container health check command
node dist/health-check-standalone.js
```

## Monitoring and Logging

### CloudWatch Logs
- **Log Group**: `/ecs/timmybot-dev`
- **Stream Prefix**: `timmybot-discordjs`
- **Format**: Structured JSON with correlation IDs

### Key Metrics
- Memory usage and heap statistics
- Discord connection status
- Lavalink connection health
- Active guilds and players count

## Rollback Procedure

### Automatic Rollback
ECS automatically rolls back if:
- Health checks fail consistently
- Container fails to start
- Deployment timeout exceeded

### Manual Rollback
```bash
# Revert to previous task definition
aws ecs update-service \
  --cluster timmybot-dev-cluster \
  --service timmybot-dev-service \
  --task-definition timmybot-dev-task:PREVIOUS_REVISION
```

## Troubleshooting

### Common Issues
1. **Container fails to start**: Check AWS credentials and secrets
2. **Health check failures**: Verify port 3000 is accessible
3. **Discord connection issues**: Check bot token and permissions
4. **Lavalink connection**: Ensure sidecar is healthy

### Debug Commands
```bash
# Check service status
aws ecs describe-services --cluster timmybot-dev-cluster --services timmybot-dev-service

# View container logs
aws logs tail /ecs/timmybot-dev --follow

# Execute into running container
aws ecs execute-command --cluster timmybot-dev-cluster --task TASK_ID --container timmybot-dev-container --interactive --command "/bin/sh"
```

## Security Considerations

### Container Security
- Non-root user execution
- Minimal base image (Alpine)
- No unnecessary packages or tools
- Regular security scanning with Trivy

### AWS Security
- IAM roles with least privilege
- Secrets stored in AWS Secrets Manager
- VPC with private subnets
- Security groups with minimal access

### CI/CD Security
- OIDC authentication (no long-lived keys)
- Dependency vulnerability scanning
- Container image scanning
- Secure artifact handling