/**
 * Join command - Connects the bot to a voice channel
 */

import { CommandInteraction, SlashCommandBuilder, GuildMember, VoiceChannel, ChatInputCommandInteraction } from 'discord.js';
import { BaseSlashCommand } from './SlashCommand';
import { LavalinkService } from '../services/LavalinkService';
import { GuildQueueService } from '../services/GuildQueueService';

export class JoinCommand extends BaseSlashCommand {
  private lavalinkService: LavalinkService;
  private guildQueueService: GuildQueueService;

  constructor(lavalinkService: LavalinkService, guildQueueService: GuildQueueService) {
    super();
    this.lavalinkService = lavalinkService;
    this.guildQueueService = guildQueueService;
  }

  data = new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join your voice channel');

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
          content: '❌ You need to be in a voice channel to use this command!',
          ephemeral: true,
        });
        return;
      }

      const voiceChannel = member.voice.channel as VoiceChannel;

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

      // Get or create player for the guild
      const connection = await this.lavalinkService.getConnection(
        interaction.guildId!,
        voiceChannel.id,
        interaction.channelId
      );

      if (connection) {
        await interaction.editReply({
          content: `✅ Joined **${voiceChannel.name}**! Ready to play music.`,
        });
      } else {
        throw new Error('Failed to create connection');
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