import { spawn } from "child_process";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "ffmpeg-static";

// Whisper rejects any file over 25MB, but advisors upload Zoom/Teams videos
// and full-bitrate recordings far larger than that (Tamara, 40MB, Oct 2026).
// Speech needs very little: Whisper resamples everything to 16kHz mono
// internally, so re-encoding to 16kHz mono 32kbps MP3 costs no accuracy and
// shrinks an hour of call to ~14MB. Splitting into fixed-length segments keeps
// every piece far under the ceiling AND lets the pieces transcribe in parallel,
// so a 2-hour call takes about as long as a 10-minute one — the route's
// 300s budget was already the bottleneck on long calls (see route.ts).
const SEGMENT_SECONDS = 600; // 10 min ≈ 2.4MB per segment at 32kbps

// A recording a hair over a segment boundary leaves a sliver (600.05s → an
// 899-byte final segment) that Whisper rejects as "too short" (< 0.1s), which
// would fail the whole upload. 32kbps ≈ 4KB/s, so anything under ~1.5s of audio
// carries no speech worth keeping — drop it.
const MIN_SEGMENT_BYTES = 6_000;

/**
 * An error whose message is safe to show the advisor (it lands in
 * sales_calls.error_message). `retryable: false` means sending the original
 * file to Whisper won't help either (e.g. there is no audio at all).
 */
export class RecordingError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "RecordingError";
  }
}

export interface AudioSegment {
  buffer: Buffer;
  fileName: string;
}

/**
 * Re-encode a recording (audio or video) into small speech-quality MP3
 * segments, in order. Throws RecordingError (advisor-safe message) on failure;
 * when it's retryable the caller may send the original file if it's small
 * enough for Whisper.
 */
export async function toSpeechSegments(inputPath: string): Promise<AudioSegment[]> {
  if (!ffmpegPath) throw new RecordingError("Recording conversion is unavailable right now. Please try again shortly.", true);

  const outDir = await mkdtemp(join(tmpdir(), "sales-call-seg-"));
  try {
    try {
      await runFfmpeg([
        "-hide_banner", "-loglevel", "error",
        "-i", inputPath,
        "-vn",                // drop any video track
        "-ac", "1",           // mono
        "-ar", "16000",       // 16kHz — Whisper's native rate
        "-b:a", "32k",
        "-f", "segment",
        "-segment_time", String(SEGMENT_SECONDS),
        "-reset_timestamps", "1",
        join(outDir, "seg%03d.mp3"),
      ]);
    } catch (err) {
      console.error("ffmpeg re-encode failed:", err);
      const detail = err instanceof Error ? err.message : "";
      if (/does not contain any stream|matches no streams/i.test(detail)) {
        throw new RecordingError("This recording has no audio track, so there's nothing to transcribe.", false);
      }
      throw new RecordingError(
        "We couldn't read this recording. Try exporting it as an MP3 or M4A and uploading again.",
        true,
      );
    }

    const names = (await readdir(outDir)).filter((n) => n.endsWith(".mp3")).sort();
    const segments = await Promise.all(
      names.map(async (name) => ({ buffer: await readFile(join(outDir, name)), fileName: name })),
    );
    const kept = segments.filter((seg) => seg.buffer.length >= MIN_SEGMENT_BYTES);
    if (kept.length === 0) {
      throw new RecordingError("This recording is too short to transcribe.", false);
    }
    return kept;
  } finally {
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
