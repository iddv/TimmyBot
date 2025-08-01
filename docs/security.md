# 🔒 TimmyBot Security & Compliance

*Security practices, compliance standards, and data protection*

## 🎯 **Security Philosophy**

### AWS Well-Architected Framework Compliance
TimmyBot follows the [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) security pillar:

```yaml
Security Principles:
  ✅ Strong identity foundation (IAM roles, least privilege)
  ✅ Security at all layers (network, application, data)
  ✅ Automated security best practices
  ✅ Data protection in transit and at rest
  ✅ Incident response preparation
```

### Zero Trust Architecture
```yaml
Trust Nothing, Verify Everything:
  - All API calls require authentication
  - OAuth tokens stored encrypted in AWS Secrets Manager
  - Network traffic encrypted (TLS 1.3)
  - Input validation on all user inputs
  - Principle of least privilege for all AWS resources
```

## 🛡️ **OAuth Token Security**

### Why AWS Secrets Manager? (Not DynamoDB)
The AWS Well-Architected Framework explicitly states OAuth tokens should **NOT** be stored in DynamoDB:

```yaml
❌ DynamoDB Approach (Anti-pattern):
  - OAuth tokens in DynamoDB with KMS encryption
  - Manual token rotation required
  - No automatic credential rotation
  - Basic access control only
  - Not designed for secret management

✅ AWS Secrets Manager Approach (Best Practice):
  - Purpose-built for secret storage
  - Automatic token rotation
  - Fine-grained access control
  - Built-in auditing and compliance
  - Integration with AWS services
  - Encryption by default
```

### Token Storage Implementation
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
                kmsKeyId = "arn:aws:kms:us-east-1:account:key/key-id"
            }
        } catch (e: ResourceExistsException) {
            // Update existing secret with versioning
            secretsManagerClient.updateSecret {
                secretId = secretName
                secretString = gson.toJson(tokens)
                description = "Updated: ${Instant.now()}"
            }
        }
        
        logger.info("Stored OAuth tokens for user {} in Secrets Manager", userId.takeLast(4))
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
        } catch (e: Exception) {
            logger.error("Failed to retrieve tokens for user {}: {}", userId.takeLast(4), e.message)
            null
        }
    }
}
```

### Token Encryption & Key Management
```yaml
Encryption at Rest:
  - AWS Secrets Manager uses AWS KMS for encryption
  - Customer-managed KMS keys for additional control
  - Automatic key rotation (365 days)
  - Cross-region replication for disaster recovery

Encryption in Transit:
  - TLS 1.3 for all API communications
  - Certificate pinning for music service APIs
  - mTLS for service-to-service communication
  - No plaintext token transmission
```

### Automatic Token Rotation
```kotlin
@Service
class TokenRotationService {
    
