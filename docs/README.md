
# UI Migration Testing Platform – Documentation

## Overview

The **UI Migration Testing Platform** automates verification when migrating a user interface from one implementation to another (e.g. legacy framework → modern framework).

It allows you to:

- **Define test cases** as ordered sequences of high-level UI actions (open, click, enter).
- **Execute those test cases** against both **pre-migration** and **post-migration** versions of an application.
- **Capture rich artifacts** (screenshots, DOM, network logs) for each step.
- **Compare behaviors** between versions and **persist human-readable results**.

The project is composed of two main runtime modules plus shared storage:

- **`backend/`** – Spring Boot application (Java):
  - Exposes REST APIs for:
    - Test case creation and retrieval.
    - Test run creation and result retrieval.
  - Persists test cases, runs, and step results in H2 via JPA.
  - Orchestrates the external agent process and ingests its report.
- **`agent/`** – Node.js application using Playwright:
  - Reads test steps and URLs from `storage/<runId>/input.json`.
  - Runs the steps in real browsers against both environments.
  - Captures screenshots, DOM snapshots, and network traffic.
  - Compares pre/post behavior and writes `storage/<runId>/report.json`.
- **`storage/` (runtime directory)**:
  - Shared filesystem handshake between backend and agent.
  - Holds per-run inputs, artifacts, reports, and logs.

---

## High-Level Architecture and Flow

At a high level, a single test run flows through the system as follows:

1. **Create a test case**
   - Client calls the backend (e.g. `POST /api/testcases`) with:
     - Name, description.
     - Ordered list of human-readable step instructions.
   - Backend persists:
     - `TestCase` entity.
     - Associated ordered `TestStep` entities.

2. **Start a test run**
   - Client calls `POST /api/testruns` with:
     - `testCaseId`.
     - `preMigrationUrl`, `postMigrationUrl`.
   - Backend:
     - Creates a `TestRun` record with status `CREATED` / `RUNNING`.
     - Writes `storage/<runId>/input.json` with all data needed by the agent.
     - Launches the Node.js agent as an **asynchronous external process**.

3. **Agent executes the scenario**
   - Agent reads `input.json`.
   - For each environment (pre and post):
     - Opens the target URL in a Playwright-controlled browser.
     - Executes each instruction via the step executor.
     - After each step, saves:
       - Screenshot and DOM snapshot.
       - Network logs via the UI observer.

4. **Agent compares and reports**
   - For each step, the comparator:
     - Compares pre/post outcomes and network metrics.
     - Assigns `PASS`/`FAIL` and a descriptive comment.
   - Reporter writes `storage/<runId>/report.json` plus optional `agent.log`.

5. **Backend ingests results**
   - After the agent terminates (or times out), the backend:
     - Reads `report.json`.
     - Creates `StepResult` entities with paths to screenshots and comments.
     - Updates `TestRun` status to `COMPLETED` or `FAILED`.

6. **Client consumes results**
   - Client calls `GET /api/testruns/{runId}/results`.
   - Backend returns a `TestRunResultsResponse` including:
     - Run metadata (URLs, status, timestamp).
     - Ordered per-step results with statuses and filesystem paths to artifacts.

This separation of concerns keeps **business logic and persistence** in the backend, while delegating **browser automation and environment comparison** to the agent.

---

## Directory-Level Architecture

At a high level, the project directories are organized as:

- **`backend/`**
  - `pom.xml`, `mvnw`, `.mvn/` – Maven build and wrapper.
  - `src/main/java/com/uimigration/platform/`
    - `BackendApplication.java` – Spring Boot entrypoint.
    - `config/` – async, CORS, and Jackson configuration.
    - `controller/` – REST API controllers.
    - `dto/` – request/response models.
    - `model/` – JPA entities and enums.
    - `repository/` – Spring Data JPA repositories.
    - `service/` – test case, test run, and agent orchestration logic.
  - `src/main/resources/application.properties` – DB, server, and agent/storage config.
  - `src/test/java/...` – basic Spring Boot context test.

- **`agent/`**
  - `package.json`, `package-lock.json` – Node.js project metadata and dependencies.
  - `src/index.js` – CLI entrypoint.
  - `src/runner.js` – orchestrates reading input, running steps, and writing report.
  - `src/stepExecutor.js` – parses and executes high-level UI instructions.
  - `src/uiObserver.js` – captures network activity.
  - `src/comparator.js` – compares pre/post runs and generates comments.
  - `src/reporter.js` – writes the final JSON report.

- **`storage/`** (runtime only, typically gitignored)
  - `<runId>/` subdirectories per test run.
  - See `storage.md` for a detailed breakdown.

---

## Documentation Contents

This `docs/` folder contains deeper, file-level documentation for each part of the system:

- **[`backend.md`](backend.md)** – **Backend module (Spring Boot)**
  - Architecture and workflow from REST call to database.
  - Detailed, per-file explanation for:
    - `BackendApplication`, `config`, `controller`, `dto`, `model`, `repository`, `service`.
  - How test cases and runs are persisted and how the agent is orchestrated.

- **[`agent.md`](agent.md)** – **Agent module (Node.js + Playwright)**
  - Full execution pipeline from CLI entrypoint to report.
  - Detailed, per-file explanation for:
    - `index.js`, `runner.js`, `stepExecutor.js`, `uiObserver.js`, `comparator.js`, `reporter.js`.
  - How UI instructions are interpreted and how comparisons are computed.

- **[`storage.md`](storage.md)** – **Storage layout and data flow**
  - Exact per-run directory structure under `storage/<runId>/`.
  - Semantics of `input.json`, `pre/`, `post/`, `report.json`, and `agent.log`.
  - How data moves between backend and agent via the filesystem.

Each of these documents explains **what each file does** and **how it connects to the rest of the architecture**, so you can quickly locate where to make changes for new features or debugging. 
