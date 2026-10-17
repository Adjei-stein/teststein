// Loads every migration into an in-process PostgreSQL (PGlite) and checks constraints,
// cross-tenant foreign keys and row-level security. Run with: npm test -w @teststein/db
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migDir = fileURLToPath(new URL('../migrations', import.meta.url));
const migrations = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
const db = new PGlite({ extensions: { citext } });
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const expectError = async (name, sql, match) => {
  try { await db.exec(sql); ok(name, false, 'no error raised'); }
  catch (e) { ok(name, !match || e.message.includes(match), e.message.split('\n')[0]); }
};

console.log((await db.query('select version()')).rows[0].version);
for (const f of migrations) { await db.exec(readFileSync(join(migDir, f), 'utf8')); ok(`migration ${f} loads`, true); }

// Seed as superuser (bypasses RLS).
const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';
const U1 = '00000000-0000-0000-0000-000000000001';
await db.exec(`
  insert into users (id, email, name) values ('${U1}', 'Paul@Example.com', 'Paul');
  insert into organizations (id, name, slug) values ('${ORG_A}', 'Acme', 'acme'), ('${ORG_B}', 'Globex', 'globex');
  insert into org_members values ('${ORG_A}', '${U1}', 'owner', now());
  insert into projects (id, org_id, key, name, app_type) values
    ('00000000-0000-0000-0000-0000000000a1', '${ORG_A}', 'SHOP', 'ShopInn', 'mobile'),
    ('00000000-0000-0000-0000-0000000000b1', '${ORG_B}', 'GLX', 'Globex App', 'web');
  insert into environments (id, org_id, project_id, name) values
    ('00000000-0000-0000-0000-0000000000a2', '${ORG_A}', '00000000-0000-0000-0000-0000000000a1', 'Staging');
  insert into test_cases (id, org_id, project_id, number, title) values
    ('00000000-0000-0000-0000-0000000000a3', '${ORG_A}', '00000000-0000-0000-0000-0000000000a1', 1, 'Login works');
  insert into script_sources (id, org_id, project_id, name, kind) values
    ('00000000-0000-0000-0000-0000000000a4', '${ORG_A}', '00000000-0000-0000-0000-0000000000a1', 'uploads', 'upload');
`);
ok('seed data inserts', true);

// citext email uniqueness
await expectError('emails are case-insensitive unique', `insert into users (email, name) values ('paul@example.com', 'Dup')`, 'duplicate key');

// Cross-tenant reference blocked by composite FK.
await expectError('cannot attach org B row to org A project',
  `insert into test_cases (org_id, project_id, number, title) values ('${ORG_B}', '00000000-0000-0000-0000-0000000000a1', 2, 'sneaky')`,
  'foreign key');

// Constraints
await expectError('project key format enforced',
  `insert into projects (org_id, key, name, app_type) values ('${ORG_A}', 'bad key', 'x', 'web')`, 'check');
await expectError('git source requires connection + repo',
  `insert into script_sources (org_id, project_id, name, kind) values ('${ORG_A}', '00000000-0000-0000-0000-0000000000a1', 'g', 'git')`, 'check');
await expectError('java job requires maven/gradle',
  `insert into job_definitions (org_id, project_id, source_id, name, framework) values ('${ORG_A}', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 'j', 'testng')`, 'check');
await expectError('pytest job cannot use npm',
  `insert into job_definitions (org_id, project_id, source_id, name, framework, build_tool) values ('${ORG_A}', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 'p', 'pytest', 'npm')`, 'check');
await expectError('unknown library rejected',
  `insert into job_definitions (org_id, project_id, source_id, name, framework, libraries) values ('${ORG_A}', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 'x', 'pytest', '{webdriverio}')`, 'check');

await db.exec(`
  insert into job_definitions (id, org_id, project_id, source_id, name, framework, build_tool, libraries) values
    ('00000000-0000-0000-0000-0000000000a5', '${ORG_A}', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 'Selenium Java', 'junit5', 'maven', '{selenium}'),
    ('00000000-0000-0000-0000-0000000000a6', '${ORG_A}', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 'Load', 'locust', null, '{}');
`);
const langs = (await db.query(`select name, language from job_definitions order by name`)).rows;
ok('language derived from framework', langs[0].language === 'python' && langs[1].language === 'java', JSON.stringify(langs));

await expectError('manual run cannot reference a job definition',
  `insert into test_runs (org_id, project_id, number, name, kind, trigger, job_definition_id) values ('${ORG_A}', '00000000-0000-0000-0000-0000000000a1', 1, 'r', 'manual', 'manual', '00000000-0000-0000-0000-0000000000a5')`, 'check');

