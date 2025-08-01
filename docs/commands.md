# 🎵 TimmyBot Commands

*Command system and premium features*

## 🎯 **Command Philosophy**

### Premium Features for Everyone
- Users authenticate with their own premium accounts
- No bot subscriptions or paywalls
- Access to personal playlists, liked songs, and recommendations
- High-quality audio streaming with no ads

### Smart Multi-Platform Integration
- Searches across all authenticated platforms simultaneously
- Intelligent ranking: Premium > Platform preference > Quality
- Seamless switching between YouTube, Spotify, SoundCloud

## 🎵 **Core Music Commands**

### `/play [query]` - Smart Music Search
**Description**: Search and play music across all authenticated platforms

```kotlin
suspend fun handlePlayCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val guildId = event.interaction.guildId.get().asString()
    val userId = event.interaction.user.id.asString()
    val query = event.getOption("query").get().value.get().asString()
    
    // Check user authentication
    val userTokens = secureTokenService.getUserTokens(userId)
    if (userTokens == null) {
        return event.reply(buildAuthenticationPrompt())
    }
    
    // Search across all authenticated platforms
    val searchResult = unifiedSearchService.searchAcrossPlatforms(query, userId)
    
    when (searchResult.status) {
        SearchStatus.SUCCESS -> {
            val selectedTrack = searchResult.tracks.first()
            
            // Add to guild-specific queue
            guildStateManager.addToQueue(guildId, selectedTrack, userId)
            val queuePosition = guildStateManager.getQueueSize(guildId)
            
            // If not playing, start playing
            if (!isPlaying(guildId)) {
                playNextTrack(guildId)
                return event.reply(buildNowPlayingMessage(selectedTrack))
            } else {
                return event.reply(buildAddedToQueueMessage(selectedTrack, queuePosition))
            }
        }
        SearchStatus.NO_RESULTS -> {
            return event.reply("❌ No results found for: `$query`")
        }
        SearchStatus.AUTHENTICATION_ERROR -> {
            return event.reply(buildReauthenticationPrompt())
        }
    }
}
```

**Examples**:
- `/play Bohemian Rhapsody`
- `/play lo-fi hip hop playlist`
- `/play The Weeknd latest album`

**Features**:
- ✅ Multi-platform search (YouTube, Spotify, SoundCloud)
- ✅ Smart ranking algorithm
- ✅ Queue integration
- ✅ Auto-play if queue empty

---

### `/queue` - View Current Queue
**Description**: Display the current queue for this Discord server

```kotlin
suspend fun handleQueueCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val guildId = event.interaction.guildId.get().asString()
    val guildQueue = guildStateManager.getQueue(guildId)
    
    if (guildQueue.isEmpty()) {
        return event.reply("📭 Queue is empty! Use `/play` to add some music.")
    }
    
    val embed = EmbedCreateSpec.builder()
        .title("🎵 Current Queue")
        .description(buildQueueDescription(guildQueue))
        .color(Color.BLUE)
        .footer("Total: ${guildQueue.size} tracks", null)
        .build()
    
    val components = listOf(
        ActionRow.of(
            Button.primary("queue_clear", "🗑️ Clear Queue"),
            Button.secondary("queue_shuffle", "🔀 Shuffle"),
            Button.secondary("queue_remove", "❌ Remove Track")
        )
    )
    
    return event.reply()
        .withEmbeds(embed)
        .withComponents(components)
}
```

**Features**:
- ✅ Shows track titles, artists, and requesters
- ✅ Queue management buttons (clear, shuffle, remove)
- ✅ Total duration display
- ✅ Interactive components

---

### `/skip` - Skip Current Track
**Description**: Skip the currently playing track

