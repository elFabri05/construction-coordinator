import {
  AI_SUGGESTION_CONFIDENCES,
  AI_SUGGESTION_TYPES,
  AiSuggestionConfidence,
  AiSuggestionType,
} from '@construct/shared';

export interface ParsedSuggestion {
  suggestionType: AiSuggestionType;
  relatedTaskIds: string[];
  summary: string;
  detail: string;
  confidence: AiSuggestionConfidence;
}

/**
 * Defensive parser for the model's response. The model is prompted to return
 * ONLY a JSON array, but we tolerate code fences and surrounding prose, and
 * treat anything unparseable as "no result" (null) rather than crashing —
 * the caller logs and skips.
 *
 * Per-item leniency:
 * - unknown suggestion_type  → coerced to 'other' (the content still matters)
 * - missing summary/detail   → item dropped (nothing reviewable to show)
 * - missing/unknown confidence → treated as 'low' (dropped downstream —
 *   when the model can't state confidence, don't surface it to humans)
 */
export function parseSuggestions(raw: string): ParsedSuggestion[] | null {
  const json = extractJsonArray(raw);
  if (json === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }

  const suggestions: ParsedSuggestion[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const summary = typeof record.summary === 'string' ? record.summary.trim() : '';
    const detail = typeof record.detail === 'string' ? record.detail.trim() : '';
    if (!summary || !detail) {
      continue;
    }

    suggestions.push({
      suggestionType: isSuggestionType(record.suggestion_type)
        ? record.suggestion_type
        : 'other',
      relatedTaskIds: Array.isArray(record.related_task_ids)
        ? record.related_task_ids.filter((id): id is string => typeof id === 'string')
        : [],
      summary,
      detail,
      confidence: isConfidence(record.confidence) ? record.confidence : 'low',
    });
  }
  return suggestions;
}

/**
 * Pulls the JSON array text out of the raw response: strips markdown code
 * fences and any prose before/after the outermost [...] pair.
 */
function extractJsonArray(raw: string): string | null {
  let text = raw.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    text = fenced[1].trim();
  }

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function isSuggestionType(value: unknown): value is AiSuggestionType {
  return (
    typeof value === 'string' &&
    (AI_SUGGESTION_TYPES as readonly string[]).includes(value)
  );
}

function isConfidence(value: unknown): value is AiSuggestionConfidence {
  return (
    typeof value === 'string' &&
    (AI_SUGGESTION_CONFIDENCES as readonly string[]).includes(value)
  );
}
