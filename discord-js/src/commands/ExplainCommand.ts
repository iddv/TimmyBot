/**
 * Explain command - Shows bot architecture and technical information
 */

import { CommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BaseSlashCommand } from './SlashCommand';

export class ExplainCommand extends BaseSlashCommand {
  data = new SlashCommandBuilder()
    .setName('explain')
    .setDescription('Shows bot architecture and technical information');

  async execute(interaction: CommandInteraction): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🏗️ TimmyBot Architecture')
        .setDescription('Technical information about TimmyBot\'s implementation')
        .addFields(
          {
            name: '🔧 Framework',
            value: 'Discord.js v14 with TypeScript',
            inline: true,
          },
          {
            name: '🎵 Audio Engine',
            value: 'Lavalink v4 with Shoukaku client',
            inline: true,
          },
          {
            name: '☁️ Infrastructure',
            value: 'AWS ECS Fargate with sidecar containers',
            inline: true,
          },
          {
            name: '💾 Database',
            value: 'Amazon DynamoDB for queue and guild data',
            inline: true,
          },
          {
            name: '🔐 Secrets',
            value: 'AWS Secrets Manager for secure configuration',
            inline: true,
          },
          {
            name: '📊 Monitoring',
            value: 'CloudWatch logs and metrics',
            inline: true,
          },
          {
            name: '🐳 Deployment',
            value: 'Docker containers with health checks',
            inline: false,
          },
          {
            name: '🔄 Migration Status',
            value: 'Migrated from Kotlin/KordEx to Discord.js for improved stability and maintainability',
            inline: false,
          }
        )
        .setFooter({
          text: 'TimmyBot - Built with ❤️ and modern tech',
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