```kotlin
suspend fun handleSkipCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val guildId = event.interaction.guildId.get().asString()
    val currentTrack = guildStateManager.getCurrentTrack(guildId)
    
    if (currentTrack == null) {
        return event.reply("❌ Nothing is currently playing!")
    }
    
    // Skip to next track
    val nextTrack = playNextTrack(guildId)
    
    return if (nextTrack != null) {
        event.reply("⏭️ Skipped **${currentTrack.title}** by ${currentTrack.artist}\n" +
                   "▶️ Now playing: **${nextTrack.title}** by ${nextTrack.artist}")
    } else {
        event.reply("⏭️ Skipped **${currentTrack.title}**\n📭 Queue is now empty.")
    }
}
```

---

### `/stop` - Stop Playback and Clear Queue
**Description**: Stop music and clear the queue

```kotlin
suspend fun handleStopCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val guildId = event.interaction.guildId.get().asString()
    
    // Stop audio player
    audioPlayers[guildId]?.stopTrack()
    
    // Clear queue
    guildStateManager.clearQueue(guildId)
    
    // Leave voice channel after delay
    scheduler.schedule({
        voiceConnections[guildId]?.disconnect()
        voiceConnections.remove(guildId)
    }, 10, TimeUnit.SECONDS)
    
    return event.reply("⏹️ Stopped playback and cleared queue. Leaving voice channel in 10 seconds...")
}
```

## 🔐 **Authentication Commands**

### `/auth-youtube` - Authenticate with YouTube Premium
**Description**: Connect your YouTube Premium account

```kotlin
suspend fun handleYouTubeAuthCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val userId = event.interaction.user.id.asString()
    
    val authResponse = youtubeOAuthService.initiateAuth(userId)
    
    val embed = EmbedCreateSpec.builder()
        .title("🔐 YouTube Premium Authentication")
        .description("""
            **Step 1**: Go to [${authResponse.verificationUrl}](${authResponse.verificationUrl})
            **Step 2**: Enter this code: `${authResponse.userCode}`
            **Step 3**: Use `/check-auth youtube` to complete setup
            
            ⏰ Code expires in ${authResponse.expiresIn / 60} minutes
        """.trimIndent())
        .color(Color.RED)
        .footer("Your premium features will be unlocked after authentication", null)
        .build()
    
    val components = listOf(
        ActionRow.of(
            Button.link(authResponse.verificationUrl, "🔗 Open YouTube"),
            Button.primary("check_auth:youtube", "✅ Check Status")
        )
    )
    
    return event.reply()
        .withEmbeds(embed)
        .withComponents(components)
        .withEphemeral(true)
}
```

---

### `/auth-spotify` - Authenticate with Spotify Premium
**Description**: Connect your Spotify Premium account

```kotlin
suspend fun handleSpotifyAuthCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val userId = event.interaction.user.id.asString()
    
    val authResponse = spotifyOAuthService.initiateAuth(userId)
    
    val embed = EmbedCreateSpec.builder()
        .title("🔐 Spotify Premium Authentication")
        .description("""
            Click the button below to authorize TimmyBot with your Spotify Premium account.
            
            **What you'll get**:
            ✅ Access to your personal playlists
            ✅ High-quality audio streaming
            ✅ No shuffle restrictions
            ✅ Your liked songs and recommendations
        """.trimIndent())
        .color(Color.GREEN)
        .build()
    
    val components = listOf(
        ActionRow.of(
            Button.link(authResponse.authUrl, "🎵 Connect Spotify Premium")
        )
    )
    
    return event.reply()
        .withEmbeds(embed)
        .withComponents(components)
        .withEphemeral(true)
}
```

---

### `/check-auth [platform]` - Check Authentication Status
**Description**: Check if your authentication is complete

```kotlin
suspend fun handleCheckAuthCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val userId = event.interaction.user.id.asString()
    val platform = event.getOption("platform").get().value.get().asString()
    
    val authStatus = when (platform) {
        "youtube" -> youtubeOAuthService.checkAuthStatus(userId)
        "spotify" -> spotifyOAuthService.checkAuthStatus(userId)
        else -> return event.reply("❌ Invalid platform. Use `youtube` or `spotify`")
    }
    
    return when (authStatus.status) {
        "SUCCESS" -> {
            event.reply("✅ **${platform.capitalize()} Premium connected successfully!**\n" +
                       "🎵 You can now use premium features like `/my-playlists` and `/liked-songs`")
        }
        "PENDING" -> {
            event.reply("⏳ Still waiting for authentication...\n" +
                       "Please complete the authentication flow and try again.")
        }
        "NO_PENDING_AUTH" -> {
            event.reply("❌ No pending authentication found.\n" +
                       "Use `/auth-${platform}` to start the authentication process.")
        }
        else -> {
            event.reply("❌ Authentication failed. Please try `/auth-${platform}` again.")
        }
    }
}
```

