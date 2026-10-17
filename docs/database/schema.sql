-- =============================================================================
-- Teststein — database schema, phases 0–2
--   Phase 0: identity, organisations, projects, environments, secrets
--   Phase 1: test library (suites, cases, versions), script sources
--   Phase 2: runners, job definitions, schedules, runs, executions, results
--
-- Target: PostgreSQL 15+ (uses UNIQUE NULLS NOT DISTINCT and ON DELETE SET NULL (col)).
--
-- Conventions
--   * UUID primary keys; timestamptz everywhere.
--   * Every tenant-owned table has org_id NOT NULL and UNIQUE (org_id, id).
--     Child tables reference parents with composite keys (org_id, parent_id), so
--     the database itself refuses rows that point across organisations.
--   * Row-level security on every tenant table (see bottom of file). The API sets
--     `SET LOCAL app.org_id = '<uuid>'` at the start of each transaction.
--   * Status-like columns are text + CHECK rather than enums, so values can be
--     added and removed in later migrations without enum surgery.
--   * Large blobs (scripts, logs, screenshots, videos) live in object storage;
--     tables hold the storage key only.
-- =============================================================================

create extension if not exists citext;

-- Keeps updated_at current on any table that has it.
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- =============================================================================
-- PHASE 0 — Identity & tenancy
-- =============================================================================

-- Users are global: one person can belong to several organisations.
create table users (
  id                 uuid primary key default gen_random_uuid(),
  email              citext not null unique,
  name               text not null,
  password_hash      text,                       -- null for SSO-only accounts
  avatar_url         text,
  email_verified_at  timestamptz,
  last_login_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        citext not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  plan        text not null default 'free',      -- billing tier, used for quotas later
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                         -- soft delete; hard-purge after retention window
);

create table org_members (
  org_id     uuid not null references organizations (id) on delete cascade,
  user_id    uuid not null references users (id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  joined_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on org_members (user_id);

create table org_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  email        citext not null,
  role         text not null check (role in ('admin', 'member', 'viewer')),
  token_hash   text not null unique,              -- store a hash, never the raw token
  invited_by   uuid references users (id) on delete set null,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index org_invitations_org_idx on org_invitations (org_id);

-- Personal or service tokens for the public API and CI integrations.
create table api_tokens (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  user_id       uuid references users (id) on delete cascade,   -- null = org service token
  name          text not null,
  token_prefix  text not null,                    -- first chars, shown in UI to identify the token
  token_hash    text not null unique,
  scopes        text[] not null default '{}',     -- e.g. {runs:write, results:write}
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index api_tokens_org_idx on api_tokens (org_id);

-- Append-only record of who did what. Cheap to add now, painful to backfill later.
create table audit_log (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references organizations (id) on delete cascade,
  actor_id     uuid references users (id) on delete set null,
  action       text not null,                     -- e.g. 'project.created', 'secret.updated'
  entity_type  text not null,
  entity_id    uuid,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index audit_log_org_time_idx on audit_log (org_id, created_at desc);


-- =============================================================================
-- PHASE 0 — Projects, environments, secrets
-- =============================================================================

create table projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  key          text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),   -- e.g. SHOP → case SHOP-123
  name         text not null,
  description  text not null default '',
  app_type     text not null check (app_type in ('web', 'mobile', 'api', 'desktop')),
  start_date   date,
  end_date     date,
  case_seq     integer not null default 0,        -- last allocated test case number
  run_seq      integer not null default 0,        -- last allocated run number
  created_by   uuid references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (org_id, id),
  unique (org_id, key),
  check (end_date is null or start_date is null or end_date >= start_date)
);

-- Optional per-project role overrides; without a row, the org role applies.
create table project_members (
  org_id      uuid not null,
  project_id  uuid not null,
  user_id     uuid not null references users (id) on delete cascade,
  role        text not null check (role in ('lead', 'tester', 'viewer')),
  primary key (project_id, user_id),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade
);

-- People who receive run reports. Not necessarily platform users.
create table project_stakeholders (
  org_id      uuid not null,
  project_id  uuid not null,
  email       citext not null,
  primary key (project_id, email),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade
);

create table environments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  project_id  uuid not null,
  name        text not null,                      -- Development, QA, Staging, Production…
  base_url    text,
  variables   jsonb not null default '{}',        -- non-secret key/values only
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, id),
  unique (project_id, name),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade
);

