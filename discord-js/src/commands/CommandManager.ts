/**
 * Command Manager for Discord slash commands
 * Handles registration, validation, and execution of commands
 */

import { Client, Collection, CommandInteraction, REST, Routes } from 'discord.js';
import { SlashCommand } from './SlashCommand';
import { logger } from '../utils/logger';

export class CommandManager {
  private commands: Collection<string, SlashCommand>;
  private client: Client;
  private rest: REST;

  constructor(client: Client, token: string) {
    this.commands = new Collection();
    this.client = client;
    this.rest = new REST({ version: '10' }).setToken(token);
  }

  /**
   * Register a slash command
   */
  registerCommand(command: SlashCommand): void {
    // Validate command before registration
    if (!this.validateCommand(command)) {
      throw new Error(`Invalid command: ${command.data?.name || 'unknown'}`);
    }

    const commandName = command.data.name;
    
    if (this.commands.has(commandName)) {
      logger.warn(`⚠️ Command ${commandName} is already registered, overwriting...`);
    }

    this.commands.set(commandName, command);
    logger.info(`📝 Registered command: ${commandName}`);
  }

  /**
   * Register multiple commands at once
   */
  registerCommands(commands: SlashCommand[]): void {
    if (!Array.isArray(commands)) {
      throw new Error('Commands must be an array');
    }

    let successCount = 0;
    const errors: string[] = [];

    for (const command of commands) {
      try {
        this.registerCommand(command);
        successCount++;
      } catch (error) {
        const errorMessage = `Failed to register command: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        logger.error(errorMessage);
      }
    }

    logger.info(`📊 Command registration complete: ${successCount}/${commands.length} successful`);

    if (errors.length > 0) {
      throw new Error(`Failed to register ${errors.length} commands: ${errors.join(', ')}`);
    }
  }

  /**
   * Deploy commands to Discord API
   */
  async deployCommands(applicationId: string, guildId?: string): Promise<void> {
    try {
      const commandData = this.commands.map(command => command.data.toJSON());
      
      logger.info(`🚀 Started refreshing ${commandData.length} application (/) commands...`);

      let route: `/${string}`;
      if (guildId) {
        // Deploy to specific guild (faster for development)
        route = Routes.applicationGuildCommands(applicationId, guildId);
        logger.info(`📍 Deploying commands to guild: ${guildId}`);
      } else {
        // Deploy globally (takes up to 1 hour to propagate)
        route = Routes.applicationCommands(applicationId);
        logger.info('🌍 Deploying commands globally');
      }

      const data = await this.rest.put(route, { body: commandData }) as any[];

      logger.info(`✅ Successfully reloaded ${data.length} application (/) commands`);
    } catch (error) {
      logger.error('❌ Failed to deploy commands:', error);
      throw error;
    }
  }

  /**
   * Handle command interaction
   */
  async handleInteraction(interaction: CommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`⚠️ No command matching ${interaction.commandName} was found`);
      await interaction.reply({
        content: 'Unknown command!',
        ephemeral: true,
      });
      return;
    }

    try {
      logger.info(`🎯 Executing command: ${interaction.commandName}`, {
        user: interaction.user.tag,
        guild: interaction.guild?.name || 'DM',
        guildId: interaction.guildId,
      });

      await command.execute(interaction);

      logger.info(`✅ Command executed successfully: ${interaction.commandName}`);
    } catch (error) {
      logger.error(`❌ Error executing command ${interaction.commandName}:`, error);

      const errorMessage = 'There was an error while executing this command!';

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        logger.error('❌ Failed to send error message:', replyError);
      }
    }
  }

  /**
   * Get all registered commands
   */
  getCommands(): Collection<string, SlashCommand> {
    return this.commands;
  }

  /**
   * Get command by name
   */
  getCommand(name: string): SlashCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Remove a command
   */
  removeCommand(name: string): boolean {
    const removed = this.commands.delete(name);
    if (removed) {
      logger.info(`🗑️ Removed command: ${name}`);
    }
    return removed;
  }

  /**
   * Clear all commands
   */
  clearCommands(): void {
    const count = this.commands.size;
    this.commands.clear();
    logger.info(`🧹 Cleared ${count} commands`);
  }

  /**
   * Get command registration statistics
   */
  getStats(): { total: number; names: string[] } {
    return {
      total: this.commands.size,
      names: Array.from(this.commands.keys()),
    };
  }

  /**
   * Check if a command is registered
   */
  hasCommand(name: string): boolean {
    return this.commands.has(name);
  }

  /**
   * Validate command data
   */
  private validateCommand(command: SlashCommand): boolean {
    try {
      // Check if command object exists
      if (!command) {
        logger.error('❌ Command is null or undefined');
        return false;
      }

      // Check if command data exists
      if (!command.data) {
        logger.error('❌ Command missing data property');
        return false;
      }

      // Check if command has name
      if (!command.data.name) {
        logger.error('❌ Command missing name');
        return false;
      }

      // Check if command has description
      if (!command.data.description) {
        logger.error(`❌ Command ${command.data.name} missing description`);
        return false;
      }

      // Check if command has execute function
      if (!command.execute || typeof command.execute !== 'function') {
        logger.error(`❌ Command ${command.data.name} missing execute function`);
        return false;
      }

      // Validate command name format (Discord requirements)
      const nameRegex = /^[a-z0-9_-]{1,32}$/;
      if (!nameRegex.test(command.data.name)) {
        logger.error(`❌ Command name ${command.data.name} is invalid (must be 1-32 characters, lowercase letters, numbers, hyphens, and underscores only)`);
        return false;
      }

      // Validate description length (Discord requirements)
      if (command.data.description.length < 1 || command.data.description.length > 100) {
        logger.error(`❌ Command ${command.data.name} description must be 1-100 characters`);
        return false;
      }

      // Try to convert to JSON to validate structure
      try {
        command.data.toJSON();
      } catch (jsonError) {
        logger.error(`❌ Command ${command.data.name} has invalid data structure:`, jsonError);
        return false;
      }

      logger.debug(`✅ Command ${command.data.name} validation passed`);
      return true;
    } catch (error) {
      logger.error('❌ Error validating command:', error);
      return false;
    }
  }
}