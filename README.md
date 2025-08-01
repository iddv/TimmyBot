# 🚀 TimmyBot 
*AWS-Compliant Discord Music Bot with Guild Isolation Architecture*

A next-generation Discord music bot featuring **"Bring Your Own Premium"** authentication, guild-isolated queues, and cloud-native AWS architecture.

## 🎯 **Project Status: MAJOR MILESTONE ACHIEVED** ✅

**✅ Guild Isolation Architecture Successfully Deployed**  
**✅ AWS ECS Fargate Production Ready**  
**✅ Cloud-Native Infrastructure Complete**  

## 🎵 **Add TimmyBot to Your Discord Server**

<div align="center">

### **🚀 TimmyBot is LIVE and Ready to Play Music!**

[![Add TimmyBot to Discord](https://img.shields.io/badge/Add_to_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white&label=🎵%20TimmyBot)](https://discord.com/api/oauth2/authorize?client_id=965593589109358652&permissions=3145728&scope=bot)

**Features: Guild-Isolated Queues • Cloud-Native • Auto-Scaling**

</div>

### **🔧 Current Architecture**
```
┌─────────────────────────────────────────────────────────────┐
│                 AWS CLOUD-NATIVE STACK                     │
├─────────────────────────────────────────────────────────────┤
│  ECS Fargate        │  DynamoDB           │  Secrets Manager│
│  ✅ Running         │  ✅ Guild Queues    │  ✅ Bot Tokens  │  
│  ✅ Auto-scaling    │  ✅ User Prefs      │  ✅ OAuth Creds │
│  ✅ IAM Roles       │  ✅ Track Cache     │  ✅ Encrypted   │
│  ✅ Health Checks   │  ✅ Server Allowlist│                 │
└─────────────────────────────────────────────────────────────┘
```

### **🚀 Key Innovation: "Bring Your Own Premium"**
Instead of bot-managed accounts, TimmyBot will integrate with users' own premium music subscriptions:
- 🎵 **YouTube Premium**: Personal playlists, ad-free streaming  
- 🎶 **Spotify Premium**: Full catalog access, lossless audio  
- 🎧 **SoundCloud Pro**: High-quality streams, extended tracks  
- 🍎 **Apple Music**: Exclusive content, spatial audio

## 🎵 **Discord Commands** (Guild-Isolated)

Each Discord server gets its own isolated music queue:

* **?play** - Plays a song in your server's queue, eg. `?play https://www.youtube.com/watch?v=dQw4w9WgXcQ`
* **?skip** - Skips the current song in your server
* **?current** - Current playing track for your server
* **?next** - Next track in your server's queue  
* **?join** - Joins your voice channel
* **?clear** - Clears your server's queue
* **?stfu** - STFU Timmy! Stops current track, clears your server's queue and leaves
* **?leave** - Leaves the voice channel
* **?ping** - Pong!
* **?help** - Shows available commands
* **?explain** - Explains the provided command

## 🤖 **Discord Bot Setup (Required First Step)**

**Before deployment, you need a Discord bot token and invite link:**

1. **📖 Complete Setup Guide**: [docs/DISCORD_BOT_SETUP.md](docs/DISCORD_BOT_SETUP.md)
2. **🔗 Get Bot Token**: https://discord.com/developers/applications  
3. **⚡ Quick Setup**: `./scripts/setup-discord-token.sh YOUR_BOT_TOKEN`

**Your invite link format:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3145728&scope=bot
```

## 🐳 **Deployment Options**

### **Option 1: AWS ECS Deployment (Recommended)**
Complete cloud-native deployment with auto-scaling:

```bash
# 1. Deploy infrastructure
cd cdk && cdk deploy --all

# 2. Configure Discord bot token (get from Discord Developer Portal)
./scripts/setup-discord-token.sh YOUR_DISCORD_BOT_TOKEN

# 3. Your bot is now running in ECS Fargate and ready to invite!
```

### **Option 2: Local Development**
```bash
# Build the application
./gradlew build

# Run locally (requires AWS credentials configured)
export AWS_DEFAULT_REGION=eu-central-1
export GUILD_QUEUES_TABLE=timmybot-dev-guild-queues
export SERVER_ALLOWLIST_TABLE=timmybot-dev-server-allowlist
java -jar build/libs/timmybot.jar
```

## 📖 **Project Development**

A major architectural redesign is in progress to modernize TimmyBot with AWS cloud-native architecture, user OAuth authentication, and enhanced features.

**📋 For development status, roadmap, and technical documentation, see [docs/TRACKER.md](docs/TRACKER.md)**

---

**🔄 Last Updated**: August 2025 by iddv# TimmyBot Test Deployment Fri Aug  1 15:54:35 CEST 2025