// Run → execution → result → artifact, then ON DELETE SET NULL (col) behaviour.
await db.exec(`
  insert into test_runs (id, org_id, project_id, number, name, kind, trigger, environment_id, job_definition_id) values
    ('00000000-0000-0000-0000-0000000000a7', '${ORG_A}', '00000000-0000-0000-0000-0000000000a1', 1, 'Nightly', 'automated', 'schedule', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a5');
  insert into executions (id, org_id, test_run_id) values ('00000000-0000-0000-0000-0000000000a8', '${ORG_A}', '00000000-0000-0000-0000-0000000000a7');
  insert into test_results (org_id, test_run_id, execution_id, test_case_id, name, status) values
    ('${ORG_A}', '00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000a3', 'LoginTest.valid', 'passed');
  delete from environments where id = '00000000-0000-0000-0000-0000000000a2';
`);
const run = (await db.query(`select environment_id, org_id from test_runs where id = '00000000-0000-0000-0000-0000000000a7'`)).rows[0];
ok('deleting environment nulls run.environment_id but keeps org_id', run.environment_id === null && run.org_id === ORG_A);

await expectError('execution shard index must be < total',
  `insert into executions (org_id, test_run_id, shard_index, shard_total) values ('${ORG_A}', '00000000-0000-0000-0000-0000000000a7', 2, 2)`, 'check');

// updated_at trigger
await db.exec(`update projects set updated_at = '2000-01-01' where key = 'SHOP'; update projects set name = 'ShopInn 2' where key = 'SHOP';`);
const upd = (await db.query(`select updated_at > '2001-01-01' as fresh from projects where key = 'SHOP'`)).rows[0];
ok('updated_at trigger fires', upd.fresh);

// Hosted runner must not have org; self-hosted must.
await expectError('self-hosted runner needs an org',
  `insert into runners (name, kind, token_hash) values ('r', 'self_hosted', 'h1')`, 'check');
await db.exec(`
  insert into runners (org_id, name, kind, token_hash) values ('${ORG_A}', 'acme-box', 'self_hosted', 'h2'), ('${ORG_B}', 'globex-box', 'self_hosted', 'h3');
  insert into runners (name, kind, token_hash) values ('hosted-1', 'hosted', 'h4');
`);


// ---- 002 API testing ----
const P = '00000000-0000-0000-0000-0000000000a1';
await db.exec(`
  insert into api_collections (id, org_id, project_id, name) values
    ('00000000-0000-0000-0000-0000000000c1', '${ORG_A}', '${P}', 'Payments API'),
    ('00000000-0000-0000-0000-0000000000c2', '${ORG_A}', '${P}', 'Users API');
  insert into api_folders (id, org_id, collection_id, name) values
    ('00000000-0000-0000-0000-0000000000f1', '${ORG_A}', '00000000-0000-0000-0000-0000000000c1', 'Auth');
  insert into api_requests (id, org_id, collection_id, folder_id, name, method, url, body, assertions, extract) values
    ('00000000-0000-0000-0000-0000000000e1', '${ORG_A}', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1',
     'Login', 'POST', '{{base_url}}/login', '{"mode":"json","content":{"user":"a"}}',
     '[{"source":"status","operator":"equals","expected":200}]', '[{"variable":"token","source":"body","path":"$.token"}]');
`);
ok('collection, folder and request insert', true);
await expectError('request cannot sit in a folder of another collection',
  `insert into api_requests (org_id, collection_id, folder_id, name, url) values ('${ORG_A}', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000f1', 'x', '/x')`, 'foreign key');
await expectError('unknown body mode rejected',
  `insert into api_requests (org_id, collection_id, name, url, body) values ('${ORG_A}', '00000000-0000-0000-0000-0000000000c1', 'x', '/x', '{"mode":"soap"}')`, 'check');
await expectError('unknown HTTP method rejected',
  `insert into api_requests (org_id, collection_id, name, method, url) values ('${ORG_A}', '00000000-0000-0000-0000-0000000000c1', 'x', 'FETCH', '/x')`, 'check');
await expectError('api job must reference a collection, not a source',
  `insert into job_definitions (org_id, project_id, source_id, name, framework) values ('${ORG_A}', '${P}', '00000000-0000-0000-0000-0000000000a4', 'api1', 'api')`, 'job_definitions_target_check');
await expectError('api job cannot have a build tool',
  `insert into job_definitions (org_id, project_id, api_collection_id, name, framework, build_tool) values ('${ORG_A}', '${P}', '00000000-0000-0000-0000-0000000000c1', 'api2', 'api', 'npm')`, 'job_definitions_toolchain_check');
await expectError('script job cannot reference a collection',
  `insert into job_definitions (org_id, project_id, source_id, api_collection_id, name, framework) values ('${ORG_A}', '${P}', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000c1', 'p2', 'pytest')`, 'job_definitions_target_check');
await db.exec(`insert into job_definitions (id, org_id, project_id, api_collection_id, name, framework) values
  ('00000000-0000-0000-0000-0000000000a9', '${ORG_A}', '${P}', '00000000-0000-0000-0000-0000000000c1', 'Payments API run', 'api')`);
const apiLang = (await db.query(`select language from job_definitions where framework = 'api'`)).rows[0].language;
ok('api job has no language', apiLang === null);

await expectError('config_path requires config_job',
  `insert into job_definitions (org_id, project_id, source_id, name, framework, config_path) values ('${ORG_A}', '${P}', '00000000-0000-0000-0000-0000000000a4', 'c1', 'pytest', 'teststein.yml')`, 'check');
