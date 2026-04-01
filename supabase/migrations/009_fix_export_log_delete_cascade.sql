-- Fix export_log foreign key constraint to allow client deletion
-- Existing constraint blocks deletion because it lacks ON DELETE CASCADE

ALTER TABLE export_log
DROP CONSTRAINT IF EXISTS export_log_client_id_fkey,
ADD CONSTRAINT export_log_client_id_fkey 
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE;
