import { z } from "zod";

export const salesCallCreateSchema = z.object({
  title: z.string().max(200).optional(),
  call_date: z.string().optional(),
  notes: z.string().max(5000).optional(),
});

export const salesCallTranscriptSchema = salesCallCreateSchema.extend({
  transcript_text: z.string().min(50, "Transcript must be at least 50 characters").max(500000),
});

// Recording already uploaded by the browser to the `sales-calls` bucket; the
// route downloads it from there (a multipart body would hit Vercel's 4.5MB cap).
export const salesCallRecordingSchema = salesCallCreateSchema.extend({
  storage_path: z.string().min(1).max(500),
});

export type SalesCallCreateInput = z.infer<typeof salesCallCreateSchema>;
export type SalesCallRecordingInput = z.infer<typeof salesCallRecordingSchema>;
export type SalesCallTranscriptInput = z.infer<typeof salesCallTranscriptSchema>;
