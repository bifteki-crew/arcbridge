import { encode } from "gpt-tokenizer";

/**
 * Count tokens with a real BPE tokenizer (gpt-tokenizer, cl100k_base — the
 * GPT-4 family encoding). Pure JS, no native deps, deterministic. This is what
 * makes the token-savings numbers defensible rather than a chars/4 guess.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}

/** Sum the token counts of several strings. */
export function sumTokens(texts: string[]): number {
  return texts.reduce((total, t) => total + countTokens(t), 0);
}