-- Encrypted at the application layer (envelope encryption); the DB never sees plaintext.
-- Scope: org-wide (project_id null), project-wide (environment_id null) or one environment.
create table secrets (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  project_id       uuid,
  environment_id   uuid,
  name             text not null check (name ~ '^[A-Z_][A-Z0-9_]*$'),
  encrypted_value  bytea not null,
  key_version      integer not null,              -- which encryption key wrapped it, for rotation
  created_by       uuid references users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique nulls not distinct (org_id, project_id, environment_id, name),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade,
  foreign key (org_id, environment_id) references environments (org_id, id) on delete cascade,
  check (environment_id is null or project_id is not null)
);


-- =============================================================================
-- PHASE 1 — Test library
-- =============================================================================

create table test_suites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  project_id  uuid not null,
  parent_id   uuid,                               -- null = top level
  name        text not null,
  position    integer not null default 0,         -- order among siblings
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade,
  foreign key (org_id, parent_id) references test_suites (org_id, id) on delete cascade
);
create index test_suites_project_idx on test_suites (project_id, parent_id, position);

create table test_cases (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  project_id         uuid not null,
  suite_id           uuid,
  number             integer not null,            -- shown as <project.key>-<number>
  title              text not null,
  preconditions      text not null default '',
  -- [{ "action": "...", "expected": "..." }, ...]
  steps              jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  priority           text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  type               text not null default 'functional'
                     check (type in ('functional', 'smoke', 'regression', 'api', 'performance', 'security', 'other')),
  status             text not null default 'draft' check (status in ('draft', 'ready', 'needs_update', 'deprecated')),
  automation_status  text not null default 'manual' check (automation_status in ('manual', 'to_automate', 'automated')),
  tags               text[] not null default '{}',
  version            integer not null default 1,
  created_by         uuid references users (id) on delete set null,
  updated_by         uuid references users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (org_id, id),
  unique (project_id, number),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade,
  foreign key (org_id, suite_id) references test_suites (org_id, id) on delete set null (suite_id)
);
create index test_cases_suite_idx on test_cases (suite_id) where deleted_at is null;
create index test_cases_tags_idx on test_cases using gin (tags);

-- Full snapshot per saved version: powers history, diffs and "which version was run".
create table test_case_versions (
  org_id        uuid not null,
  test_case_id  uuid not null,
  version       integer not null,
  snapshot      jsonb not null,
  changed_by    uuid references users (id) on delete set null,
  changed_at    timestamptz not null default now(),
  primary key (test_case_id, version),
  foreign key (org_id, test_case_id) references test_cases (org_id, id) on delete cascade
);


-- =============================================================================
-- PHASE 1 — Script sources (uploads and Git)
-- =============================================================================

-- Org-level link to a Git host. A project can use several repos through one connection.
create table git_connections (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references organizations (id) on delete cascade,
  provider                 text not null check (provider in ('github', 'gitlab', 'bitbucket', 'generic')),
  display_name             text not null,
  external_installation_id text,                  -- GitHub App installation id, etc.
  host_url                 text,                  -- for self-hosted GitLab / generic Git
  credentials_encrypted    bytea,                 -- deploy key, PAT or OAuth refresh token
  key_version              integer,
  created_by               uuid references users (id) on delete set null,
  created_at               timestamptz not null default now(),
  unique (org_id, id)
);

-- A place scripts come from. Both kinds resolve to an immutable snapshot at run time:
-- uploads → a script_versions row, git → a commit SHA (recorded on test_runs).
create table script_sources (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  project_id         uuid not null,
  name               text not null,
  kind               text not null check (kind in ('upload', 'git')),
  git_connection_id  uuid,
  repo               text,                        -- 'owner/name' or full clone URL
  default_ref        text,                        -- branch or tag
  root_path          text not null default '',    -- sub-folder inside the repo or upload
  created_by         uuid references users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, id),
  unique (project_id, name),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade,
  foreign key (org_id, git_connection_id) references git_connections (org_id, id),
  check (
    (kind = 'git' and git_connection_id is not null and repo is not null and default_ref is not null)
    or (kind = 'upload' and git_connection_id is null and repo is null)
  )
);

