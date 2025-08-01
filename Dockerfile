# TimmyBot Dockerfile for AWS ECS Deployment (CDK-managed)
# Multi-stage build for optimized production container

FROM openjdk:17-jdk-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Copy Gradle wrapper and build files
WORKDIR /app
COPY gradlew .
COPY gradle gradle
COPY build.gradle.kts .
COPY settings.gradle .

# Copy source code
COPY src src

# Build the application
RUN ./gradlew build --no-daemon

# Production stage
FROM openjdk:17-jre-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r timmybot && useradd -r -g timmybot timmybot

# Set working directory
WORKDIR /app

# Copy built JAR from builder stage
COPY --from=builder /app/build/libs/*.jar timmybot.jar

# Change ownership to non-root user
RUN chown -R timmybot:timmybot /app

# Switch to non-root user
USER timmybot

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Set memory options for container environment
ENV JAVA_OPTS="-Xmx512m -Xms256m -XX:+UseG1GC -XX:MaxGCPauseMillis=200"

# Expose health check port
EXPOSE 8080

# Run the application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar timmybot.jar"]