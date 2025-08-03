# Multi-stage Dockerfile for TimmyBot Discord.js
# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build the application
RUN npm run build

# Remove dev dependencies and clean up
RUN npm prune --production && npm cache clean --force

# Stage 2: Production stage
FROM node:20-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S timmybot && \
    adduser -S timmybot -u 1001 -G timmybot

# Set working directory
WORKDIR /app

# Install runtime dependencies and debugging tools
RUN apk add --no-cache dumb-init curl netcat-openbsd

# Copy built application from builder stage
COPY --from=builder --chown=timmybot:timmybot /app/dist ./dist
COPY --from=builder --chown=timmybot:timmybot /app/node_modules ./node_modules
COPY --from=builder --chown=timmybot:timmybot /app/package*.json ./

# Copy scripts for debugging and testing
COPY --chown=timmybot:timmybot scripts/ ./scripts/
RUN chmod +x ./scripts/*.sh

# Create logs directory
RUN mkdir -p /app/logs && chown -R timmybot:timmybot /app/logs

# Switch to non-root user
USER timmybot

# Expose health check port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node dist/health-check-standalone.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]