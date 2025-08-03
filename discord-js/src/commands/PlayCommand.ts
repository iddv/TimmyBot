/**
 * Play command - Loads and plays music tracks
 */

import { CommandInteraction, SlashCommandBuilder, GuildMember, VoiceChannel, ChatInputCommandInteraction } from 'discord.js';
import { BaseSlashCommand } from './SlashCommand';
import { LavalinkService } from '../services/LavalinkService';
import { GuildQueueService } from '../services/GuildQueueService';

export class PlayCommand extends BaseSlashCommand {
  private lavalinkService: LavalinkService;
  private guildQueueService: GuildQueueService;

  constructor(lavalinkService: LavalinkService, guildQueueService: GuildQueueService) {
    super();
    this.lavalinkService = lavalinkService;
    this.guildQueueService = guildQueueService;
  }

  data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from YouTube or search query')
    .addStringOption(option =>
      option
        .setName('song')
        .setDescription('YouTube URL or search query')
        .setRequired(true)
    ) as SlashCommandBuilder;

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
          content: '❌ You need to be in a voice channel to play music!',
          ephemeral: true,
        });
        return;
      }

      const voiceChannel = member.voice.channel as VoiceChannel;
      const query = interaction.options.get('song', true).value as string;

      // Check if bot has permissions to join the voice channel
      const permissions = voiceChannel.permissionsFor(interaction.client.user!);
      if (!permissions?.has(['Connect', 'Speak'])) {
        await interaction.reply({
          content: '❌ I need permission to connect and speak in your voice channel!',
          ephemeral: true,
        });
        return;
      }

      await this.deferReply(interaction);

      try {
        // Add track to queue and play if it's the first track
        const result = await this.lavalinkService.addTrackToQueue(
          interaction.guildId!,
          query,
          voiceChannel.id,
          interaction.channelId
        );

        if (result.track) {
          const track = result.track;
          const duration = this.formatDuration(track.info.length);
          
          if (result.position === 1) {
            await interaction.editReply({
              content: `🎵 **Now playing:** ${track.info.title}\n` +
                      `👤 **Artist:** ${track.info.author}\n` +
                      `⏱️ **Duration:** ${duration}\n` +
                      `🔗 **Source:** ${track.info.uri}`,
            });
          } else {
            await interaction.editReply({
              content: `✅ **Added to queue:** ${track.info.title}\n` +
                      `👤 **Artist:** ${track.info.author}\n` +
                      `⏱️ **Duration:** ${duration}\n` +
                      `📍 **Position in queue:** ${result.position}\n` +
                      `🔗 **Source:** ${track.info.uri}`,
            });
          }
        } else {
          await interaction.editReply({
            content: `✅ **Added to queue:** ${query}\n📍 **Position in queue:** ${result.position}`,
          });
        }

      } catch (loadError) {
        if (loadError instanceof Error) {
          if (loadError.message.includes('No tracks found')) {
            await interaction.editReply({
              content: `❌ No tracks found for: **${query}**\n\nTry:\n• A different search term\n• A direct YouTube URL\n• Being more specific in your search`,
            });
          } else if (loadError.message.includes('No Lavalink node available')) {
            await interaction.editReply({
              content: '❌ Music service is currently unavailable. Please try again later.',
            });
          } else {
            await interaction.editReply({
              content: `❌ Failed to load track: ${loadError.message}`,
            });
          }
        } else {
          throw loadError;
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

  /**
   * Format duration from milliseconds to MM:SS format
   */
  private formatDuration(milliseconds: number): string {
    if (!milliseconds || milliseconds === 0) {
      return 'Unknown';
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}