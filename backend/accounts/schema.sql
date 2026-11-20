-- Run once as the schema owner using psql with ON_ERROR_STOP=1.
-- Additive account preparation only; does not change csun_mapper or existing data.
BEGIN;

CREATE SCHEMA IF NOT EXISTS csun_accounts;

CREATE TABLE IF NOT EXISTS csun_accounts.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 80),
    email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email = btrim(email)),
    -- Server-generated Argon2id encoding (salt and work parameters included).
    -- Never put a submitted password here, including during registration.
    password_hash text NOT NULL CHECK (char_length(password_hash) >= 32),
    email_verified_at timestamptz,
    password_changed_at timestamptz NOT NULL DEFAULT now(),
    disabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_users_email_unique ON csun_accounts.users (lower(email));

-- Anonymous sessions carry CSRF protection before login/register/reset.
-- On login, destroy the anonymous session and issue a new authenticated one.
CREATE TABLE IF NOT EXISTS csun_accounts.sessions (
    token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    user_id uuid REFERENCES csun_accounts.users(id) ON DELETE CASCADE,
    csrf_token_hash bytea NOT NULL CHECK (octet_length(csrf_token_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS accounts_sessions_user ON csun_accounts.sessions (user_id);
CREATE INDEX IF NOT EXISTS accounts_sessions_expiry ON csun_accounts.sessions (expires_at);

CREATE TABLE IF NOT EXISTS csun_accounts.email_verification_tokens (
    token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    user_id uuid NOT NULL REFERENCES csun_accounts.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS accounts_verification_user ON csun_accounts.email_verification_tokens (user_id);
CREATE INDEX IF NOT EXISTS accounts_verification_expiry ON csun_accounts.email_verification_tokens (expires_at);

CREATE TABLE IF NOT EXISTS csun_accounts.password_reset_tokens (
    token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    user_id uuid NOT NULL REFERENCES csun_accounts.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS accounts_reset_user ON csun_accounts.password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS accounts_reset_expiry ON csun_accounts.password_reset_tokens (expires_at);

-- Provision a separate runtime login role outside this migration.
-- No app login is created here and no credentials are embedded in this file.
REVOKE ALL ON SCHEMA csun_accounts FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA csun_accounts FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA csun_accounts REVOKE ALL ON TABLES FROM PUBLIC;
COMMIT;
