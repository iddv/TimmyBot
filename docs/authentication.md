# 🔐 TimmyBot Authentication

*OAuth integration with music streaming services*

## 🎯 **Authentication Strategy**

### "Bring Your Own Premium" Approach
Users authenticate with their own premium streaming accounts:
- **YouTube Premium** - Ad-free, high-quality, unlimited usage, personal playlists
- **Spotify Premium** - Full catalog, no shuffle restrictions, lossless audio
- **SoundCloud Pro** - High-quality streams, longer tracks, no ads
- **Apple Music** - Lossless/Hi-Res audio, spatial audio, exclusive content

### Legal & Compliance Benefits
✅ **No ToS Violations** - Users authenticate themselves  
✅ **No Rate Limiting** - Uses user's quotas, not bot's  
✅ **Premium Features** - Full access to user's subscription benefits  
✅ **Personal Content** - User's playlists, liked songs, recommendations  

## 🔐 **AWS Security Compliance**

### OAuth Token Storage (AWS Best Practice)
```yaml
Storage: AWS Secrets Manager
Structure: /timmybot/users/{userId}/oauth
Encryption: AWS managed keys
Access: IAM role-based with least privilege
Rotation: Automatic every 24 hours
Cost: $0.40 per secret per month

⚠️ Critical: Storing OAuth tokens in DynamoDB is an AWS anti-pattern
✅ Solution: Use Secrets Manager per AWS Well-Architected Framework
```

### Secret Structure
```json
{
  "youtubeOAuth": {
    "accessToken": "ya29.a0ARrdaM9...",
    "refreshToken": "1//04_dGtqLd...",
    "expiresAt": 1693574400,
    "scopes": [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtubepartner"
    ]
  },
  "spotifyOAuth": {
    "accessToken": "BQCqkF3n0...",
    "refreshToken": "AQCb4KooLJ...",
    "expiresAt": 1693574400,
    "scopes": [
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
      "playlist-read-private"
    ]
  },
  "soundcloudOAuth": {
    "accessToken": "1-138878-...",
    "refreshToken": null,
    "expiresAt": null,
    "scopes": ["non-expiring"]
  }
}
```

## 🎵 **Platform Integrations**

### YouTube Premium Integration
```kotlin
@Service
class YouTubePremiumService : MusicService {
    
    override suspend fun search(query: String, userToken: OAuthTokens): List<TrackInfo> {
        val ytMusic = YTMusic(
            auth = userToken.accessToken,
            oauth_credentials = OAuthCredentials(
                client_id = System.getenv("YOUTUBE_CLIENT_ID"),
                client_secret = System.getenv("YOUTUBE_CLIENT_SECRET")
            )
        )
        
        val results = ytMusic.search(query, filter = "songs", limit = 10)
        return results.map { result ->
            TrackInfo(
                id = result.videoId,
                title = result.title,
                artist = result.artists?.firstOrNull()?.name ?: "Unknown",
                duration = result.duration_seconds,
                thumbnailUrl = result.thumbnails?.lastOrNull()?.url,
                platform = "youtube",
                isPremium = true, // User's own premium account!
                quality = "high",  // Premium quality available
                streamUrl = getHighQualityStreamUrl(result.videoId, userToken)
            )
        }
    }
    
    override suspend fun getUserPlaylists(userToken: OAuthTokens): List<PlaylistInfo> {
        val ytMusic = createYTMusicClient(userToken)
        val playlists = ytMusic.getLibraryPlaylists()
        
        return playlists.map { playlist ->
            PlaylistInfo(
                id = playlist.playlistId,
                name = playlist.title,
                trackCount = playlist.trackCount,
                platform = "youtube",
                isPersonal = true,
                description = playlist.description
            )
        }
    }
    
    override suspend fun getRecommendations(userToken: OAuthTokens): List<TrackInfo> {
        val ytMusic = createYTMusicClient(userToken)
        
        // Get user's listening history for context
        val recentTracks = ytMusic.getHistory().take(5)
        val seedTrack = recentTracks.firstOrNull() ?: return emptyList()
        
        // Get YouTube Music's AI recommendations based on user's actual data
        val recommendations = ytMusic.getWatchPlaylist(seedTrack.videoId)
            .take(10)
            .map { it.toTrackInfo() }
            
        return recommendations
    }
}
```

