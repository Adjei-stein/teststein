-- =============================================================================
-- Teststein — migration 002: API functional testing (phase 3)
--
-- Users build HTTP/GraphQL requests in the UI, group them into collections and
-- folders, add assertions and chain values between requests. Collections run on
-- runners like any other job (framework 'api' in job_definitions), so they can reach
-- internal APIs, use schedules and CI triggers, and produce normal test_runs/results.
--
-- When a run starts, the resolved collection is copied into test_runs.config_snapshot,
-- so later edits never change what a past run executed.
--
-- Values may contain {{variables}}, resolved on the runner in this order:
-- values extracted earlier in the run → environment variables → collection variables.
-- {{secrets.NAME}} is resolved on the runner only and masked in stored results.
-- =============================================================================

create table api_collections (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  project_id   uuid not null,
  name         text not null,
  description  text not null default '',
  -- Default auth for every request unless overridden (see "auth" shape in README).
  auth         jsonb not null default '{"type": "none"}' check (jsonb_typeof(auth) = 'object'),
  -- Default variables: {"name": "value"}; environments override them.
  variables    jsonb not null default '{}' check (jsonb_typeof(variables) = 'object'),
  -- {timeout_ms, follow_redirects, verify_tls, stop_on_failure}
  settings     jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  imported_from text check (imported_from in ('postman', 'openapi', 'insomnia', 'har', 'curl')),
  created_by   uuid references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id),
  unique (project_id, name),
  foreign key (org_id, project_id) references projects (org_id, id) on delete cascade
);

create table api_folders (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  collection_id  uuid not null,
  parent_id      uuid,                            -- null = top level of the collection
  name           text not null,
  position       integer not null default 0,
  auth           jsonb check (auth is null or jsonb_typeof(auth) = 'object'),   -- null = inherit
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, collection_id, id),
  foreign key (org_id, collection_id) references api_collections (org_id, id) on delete cascade,
  -- A sub-folder must be in the same collection as its parent.
  foreign key (org_id, collection_id, parent_id) references api_folders (org_id, collection_id, id) on delete cascade
);
create index api_folders_tree_idx on api_folders (collection_id, parent_id, position);

create table api_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  collection_id  uuid not null,
  folder_id      uuid,                            -- null = top level of the collection
  name           text not null,
  position       integer not null default 0,      -- run order within its folder
  protocol       text not null default 'http' check (protocol in ('http', 'graphql')),
  method         text not null default 'GET'
                 check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  url            text not null,                   -- may contain {{variables}}
  -- [{ "key": "page", "value": "1", "enabled": true }]
  query_params   jsonb not null default '[]' check (jsonb_typeof(query_params) = 'array'),
  headers        jsonb not null default '[]' check (jsonb_typeof(headers) = 'array'),
  -- { "mode": "json", "content": {...} } — see README for every mode
  body           jsonb not null default '{"mode": "none"}'
                 check (body ->> 'mode' in ('none', 'json', 'text', 'xml', 'form_urlencoded', 'multipart', 'graphql')),
  auth           jsonb check (auth is null or jsonb_typeof(auth) = 'object'),   -- null = inherit
  -- [{ "source": "status", "operator": "equals", "expected": 200 }, ...]
  assertions     jsonb not null default '[]' check (jsonb_typeof(assertions) = 'array'),
  -- Values to capture for later requests (chaining):
  -- [{ "variable": "token", "source": "body", "path": "$.access_token" }]
  extract        jsonb not null default '[]' check (jsonb_typeof(extract) = 'array'),
  timeout_ms     integer check (timeout_ms between 1 and 300000),   -- null = collection setting
  -- Optional link to a library test case, so results appear in that case's history.
  test_case_id   uuid,
  created_by     uuid references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, collection_id) references api_collections (org_id, id) on delete cascade,
  -- The folder must belong to the same collection.
  foreign key (org_id, collection_id, folder_id) references api_folders (org_id, collection_id, id) on delete cascade,
  foreign key (org_id, test_case_id) references test_cases (org_id, id) on delete set null (test_case_id)
);
create index api_requests_order_idx on api_requests (collection_id, folder_id, position);

-- Collections run through job_definitions (framework = 'api'), giving them schedules,
-- CI triggers, environments and runner selection for free.
alter table job_definitions
  add constraint job_definitions_api_collection_fkey
  foreign key (org_id, api_collection_id) references api_collections (org_id, id) on delete cascade;

-- HTTP details for one request in one run. The pass/fail, duration and error live on
-- the matching test_results row (one row per request executed).
create table api_request_results (
  test_result_id        uuid primary key,
  org_id                uuid not null,
  request_id            uuid,                     -- null if the request was later deleted
  iteration             integer not null default 1,   -- for data-driven runs (later)
  method                text not null,
  url                   text not null,            -- resolved URL, secrets masked
  request_headers       jsonb not null default '{}',  -- secrets masked
  request_body_preview  text,                     -- first 64 KB, secrets masked
  status_code           integer check (status_code between 100 and 599),
  response_time_ms      integer check (response_time_ms >= 0),
  response_size_bytes   bigint check (response_size_bytes >= 0),
  response_headers      jsonb,
  response_body_preview text,                     -- first 64 KB
  response_body_key     text,                     -- full body in object storage, if larger
  -- Network failures, when no response came back.
  error_kind            text check (error_kind in ('dns', 'connect', 'tls', 'timeout', 'reset', 'invalid_request', 'other')),
  -- [{ "assertion": {...}, "passed": false, "actual": 500, "message": "expected 200" }]
  assertion_results     jsonb not null default '[]' check (jsonb_typeof(assertion_results) = 'array'),
  -- Variables captured by `extract` (secret-looking values masked).
  extracted             jsonb not null default '{}',
  foreign key (org_id, test_result_id) references test_results (org_id, id) on delete cascade,
  foreign key (org_id, request_id) references api_requests (org_id, id) on delete set null (request_id),
  check ((status_code is null) = (error_kind is not null))
);
create index api_request_results_request_idx on api_request_results (request_id) where request_id is not null;


-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['api_collections', 'api_folders', 'api_requests'] loop
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_updated_at', t);
  end loop;
end;
$$;

-- Row-level security (same model as 001_core.sql)
do $$
declare t text;
begin
  foreach t in array array['api_collections', 'api_folders', 'api_requests', 'api_request_results'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (org_id = current_org_id()) with check (org_id = current_org_id())', t);
  end loop;
end;
$$;