await db.exec(`insert into job_definitions (org_id, project_id, source_id, name, framework, config_path, config_job) values ('${ORG_A}', '${P}', '00000000-0000-0000-0000-0000000000a4', 'c2', 'pytest', 'teststein.yml', 'smoke')`);
await expectError('same job key in same file only once',
  `insert into job_definitions (org_id, project_id, source_id, name, framework, config_path, config_job) values ('${ORG_A}', '${P}', '00000000-0000-0000-0000-0000000000a4', 'c3', 'pytest', 'teststein.yml', 'smoke')`, 'duplicate key');

await db.exec(`
  insert into test_runs (id, org_id, project_id, number, name, kind, trigger, job_definition_id) values
    ('00000000-0000-0000-0000-0000000000d1', '${ORG_A}', '${P}', 2, 'API run', 'automated', 'manual', '00000000-0000-0000-0000-0000000000a9');
  insert into test_results (id, org_id, test_run_id, name, status) values
    ('00000000-0000-0000-0000-0000000000d2', '${ORG_A}', '00000000-0000-0000-0000-0000000000d1', 'Auth / Login', 'passed'),
    ('00000000-0000-0000-0000-0000000000d3', '${ORG_A}', '00000000-0000-0000-0000-0000000000d1', 'Auth / Login (timeout)', 'failed');
  insert into api_request_results (test_result_id, org_id, request_id, method, url, status_code, response_time_ms) values
    ('00000000-0000-0000-0000-0000000000d2', '${ORG_A}', '00000000-0000-0000-0000-0000000000e1', 'POST', 'https://staging/login', 200, 87);
`);
await expectError('result needs a status code or an error kind, not both/neither',
  `insert into api_request_results (test_result_id, org_id, method, url) values ('00000000-0000-0000-0000-0000000000d3', '${ORG_A}', 'POST', 'https://staging/login')`, 'check');
await db.exec(`insert into api_request_results (test_result_id, org_id, method, url, error_kind) values ('00000000-0000-0000-0000-0000000000d3', '${ORG_A}', 'POST', 'https://staging/login', 'timeout')`);
await db.exec(`delete from api_requests where id = '00000000-0000-0000-0000-0000000000e1'`);
const kept = (await db.query(`select count(*)::int n from api_request_results where request_id is null`)).rows[0].n;
ok('deleting a request keeps its past results', kept === 2);
await db.exec(`delete from api_collections where id = '00000000-0000-0000-0000-0000000000c1'`);
const jobGone = (await db.query(`select count(*)::int n from job_definitions where framework = 'api'`)).rows[0].n;
const runKept = (await db.query(`select job_definition_id from test_runs where id = '00000000-0000-0000-0000-0000000000d1'`)).rows[0];
ok('deleting a collection removes its job but keeps run history', jobGone === 0 && runKept.job_definition_id === null);

// ---- RLS as an application role ----
await db.exec(`
  create role teststein_app;
  grant select, insert, update, delete on all tables in schema public to teststein_app;
  set role teststein_app;
`);
const count = async (t) => Number((await db.query(`select count(*)::int as n from ${t}`)).rows[0].n);

ok('no org set → sees no projects', (await count('projects')) === 0);
ok('no org set → sees no organizations', (await count('organizations')) === 0);

await db.exec(`set app.user_id = '${U1}'`);
const myOrgs = (await db.query(`select slug from organizations`)).rows.map(r => r.slug);
ok('user only (no org) → lists own orgs for the switcher', JSON.stringify(myOrgs) === '["acme"]', JSON.stringify(myOrgs));
ok('user only → still no project access', (await count('projects')) === 0);

await db.exec(`set app.org_id = '${ORG_A}'`);
ok('org A → sees 1 project', (await count('projects')) === 1);
ok('org A → sees own + hosted runners (2)', (await count('runners')) === 2);
await expectError('org A cannot insert a row tagged org B',
  `insert into projects (org_id, key, name, app_type) values ('${ORG_B}', 'HACK', 'x', 'web')`, 'row-level security');
const hostedUpdate = await db.query(`update runners set name = 'mine' where kind = 'hosted' returning id`);
ok('org A update of hosted runner affects 0 rows', hostedUpdate.rows.length === 0);
const hostedName = (await db.query(`select name from runners where kind='hosted'`)).rows[0].name;
ok('…hosted runner unchanged', hostedName === 'hosted-1');

await db.exec(`set app.org_id = '${ORG_B}'`);
ok('org B → sees only its project', (await count('projects')) === 1 &&
  (await db.query(`select key from projects`)).rows[0].key === 'GLX');
ok('org B → cannot see org A test results', (await count('test_results')) === 0);
ok('org B → cannot see org A API collections', (await count('api_collections')) === 0);
ok('org B → cannot see org A API results', (await count('api_request_results')) === 0);
await db.exec(`set app.org_id = '${ORG_A}'`);
ok('org A → sees its API collection', (await count('api_collections')) === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
