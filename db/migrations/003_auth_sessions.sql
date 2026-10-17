-- =============================================================================
-- Teststein — migration 003: sign-in sessions
--
-- One row per signed-in browser. The browser holds an opaque refresh token in an
-- httpOnly cookie; only its SHA-256 hash is stored here. Each refresh rotates the
-- token: the old row is revoked and points at its replacement. If a revoked token is
-- ever presented again, it was stolen or replayed, and every session of that user is revoked.
--
-- Sessions belong to a user, not an organisation, so this table has no org_id and no RLS.
-- =============================================================================

create table user_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users (id) on delete cascade,
  refresh_token_hash  text not null unique,
  user_agent          text,
  ip                  inet,
  created_at          timestamptz not null default now(),
  last_used_at        timestamptz not null default now(),
  expires_at          timestamptz not null,
  revoked_at          timestamptz,
  replaced_by         uuid references user_sessions (id) on delete set null
);
create index user_sessions_user_idx on user_sessions (user_id) where revoked_at is null;
create index user_sessions_expiry_idx on user_sessions (expires_at);
