/**
 * Content-block shapes for the review prompt. Structurally identical to the
 * Anthropic Messages API user-content blocks, kept as local types so the
 * prompt builder (and its tests) don't depend on the SDK.
 */
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/webp';
    data: string;
  };
}

export type ContentBlock = TextBlock | ImageBlock;

/** Everything the Claude call needs for one submission-review job. */
export interface ReviewContext {
  system: string;
  content: ContentBlock[];
  /** Task ids Claude may legally reference in related_task_ids. */
  validTaskIds: string[];
}

export function mediaTypeForKey(key: string): ImageBlock['source']['media_type'] {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
