/**
 * Ping command - Basic utility command for testing bot responsiveness
 */

import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BaseSlashCommand } from './SlashCommand';

export class PingCommand extends BaseSlashCommand {
  data = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong! and shows bot latency');

  async execute(interaction: CommandInteraction): Promise<void> {
    try {
      // Calculate latency
      const sent = await interaction.reply({
        content: 'Pinging...',
        fetchReply: true,
      });

      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiLatency = Math.round(interaction.client.ws.ping);

      await interaction.editReply({
        content: `🏓 Pong!\n📡 Latency: ${latency}ms\n💓 API Latency: ${apiLatency}ms`,
      });
    } catch (error) {
      await this.handleError(interaction, error as Error);
    }
  }
}