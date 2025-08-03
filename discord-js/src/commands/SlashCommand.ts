/**
 * Interface for Discord slash commands
 * Defines the structure that all commands must implement
 */

import { CommandInteraction, SlashCommandBuilder } from 'discord.js';

export interface SlashCommand {
  /**
   * The command data for Discord API registration
   */
  data: SlashCommandBuilder;

  /**
   * Execute the command
   * @param interaction The Discord command interaction
   */
  execute(interaction: CommandInteraction): Promise<void>;
}

/**
 * Base class for slash commands with common functionality
 */
export abstract class BaseSlashCommand implements SlashCommand {
  abstract data: SlashCommandBuilder;

  abstract execute(interaction: CommandInteraction): Promise<void>;

  /**
   * Check if the user has permission to use this command
   * Override in subclasses for command-specific permission checks
   */
  protected async hasPermission(interaction: CommandInteraction): Promise<boolean> {
    // Default: all users can use commands
    // Override in subclasses for specific permission requirements
    return true;
  }

  /**
   * Handle command errors with user-friendly messages
   */
  protected async handleError(interaction: CommandInteraction, error: Error): Promise<void> {
    console.error(`Error executing command ${this.data.name}:`, error);

    const errorMessage = 'There was an error while executing this command!';

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }

  /**
   * Defer the reply if the command might take a while
   */
  protected async deferReply(interaction: CommandInteraction, ephemeral: boolean = false): Promise<void> {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
  }
}