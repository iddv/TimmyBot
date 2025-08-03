/**
 * Basic tests for PlayCommand
 */

import { PlayCommand } from './PlayCommand';
import { LavalinkService } from '../services/LavalinkService';
import { GuildQueueService } from '../services/GuildQueueService';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock the services
jest.mock('../services/LavalinkService');
jest.mock('../services/GuildQueueService');

describe('PlayCommand', () => {
  let playCommand: PlayCommand;
  let mockLavalinkService: jest.Mocked<LavalinkService>;
  let mockGuildQueueService: jest.Mocked<GuildQueueService>;

  beforeEach(() => {
    // Create mocked services
    mockLavalinkService = {
      addTrackToQueue: jest.fn(),
    } as any;

    mockGuildQueueService = {
      isGuildAllowed: jest.fn(),
    } as any;

    playCommand = new PlayCommand(mockLavalinkService, mockGuildQueueService);
  });

  it('should have correct command name', () => {
    expect(playCommand.data.name).toBe('play');
  });

  it('should have correct command description', () => {
    expect(playCommand.data.description).toBe('Play a song from YouTube or search query');
  });

  it('should reject when guild is not allowed', async () => {
    const mockInteraction = {
      guildId: 'guild-123',
      reply: jest.fn(),
    } as any;

    mockGuildQueueService.isGuildAllowed.mockResolvedValue(false);

    await playCommand.execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: '❌ This server is not authorized to use TimmyBot. Please contact an administrator.',
      ephemeral: true,
    });
  });
});