## 🎵 **Premium Feature Commands**

### `/my-playlists` - Access Personal Playlists
**Description**: Browse and play your personal playlists

```kotlin
suspend fun handleMyPlaylistsCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val userId = event.interaction.user.id.asString()
    val userTokens = secureTokenService.getUserTokens(userId)
    
    if (userTokens == null) {
        return event.reply()
            .withEphemeral(true)
            .withContent("🔐 Please authenticate first using `/auth-youtube` or `/auth-spotify`")
    }
    
    // Fetch playlists from all authenticated platforms
    val allPlaylists = mutableListOf<PlaylistInfo>()
    
    userTokens.youtubeOAuth?.let { token ->
        allPlaylists.addAll(youtubeService.getUserPlaylists(token))
    }
    
    userTokens.spotifyOAuth?.let { token ->
        allPlaylists.addAll(spotifyService.getUserPlaylists(token))
    }
    
    if (allPlaylists.isEmpty()) {
        return event.reply("📭 No playlists found. Make sure you have playlists in your connected accounts.")
    }
    
    // Create interactive playlist selection
    val playlistButtons = allPlaylists.take(10).mapIndexed { index, playlist ->
        Button.primary(
            "play_playlist:${playlist.id}:${playlist.platform}",
            "${playlist.name} (${playlist.trackCount}) [${playlist.platform.uppercase()}]"
        )
    }
    
    val embed = EmbedCreateSpec.builder()
        .title("🎵 Your Personal Playlists")
        .description("Choose a playlist to add to the queue:")
        .color(Color.PURPLE)
        .footer("Showing your playlists from connected premium accounts", null)
        .build()
    
    return event.reply()
        .withEmbeds(embed)
        .withComponents(playlistButtons.chunked(5).map { ActionRow.of(*it.toTypedArray()) })
        .withEphemeral(true)
}
```

---

### `/liked-songs` - Play Your Liked Music
**Description**: Add your liked/saved songs to the queue

```kotlin
suspend fun handleLikedSongsCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val userId = event.interaction.user.id.asString()
    val guildId = event.interaction.guildId.get().asString()
    val userTokens = secureTokenService.getUserTokens(userId)
    
    if (userTokens == null) {
        return event.reply("🔐 Please authenticate first!")
    }
    
    val likedSongs = mutableListOf<TrackInfo>()
    
    // Get liked songs from authenticated platforms
    userTokens.youtubeOAuth?.let { token ->
        val ytLiked = youtubeService.getLikedSongs(token)
        likedSongs.addAll(ytLiked.take(25)) // Limit for performance
    }
    
    userTokens.spotifyOAuth?.let { token ->
        val spotifyLiked = spotifyService.getLikedSongs(token)
        likedSongs.addAll(spotifyLiked.take(25))
    }
    
    if (likedSongs.isEmpty()) {
        return event.reply("❌ No liked songs found in your connected accounts.")
    }
    
    // Add to queue
    likedSongs.forEach { track ->
        guildStateManager.addToQueue(guildId, track, userId)
    }
    
    // Start playing if queue was empty
    if (!isPlaying(guildId)) {
        playNextTrack(guildId)
    }
    
    return event.reply("❤️ **Added ${likedSongs.size} liked songs to queue!**\n" +
                      "🎵 Playing your personal favorites from ${userTokens.getConnectedPlatforms()}!")
}
```

---

### `/recommendations` - AI-Powered Music Suggestions
**Description**: Get personalized recommendations based on your listening history

