# 🔒 TimmyBot Access Control

*Server allowlist implementation and manual approval workflow*

## 🎯 **Access Control Strategy**

### Why Server Allowlist?
- **Cost Control**: Prevents $400+/month Secrets Manager costs
- **Abuse Prevention**: Manual approval stops spam/abuse
- **Quality Control**: Ensures legitimate Discord communities
- **Scalability**: Simple to implement and maintain

### Zen Advisor Consensus
**Unanimous 9/10 confidence** across all perspectives:
- **"Drastically better"** than complex trial systems
- **Industry standard pattern** for controlled rollouts
- **Zero external dependencies** needed
- **Easy to evolve** into more complex system later

## 🏗️ **Implementation**

### Core Access Control Service
```kotlin
@Component
class ServerAccessControl {
    
    // Version-controlled allowlist for audit trail
    private val allowedGuilds = setOf(
        "123456789012345678", // Example Discord Server 1
        "987654321098765432", // Example Discord Server 2
        "456789012345678901", // Example Discord Server 3
        // Add new server IDs here after manual approval
    )
    
    fun isGuildAllowed(guildId: String): Boolean {
        return allowedGuilds.contains(guildId)
    }
    
    fun handleUnauthorizedGuild(event: ChatInputInteractionEvent): Mono<Void> {
        return event.reply()
            .withEphemeral(true)
            .withContent(buildAccessRequestMessage())
            .then()
    }
    
    private fun buildAccessRequestMessage(): String {
        return """
        🚫 **This server is not authorized to use TimmyBot**
        
        📧 **Request Access:**
        • GitHub: Contact [@iddv](https://github.com/iddv)
        • LinkedIn: Message me at [linkedin.com/in/iddvprofile](https://linkedin.com/in/iddvprofile)
        
        🔧 **Self-Deploy Option:**
        • Deploy your own instance: [GitHub Repository](https://github.com/iddv/timmybot)
        • Full control over your bot and AWS costs
        
        ⏱️ **Response Time:** Usually 24-48 hours for manual approval
        
        📋 **Include in Request:**
        • Discord server name and ID
        • Server purpose and community size  
        • Expected usage (casual/heavy)
        • Contact information
        """.trimIndent()
    }
}
```

### Integration with Main Service
```kotlin
@Component
class TimmyBotService {
    
    @Autowired
    private lateinit var accessControl: ServerAccessControl
    
    private fun handleSlashCommand(event: ChatInputInteractionEvent): Mono<Void> {
        val guildId = event.interaction.guildId.orElse(null)?.asString()
        
        // Check server authorization FIRST
        if (guildId == null || !accessControl.isGuildAllowed(guildId)) {
            return accessControl.handleUnauthorizedGuild(event)
        }
        
        // Proceed with normal command handling only if authorized
        return when (event.commandName) {
            "play" -> handlePlayCommand(event)
            "queue" -> handleQueueCommand(event) 
            "skip" -> handleSkipCommand(event)
            "auth-youtube" -> handleYouTubeAuth(event)
            "auth-spotify" -> handleSpotifyAuth(event)
            else -> event.reply("Unknown command")
        }
    }
}
```

## 📋 **Manual Approval Workflow**

### Request Process
```yaml
Step 1 - User Discovery:
  - User tries to use bot in unauthorized server
  - Bot displays access request message with contact info
  - Clear instructions on what information to provide

Step 2 - User Request:
  - User contacts via GitHub issues or LinkedIn message
  - Provides required information:
    * Discord server name and ID
    * Server purpose/community description
    * Estimated user count and usage level
    * Server owner contact information

Step 3 - Review Process:
  - Manual review within 24-48 hours
  - Check legitimacy of Discord community
  - Verify reasonable usage expectations
  - Confirm server owner authenticity

Step 4 - Approval:
  - Add server ID to allowedGuilds set
  - Commit change to version control (audit trail)  
  - Deploy updated configuration via CI/CD
  - Test bot access in newly approved server

Step 5 - Notification:
  - Reply to user's request with approval confirmation
  - Provide bot invite link if needed
  - Include basic usage instructions
```