-- Each upload is a new immutable version (a zip in object storage).
create table script_versions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  source_id       uuid not null,
  version         integer not null,
  storage_key     text not null,
  content_sha256  text not null,
  size_bytes      bigint not null check (size_bytes >= 0),
  notes           text not null default '',
  uploaded_by     uuid references users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (org_id, id),
  unique (source_id, version),
  foreign key (org_id, source_id) references script_sources (org_id, id) on delete cascade
);


-- =============================================================================
-- PHASE 2 — Runners
-- =============================================================================

-- org_id null = a hosted runner operated by the platform (SaaS, later).
-- Self-hosted runners belong to exactly one organisation.
create table runners (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid references organizations (id) on delete cascade,
  name               text not null,
  kind               text not null check (kind in ('self_hosted', 'hosted')),
  -- Capabilities the agent advertises on registration and heartbeat, e.g.
  -- {linux, x64, docker, kvm, android:emulator, android:device:pixel-7}
  labels             text[] not null default '{}',
  os                 text,
  arch               text,
  agent_version      text,
  status             text not null default 'offline' check (status in ('online', 'offline', 'draining', 'disabled')),
  max_concurrency    integer not null default 1 check (max_concurrency > 0),
  token_hash         text not null unique,        -- the agent authenticates with this
  last_heartbeat_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((kind = 'hosted') = (org_id is null))
);
create index runners_org_idx on runners (org_id);
create index runners_labels_idx on runners using gin (labels);

-- Short-lived tokens an admin generates to register a new self-hosted runner.
create table runner_registration_tokens (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  token_hash  text not null unique,
  created_by  uuid references users (id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);


-- =============================================================================
-- PHASE 2 — Job definitions & schedules
-- =============================================================================

-- What to run and how: the stored form of a teststein.yml job.
-- For git sources with config_path set, `config` is a cache refreshed from the repo
-- on each run; otherwise it is edited in the UI and is the source of truth.
create table job_definitions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  project_id   uuid not null,
  source_id    uuid not null,
  name         text not null,
  -- The test runner. Playwright/Selenium/Appium in Python run under pytest, in Java
  -- under junit5/testng; 'playwright' here means the Playwright Test runner (Node).
  framework    text not null check (framework in
               ('pytest', 'mocha', 'playwright', 'cypress', 'junit5', 'testng', 'locust')),
  language     text generated always as (case
                 when framework in ('pytest', 'locust') then 'python'
                 when framework in ('junit5', 'testng') then 'java'
                 else 'javascript' end) stored,
  build_tool   text check (build_tool in ('pip', 'npm', 'maven', 'gradle')),
  -- Libraries layered on top of the runner; select runner images and services.
  libraries    text[] not null default '{}'       -- e.g. {selenium}, {appium}, {playwright}
               check (libraries <@ array['selenium', 'appium', 'playwright']),
  config_path  text,                              -- e.g. 'teststein.yml' inside the source
  -- { image, install, command, services[], results{junit}, artifacts[], env{},
  --   timeout, shards, retries, load{users,spawn_rate,duration,workers}, thresholds{} }
  config       jsonb not null default '{}',
  runs_on      text[] not null default '{}',      -- required runner labels
  created_by   uuid references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (org_id, id),
  unique (project_id, name),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade,
  foreign key (org_id, source_id) references script_sources (org_id, id),
  -- Java needs Maven or Gradle; Python and Node default to pip / npm when null.
  check (
    (language = 'java'       and coalesce(build_tool, '') in ('maven', 'gradle'))
    or (language = 'python'     and coalesce(build_tool, 'pip') = 'pip')
    or (language = 'javascript' and coalesce(build_tool, 'npm') = 'npm')
  )
);

-- Maps automated test names (as reported in JUnit XML) to library test cases, so an
-- automated result updates the case it covers.
create table test_case_automation_links (
  org_id             uuid not null,
  test_case_id       uuid not null,
  job_definition_id  uuid not null,
  match_name         text not null,               -- e.g. 'tests/test_login.py::test_valid_login'
  primary key (job_definition_id, match_name),
  foreign key (org_id, test_case_id) references test_cases (org_id, id) on delete cascade,
  foreign key (org_id, job_definition_id) references job_definitions (org_id, id) on delete cascade
);
create index test_case_automation_links_case_idx on test_case_automation_links (test_case_id);