```kotlin
suspend fun handleRecommendationsCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val userId = event.interaction.user.id.asString()
    val userTokens = secureTokenService.getUserTokens(userId)
    
    if (userTokens?.youtubeOAuth == null) {
        return event.reply("🔐 YouTube Premium authentication required for AI recommendations!")
    }
    
    val recommendations = youtubeService.getRecommendations(userTokens.youtubeOAuth)
    
    if (recommendations.isEmpty()) {
        return event.reply("❌ No recommendations available. Try listening to more music first!")
    }
    
    val recommendationButtons = recommendations.take(10).map { track ->
        Button.success(
            "play:${track.id}:${track.platform}",
            "${track.title} - ${track.artist}"
        )
    }
    
    val embed = EmbedCreateSpec.builder()
        .title("🤖 AI-Powered Recommendations")
        .description("Based on your YouTube Music listening history:")
        .color(Color.ORANGE)
        .footer("Powered by YouTube Music's recommendation engine", null)
        .build()
    
    return event.reply()
        .withEmbeds(embed)
        .withComponents(recommendationButtons.chunked(5).map { ActionRow.of(*it.toTypedArray()) })
        .withEphemeral(true)
}
```

---

### `/play-history` - Recent Listening History
**Description**: Play songs from your recent listening history

```kotlin
suspend fun handlePlayHistoryCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val userId = event.interaction.user.id.asString()
    val userTokens = secureTokenService.getUserTokens(userId)
    
    if (userTokens?.youtubeOAuth == null) {
        return event.reply("🔐 YouTube Premium authentication required for listening history!")
    }
    
    val history = youtubeService.getListeningHistory(userTokens.youtubeOAuth).take(10)
    
    if (history.isEmpty()) {
        return event.reply("📭 No listening history found.")
    }
    
    val historyButtons = history.map { track ->
        Button.secondary(
            "play:${track.id}:youtube",
            "${track.title} - ${track.artist}"
        )
    }
    
    val embed = EmbedCreateSpec.builder()
        .title("🎵 Your Recent Listening History")
        .description("Click to add to queue:")
        .color(Color.YELLOW)
        .footer("From your YouTube Music history", null)
        .build()
    
    return event.reply()
        .withEmbeds(embed)
        .withComponents(historyButtons.chunked(5).map { ActionRow.of(*it.toTypedArray()) })
        .withEphemeral(true)
}
```

## ⚙️ **Utility Commands**

### `/now-playing` - Current Track Info
**Description**: Show information about the currently playing track

```kotlin
suspend fun handleNowPlayingCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val guildId = event.interaction.guildId.get().asString()
    val currentTrack = guildStateManager.getCurrentTrack(guildId)
    
    if (currentTrack == null) {
        return event.reply("❌ Nothing is currently playing!")
    }
    
    val embed = EmbedCreateSpec.builder()
        .title("🎵 Now Playing")
        .description("**${currentTrack.title}**\nby ${currentTrack.artist}")
        .thumbnail(currentTrack.thumbnailUrl ?: "")
        .color(Color.GREEN)
        .addField("Platform", currentTrack.platform.capitalize(), true)
        .addField("Quality", currentTrack.quality.capitalize(), true)
        .addField("Requested by", "<@${currentTrack.requestedBy}>", true)
        .addField("Duration", formatDuration(currentTrack.duration), true)
        .footer("Premium: ${if (currentTrack.isPremium) "✅" else "❌"}", null)
        .build()
    
    val components = listOf(
        ActionRow.of(
            Button.primary("skip", "⏭️ Skip"),
            Button.secondary("queue", "📋 Queue"),
            Button.danger("stop", "⏹️ Stop")
        )
    )
    
    return event.reply()
        .withEmbeds(embed)
        .withComponents(components)
}
```

---

### `/volume [level]` - Adjust Playback Volume
**Description**: Set the playback volume (0-100)