### Approval Criteria
```yaml
✅ Approved:
  - Legitimate Discord communities (gaming, music, hobbies)
  - Clear server purpose and active membership
  - Reasonable expected usage (<100 concurrent users)
  - Identifiable server owner with good standing
  - Educational or non-profit communities (priority)

❌ Rejected:
  - Brand new servers with no activity
  - Suspicious or spam-like requests
  - Commercial/advertising focused servers
  - Excessive usage expectations (>500 users)
  - No clear server purpose or community
  - Previous ToS violations or abuse

⏸️ Deferred:
  - Unclear server purpose (request more info)
  - Borderline usage levels (may suggest self-deploy)
  - Server in development/planning phase
```

## 🔧 **Configuration Management**

### Version-Controlled Allowlist
```kotlin
// Store in application.yml for easy updates
@ConfigurationProperties("timmybot.access")
@Component
data class AccessControlConfig(
    val allowedGuilds: Set<String> = emptySet(),
    val approvalEnabled: Boolean = true,
    val maxAllowedGuilds: Int = 50
)
```

```yaml
# application.yml
timmybot:
  access:
    approval-enabled: true
    max-allowed-guilds: 50
    allowed-guilds:
      - "123456789012345678"  # Example Server 1
      - "987654321098765432"  # Example Server 2
      - "456789012345678901"  # Example Server 3
```

### Dynamic Configuration Updates
```kotlin
@RestController
@RequestMapping("/admin/access")
class AccessControlAdminController {
    
    @Autowired
    private lateinit var accessConfig: AccessControlConfig
    
    @PostMapping("/approve/{guildId}")
    @PreAuthorize("hasRole('ADMIN')")
    fun approveGuild(@PathVariable guildId: String): ResponseEntity<String> {
        if (accessConfig.allowedGuilds.size >= accessConfig.maxAllowedGuilds) {
            return ResponseEntity.badRequest()
                .body("Maximum allowed guilds (${accessConfig.maxAllowedGuilds}) reached")
        }
        
        // Add to configuration (requires restart to take effect)
        // In production, this would update configuration store
        logger.info("Guild $guildId approved for access")
        
        return ResponseEntity.ok("Guild $guildId approved. Deploy needed to activate.")
    }
    
    @DeleteMapping("/revoke/{guildId}")
    @PreAuthorize("hasRole('ADMIN')")
    fun revokeGuildAccess(@PathVariable guildId: String): ResponseEntity<String> {
        // Remove from configuration
        logger.info("Guild $guildId access revoked")
        
        return ResponseEntity.ok("Guild $guildId access revoked. Deploy needed to activate.")
    }
    
    @GetMapping("/status")
    fun getAccessStatus(): AccessStatus {
        return AccessStatus(
            totalApprovedGuilds = accessConfig.allowedGuilds.size,
            maxAllowedGuilds = accessConfig.maxAllowedGuilds,
            approvalEnabled = accessConfig.approvalEnabled,
            approvedGuilds = accessConfig.allowedGuilds.toList()
        )
    }
}
```

## 📊 **Monitoring & Analytics**

### Access Control Metrics
```kotlin
@Component
class AccessControlMetrics {
    
    private val deniedRequestsCounter = Counter.builder("timmybot.access.denied")
        .description("Number of denied access requests")
        .tag("reason", "unauthorized_guild")
        .register(meterRegistry)
    
    private val approvedGuildsGauge = Gauge.builder("timmybot.access.approved_guilds")
        .description("Number of approved guilds")
        .register(meterRegistry, this) { accessConfig.allowedGuilds.size.toDouble() }
    
    fun recordDeniedAccess(guildId: String, commandName: String) {
        deniedRequestsCounter.increment(
            Tags.of(
                Tag.of("guild_id", guildId.takeLast(4)), // Only last 4 digits for privacy
                Tag.of("command", commandName)
            )
        )
        
        logger.info("Access denied for guild {} attempting command {}", 
                   guildId.takeLast(4), commandName)
    }
}
```

