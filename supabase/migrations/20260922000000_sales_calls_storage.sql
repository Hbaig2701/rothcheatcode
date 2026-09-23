-- Sales-call recordings now go straight from the browser to Storage, and the
-- API route pulls them down to transcribe. Routing the file through the API
-- body capped real uploads at Vercel's 4.5MB request limit while the UI
-- promised 25MB (Joshua Williamson, Sep 2026 — a 17MB MP3 failed with no
-- record). The `sales-call-uploads` bucket has existed since March 2026 but
-- nothing wrote to it; give it limits and an upload policy.
UPDATE storage.buckets
SET
  file_size_limit = 26214400, -- 25MB, the Whisper transcription ceiling
  allowed_mime_types = ARRAY[
    'video/mp4', 'audio/mpeg', 'audio/mp3', 'audio/x-mpeg', 'audio/wav', 'audio/x-wav',
    'audio/wave', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'video/webm'
  ]
WHERE id = 'sales-call-uploads';

-- Advisors write only into their own folder (<uid>/<file>). No SELECT policy:
-- the server reads with the service role, and recordings are deleted after
-- transcription, so the browser never needs to read them back.
CREATE POLICY "Advisors upload own sales-call recordings"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sales-call-uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
