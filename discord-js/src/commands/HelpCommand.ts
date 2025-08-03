/**
 * Help command - Shows available commands and their descriptions
 */

import { CommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseSlashCommand } from './SlashCommand';

export class HelpCommand extends BaseSlashCommand {
  data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows all available commands and their descriptions');

  async execute(interaction: CommandInteraction): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🤖 TimmyBot Commands')
        .setDescription('Here are all the available commands:')
        .addFields(
          {
            name: '🏓 /ping',
            value: 'Check bot latency and responsiveness',
            inline: false,
          },
          {
            name: '❓ /help',
            value: 'Show this help message',
            inline: false,
          },
          {
            name: '📋 /explain',
            value: 'Show bot architecture and technical information',
            inline: false,
          },
          {
            name: '🎵 /join',
            value: 'Join your current voice channel',
            inline: false,
          },
          {
            name: '▶️ /play',
            value: 'Play music from YouTube URL or search query',
            inline: false,
          },
          {
            name: '⏭️ /skip',
            value: 'Skip the currently playing track',
            inline: false,
          },
          {
            name: '🗑️ /clear',
            value: 'Clear the music queue for this server',
            inline: false,
          }
        )
        .setFooter({
          text: 'TimmyBot - Discord.js Migration',
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      await this.handleError(interaction, error as Error);
    }
  }
}