### Spotify Premium Integration
```kotlin
@Service
class SpotifyPremiumService : MusicService {
    
    override suspend fun search(query: String, userToken: OAuthTokens): List<TrackInfo> {
        val spotifyApi = SpotifyApi.builder()
            .setAccessToken(userToken.accessToken)
            .build()
            
        val searchResult = spotifyApi.searchTracks(query)
            .limit(10)
            .build()
            .execute()
            
        return searchResult.items.map { track ->
            TrackInfo(
                id = track.id,
                title = track.name,
                artist = track.artists.firstOrNull()?.name ?: "Unknown",
                duration = track.durationMs / 1000,
                thumbnailUrl = track.album.images.firstOrNull()?.url,
                platform = "spotify",
                isPremium = true, // User's premium features!
                quality = if (isSpotifyHiFi(userToken)) "lossless" else "high"
            )
        }
    }
    
    override suspend fun getUserPlaylists(userToken: OAuthTokens): List<PlaylistInfo> {
        val spotifyApi = createSpotifyClient(userToken)
        val playlists = spotifyApi.listOfUsersPlaylists().build().execute()
        
        return playlists.items.map { playlist ->
            PlaylistInfo(
                id = playlist.id,
                name = playlist.name,
                trackCount = playlist.tracks.total,
                platform = "spotify",
                isPersonal = playlist.owner.id == getCurrentUser(userToken).id,
                description = playlist.description
            )
        }
    }
    
    override suspend fun getLikedSongs(userToken: OAuthTokens): List<TrackInfo> {
        val spotifyApi = createSpotifyClient(userToken)
        val likedTracks = spotifyApi.usersSavedTracks.build().execute()
        
        return likedTracks.items.map { savedTrack ->
            savedTrack.track.toTrackInfo()
        }
    }
}
```

## 🔄 **OAuth Authentication Flows**

### Device Code Flow (YouTube/Google)
```kotlin
@RestController
@RequestMapping("/oauth/youtube")
class YouTubeOAuthController {
    
    @PostMapping("/initiate/{userId}")
    suspend fun initiateYouTubeAuth(@PathVariable userId: String): OAuthInitResponse {
        // Generate device flow for TV/Limited Input devices (Discord bots)
        val deviceCodeResponse = googleOAuthClient.getDeviceCode(
            clientId = System.getenv("YOUTUBE_CLIENT_ID"),  
            scopes = listOf(
                "https://www.googleapis.com/auth/youtube.readonly",
                "https://www.googleapis.com/auth/youtubepartner"
            )
        )
        
        // Store pending auth in DynamoDB with TTL
        storePendingAuth(userId, deviceCodeResponse)
        
        return OAuthInitResponse(
            userCode = deviceCodeResponse.userCode,
            verificationUrl = deviceCodeResponse.verificationUrl,
            message = buildAuthMessage(deviceCodeResponse),
            expiresIn = deviceCodeResponse.expiresIn
        )
    }
    
    @PostMapping("/check/{userId}")
    suspend fun checkAuthStatus(@PathVariable userId: String): AuthStatusResponse {
        val pendingAuth = getPendingAuth(userId) 
            ?: return AuthStatusResponse(status = "NO_PENDING_AUTH")
        
        // Poll OAuth provider for completion
        val tokenResponse = try {
            googleOAuthClient.getToken(pendingAuth.deviceCode)
        } catch (e: AuthPendingException) {
            return AuthStatusResponse(
                status = "PENDING", 
                message = "⏳ Still waiting for authentication..."
            )
        }
        
        // Store OAuth tokens in Secrets Manager (AWS Best Practice)
        storeUserTokensInSecretsManager(userId, tokenResponse)
        
        // Clean up pending auth
        deletePendingAuth(userId)
        
        return AuthStatusResponse(
            status = "SUCCESS",
            message = "✅ YouTube Premium authentication successful!"
        )
    }
}
```