    @Scheduled(cron = "0 0 2 * * ?") // Daily at 2 AM
    suspend fun rotateExpiredTokens() {
        val expiredTokens = findExpiredTokens()
        
        expiredTokens.forEach { (userId, tokens) ->
            try {
                val refreshedTokens = refreshTokensIfNeeded(tokens)
                if (refreshedTokens != tokens) {
                    secureTokenService.storeUserTokens(userId, refreshedTokens)
                    logger.info("Rotated tokens for user {}", userId.takeLast(4))
                }
            } catch (e: Exception) {
                logger.error("Failed to rotate tokens for user {}: {}", userId.takeLast(4), e.message)
                // Alert for manual intervention
                alertingService.sendAlert("Token rotation failed for user ${userId.takeLast(4)}")
            }
        }
    }
}
```

## 🔐 **Access Control & Authentication**

### IAM Role-Based Security
```yaml
ECS Task Role (timmybot-task-role):
  Policies:
    - DynamoDBAccessPolicy (guild-queues, user-preferences, track-cache)
    - SecretsManagerReadPolicy (/timmybot/users/*/oauth)
    - S3AccessPolicy (timmybot-cache-*, timmybot-user-data-*)
    - CloudWatchLogsPolicy (log groups only)
  
ECS Execution Role (timmybot-execution-role):
  Policies:
    - AmazonECSTaskExecutionRolePolicy
    - ECRImagePullPolicy
    - CloudWatchLogsPolicy

Admin Role (timmybot-admin-role):
  Policies:
    - Full access to TimmyBot resources
    - Secrets Manager admin access
    - ECS service management
    - CloudWatch monitoring
```

### Server Access Control Implementation
```kotlin
@Component
class ServerAccessControl {
    
    // Encrypted at rest, version controlled
    @Value("\${timmybot.access.allowed-guilds}")
    private lateinit var allowedGuildsString: String
    
    private val allowedGuilds: Set<String> by lazy {
        allowedGuildsString.split(",").toSet()
    }
    
    fun isGuildAllowed(guildId: String): Boolean {
        val allowed = allowedGuilds.contains(guildId)
        
        // Log access attempts for security monitoring
        if (!allowed) {
            securityMetrics.recordUnauthorizedAccess(guildId)
            logger.warn("Unauthorized access attempt from guild {}", guildId.takeLast(4))
        }
        
        return allowed
    }
    
    @EventListener
    fun handleUnauthorizedAttempt(event: UnauthorizedAccessEvent) {
        // Rate limiting for repeated attempts
        val attempts = rateLimiter.getAttempts(event.guildId)
        if (attempts > MAX_ATTEMPTS_PER_HOUR) {
            // Temporary ban and alert
            temporaryBanService.banGuild(event.guildId, Duration.ofHours(1))
            alertingService.sendSecurityAlert("Multiple unauthorized attempts from guild ${event.guildId.takeLast(4)}")
        }
    }
}
```

## 🛡️ **Input Validation & Sanitization**

### Command Input Validation
```kotlin
@Component
class InputValidator {
    
    private val maxQueryLength = 200
    private val maxPlaylistNameLength = 100
    private val forbiddenPatterns = listOf(
        Regex("javascript:", RegexOption.IGNORE_CASE),
        Regex("<script", RegexOption.IGNORE_CASE),
        Regex("(?i)\\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\\b")
    )
    
    fun validateSearchQuery(query: String): ValidationResult {
        return when {
            query.isBlank() -> ValidationResult.error("Search query cannot be empty")
            query.length > maxQueryLength -> ValidationResult.error("Search query too long (max $maxQueryLength characters)")
            containsForbiddenPattern(query) -> ValidationResult.error("Invalid characters in search query")
            else -> ValidationResult.success(sanitizeQuery(query))
        }
    }
    
    private fun containsForbiddenPattern(input: String): Boolean {
        return forbiddenPatterns.any { it.containsMatchIn(input) }
    }
    
    private fun sanitizeQuery(query: String): String {
        return query
            .replace(Regex("[<>\"'&]"), "") // Remove HTML/SQL injection chars
            .replace(Regex("\\s+"), " ") // Normalize whitespace
            .trim()
    }
}
```

### API Response Sanitization
```kotlin
@Component
class ResponseSanitizer {
    
    fun sanitizeTrackInfo(track: TrackInfo): TrackInfo {
        return track.copy(
            title = sanitizeString(track.title),
            artist = sanitizeString(track.artist),
            thumbnailUrl = validateUrl(track.thumbnailUrl)
        )
    }
    
    private fun sanitizeString(input: String?): String {
        return input
            ?.replace(Regex("[<>\"'&]"), "")
            ?.take(200) // Prevent extremely long strings
            ?: ""
    }
    
    private fun validateUrl(url: String?): String? {
        return try {
            if (url != null && URI(url).scheme in listOf("http", "https")) {
                url
            } else null
        } catch (e: URISyntaxException) {
            null
        }
    }
}
```

## 🔍 **Security Monitoring & Logging**

### Security Event Logging
```kotlin
@Component
class SecurityAuditLogger {
    
    private val securityLogger = LoggerFactory.getLogger("SECURITY")
    
    fun logAuthenticationAttempt(userId: String, platform: String, success: Boolean, ipAddress: String?) {
        val event = SecurityEvent(
            type = "AUTHENTICATION_ATTEMPT",
            userId = hashUserId(userId),
            details = mapOf(
                "platform" to platform,
                "success" to success,
                "ip" to (ipAddress?.let { hashIpAddress(it) } ?: "unknown")
            ),
            timestamp = Instant.now()
        )
        
        securityLogger.info("Security event: {}", gson.toJson(event))
    }
    
    fun logUnauthorizedAccess(guildId: String, commandAttempted: String, userId: String?) {
        val event = SecurityEvent(
            type = "UNAUTHORIZED_ACCESS",
            guildId = hashGuildId(guildId),
            userId = userId?.let { hashUserId(it) },
            details = mapOf(
                "command" to commandAttempted,
                "blocked" to true
            ),
            timestamp = Instant.now()
        )
        
        securityLogger.warn("Security event: {}", gson.toJson(event))
    }
    
    // Hash IDs for privacy while maintaining ability to correlate events
    private fun hashUserId(userId: String): String {
        return MessageDigest.getInstance("SHA-256")
            .digest("$userId:user:$SALT".toByteArray())
            .joinToString("") { "%02x".format(it) }
            .take(16) // First 16 chars for logs
    }
}
```

### Security Metrics & Alerting
```kotlin
@Component
class SecurityMetrics {
    
    private val unauthorizedAccessCounter = Counter.builder("timmybot.security.unauthorized_access")
        .description("Unauthorized access attempts")
        .register(meterRegistry)
    
    private val authFailureCounter = Counter.builder("timmybot.security.auth_failures")
        .description("Authentication failures")
        .register(meterRegistry)
    
    private val suspiciousActivityGauge = Gauge.builder("timmybot.security.suspicious_activity")
        .description("Suspicious activity level (0-100)")
        .register(meterRegistry, this) { calculateSuspiciousActivityLevel() }
    
    fun recordUnauthorizedAccess(guildId: String) {
        unauthorizedAccessCounter.increment(
            Tags.of(Tag.of("guild_hash", guildId.takeLast(4)))
        )
    }
    
    fun recordAuthFailure(platform: String, reason: String) {
        authFailureCounter.increment(
            Tags.of(
                Tag.of("platform", platform),
                Tag.of("reason", reason)
            )
        )
    }
}
```

### CloudWatch Security Alarms
```bash
# Unauthorized access alarm
aws cloudwatch put-metric-alarm \
    --alarm-name "TimmyBot-UnauthorizedAccess" \
    --alarm-description "Alert on unauthorized access attempts" \
    --metric-name "timmybot.security.unauthorized_access" \
    --namespace "TimmyBot/Security" \
    --statistic Sum \
    --period 300 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold \
    --alarm-actions "arn:aws:sns:us-east-1:ACCOUNT:security-alerts"

# Authentication failure alarm  
aws cloudwatch put-metric-alarm \
    --alarm-name "TimmyBot-AuthFailures" \
    --alarm-description "Alert on authentication failures" \
    --metric-name "timmybot.security.auth_failures" \
    --namespace "TimmyBot/Security" \
    --statistic Sum \
    --period 900 \
    --threshold 20 \
    --comparison-operator GreaterThanThreshold \
    --alarm-actions "arn:aws:sns:us-east-1:ACCOUNT:security-alerts"
```

## 🔐 **Data Protection & Privacy**

### Personal Data Handling
```yaml
Data Classification:
  Public Data:
    - Discord user IDs (hashed in logs)
    - Guild IDs (hashed in logs)
    - Command usage statistics (anonymized)
  
  Sensitive Data:
    - OAuth access tokens (AWS Secrets Manager)
    - OAuth refresh tokens (AWS Secrets Manager)
    - User preferences (DynamoDB with encryption)
  
  No Collection:
    - Real names or personal information
    - Email addresses (except for approval requests)
    - Voice or message content
    - Location data
```

### Data Retention & Deletion
```kotlin
@Component
class DataRetentionService {
    
    @Scheduled(cron = "0 0 3 * * ?") // Daily at 3 AM
    suspend fun cleanupExpiredData() {
        // DynamoDB TTL handles most cleanup automatically
        
        // Manual cleanup for edge cases
        cleanupOrphanedSecrets()
        cleanupOldLogEntries()
        anonymizeOldMetrics()
    }
    
    suspend fun deleteUserData(userId: String) {
        try {
            // Delete OAuth tokens from Secrets Manager
            secretsManagerClient.deleteSecret {
                secretId = "/timmybot/users/$userId/oauth"
                forceDeleteWithoutRecovery = true
            }
            
            // Delete user preferences from DynamoDB
            dynamoDbClient.deleteItem {
                tableName = "timmybot-user-preferences"
                key = mapOf("userId" to AttributeValue.S(userId))
            }
            
            logger.info("Deleted all data for user {}", userId.takeLast(4))
        } catch (e: Exception) {
            logger.error("Failed to delete user data for {}: {}", userId.takeLast(4), e.message)
            throw DataDeletionException("Failed to delete user data", e)
        }
    }
}
```

## 🚨 **Incident Response**

### Security Incident Classifications
```yaml
P0 - Critical (Response: Immediate):
  - Unauthorized access to AWS resources
  - OAuth token exposure or breach
  - Service compromise or malware detection
  - Data exfiltration attempts

P1 - High (Response: <2 hours):
  - Authentication system failures
  - Persistent unauthorized access attempts
  - Suspicious admin activity
  - Service availability threats

P2 - Medium (Response: <24 hours):
  - Input validation bypasses
  - Rate limiting failures
  - Monitoring system alerts
  - Configuration security issues

P3 - Low (Response: <1 week):
  - Security audit findings
  - Documentation updates needed
  - Non-critical vulnerability reports
  - Process improvement opportunities
```

### Incident Response Procedures
```kotlin
@Component
class IncidentResponseService {
    
    suspend fun handleSecurityIncident(incident: SecurityIncident) {
        when (incident.severity) {
            IncidentSeverity.CRITICAL -> {
                // Immediate containment
                emergencyShutdown()
                notifySecurityTeam()
                isolateAffectedResources()
                
                // Evidence preservation
                captureSystemState()
                preserveLogs()
                
                // Communication
                updateStatusPage("Security incident - service temporarily unavailable")
            }
            
            IncidentSeverity.HIGH -> {
                // Rapid response
                assessThreat()
                implementCountermeasures()
                increaseMonitoring()
                notifyAdministrators()
            }
            
            IncidentSeverity.MEDIUM -> {
                // Standard response
                investigateIncident()
                documentFindings()
                planRemediation()
                scheduleSecurityReview()
            }
        }
    }
}
```

## 📋 **Compliance & Auditing**

### Compliance Standards
```yaml
AWS Well-Architected Framework:
  ✅ Security Pillar - Strong identity foundation
  ✅ Security Pillar - Apply security at all layers
  ✅ Security Pillar - Automate security best practices
  ✅ Security Pillar - Protect data in transit and at rest
  ✅ Security Pillar - Prepare for security events

SOC 2 Type II (If Required):
  ✅ Security - Access controls and authentication
  ✅ Availability - System uptime and disaster recovery
  ✅ Confidentiality - Data protection and encryption
  ✅ Processing Integrity - System accuracy and completeness
  ✅ Privacy - Personal information handling (minimal collection)

GDPR Compliance (EU Users):
  ✅ Right to erasure (data deletion functionality)
  ✅ Data minimization (minimal personal data collection)
  ✅ Consent (explicit OAuth consent flows)
  ✅ Data portability (user can export their data)
  ✅ Privacy by design (security-first architecture)
```

### Security Audit Trail
```kotlin
@Component
class AuditTrailService {
    
    suspend fun recordAdminAction(adminId: String, action: String, resource: String, details: Map<String, Any>) {
        val auditEvent = AuditEvent(
            eventId = UUID.randomUUID().toString(),
            adminId = hashAdminId(adminId),
            action = action,
            resource = resource,
            details = details,
            timestamp = Instant.now(),
            source = "admin-panel"
        )
        
        // Store in CloudWatch Logs for long-term retention
        auditLogger.info("AUDIT: {}", gson.toJson(auditEvent))
        
        // Also store in DynamoDB for querying
        auditRepository.save(auditEvent)
    }
    
    suspend fun getAuditHistory(
        startTime: Instant,
        endTime: Instant,
        adminId: String? = null,
        action: String? = null
    ): List<AuditEvent> {
        return auditRepository.findByTimeRangeAndFilters(startTime, endTime, adminId, action)
    }
}
```

---

**🔄 Last Updated**: August 2025  
**📖 Related Docs**: [Architecture](architecture.md), [Authentication](authentication.md), [Access Control](access-control.md)