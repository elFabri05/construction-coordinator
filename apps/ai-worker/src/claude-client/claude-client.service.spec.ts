import { ConfigService } from '@nestjs/config';
import { ClaudeClientService } from './claude-client.service';
import { ReviewContext } from '../prompt-builder/review-context';

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

const context: ReviewContext = {
  system: 'system prompt',
  content: [{ type: 'text', text: 'context' }],
  validTaskIds: ['task-1'],
};

const config = {
  get: jest.fn().mockReturnValue(undefined),
  getOrThrow: jest.fn().mockReturnValue('test-api-key'),
} as unknown as ConfigService;

const textResponse = (text: string, stop_reason = 'end_turn') => ({
  stop_reason,
  content: [{ type: 'text', text }],
});

const suggestion = (confidence: string, summary = 'A problem') => ({
  suggestion_type: 'blocker',
  related_task_ids: ['task-1'],
  summary,
  detail: 'Detail sentences here.',
  confidence,
});

describe('ClaudeClientService', () => {
  let service: ClaudeClientService;

  beforeEach(() => {
    mockCreate.mockReset();
    service = new ClaudeClientService(config);
  });

  it('returns [] for a routine "boring" review (empty array response)', async () => {
    mockCreate.mockResolvedValue(textResponse('[]'));
    await expect(service.review(context)).resolves.toEqual([]);
  });

  it('returns parsed suggestions and sends the assembled context', async () => {
    mockCreate.mockResolvedValue(textResponse(JSON.stringify([suggestion('high')])));
    const result = await service.review(context);

    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe('A problem');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'system prompt',
        messages: [{ role: 'user', content: context.content }],
      }),
    );
  });

  it('filters out low-confidence suggestions', async () => {
    mockCreate.mockResolvedValue(
      textResponse(
        JSON.stringify([
          suggestion('low', 'Low one'),
          suggestion('medium', 'Medium one'),
          suggestion('high', 'High one'),
        ]),
      ),
    );
    const result = await service.review(context);
    expect(result.map((s) => s.summary)).toEqual(['Medium one', 'High one']);
  });

  it('parses code-fenced JSON', async () => {
    mockCreate.mockResolvedValue(
      textResponse('```json\n' + JSON.stringify([suggestion('high')]) + '\n```'),
    );
    await expect(service.review(context)).resolves.toHaveLength(1);
  });

  it('returns [] (does not throw) on malformed JSON', async () => {
    mockCreate.mockResolvedValue(textResponse('Sorry, I cannot produce JSON today.'));
    await expect(service.review(context)).resolves.toEqual([]);
  });

  it('returns [] on a refusal stop reason', async () => {
    mockCreate.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await expect(service.review(context)).resolves.toEqual([]);
  });

  it('propagates API errors (queue layer marks the job failed)', async () => {
    mockCreate.mockRejectedValue(new Error('api unavailable'));
    await expect(service.review(context)).rejects.toThrow('api unavailable');
  });
});
