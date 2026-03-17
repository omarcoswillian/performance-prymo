-- Client portal: allows agency users to invite clients to view their ad account data.
-- Clients get their own login but can only see accounts they've been granted access to.

-- User roles table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'client')),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own role"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access user_roles"
  ON user_roles FOR ALL
  USING (auth.role() = 'service_role');

-- Client access: maps client users to ad accounts they can view
CREATE TABLE IF NOT EXISTS client_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  permissions jsonb NOT NULL DEFAULT '{"view": true, "reports": true}',
  client_label text, -- custom label shown to client (e.g., their brand name)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_user_id, ad_account_id)
);

ALTER TABLE client_access ENABLE ROW LEVEL SECURITY;

-- Clients can see their own access records
CREATE POLICY "Clients can view own access"
  ON client_access FOR SELECT
  USING (auth.uid() = client_user_id);

-- Admins can manage access they created
CREATE POLICY "Admins can manage invites"
  ON client_access FOR ALL
  USING (auth.uid() = invited_by);

CREATE POLICY "Service role full access client_access"
  ON client_access FOR ALL
  USING (auth.role() = 'service_role');

-- Client invitations (pending registration)
CREATE TABLE IF NOT EXISTS client_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ad_account_id text NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  client_label text,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 year'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own invitations"
  ON client_invitations FOR ALL
  USING (auth.uid() = invited_by);

CREATE POLICY "Service role full access client_invitations"
  ON client_invitations FOR ALL
  USING (auth.role() = 'service_role');

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_client_invitations_token ON client_invitations(token);
