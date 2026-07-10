import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ReviewContext } from '../prompt-builder/review-context';
import { ParsedSuggestion, parseSuggestions } from './suggestion-parser';

const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 16000;
// Transient errors (429, 5xx, connection) are retried with exponential
// backoff by the Anthropic SDK itself; this caps the retries.
const DEFAULT_MAX_RETRIES = 3;

/**
 * Wraps the Anthropic SDK call for one review: sends the assembled context,
 * parses the structured JSON response defensively, and keeps only
 * medium/high-confidence suggestions (low ones are logged for later tuning,
 * never surfaced to users).
 */
@Injectable()
export class ClaudeClientService {
  private readonly logger = new Logger(ClaudeClientService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: ConfigService) {
    this.model = config.get<string>('CLAUDE_MODEL') ?? DEFAULT_MODEL;
    this.maxTokens = Number(config.get<string>('CLAUDE_MAX_TOKENS') ?? DEFAULT_MAX_TOKENS);
    this.client = new Anthropic({
      apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
      maxRetries: Number(config.get<string>('CLAUDE_MAX_RETRIES') ?? DEFAULT_MAX_RETRIES),
    });
  }

  /**
   * Returns the suggestions worth persisting (medium/high confidence only).
   * A response that can't be parsed is logged and treated as "no suggestions"
   * so a malformed reply never crashes the worker. Non-transient API errors
   * (after SDK retries are exhausted) propagate to the queue layer, which
   * marks the job failed.
   */
  async review(context: ReviewContext): Promise<ParsedSuggestion[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: context.system,
      messages: [{ role: 'user', content: context.content }],
    });

    if (response.stop_reason === 'refusal') {
      this.logger.warn('Claude declined to review this submission batch');
      return [];
    }
    if (response.stop_reason === 'max_tokens') {
      this.logger.warn('Claude response was truncated (max_tokens) — skipping');
      return [];
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const suggestions = parseSuggestions(text);
    if (suggestions === null) {
      this.logger.error(
        `Could not parse Claude response as a JSON suggestion array — skipping. Raw: ${text.slice(0, 500)}`,
      );
      return [];
    }

    const [keep, dropped] = [
      suggestions.filter((s) => s.confidence !== 'low'),
      suggestions.filter((s) => s.confidence === 'low'),
    ];
    for (const s of dropped) {
      // Logged (not persisted) so there's data for tuning the threshold later.
      this.logger.log(`Dropping low-confidence suggestion: ${s.summary}`);
    }
    return keep;
  }
}
