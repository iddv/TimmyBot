/**
 * Clear command - Clears the music queue
 */

import { CommandInteraction, SlashCommandBuilder, GuildMember, ChatInputCommandInteraction } from 'discord.js';
import { BaseSlashCommand } from './SlashCommand';
import { LavalinkService } from '../services/LavalinkService';
import { GuildQueueService } from '../services/GuildQueueService';

export class ClearCommand extends BaseSlashCommand {
  private lavalinkService: LavalinkService;
  private guildQueueService: GuildQueueService;

  constructor(lavalinkService: LavalinkService, guildQueueService: GuildQueueService) {
    super();
    this.lavalinkService = lavalinkService;
    this.guildQueueService = guildQueueService;
  }

  data = new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear the music queue and stop playback');

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Check if guild is allowed
      if (!await this.guildQueueService.isGuildAllowed(interaction.guildId!)) {
        await interaction.reply({
          content: '❌ This server is not authorized to use TimmyBot. Please contact an administrator.',
          ephemeral: true,
        });
        return;
      }

      // Check if user is in a voice channel
      const member = interaction.member as GuildMember;
      if (!member?.voice?.channel) {
        await interaction.reply({
          content: '❌ You need to be in a voice channel to clear the queue!',
          ephemeral: true,
        });
        return;
      }

      // Check if there's a queue to clear
      const queueSize = await this.lavalinkService.getQueueSize(interaction.guildId!);
      if (queueSize === 0) {
        await interaction.reply({
          content: '❌ The queue is already empty!',
          ephemeral: true,
        });
        return;
      }

      await this.deferReply(interaction);

      try {
        // Clear the guild queue and stop playback
        await this.lavalinkService.clearGuildQueue(interaction.guildId!);

        await interaction.editReply({
          content: `🗑️ **Queue cleared!**\n📊 **Removed ${queueSize} track${queueSize === 1 ? '' : 's'}** from the queue and stopped playback.`,
        });

      } catch (clearError) {
        if (clearError instanceof Error) {
          await interaction.editReply({
            content: `❌ Failed to clear queue: ${clearError.message}`,
          });
        } else {
          throw clearError;
        }
      }

    } catch (error) {
      await this.handleError(interaction, error as Error);
    }
  }

  protected override async hasPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
    // Check if user is in a guild
    if (!interaction.guildId) {
      return false;
    }

    // Check if user is in a voice channel
    const member = interaction.member as GuildMember;
    return !!(member?.voice?.channel);
  }
}