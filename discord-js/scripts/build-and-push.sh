#!/bin/bash

# Build and push Discord.js Docker image to ECR
# Usage: ./scripts/build-and-push.sh [environment] [tag]

set -e

# Configuration
AWS_REGION="eu-central-1"
AWS_ACCOUNT_ID="164859598862"
ECR_REPOSITORY="timmybot-discordjs"
ENVIRONMENT="${1:-dev}"
TAG="${2:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Building and pushing TimmyBot Discord.js image...${NC}"
echo "Environment: $ENVIRONMENT"
echo "Tag: $TAG"
echo "ECR Repository: $ECR_REPOSITORY"
echo ""

# Check if we're in the discord-js directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must run from discord-js directory${NC}"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    exit 1
fi

# Build the Docker image
echo -e "${YELLOW}📦 Building Docker image...${NC}"
docker build -t $ECR_REPOSITORY:$TAG .

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker image built successfully${NC}"

# Get ECR login token
echo -e "${YELLOW}🔐 Logging in to ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ ECR login failed${NC}"
    exit 1
fi

# Check if ECR repository exists, create if it doesn't
echo -e "${YELLOW}🏗️  Checking ECR repository...${NC}"
aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION > /dev/null 2>&1 || {
    echo -e "${YELLOW}📝 Creating ECR repository: $ECR_REPOSITORY${NC}"
    aws ecr create-repository --repository-name $ECR_REPOSITORY --region $AWS_REGION
    
    # Set lifecycle policy to keep only 10 images
    aws ecr put-lifecycle-configuration --repository-name $ECR_REPOSITORY --region $AWS_REGION --lifecycle-policy-text '{
        "rules": [
            {
                "rulePriority": 1,
                "description": "Keep only 10 images",
                "selection": {
                    "tagStatus": "any",
                    "countType": "imageCountMoreThan",
                    "countNumber": 10
                },
                "action": {
                    "type": "expire"
                }
            }
        ]
    }'
}

# Tag the image for ECR
ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$TAG"
echo -e "${YELLOW}🏷️  Tagging image: $ECR_URI${NC}"
docker tag $ECR_REPOSITORY:$TAG $ECR_URI

# Push the image to ECR
echo -e "${YELLOW}⬆️  Pushing image to ECR...${NC}"
docker push $ECR_URI

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker push failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Image pushed successfully!${NC}"
echo -e "${GREEN}📍 Image URI: $ECR_URI${NC}"

# Clean up local images to save space
echo -e "${YELLOW}🧹 Cleaning up local images...${NC}"
docker rmi $ECR_REPOSITORY:$TAG $ECR_URI || true

echo -e "${GREEN}🎉 Build and push completed successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update ECS task definition to use: $ECR_URI"
echo "2. Deploy the updated task definition"
echo "3. Update ECS service to use the new task definition"