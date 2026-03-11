-- Create report_history table
CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- File metadata
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Path in Supabase Storage
  file_size BIGINT NOT NULL, -- Size in bytes

  -- Report metadata
  report_type TEXT NOT NULL, -- 'growth' or 'guaranteed_income'
  client_name TEXT, -- Denormalized for easy filtering

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on user_id for fast user queries
CREATE INDEX IF NOT EXISTS report_history_user_id_idx ON report_history(user_id);

-- Create index on client_id for client-specific queries
CREATE INDEX IF NOT EXISTS report_history_client_id_idx ON report_history(client_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS report_history_created_at_idx ON report_history(created_at DESC);

-- Enable Row Level Security
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own reports
CREATE POLICY "Users can view their own report history"
  ON report_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own reports
CREATE POLICY "Users can insert their own reports"
  ON report_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own reports
CREATE POLICY "Users can delete their own reports"
  ON report_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create storage bucket for reports (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: Users can only access their own report files
CREATE POLICY "Users can upload their own reports"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'reports' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own reports"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'reports' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own reports"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'reports' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
