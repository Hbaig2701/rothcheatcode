import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * Transcribe audio/video file using OpenAI Whisper API.
 * Accepts: mp4, mp3, wav, m4a, webm, mpeg, mpga, oga, ogg
 * Max file size: 25MB (Whisper). Larger uploads go through toSpeechSegments
 * + transcribeSegments instead.
 */
export async function transcribeAudio(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ text: string; duration?: number }> {
  const openai = getOpenAI();

  const file = new File([new Uint8Array(fileBuffer)], fileName, { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: file,
    response_format: "verbose_json",
  });

  return {
    text: transcription.text,
    duration: transcription.duration ? Math.round(transcription.duration) : undefined,
  };
}

// Parallel Whisper calls per recording. A 2-hour call (12 segments) finishes in
// 2 rounds (~20s each), leaving the 300s budget mostly for the analysis step,
// while staying far under OpenAI's per-minute request limits.
const TRANSCRIBE_CONCURRENCY = 6;

/**
 * Transcribe ordered audio segments in parallel and stitch them back together.
 * Segment order is preserved regardless of which finishes first.
 */
export async function transcribeSegments(
  segments: { buffer: Buffer; fileName: string }[]
): Promise<{ text: string; duration?: number }> {
  const results: { text: string; duration?: number }[] = new Array(segments.length);
  let next = 0;
  const worker = async () => {
    while (next < segments.length) {
      const i = next++;
      results[i] = await transcribeAudio(segments[i].buffer, segments[i].fileName, "audio/mpeg");
    }
  };
  await Promise.all(Array.from({ length: Math.min(TRANSCRIBE_CONCURRENCY, segments.length) }, worker));

  const durations = results.map((r) => r.duration);
  return {
    text: results.map((r) => r.text.trim()).filter(Boolean).join(" "),
    duration: durations.every((d) => d != null)
      ? durations.reduce((s, d) => s + (d as number), 0)
      : undefined,
  };
}
