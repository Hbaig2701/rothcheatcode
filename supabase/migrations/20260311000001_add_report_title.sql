-- Add title column to report_history table
ALTER TABLE report_history
ADD COLUMN title TEXT;

-- Add comment
COMMENT ON COLUMN report_history.title IS 'Optional user-provided title to identify the report';
