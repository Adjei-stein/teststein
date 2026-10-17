-- Runs once when the Postgres container is first created (docker-entrypoint-initdb.d),
-- and in CI. Creates the role the API connects as.
--
-- Migrations run as the database owner (POSTGRES_USER). The API uses `teststein_app`,
-- which is NOT the owner and has no BYPASSRLS, so row-level security always applies.
-- Table privileges are granted to it by the migration script after each run.
-- Change this password anywhere other than local development.
create role teststein_app login password 'teststein_app';
