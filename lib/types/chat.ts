/**
 * AI Chat — shared types
 *
 * Mirrors the chat_conversations + chat_messages tables. Used by both the
 * server route (when persisting) and the widget (when rendering).
 */

export type ChatRole = 'user' | 'assistant' | 'tool';

export interface ChatConversation {
  id: string;
  user_id: string;
  title: string | null;
  last_message_at: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * One row of structured content as the Anthropic API speaks it. We persist
 * the shape verbatim so the admin panel can show exactly what the model did,
 * including tool_use and tool_result blocks.
 */
export type ChatContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64' | 'url'; media_type?: string; data?: string; url?: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string | Array<{ type: 'text'; text: string }>;
      is_error?: boolean;
    };

export interface ChatMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  content_blocks: ChatContentBlock[] | null;
  attachment_url: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  cost_usd: number | null;
  model: string | null;
  created_ticket_id: string | null;
  created_at: string;
}

/**
 * Per-message Anthropic usage. Mirrors what the API returns in `usage` on a
 * Messages response, plus the cache fields. Stored on the assistant message.
 */
export interface ChatMessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

/**
 * Aggregate usage view — computed on the fly from chat_messages for the
 * admin panel. Defined here so the API layer + UI agree on shape.
 */
export interface ChatUsageRollup {
  user_id: string;
  message_count: number;
  conversation_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
}
