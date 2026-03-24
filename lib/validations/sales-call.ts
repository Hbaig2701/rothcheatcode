import { z } from "zod";

export const salesCallCreateSchema = z.object({
  title: z.string().max(200).optional(),
  call_date: z.string().optional(),
  notes: z.string().max(5000).optional(),
});

export const salesCallTranscriptSchema = salesCallCreateSchema.extend({
  transcript_text: z.string().min(50, "Transcript must be at least 50 characters").max(500000),
});

export type SalesCallCreateInput = z.infer<typeof salesCallCreateSchema>;
export type SalesCallTranscriptInput = z.infer<typeof salesCallTranscriptSchema>;
