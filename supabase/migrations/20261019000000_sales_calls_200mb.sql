-- Recordings over Whisper's 25MB ceiling are now re-encoded to speech-quality
-- mono and split into segments server-side (lib/sales-calls/audio.ts), so the
-- bucket no longer needs to stop at 25MB. Tamara, Oct 2026: 40MB recording.
-- NOTE: the project-wide Storage upload limit (dashboard → Storage → Settings)
-- must also be ≥ 200MB or uploads above it still fail.
UPDATE storage.buckets
SET file_size_limit = 209715200 -- 200MB
WHERE id = 'sales-call-uploads';

-- Call dates picked in the upload form were stored as UTC midnight
-- (new Date("YYYY-MM-DD")), so every US advisor saw the previous day. The form
-- now stores noon UTC; move existing date-only picks (exactly 00:00:00 UTC —
-- a "now" timestamp never lands on that to the microsecond) to noon too.
UPDATE public.sales_calls
SET call_date = call_date + interval '12 hours'
WHERE call_date = date_trunc('day', call_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
