/**
 * Anthropic client + model + pricing constants for the chat feature.
 *
 * Default model is Haiku 4.5 — fast, cheap, and strong enough for theory
 * Q&A and explanations. Sonnet 4.6 is available for future routing if we
 * find tool-heavy / multi-step conversations need more reasoning.
 *
 * Pricing values are hardcoded so a price change at Anthropic doesn't
 * retroactively rewrite cost history in chat_messages. Update these when
 * Anthropic publishes new pricing; existing rows keep their old cost.
 */
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Default model. If we add hybrid routing, this stays as the "cheap path"
// and a Sonnet variant gets called on demand for harder questions.
export const CHAT_MODEL_DEFAULT = "claude-haiku-4-5-20251001";

/**
 * Per-million-token USD prices for each Claude model the chat may use.
 * `cache_read` is the discounted price for cache hits; `cache_write` is the
 * (slightly higher) one-time price to create a cache block. Captured per
 * model because Sonnet/Haiku differ.
 */
export interface ModelPricing {
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok: number;
  cache_write_per_mtok: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001": {
    input_per_mtok: 1.00,
    output_per_mtok: 5.00,
    cache_read_per_mtok: 0.10,
    cache_write_per_mtok: 1.25,
  },
  "claude-sonnet-4-6": {
    input_per_mtok: 3.00,
    output_per_mtok: 15.00,
    cache_read_per_mtok: 0.30,
    cache_write_per_mtok: 3.75,
  },
  "claude-opus-4-7": {
    input_per_mtok: 15.00,
    output_per_mtok: 75.00,
    cache_read_per_mtok: 1.50,
    cache_write_per_mtok: 18.75,
  },
};

/**
 * Compute the USD cost of a single Anthropic API call given its token usage.
 * Returns 0 when the model isn't in MODEL_PRICING (unknown model — record
 * the message anyway, just without cost). Cache fields default to 0.
 */
export function computeMessageCost(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  }
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input_per_mtok;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output_per_mtok;
  const cacheReadCost =
    ((usage.cache_read_tokens ?? 0) / 1_000_000) * pricing.cache_read_per_mtok;
  const cacheWriteCost =
    ((usage.cache_creation_tokens ?? 0) / 1_000_000) * pricing.cache_write_per_mtok;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}
