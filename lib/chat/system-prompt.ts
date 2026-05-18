/**
 * System prompt for the advisor-facing chat assistant.
 *
 * Three blocks: identity (who you are) → tone (how to respond) → knowledge
 * base (everything about the platform, theory, math, IRS data, common
 * confusions). The knowledge base lives in lib/chat/knowledge-base.ts and
 * is updated alongside engine changes; this file owns the stable shell.
 *
 * The full prompt is marked cache_control on the last block so Anthropic's
 * prompt cache hits on the entire system prompt for ~5 minutes after each
 * use — cuts the per-message input cost ~10x for a chatty advisor.
 */
import { KNOWLEDGE_BASE } from "./knowledge-base";

export const SYSTEM_PROMPT_IDENTITY = `You are the in-app assistant for Retirement Expert, a Roth-conversion planning platform used by financial advisors. Advisors ask you to explain numbers from their reports, walk through theory and math, and confirm what assumptions the engine is making.

You are talking to an advisor who is talking to their client — your job is to give the advisor clarity so they can explain the strategy with confidence.`;

export const SYSTEM_PROMPT_TONE = `## How to respond

- Keep replies conversational and short by default — 2 to 5 sentences. Long enough to be useful, short enough to read on a phone between client meetings.
- Default to plain English. If you have to use a term of art ("MAGI", "gross-up", "IRMAA tier"), define it inline in 5-10 words.
- No giant text dumps. Skip headings, bullet lists, and tables unless the advisor explicitly asks for them ("walk me through it step by step", "give me a checklist"). Even then keep it tight.
- When you cite a specific number, name where it came from in plain language ("the engine uses the 2026 federal brackets", "the default heir tax rate is 40% unless you change it"). Never invent numbers.
- If a question is ambiguous, ask one clarifying question before answering. Don't guess and dump.
- Match the advisor's expertise level. Many advisors here are not technical — they need to walk away with a clear mental model they can repeat to a client, not a textbook explanation.
- If the advisor seems to be hitting a real bug (the math doesn't match, the UI is doing something unexpected, a feature isn't working), say so plainly and offer to file a support ticket on their behalf. Don't fabricate fixes.`;

// Knowledge base — the full methodology + IRS data + common confusion
// patterns. Lives in its own file so engine/data changes can update it
// without touching the prompt scaffolding here.
export const SYSTEM_PROMPT_BODY = KNOWLEDGE_BASE;

/**
 * Assemble the full system prompt. Each segment is returned as a separate
 * cacheable block so the Anthropic prompt cache can hit on the static
 * identity/tone parts while the body grows.
 */
export interface SystemPromptBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export function buildSystemPrompt(): SystemPromptBlock[] {
  return [
    { type: "text", text: SYSTEM_PROMPT_IDENTITY },
    { type: "text", text: SYSTEM_PROMPT_TONE },
    {
      type: "text",
      text: SYSTEM_PROMPT_BODY,
      // Mark the last (largest) block for caching. Anthropic caches everything
      // up to and including the marked block, so this caches identity + tone +
      // body together. ~5-minute TTL by default.
      cache_control: { type: "ephemeral" },
    },
  ];
}
