/**
 * Skip command - Skips the current track
 */

import { CommandInteraction, SlashCommandBuilder, GuildMember, ChatInputCommandInteraction } from 'discord.js';
import { BaseSlashCommand } from './SlashCommand';
import { LavalinkService } from '../services/LavalinkService';
import { GuildQueueService } from '../services/GuildQueueService';

export class SkipCommand extends BaseSlashCommand {
  private lavalinkService: LavalinkService;
  private guildQueueService: GuildQueueService;

  constructor(lavalinkService: LavalinkService, guildQueueService: GuildQueueService) {
    super();
    this.lavalinkService = lavalinkService;
    this.guildQueueService = guildQueueService;
  }

  data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track');

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
          content: '❌ You need to be in a voice channel to skip tracks!',
          ephemeral: true,
        });
        return;
      }

      // Check if there's a queue to skip from
      const queueSize = await this.lavalinkService.getQueueSize(interaction.guildId!);
      if (queueSize === 0) {
        await interaction.reply({
          content: '❌ There are no tracks in the queue to skip!',
          ephemeral: true,
        });
        return;
      }

      await this.deferReply(interaction);

      try {
        // Skip the current track
        const result = await this.lavalinkService.skipCurrentTrack(interaction.guildId!);

        if (result.skipped) {
          const remainingTracks = await this.lavalinkService.getQueueSize(interaction.guildId!);
          
          if (remainingTracks > 0) {
            await interaction.editReply({
              content: `⏭️ **Track skipped!**\n📊 **Tracks remaining in queue:** ${remainingTracks}`,
            });
          } else {
            await interaction.editReply({
              content: '⏭️ **Track skipped!** Queue is now empty.',
            });
          }
        } else {
          await interaction.editReply({
            content: '❌ Failed to skip track. Please try again.',
          });
        }

      } catch (skipError) {
        if (skipError instanceof Error) {
          if (skipError.message.includes('No player found')) {
            await interaction.editReply({
              content: '❌ No music is currently playing!',
            });
          } else {
            await interaction.editReply({
              content: `❌ Failed to skip track: ${skipError.message}`,
            });
          }
        } else {
          throw skipError;
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