create table schedules (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  job_definition_id  uuid not null,
  environment_id     uuid,
  cron               text not null,
  timezone           text not null default 'UTC',
  ref                text,                        -- git branch override; null = source default
  enabled            boolean not null default true,
  next_run_at        timestamptz,
  created_by         uuid references users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (org_id, job_definition_id) references job_definitions (org_id, id) on delete cascade,
  foreign key (org_id, environment_id) references environments (org_id, id) on delete set null (environment_id)
);
create index schedules_due_idx on schedules (next_run_at) where enabled;


-- =============================================================================
-- PHASE 2 — Runs, executions, results, artifacts
-- =============================================================================

-- A run is what users see in "Recent test runs". Manual runs have no executions;
-- automated runs have one or more (shards and retries).
create table test_runs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  project_id         uuid not null,
  number             integer not null,            -- per project, shown as run #42
  name               text not null,
  kind               text not null check (kind in ('manual', 'automated')),
  trigger            text not null check (trigger in ('manual', 'schedule', 'api', 'git_push', 'git_pr', 'rerun')),
  status             text not null default 'queued'
                     check (status in ('queued', 'running', 'passed', 'failed', 'cancelled', 'error')),
  environment_id     uuid,
  job_definition_id  uuid,
  -- Exactly what was run: an upload version, or a git ref + commit.
  script_version_id  uuid,
  git_ref            text,
  commit_sha         text check (commit_sha ~ '^[0-9a-f]{40}$'),
  pull_request       integer,
  parent_run_id      uuid,                        -- set when this is a re-run of failures
  config_snapshot    jsonb,                       -- resolved job config at trigger time
  -- Denormalised counts, updated as results arrive, so lists and dashboards stay cheap.
  total_count        integer not null default 0,
  passed_count       integer not null default 0,
  failed_count       integer not null default 0,
  blocked_count      integer not null default 0,
  skipped_count      integer not null default 0,
  created_by         uuid references users (id) on delete set null,
  created_at         timestamptz not null default now(),
  started_at         timestamptz,
  finished_at        timestamptz,
  unique (org_id, id),
  unique (project_id, number),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade,
  foreign key (org_id, environment_id) references environments (org_id, id) on delete set null (environment_id),
  foreign key (org_id, job_definition_id) references job_definitions (org_id, id) on delete set null (job_definition_id),
  foreign key (org_id, script_version_id) references script_versions (org_id, id) on delete set null (script_version_id),
  foreign key (org_id, parent_run_id) references test_runs (org_id, id) on delete set null (parent_run_id),
  check (kind = 'automated' or job_definition_id is null)
);
create index test_runs_project_time_idx on test_runs (project_id, created_at desc);
create index test_runs_org_time_idx on test_runs (org_id, created_at desc);

-- One job on one runner. The queue (Redis/NATS) carries execution ids; this table is
-- the source of truth if the queue is lost.
create table executions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  test_run_id      uuid not null,
  shard_index      integer not null default 0,
  shard_total      integer not null default 1,
  attempt          integer not null default 1,
  runner_id        uuid references runners (id) on delete set null,
  required_labels  text[] not null default '{}',
  status           text not null default 'queued'
                   check (status in ('queued', 'assigned', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out', 'error')),
  exit_code        integer,
  error_message    text,
  log_storage_key  text,                          -- full log, written when the job ends
  queued_at        timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  -- Runner-reported usage; feeds quotas and billing later.
  cpu_seconds      numeric,
  peak_memory_mb   integer,
  unique (org_id, id),
  unique (test_run_id, shard_index, attempt),
  foreign key (org_id, test_run_id) references test_runs (org_id, id) on delete cascade,
  check (shard_index >= 0 and shard_index < shard_total)
);
create index executions_queue_idx on executions (queued_at) where status = 'queued';
create index executions_runner_idx on executions (runner_id) where status in ('assigned', 'running');

-- One row per test per run. Manual runs pre-create rows as 'untested' (with assignee);
-- automated runs insert rows as JUnit results are parsed.
create table test_results (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  test_run_id     uuid not null,
  execution_id    uuid,
  test_case_id    uuid,                           -- null if an automated test isn't linked to a case
  test_case_version integer,                      -- which version of the case was executed
  name            text not null,                  -- case title, or JUnit classname + name
  suite_name      text,
  status          text not null default 'untested'
                  check (status in ('untested', 'passed', 'failed', 'blocked', 'skipped', 'retest')),
  duration_ms     integer check (duration_ms >= 0),
  error_message   text,
  stack_trace     text,
  -- Manual runs: [{ "status": "passed", "actual": "..." }, ...] aligned with the case's steps.
  step_results    jsonb,
  comment         text,
  assigned_to     uuid references users (id) on delete set null,
  executed_by     uuid references users (id) on delete set null,
  executed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, test_run_id) references test_runs (org_id, id) on delete cascade,
  foreign key (org_id, execution_id) references executions (org_id, id) on delete set null (execution_id),
  foreign key (org_id, test_case_id) references test_cases (org_id, id) on delete set null (test_case_id)
);
create index test_results_run_idx on test_results (test_run_id, status);
create index test_results_case_history_idx on test_results (test_case_id, executed_at desc) where test_case_id is not null;
create index test_results_assignee_idx on test_results (assigned_to) where status = 'untested';

