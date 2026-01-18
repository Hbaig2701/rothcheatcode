-- Add missing UPDATE policy to clients table
-- Fixes: "Failed to update client" error

-- Check if the UPDATE policy already exists before creating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients'
    AND policyname = 'Users can update own clients'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update own clients" ON clients FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- Also ensure SELECT, INSERT, DELETE policies exist (for completeness)
DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients'
    AND policyname = 'Users can view own clients'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own clients" ON clients FOR SELECT USING (user_id = auth.uid())';
  END IF;

  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients'
    AND policyname = 'Users can create own clients'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can create own clients" ON clients FOR INSERT WITH CHECK (user_id = auth.uid())';
  END IF;

  -- DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients'
    AND policyname = 'Users can delete own clients'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete own clients" ON clients FOR DELETE USING (user_id = auth.uid())';
  END IF;
END $$;

-- Ensure RLS is enabled on clients table
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
