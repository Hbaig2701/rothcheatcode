-- Add parent_client_id to allow multiple scenarios under a single customer
ALTER TABLE clients 
ADD COLUMN parent_client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

CREATE INDEX idx_clients_parent_client_id ON clients(parent_client_id);
