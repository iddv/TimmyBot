package timmybot.commands

import discord4j.core.event.domain.interaction.ChatInputInteractionEvent
import discord4j.core.event.domain.message.MessageCreateEvent
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.assertj.core.api.Assertions.assertThat
import timmybot.CommandContext
import timmybot.CommandResult

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PingCommandTest {

    private val pingCommand = PingCommand()

    @Test
    fun `should return success result for slash context`() = runBlocking {
        // Given
        val mockEvent = mockk<ChatInputInteractionEvent>()
        val context = CommandContext.SlashContext(
            event = mockEvent,
            guildId = "123456789",
            userId = "987654321"
        )

        // When
        val result = pingCommand.execute(context)

        // Then
        assertThat(result).isInstanceOf(CommandResult.Success::class.java)
        val successResult = result as CommandResult.Success
        assertThat(successResult.message).contains("🏓 Pong!")
        assertThat(successResult.message).contains("Response time:")
        assertThat(successResult.message).contains("ms")
        assertThat(successResult.ephemeral).isFalse()
    }

    @Test
    fun `should return success result for prefix context`() = runBlocking {
        // Given
        val mockEvent = mockk<MessageCreateEvent>()
        val context = CommandContext.PrefixContext(
            event = mockEvent,
            guildId = "123456789",
            userId = "987654321",
            args = listOf("ping")
        )

        // When
        val result = pingCommand.execute(context)

        // Then
        assertThat(result).isInstanceOf(CommandResult.Success::class.java)
        val successResult = result as CommandResult.Success
        assertThat(successResult.message).contains("🏓 Pong!")
        assertThat(successResult.message).contains("Response time:")
        assertThat(successResult.message).contains("ms")
    }

    @Test
    fun `should return correct command name`() {
        // When
        val commandName = pingCommand.getCommandName()

        // Then
        assertThat(commandName).isEqualTo("ping")
    }

    @Test
    fun `should return correct description`() {
        // When
        val description = pingCommand.describe()

        // Then
        assertThat(description).isEqualTo("Test bot connectivity and response time")
    }

    @Test
    fun `should have 5 second cooldown`() {
        // When
        val cooldown = pingCommand.getCooldownSeconds()

        // Then
        assertThat(cooldown).isEqualTo(5L)
    }

    @Test
    fun `should have no required permissions`() {
        // When
        val permissions = pingCommand.getRequiredPermissions()

        // Then
        assertThat(permissions).isEmpty()
    }

    @Test
    fun `should handle null guild context`() = runBlocking {
        // Given
        val mockEvent = mockk<ChatInputInteractionEvent>()
        val context = CommandContext.SlashContext(
            event = mockEvent,
            guildId = null, // DM context
            userId = "987654321"
        )

        // When
        val result = pingCommand.execute(context)

        // Then
        assertThat(result).isInstanceOf(CommandResult.Success::class.java)
        val successResult = result as CommandResult.Success
        assertThat(successResult.message).contains("🏓 Pong!")
    }
}