### Usage Analytics Dashboard
```kotlin
@RestController
@RequestMapping("/admin/analytics")
class AccessAnalyticsController {
    
    @GetMapping("/denied-requests")
    fun getDeniedRequests(@RequestParam days: Int = 7): List<DeniedRequestSummary> {
        // Return denied access attempts for monitoring
        return accessAnalyticsService.getDeniedRequestsSummary(days)
    }
    
    @GetMapping("/approval-requests")
    fun getPendingApprovals(): List<ApprovalRequest> {
        // Return pending approval requests (if using database tracking)
        return approvalService.getPendingRequests()
    }
}
```

## 🚀 **Self-Deployment Alternative**

### Documentation Structure
```yaml
/docs/self-deployment/
  - README.md                 # Quick start guide
  - aws-setup.md             # AWS account and IAM setup
  - discord-setup.md         # Discord bot token configuration
  - oauth-setup.md           # Music service OAuth client setup
  - deployment.md            # ECS deployment steps
  - cost-monitoring.md       # Cost control and alerts
  - troubleshooting.md       # Common issues and solutions
```

### Self-Deployment Benefits
```yaml
Advantages:
  ✅ Full control over costs and scaling
  ✅ No dependency on central approval process
  ✅ Ability to customize features and limits
  ✅ Learning opportunity for AWS/container deployment
  ✅ Better privacy (your own OAuth tokens)

Disadvantages:
  ❌ Requires AWS knowledge and management
  ❌ User responsible for security updates
  ❌ No shared cost benefits
  ❌ Individual troubleshooting and support
```

### Self-Deployment Support
```kotlin
// Self-deployment detection and support
@Component
class DeploymentDetectionService {
    
    fun isOfficialInstance(): Boolean {
        return System.getenv("TIMMYBOT_OFFICIAL_INSTANCE") == "true"
    }
    
    fun getSupportChannels(): SupportInfo {
        return if (isOfficialInstance()) {
            SupportInfo(
                primarySupport = "GitHub Issues",
                responseTime = "24-48 hours",
                supportUrl = "https://github.com/iddv/timmybot/issues"
            )
        } else {
            SupportInfo(
                primarySupport = "Community Support",
                responseTime = "Best effort",
                supportUrl = "https://github.com/iddv/timmybot/discussions"
            )
        }
    }
}
```

## 📈 **Scaling the Approval Process**

### When Manual Approval Becomes a Bottleneck
```yaml
Signs:
  - >10 requests per week
  - Response time >48 hours consistently  
  - Approval queue backlog growing
  - Community complaints about wait times

Solutions:
  1. Semi-Automated Approval:
     - GitHub issue templates
     - Automated checks (server age, member count)
     - One-click approval for qualified servers
     
  2. Trusted Community Approvers:
     - Delegate approval authority
     - Clear criteria and guidelines
     - Audit trail for all approvals
     
  3. Tiered Access:
     - Instant approval for small servers (<50 members)
     - Manual review for larger servers
     - Premium tier for enterprise use
```

### Future Evolution Path  
```yaml
Phase 1: Manual Approval (Current)
  - Simple, secure, cost-controlled
  - Learning about usage patterns
  - Building user base and trust

Phase 2: Semi-Automated (If needed)
  - GitHub Actions workflow for approvals
  - Automated basic checks
  - Human review for edge cases

Phase 3: Tiered Access (If successful)
  - Free tier with automatic approval
  - Premium tier with advanced features  
  - Enterprise tier with dedicated support
```

---

**🔄 Last Updated**: August 2025  
**📖 Related Docs**: [Architecture](architecture.md), [Cost Analysis](cost-analysis.md), [Authentication](authentication.md)