### Authorization Code Flow (Spotify)
```kotlin
@RestController  
@RequestMapping("/oauth/spotify")
class SpotifyOAuthController {
    
    @PostMapping("/initiate/{userId}")
    suspend fun initiateSpotifyAuth(@PathVariable userId: String): OAuthInitResponse {
        val authUrl = spotifyOAuthClient.getAuthorizationUrl(
            clientId = System.getenv("SPOTIFY_CLIENT_ID"),
            redirectUri = System.getenv("SPOTIFY_REDIRECT_URI"),
            scopes = listOf(
                "user-read-playback-state",
                "user-modify-playback-state", 
                "user-read-currently-playing",
                "playlist-read-private",
                "user-library-read"
            ),
            state = userId // Include user ID in state for callback
        )
        
        return OAuthInitResponse(
            authUrl = authUrl,
            message = "🎵 Click the link to authorize Spotify Premium access",
            expiresIn = 600 // 10 minutes
        )
    }
    
    @GetMapping("/callback")
    suspend fun handleCallback(
        @RequestParam code: String,
        @RequestParam state: String // userId
    ): ResponseEntity<String> {
        val tokenResponse = spotifyOAuthClient.exchangeCodeForTokens(
            code = code,
            redirectUri = System.getenv("SPOTIFY_REDIRECT_URI")
        )
        
        // Store tokens in Secrets Manager
        storeUserTokensInSecretsManager(state, tokenResponse)
        
        return ResponseEntity.ok("""
            <html>
            <body>
                <h2>✅ Spotify Premium Connected!</h2>
                <p>You can now close this tab and return to Discord.</p>
                <p>Try using <code>/my-playlists</code> to see your personal playlists!</p>
            </body>
            </html>
        """.trimIndent())
    }
}
```

## 🔒 **Token Management & Security**

### Secure Token Storage Service
```kotlin
@Service
class SecureTokenService {
    
    private val secretsManagerClient = SecretsManagerClient.create()
    
    suspend fun storeUserTokens(userId: String, tokens: OAuthTokens) {
        val secretName = "/timmybot/users/$userId/oauth"
        
        try {
            secretsManagerClient.createSecret {
                name = secretName
                secretString = gson.toJson(tokens)
                description = "TimmyBot OAuth tokens for user $userId"
            }
        } catch (e: ResourceExistsException) {
            // Update existing secret
            secretsManagerClient.updateSecret {
                secretId = secretName
                secretString = gson.toJson(tokens)
            }
        }
        
        logger.info("Stored OAuth tokens for user {} in Secrets Manager", userId)
    }
    
    suspend fun getUserTokens(userId: String): OAuthTokens? {
        val secretName = "/timmybot/users/$userId/oauth"
        
        return try {
            val response = secretsManagerClient.getSecretValue {
                secretId = secretName
            }
            
            gson.fromJson(response.secretString(), OAuthTokens::class.java)
        } catch (e: ResourceNotFoundException) {
            null // User hasn't authenticated yet
        }
    }
    
    suspend fun refreshTokensIfNeeded(userId: String): OAuthTokens? {
        val tokens = getUserTokens(userId) ?: return null
        
        // Check if any tokens need refresh
        val refreshedTokens = tokens.copy(
            youtubeOAuth = tokens.youtubeOAuth?.let { refreshYouTubeTokenIfNeeded(it) },
            spotifyOAuth = tokens.spotifyOAuth?.let { refreshSpotifyTokenIfNeeded(it) }
        )
        
        // Update if any tokens were refreshed
        if (refreshedTokens != tokens) {
            storeUserTokens(userId, refreshedTokens)
        }
        
        return refreshedTokens
    }
}
```

