// Upload ceiling for sales-call recordings, shared by the upload modal and the
// API route so they can't drift. Bounded by Supabase's PROJECT-WIDE Storage
// upload limit (dashboard → Storage → Settings), currently 50MB — a bucket
// can't be set above it. The server re-encodes and segments recordings
// (lib/sales-calls/audio.ts), so this can go to 200MB the moment the project
// limit is raised; just change it here and update the bucket's file_size_limit.
export const MAX_RECORDING_MB = 50;
export const MAX_RECORDING_BYTES = MAX_RECORDING_MB * 1024 * 1024;
