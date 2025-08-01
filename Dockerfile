# TimmyBot Dockerfile for AWS ECS Deployment (CDK-managed)
# Guild Isolation Architecture with AWS Integration
# Multi-stage build for optimized production container

FROM eclipse-temurin:17-jdk-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    curl \
    unzip

# Copy Gradle wrapper and build files
WORKDIR /app
COPY gradlew .
COPY gradle gradle
COPY build.gradle.kts .
COPY settings.gradle .

# Copy source code
COPY src src

# Build the application (with fallback compilation strategy)
RUN chmod +x gradlew && \
    ./gradlew clean build --no-daemon --stacktrace || \
    ./gradlew jar --no-daemon --stacktrace

# Production stage
FROM eclipse-temurin:17-jre-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    ca-certificates \
    procps

# Create non-root user for security
RUN addgroup -S timmybot && adduser -S timmybot -G timmybot

# Set working directory
WORKDIR /app

# Copy built JAR from builder stage
COPY --from=builder /app/build/libs/*.jar timmybot.jar

# Change ownership to non-root user
RUN chown -R timmybot:timmybot /app

# Switch to non-root user
USER timmybot

# Health check for Discord bot process
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD pgrep -f "java.*timmybot.jar" > /dev/null || exit 1

# Set memory options for container environment
ENV JAVA_OPTS="-Xmx512m -Xms256m -XX:+UseG1GC -XX:MaxGCPauseMillis=200"

# AWS Environment Variables (will be overridden by ECS task definition)
ENV AWS_DEFAULT_REGION=eu-central-1
ENV GUILD_QUEUES_TABLE=timmybot-dev-guild-queues
ENV SERVER_ALLOWLIST_TABLE=timmybot-dev-server-allowlist
ENV DISCORD_BOT_TOKEN_SECRET=timmybot/dev/discord-bot-token

# No ports exposed (Discord bot uses WebSocket connections)

# Run the application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar timmybot.jar"]