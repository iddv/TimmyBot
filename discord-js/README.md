# TimmyBot Discord.js Implementation

A modern Discord music bot built with Discord.js, featuring guild-isolated queues, AWS integration, and high-quality audio streaming via Lavalink.

## 🚀 Features

- **Discord.js v14** - Latest stable Discord library with slash commands
- **Guild Isolation** - Per-server music queues and settings
- **AWS Integration** - DynamoDB storage and Secrets Manager
- **Lavalink Audio** - High-quality music streaming
- **TypeScript** - Type-safe development with modern tooling
- **Docker Ready** - Optimized container for ECS deployment

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ECS Fargate Task                         │
├─────────────────────────────────────────────────────────────┤
│  TimmyBot Container (Discord.js)  │  Lavalink Container     │
│  ├── Discord.js Bot Framework     │  ├── Lavalink Server    │
│  ├── AWS SDK Integration          │  ├── YouTube Plugin     │
│  ├── DynamoDB Client              │  ├── Audio Processing   │
│  ├── Secrets Manager Client       │  └── REST API :2333     │
│  └── Lavalink Client (Shoukaku)   │                         │
└─────────────────────────────────────────────────────────────┘
```

## 🛠️ Development

### Prerequisites

- Node.js 20+
- Docker (for containerization)
- AWS CLI (for deployment)

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run with coverage
npm run test:coverage
```

### Environment Variables

```bash
# AWS Configuration
AWS_REGION=eu-central-1

# DynamoDB Tables
GUILD_QUEUES_TABLE=timmybot-dev-guild-queues
SERVER_ALLOWLIST_TABLE=timmybot-dev-server-allowlist
USER_PREFERENCES_TABLE=timmybot-dev-user-prefs
TRACK_CACHE_TABLE=timmybot-dev-track-cache

# AWS Secrets
DISCORD_BOT_TOKEN_SECRET=timmybot/dev/discord-bot-token
DATABASE_CONFIG_SECRET=timmybot/dev/database-config
APP_CONFIG_SECRET=timmybot/dev/app-config

# Lavalink Configuration
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_SECURE=false
LAVALINK_PASSWORD=youshallnotpass
```

## 🐳 Docker

```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

## 📝 Commands

- `/ping` - Test bot response and latency
- `/join` - Join your voice channel
- `/play <song>` - Play music from URL or search
- `/skip` - Skip current track
- `/clear` - Clear music queue
- `/help` - Show available commands
- `/explain` - Show bot architecture info

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 📦 Deployment

The bot is designed to run in AWS ECS Fargate with a Lavalink sidecar container. See the CDK infrastructure in the parent directory for deployment configuration.

## 🔧 Migration from Kotlin

This Discord.js implementation replaces the previous Kotlin/KordEx version while maintaining:

- ✅ Same AWS infrastructure (ECS, DynamoDB, Secrets Manager)
- ✅ Same guild isolation and server allowlist functionality  
- ✅ Same Lavalink sidecar container architecture
- ✅ Same slash commands and user experience
- ❌ No more dependency hell from KordEx/Lavakord conflicts

## 📄 License

MIT License - see LICENSE file for details.