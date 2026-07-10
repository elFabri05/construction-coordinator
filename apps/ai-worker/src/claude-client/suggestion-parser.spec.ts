import { parseSuggestions } from './suggestion-parser';

const valid = {
  suggestion_type: 'rework',
  related_task_ids: ['task-1'],
  summary: 'Rebar spacing looks wrong',
  detail: 'The photo shows 40cm spacing; the guideline requires 20cm.',
  confidence: 'high',
};

describe('parseSuggestions', () => {
  it('parses a plain JSON array', () => {
    const result = parseSuggestions(JSON.stringify([valid]));
    expect(result).toEqual([
      {
        suggestionType: 'rework',
        relatedTaskIds: ['task-1'],
        summary: 'Rebar spacing looks wrong',
        detail: 'The photo shows 40cm spacing; the guideline requires 20cm.',
        confidence: 'high',
      },
    ]);
  });

  it('parses an empty array (the routine "nothing wrong" case)', () => {
    expect(parseSuggestions('[]')).toEqual([]);
    expect(parseSuggestions('  []  ')).toEqual([]);
  });

  it('strips ```json code fences', () => {
    const result = parseSuggestions('```json\n' + JSON.stringify([valid]) + '\n```');
    expect(result).toHaveLength(1);
    expect(result![0].summary).toBe(valid.summary);
  });

  it('strips bare ``` code fences', () => {
    expect(parseSuggestions('```\n[]\n```')).toEqual([]);
  });

  it('tolerates prose around the array', () => {
    const raw = `Here is my review:\n${JSON.stringify([valid])}\nLet me know if you need more.`;
    expect(parseSuggestions(raw)).toHaveLength(1);
  });

  it('returns null for malformed JSON', () => {
    expect(parseSuggestions('[{"summary": "unterminated')).toBeNull();
    expect(parseSuggestions('not json at all')).toBeNull();
    expect(parseSuggestions('')).toBeNull();
  });

  it('returns null when the JSON is not an array', () => {
    expect(parseSuggestions('{"summary": "an object, not an array"}')).toBeNull();
  });

  it('drops items without summary or detail', () => {
    const result = parseSuggestions(
      JSON.stringify([valid, { suggestion_type: 'blocker', confidence: 'high' }]),
    );
    expect(result).toHaveLength(1);
  });

  it('coerces unknown suggestion_type to "other"', () => {
    const result = parseSuggestions(
      JSON.stringify([{ ...valid, suggestion_type: 'delay_everything' }]),
    );
    expect(result![0].suggestionType).toBe('other');
  });

  it('treats missing or unknown confidence as low', () => {
    const result = parseSuggestions(
      JSON.stringify([
        { ...valid, confidence: undefined },
        { ...valid, confidence: 'very high' },
      ]),
    );
    expect(result!.map((s) => s.confidence)).toEqual(['low', 'low']);
  });

  it('keeps only string entries of related_task_ids', () => {
    const result = parseSuggestions(
      JSON.stringify([{ ...valid, related_task_ids: ['a', 7, null, 'b'] }]),
    );
    expect(result![0].relatedTaskIds).toEqual(['a', 'b']);
  });

  it('defaults related_task_ids to [] when absent', () => {
    const { related_task_ids: _omitted, ...rest } = valid;
    const result = parseSuggestions(JSON.stringify([rest]));
    expect(result![0].relatedTaskIds).toEqual([]);
  });
});
