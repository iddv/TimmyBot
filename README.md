# 🚀 TimmyBot

A Discord music bot written in Kotlin using Discord4J and LavaPlayer.

## 📋 **What is TimmyBot?**

TimmyBot is a Discord bot that plays music in voice channels. It's built with modern technologies and designed to be reliable and easy to use.

**Current Status**: This is the original implementation. A major redesign is in progress - see [Project Development](docs/TRACKER.md) for details.

## 🎵 **Commands**

* **?play** - Plays a song, eg. `?play https://www.youtube.com/watch?v=dQw4w9WgXcQ`
* **?skip** - Skips the current song
* **?current** - Current playing track
* **?next** - Next track that will be played
* **?join** - Joins your voice channel
* **?clear** - Clears the queue
* **?stfu** - STFU Timmy! Stops the current track, clears the queue and kicks Timmy out fo the channel
* **?leave** - Leaves the voice channel
* **?ping** - Pong!
* **?help** - Help! Eeeelp! (shows this message)
* **?explain** - Explains the provided command

## 🔧 **Build & Run**

### Build
```bash
./gradlew build
```

### Run Locally
```bash
# Set up your Discord bot token as environment variable
export DISCORD_BOT_TOKEN=your_bot_token_here

# Run the bot
./gradlew bootRun
```

## 📖 **Project Development**

A major architectural redesign is in progress to modernize TimmyBot with AWS cloud-native architecture, user OAuth authentication, and enhanced features.

**📋 For development status, roadmap, and technical documentation, see [docs/TRACKER.md](docs/TRACKER.md)**

---

**🔄 Last Updated**: August 2025 by iddv