```kotlin
suspend fun handleVolumeCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val guildId = event.interaction.guildId.get().asString()
    val volume = event.getOption("level")?.value?.get()?.asLong()?.toInt() ?: 50
    
    if (volume !in 0..100) {
        return event.reply("❌ Volume must be between 0 and 100!")
    }
    
    // Update audio player volume
    audioPlayers[guildId]?.volume = volume
    
    // Save setting for guild
    guildStateManager.updateSettings(guildId) { settings ->
        settings.copy(volume = volume)
    }
    
    return event.reply("🔊 Volume set to $volume%")
}
```

---

### `/settings` - Bot Configuration
**Description**: Configure bot settings for this server

```kotlin
suspend fun handleSettingsCommand(event: ChatInputInteractionEvent): Mono<Void> {
    val guildId = event.interaction.guildId.get().asString()
    val currentSettings = guildStateManager.getSettings(guildId)
    
    val embed = EmbedCreateSpec.builder()
        .title("⚙️ TimmyBot Settings")
        .addField("Volume", "${currentSettings.volume}%", true)
        .addField("Auto-Skip", if (currentSettings.autoSkip) "✅ Enabled" else "❌ Disabled", true)
        .addField("Default Quality", currentSettings.preferredQuality.capitalize(), true)
        .color(Color.GRAY)
        .build()
    
    val components = listOf(
        ActionRow.of(
            Button.primary("settings_volume", "🔊 Volume"),
            Button.secondary("settings_quality", "🎵 Quality"),
            Button.secondary("settings_autoskip", "⏭️ Auto-Skip")
        )
    )
    
    return event.reply()
        .withEmbeds(embed)
        .withComponents(components)
        .withEphemeral(true)
}
```

## 🔄 **Interactive Components**

### Button Interactions
```kotlin
@EventListener
suspend fun handleButtonInteraction(event: ButtonInteractionEvent) {
    val customId = event.customId
    
    when {
        customId.startsWith("play:") -> {
            val (_, trackId, platform) = customId.split(":")
            handlePlayByIdButton(event, trackId, platform)
        }
        
        customId.startsWith("play_playlist:") -> {
            val (_, playlistId, platform) = customId.split(":")
            handlePlayPlaylistButton(event, playlistId, platform)
        }
        
        customId.startsWith("check_auth:") -> {
            val (_, platform) = customId.split(":")
            handleCheckAuthButton(event, platform)
        }
        
        customId == "queue_clear" -> handleClearQueueButton(event)
        customId == "queue_shuffle" -> handleShuffleQueueButton(event)
        customId == "skip" -> handleSkipButton(event)
        customId == "stop" -> handleStopButton(event)
    }
}
```

### Modal Interactions
```kotlin
@EventListener
suspend fun handleModalSubmit(event: ModalSubmitInteractionEvent) {
    when (event.customId) {
        "search_modal" -> {
            val query = event.getTextInput("search_query").get().value.get()
            handleSearchFromModal(event, query)
        }
        
        "volume_modal" -> {
            val volume = event.getTextInput("volume_input").get().value.get().toIntOrNull()
            handleVolumeFromModal(event, volume)
        }
    }
}
```

## 📊 **Command Usage Analytics**

### Command Metrics Tracking
```kotlin
@Component
class CommandMetrics {
    
    private val commandCounter = Counter.builder("timmybot.commands.executed")
        .description("Number of commands executed")
        .register(meterRegistry)
    
    private val authenticationCounter = Counter.builder("timmybot.authentication.attempts")
        .description("Authentication attempts by platform")
        .register(meterRegistry)
    
    fun recordCommandExecution(commandName: String, success: Boolean) {
        commandCounter.increment(
            Tags.of(
                Tag.of("command", commandName),
                Tag.of("success", success.toString())
            )
        )
    }
    
    fun recordAuthenticationAttempt(platform: String, success: Boolean) {
        authenticationCounter.increment(
            Tags.of(
                Tag.of("platform", platform),
                Tag.of("success", success.toString())
            )
        )
    }
}
```

---

**🔄 Last Updated**: August 2025  
**📖 Related Docs**: [Authentication](authentication.md), [Architecture](architecture.md), [Access Control](access-control.md)