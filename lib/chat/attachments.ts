/**
 * Image attachment helpers — converts a File / Blob into a base64 data URL
 * the chat server can both store and forward to Anthropic.
 *
 * V1 uses inline base64 (stored in chat_messages.attachment_url as a
 * data: URL) because it avoids needing a Supabase storage bucket. The
 * trade-off is DB bloat: each message with an image is ~150-400KB.
 * Acceptable at expected volume (a few images per advisor per day); can
 * migrate to storage if it becomes a problem.
 */

// Supported image MIME types — Anthropic accepts these for image inputs.
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// Soft client-side limit. Bigger than this and the request body gets
// uncomfortable for the Vercel edge. The server enforces a hard limit too.
const MAX_BYTES = 4 * 1024 * 1024; // 4MB

export interface PreparedAttachment {
  // data: URL ready to use as <img src=...> and to ship to the chat route.
  dataUrl: string;
  // Display-only metadata.
  name: string;
  bytes: number;
  type: string;
}

/**
 * Read a File into a data URL. Rejects unsupported types and oversized files
 * with a user-friendly message the caller can surface in the UI.
 */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Only PNG, JPG, GIF, or WebP images are supported.");
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`Image is ${mb}MB — please use one under 4MB.`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });

  return {
    dataUrl,
    name: file.name || "screenshot",
    bytes: file.size,
    type: file.type,
  };
}

/**
 * Split a data URL like "data:image/png;base64,iVBOR..." into the parts
 * Anthropic's image source block needs. Returns null on malformed input
 * so callers can skip rather than crash.
 */
export function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}
