# `teststein.yml` reference

`teststein.yml` tells Teststein how to run your tests: which framework, how to install
dependencies, what services to start, where the results are, and when to run.

- **Git sources:** commit `teststein.yml` at the root of the script source (or set a different
  path on the source). Teststein reads it on every run, so changes ship with your code.
- **Uploads:** the job form in the UI writes the same structure for you. You never have to touch YAML.

The machine-readable definition is [`teststein.schema.json`](teststein.schema.json)
(JSON Schema 2020-12). [`examples/`](examples) has a working file for every supported
framework, and [`invalid-examples/`](invalid-examples) has files the schema must reject.

## Minimal example

```yaml
version: 1
jobs:
  smoke:
    framework: pytest
```

This installs `requirements.txt`, runs `pytest`, and collects JUnit results, using the defaults below.

## Top level

| Key | Required | Description |
|---|---|---|
| `version` | yes | Always `1`. Bumped only for breaking format changes. |
| `jobs` | yes | Map of job id → job. Ids are lowercase letters, digits, `-` and `_`. **The id is the job's identity:** renaming it starts a new history. Use `name` for the display name. |

## Job keys

| Key | Type | Default | Description |
|---|---|---|---|
| `name` | string | the job id | Display name in the UI. |
| `description` | string | | |
| `framework` | enum | **required** | `pytest`, `mocha`, `playwright`, `cypress`, `junit5`, `testng`, `locust` |
| `build_tool` | enum | per framework | `pip`, `npm`, `maven`, `gradle`. **Required for Java** (`maven` or `gradle`). |
| `libraries` | list | `[]` | `selenium`, `appium`, `playwright`. These are libraries used *inside* the runner, e.g. Selenium under pytest. Picks the right image and validates services. |
| `runtime` | string | latest LTS | `python:3.12`, `node:20`, `java:21`. Must match the framework's language. |
| `image` | string | per framework | Your own container image, replacing the default. |
| `working_directory` | string | source root | Where `install` and `command` run. |
| `install` | string or list | per framework | Dependency installation. Runs before `command`, with caching. |
| `command` | string or list | per framework | Runs the tests. Should write JUnit XML (see defaults). |
| `environment` | string | none | Default project environment, e.g. `Staging`. Can be changed per run. |
| `env` | map | `{}` | Environment variables. Values may use [expressions](#expressions). |
| `services` | list | `[]` | Containers started next to the job. See [services](#services). |
| `runs_on` | list | `[]` | Labels a runner must have, e.g. `[self-hosted, kvm]`. |
| `results.junit` | glob or list | per framework | Where JUnit XML files are written. |
| `artifacts` | list | `[]` | Files to keep: `path` (glob), `kind` (`log`, `screenshot`, `video`, `trace`, `report`, `other`), `when` (`always` or `on_failure`). A plain string means `{path: <string>}`. |
| `timeout` | duration | `60m` | Per execution. Format `90s`, `30m`, `2h`. |
| `retries` | 0–3 | `0` | Re-run a failed execution. Tests that pass on a retry are flagged as flaky. |
| `shards` | 1–50 | `1` | Split the job into parallel executions. See [sharding](#sharding). |
| `cache` | list or `false` | dependency dirs | Extra paths to cache between runs, or `false` to disable caching. |
| `triggers` | map | none | `push`, `pull_request`, `schedule`. See [triggers](#triggers). |
| `load` | map | | **Locust only.** See [load tests](#load-tests-locust). |
| `thresholds` | map | | **Locust only.** |
| `android` | map | | **Required when `libraries` includes `appium`.** See [Android](#android-appium). |

## Framework defaults

Everything here can be overridden. Results go to `teststein-results/` unless noted.

| Framework | Default image | `install` | `command` | `results.junit` |
|---|---|---|---|---|
| `pytest` | `python:<runtime>` | `pip install -r requirements.txt` (if present) | `pytest --junitxml=teststein-results/junit.xml` | `teststein-results/**/*.xml` |
| `mocha` | `node:<runtime>` | `npm ci` | `npx mocha --reporter mocha-junit-reporter --reporter-options mochaFile=teststein-results/junit.xml` ¹ | `teststein-results/**/*.xml` |
| `playwright` | `mcr.microsoft.com/playwright` (version matching `@playwright/test`) | `npm ci` | `npx playwright test --reporter=junit` with `PLAYWRIGHT_JUNIT_OUTPUT_NAME` set | `teststein-results/**/*.xml` |
| `cypress` | `cypress/included` (version matching `cypress`) | `npm ci` | `npx cypress run --reporter junit --reporter-options mochaFile=teststein-results/junit-[hash].xml` | `teststein-results/**/*.xml` |
| `junit5`, `testng` + maven | `maven:3-eclipse-temurin-<runtime>` | (resolved by the build) | `mvn -B test` | `target/surefire-reports/*.xml` |
| `junit5`, `testng` + gradle | `gradle:jdk<runtime>` | (resolved by the build) | `./gradlew test` (or `gradle test` without a wrapper) | `build/test-results/test/*.xml` |
| `locust` | `locustio/locust` | `pip install -r requirements.txt` (if present) | built from `load`; don't set it yourself | stats CSV + HTML report |

¹ `mocha-junit-reporter` must be in your `devDependencies`.

**Default caches:** `~/.cache/pip`, `~/.npm`, `~/.m2/repository`, `~/.gradle/caches`, keyed by
your lockfile (`requirements.txt`, `package-lock.json`, `pom.xml`, `*.gradle*`).

## Expressions

`${{ … }}` inserts values at run time. Expressions are only allowed in **`env` values**
(including a service's `env`). Commands read them as normal environment variables, so
secrets never appear in command lines.

| Expression | Value |
|---|---|
| `${{ secrets.NAME }}` | Secret from the environment, project or organisation (most specific wins). Masked in logs and results. |
| `${{ environment.name }}` | e.g. `Staging` |
| `${{ environment.base_url }}` | The environment's base URL |
| `${{ environment.variables.NAME }}` | An environment variable defined in the UI |
| `${{ run.id }}`, `${{ run.number }}` | The run's id and per-project number |
| `${{ run.ref }}`, `${{ run.commit_sha }}` | Git branch/tag and commit (Git sources) |
| `${{ run.trigger }}` | `manual`, `schedule`, `api`, `git_push`, `git_pr`, `rerun` |

A missing secret or variable fails the run before it starts, with a clear message.
It is never replaced with an empty string.

## Variables every job gets

| Variable | Example |
|---|---|
| `TESTSTEIN` | `true` |
| `TESTSTEIN_RUN_ID`, `TESTSTEIN_RUN_NUMBER` | `…`, `42` |
| `TESTSTEIN_JOB` | `web-regression` |
| `TESTSTEIN_ENVIRONMENT`, `TESTSTEIN_BASE_URL` | `Staging`, `https://staging.example.com` |
| `TESTSTEIN_SHARD`, `TESTSTEIN_SHARD_TOTAL` | `2`, `4` (1-based) |
| `TESTSTEIN_ATTEMPT` | `1` (2+ on retries) |
| `TESTSTEIN_RESULTS_DIR` | `teststein-results` |
| `TESTSTEIN_ANDROID_APP`, `TESTSTEIN_ANDROID_UDID` | Android jobs only: absolute path to the APK and the device id |

## Services

Containers started on a private network with the job, reachable by name.

| Preset | Starts | Reach it at |
|---|---|---|
| `chrome`, `firefox`, `edge` | Selenium standalone browser | `http://<name>:4444` |
| `appium` | Appium 2 server with the UiAutomator2 driver, connected to the job's Android emulator or device | `http://appium:4723` |

Or a custom container:

```yaml
services:
  - name: db
    image: postgres:16
    env:
      POSTGRES_PASSWORD: ${{ secrets.TEST_DB_PASSWORD }}
```

To test on several browsers, define one job per browser (see
[`java-testng-selenium.yml`](examples/java-testng-selenium.yml)). Each one gets its own results and history.

## Sharding

With `shards: N`, Teststein starts N executions in parallel, each with `TESTSTEIN_SHARD`
and `TESTSTEIN_SHARD_TOTAL` set, and merges the results into one run. The framework does the splitting:

| Framework | How to split |
|---|---|
| Playwright | `npx playwright test --shard=$TESTSTEIN_SHARD/$TESTSTEIN_SHARD_TOTAL` |
| pytest | a plugin such as `pytest-split`, e.g. `--splits $TESTSTEIN_SHARD_TOTAL --group $TESTSTEIN_SHARD` |
| Others | select test files in your own script based on the two variables |

## Triggers

Triggers in the file apply to **Git sources**. For uploads, set schedules in the UI.

```yaml
triggers:
  push:
    branches: [main, release/*]
  pull_request:
    branches: [main]
    report_status: true      # post a pass/fail status check on the PR (default true)
  schedule:
    - cron: "0 2 * * *"      # 5-field cron
      timezone: Europe/London
      environment: Staging
      ref: main
```

Jobs with no `triggers` run only when started manually or through the API.

## Load tests (Locust)

```yaml
framework: locust
load:
  locustfile: load/checkout.py   # default: locustfile.py
  users: 500
  spawn_rate: 25                 # users started per second
  duration: 10m
  workers: 4                     # 0 = single process; >0 = distributed master + workers
  host: https://staging.example.com   # default: the environment's base URL
thresholds:
  p95_ms: 300
  max_error_rate: 0.01
```

- Teststein builds the Locust command from `load`. `shards`, `retries` and `libraries` don't apply.
- Locust has no pass/fail of its own. **Teststein marks the run failed if any threshold is
  missed**, and shows which ones. Available thresholds: `avg_ms`, `p50_ms`, `p95_ms`,
  `p99_ms`, `max_error_rate` (0–1), `min_rps`.
- **Hosted runners only load-test domains your organisation has verified.** Self-hosted
  runners have no such restriction.

## Android (Appium)

```yaml
libraries: [appium]
services: [appium]
android:
  emulator:
    api_level: 34
    device: pixel_7
  app: builds/app-release.apk     # path inside the script source
```

- Use **either** `emulator` (needs a runner with KVM) **or** `device: <runner label>` for a
  real device attached to a self-hosted runner, not both.
- Teststein adds the needed runner label (`android:emulator`, or the device label) to `runs_on` automatically.
- iOS is not supported yet.

## Validation and editor support

Teststein validates every file against the schema before running and shows errors in
plain language, e.g. *"Job `checkout`: Java jobs need `build_tool: maven` or `gradle`."*
(The backend should map raw schema errors such as "boolean schema is false" to messages like that.)

For autocomplete in VS Code (Red Hat YAML extension), put this line at the top of the file:

```yaml
# yaml-language-server: $schema=https://<teststein-host>/schemas/teststein.schema.json
```

## Not in the file

- **API collections built in the UI** run with the built-in `api` runner. They're configured
  in the UI, not in YAML. API tests written in code (e.g. pytest + `requests`) use a normal job,
  as in [`pytest-api.yml`](examples/pytest-api.yml).
- **Uploaded app builds** (choosing an APK by version instead of a path) arrive in phase 5.
