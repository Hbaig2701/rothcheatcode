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
 * Max file size: 25MB
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