### Token Refresh Implementation
```kotlin
@Service
class TokenRefreshService {
    
    suspend fun refreshYouTubeTokenIfNeeded(token: YouTubeOAuthToken): YouTubeOAuthToken {
        // Check if token expires within next 5 minutes
        if (token.expiresAt > System.currentTimeMillis() + 300_000) {
            return token // Still valid
        }
        
        val refreshResponse = googleOAuthClient.refreshToken(token.refreshToken)
        
        return token.copy(
            accessToken = refreshResponse.accessToken,
            expiresAt = System.currentTimeMillis() + (refreshResponse.expiresIn * 1000)
        )
    }
    
    suspend fun refreshSpotifyTokenIfNeeded(token: SpotifyOAuthToken): SpotifyOAuthToken {
        if (token.expiresAt > System.currentTimeMillis() + 300_000) {
            return token
        }
        
        val refreshResponse = spotifyOAuthClient.refreshToken(token.refreshToken)
        
        return token.copy(
            accessToken = refreshResponse.accessToken,
            refreshToken = refreshResponse.refreshToken ?: token.refreshToken,
            expiresAt = System.currentTimeMillis() + (refreshResponse.expiresIn * 1000)
        )
    }
}
```

## 🎵 **Smart Music Search**

### Multi-Platform Search with Ranking
```kotlin
@Service
class UnifiedMusicSearchService {
    
    suspend fun searchAcrossPlatforms(
        query: String, 
        userId: String
    ): SearchResult {
        val userTokens = secureTokenService.getUserTokens(userId) 
            ?: return SearchResult.unauthenticated()
        
        // Refresh tokens if needed
        val freshTokens = secureTokenService.refreshTokensIfNeeded(userId)
            ?: return SearchResult.authenticationError()
        
        // Parallel search across all authenticated platforms
        val searchTasks = listOf(
            async { 
                freshTokens.youtubeOAuth?.let { 
                    youtubeService.search(query, it) 
                } ?: emptyList()
            },
            async { 
                freshTokens.spotifyOAuth?.let { 
                    spotifyService.search(query, it) 
                } ?: emptyList()
            },
            async { 
                freshTokens.soundcloudOAuth?.let { 
                    soundcloudService.search(query, it) 
                } ?: emptyList()
            }
        )
        
        val allResults = searchTasks.awaitAll().flatten()
        
        if (allResults.isEmpty()) {
            return SearchResult.noResults(query)
        }
        
        // Smart ranking algorithm
        val rankedResults = allResults.sortedWith(
            compareByDescending<TrackInfo> { it.isPremium }
                .thenByDescending { it.platform == getUserPreferredPlatform(userId) }
                .thenByDescending { it.quality.toPriority() }
                .thenByDescending { it.duration != null }
                .thenBy { it.title.levenshteinDistance(query) }
        )
        
        return SearchResult.success(rankedResults)
    }
}
```

## 📊 **Authentication Analytics**

### OAuth Success Metrics
```kotlin
@Component
class AuthenticationMetrics {
    
    private val authAttemptCounter = Counter.builder("timmybot.auth.attempts")
        .description("OAuth authentication attempts")
        .register(meterRegistry)
    
    private val authSuccessCounter = Counter.builder("timmybot.auth.success")
        .description("Successful OAuth authentications")
        .register(meterRegistry)
    
    private val tokenRefreshCounter = Counter.builder("timmybot.auth.token_refresh")
        .description("Token refresh operations")
        .register(meterRegistry)
    
    fun recordAuthAttempt(platform: String) {
        authAttemptCounter.increment(Tags.of(Tag.of("platform", platform)))
    }
    
    fun recordAuthSuccess(platform: String) {
        authSuccessCounter.increment(Tags.of(Tag.of("platform", platform)))
    }
    
    fun recordTokenRefresh(platform: String, success: Boolean) {
        tokenRefreshCounter.increment(
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
**📖 Related Docs**: [Architecture](architecture.md), [Access Control](access-control.md), [Commands](commands.md)