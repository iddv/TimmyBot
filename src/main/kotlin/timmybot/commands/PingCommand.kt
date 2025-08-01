package timmybot.commands

import timmybot.Command
import timmybot.CommandContext
import timmybot.CommandResult

/**
 * Ping Command - Test connectivity and response time
 * Migrated to unified Command interface for slash/prefix compatibility
 */
class PingCommand : Command {
    override suspend fun execute(context: CommandContext): CommandResult {
        val startTime = System.currentTimeMillis()
        val responseTime = System.currentTimeMillis() - startTime
        
        return when (context) {
            is CommandContext.SlashContext -> {
                CommandResult.Success(
                    message = "🏓 Pong! Response time: ${responseTime}ms",
                    ephemeral = false
                )
            }
            
            is CommandContext.PrefixContext -> {
                CommandResult.Success(
                    message = "🏓 Pong! Response time: ${responseTime}ms"
                )
            }
        }
    }
    
    override fun describe(): String = "Test bot connectivity and response time"
    
    override fun getCommandName(): String = "ping"
    
    override fun getCooldownSeconds(): Long = 5L // 5 second cooldown to prevent spam
}