create table artifacts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  test_run_id     uuid not null,
  execution_id    uuid,
  test_result_id  uuid,                           -- e.g. a failure screenshot for one test
  kind            text not null check (kind in ('log', 'screenshot', 'video', 'trace', 'report', 'junit', 'other')),
  name            text not null,
  storage_key     text not null,
  content_type    text not null,
  size_bytes      bigint not null check (size_bytes >= 0),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,                    -- retention, depends on plan
  foreign key (org_id, test_run_id) references test_runs (org_id, id) on delete cascade,
  foreign key (org_id, execution_id) references executions (org_id, id) on delete cascade,
  foreign key (org_id, test_result_id) references test_results (org_id, id) on delete cascade
);
create index artifacts_run_idx on artifacts (test_run_id);
create index artifacts_expiry_idx on artifacts (expires_at) where expires_at is not null;


-- =============================================================================
-- updated_at triggers
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'users', 'organizations', 'projects', 'environments', 'secrets', 'test_suites',
    'test_cases', 'script_sources', 'runners', 'job_definitions', 'schedules', 'test_results'
  ] loop
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_updated_at', t);
  end loop;
end;
$$;


-- =============================================================================
-- Row-level security
--
-- The API connects as a non-owner role (e.g. `teststein_app`) and runs
--   begin; set local app.org_id = '<current org uuid>'; ...; commit;
--   set local app.user_id = '<signed-in user uuid>';
-- so every query is confined to one organisation even if a WHERE clause is forgotten.
-- app.user_id alone (no org yet) is enough to list the user's own organisations.
-- Cross-org work (token lookups at auth time, signup, runner dispatch, retention
-- jobs) uses a separate role with BYPASSRLS, kept out of request-handling code.
-- =============================================================================

create function current_org_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

create function current_app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'org_invitations', 'api_tokens', 'audit_log',
    'projects', 'project_members', 'project_stakeholders', 'environments', 'secrets',
    'test_suites', 'test_cases', 'test_case_versions',
    'git_connections', 'script_sources', 'script_versions',
    'runner_registration_tokens', 'job_definitions', 'test_case_automation_links', 'schedules',
    'test_runs', 'executions', 'test_results', 'artifacts'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (org_id = current_org_id()) with check (org_id = current_org_id())', t);
  end loop;
end;
$$;

-- Memberships: a user can always read their own rows (for the org switcher);
-- everything else is scoped to the current org.
alter table org_members enable row level security;
alter table org_members force row level security;
create policy own_memberships on org_members for select
  using (user_id = current_app_user_id());
create policy tenant_isolation on org_members
  using (org_id = current_org_id()) with check (org_id = current_org_id());

alter table organizations enable row level security;
alter table organizations force row level security;
create policy member_read on organizations for select
  using (id in (select org_id from org_members where user_id = current_app_user_id()));
create policy tenant_isolation on organizations
  using (id = current_org_id()) with check (id = current_org_id());

-- Orgs see their own runners plus platform-hosted ones (read-only).
alter table runners enable row level security;
alter table runners force row level security;
create policy tenant_read on runners for select
  using (org_id = current_org_id() or org_id is null);
create policy tenant_write on runners for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());
