# Agent Module – Detailed Documentation (Node.js + Playwright)

## Overview

The `agent` module is a **Node.js** application that:

- **Executes UI test steps** on both pre- and post-migration versions of an application using **Playwright**.
- **Captures artifacts** (screenshots, DOM snapshots, network logs) for each step.
- **Compares behavior** between the two runs.
- **Writes a structured report** (`report.json`) consumed by the backend.

The agent is not a long-running service; it is invoked as a **short-lived CLI process** by the backend for each test run and communicates entirely through the filesystem (`storage/`).

---

## High-Level Execution Flow

1. **Startup (CLI invocation)**
   - Backend executes the agent with:
     - `--runId=<UUID>`
     - `--preMigrationUrl=<url>`
     - `--postMigrationUrl=<url>`
   - The agent starts in a given working directory (configured in backend `application.properties`).

2. **Input Loading**
   - Agent reads `storage/<runId>/input.json`, which contains:
     - `runId`
     - `preMigrationUrl`, `postMigrationUrl`
     - `steps`: ordered list of textual instructions.

3. **Execution on Pre- and Post-Migration Apps**
   - For each environment (`pre` and `post`):
     - Launches a Playwright browser + context and a page.
     - Attaches a network observer to capture HTTP requests/responses.
     - Iterates over all steps, executing them via the step executor.
     - After each step, captures:
       - Screenshot (`step-<n>.png`)
       - DOM snapshot (`step-<n>.html`)
       - Network logs appended to JSON files.

4. **Comparison**
   - Once both runs are complete, the agent:
     - Reads step-level results and artifacts.
     - Compares pre/post for each step (success flags, presence of artifacts, network counts).
     - Produces a `status` (`PASS`/`FAIL`) and an explanatory comment.

5. **Reporting & Exit**
   - Writes `storage/<runId>/report.json` containing:
     - `runId`
     - `steps`: array of per-step comparison results.
     - `summary`: totals and high-level metrics.
   - Returns an appropriate exit code:
     - `0` on success,
     - non-zero on errors (input missing, Playwright failure, etc.).

---

## Root-Level Files (Agent Module)

- **`package.json`**
  - Describes the Node.js package:
    - Name, version, and description of the agent.
    - `dependencies`:
      - **`@playwright/test` or `playwright`** – used for launching browsers and interacting with pages.
      - Other utilities as needed (e.g. `fs-extra` style helpers if used).
    - `scripts`:
      - May include:
        - `start` / `run` – run the agent (entrypoint `src/index.js`).
        - `install-browsers` – fetch Playwright browser binaries.
  - Important for installing dependencies and for reproducible environments.

- **`package-lock.json`**
  - Auto-generated dependency lock file.
  - Pins exact versions of transitive dependencies for deterministic builds.

---

## `src/index.js` – CLI Entrypoint

- **Role**
  - Main entry script for the agent process.
  - Parses CLI arguments and calls the core `run` function.

- **Key responsibilities**
  - Parse `process.argv` to extract:
    - `--runId`
    - `--preMigrationUrl`
    - `--postMigrationUrl`
  - Validate that required arguments are present; if not, print usage and exit with a non-zero status.
  - Optionally handle environment variables (e.g. `PLAYWRIGHT_BROWSERS_PATH`) or logging configuration.
  - Call `run({ runId, preMigrationUrl, postMigrationUrl })` exported from `runner.js`.
  - Handle unhandled errors:
    - Log the error message and stack trace.
    - Exit with an error code so the backend can mark the run as failed.

---

## `src/runner.js` – Core Orchestrator

- **Role**
  - Coordinates the entire lifecycle of a single test run inside the agent.

- **Key responsibilities**
  - **Load input**
    - Build the path `storage/<runId>/input.json`.
    - Read and parse it into an object:
      - `{ runId, preMigrationUrl, postMigrationUrl, steps }`.
    - Validate that required fields exist and `steps` is a non-empty array.
  - **Prepare directories**
    - Ensure `storage/<runId>/pre/` and `storage/<runId>/post/` exist.
    - Optionally clean or reuse existing directories if present.
  - **Configure Playwright**
    - Launch Chromium (or configured browser) for each environment:
      - `preBrowser`, `postBrowser`.
      - Per-environment contexts and pages.
  - **Attach observers**
    - For each environment, call functions from `uiObserver.js`:
      - Attach `request` / `response` listeners to the page.
      - Ensure network events are written to JSON logs.
  - **Execute steps**
    - For each environment and each step:
      - Invoke `stepExecutor.executeStep(...)` (or similarly named).
      - Collect results: `ok` flag, failure reason, artifact paths.
  - **Compare**
    - After both environments complete:
      - Collect the per-step outputs into structures for pre and post.
      - Call `compareRuns(preResults, postResults, runId, storageBasePath)` from `comparator.js`.
  - **Write report**
    - Use helper(s) from `reporter.js` and/or local utilities to:
      - Write `report.json` containing:
        - Per-step status, screenshot paths, comments.
        - Summary totals (e.g. number of steps, failures).
  - **Cleanup**
    - Ensure Playwright browsers are closed even on failures (`try/finally`).
    - Propagate error codes to the caller so the backend can mark failures correctly.

- **Utilities**
  - Often exposes helper functions like:
    - `safeWriteJson(filePath, data)` – writes a JSON file with directory creation and error handling.

---

## `src/stepExecutor.js` – Step Parsing & Execution

- **Role**
  - Encapsulates **how individual test instructions are interpreted and executed** on a Playwright `page`.

- **Supported instruction patterns (examples)**
  - `open` – navigate to the base URL (from CLI) or a homepage.
  - `open /path` – navigate to a relative path appended to the base URL.
  - `click Login` – find a UI element containing text `"Login"` and click it.
  - `enter john.doe into username` – type `john.doe` into the input associated with `"username"`.

- **Key behaviors**
  - **Parsing**
    - Converts raw instruction strings into structured actions:
      - `{ type: 'open', path: '/login' }`
      - `{ type: 'click', text: 'Login' }`
      - `{ type: 'enter', value: 'john', target: 'username' }`
  - **Element lookup**
    - Uses helper functions such as:
      - `findByVisibleText(page, text)` – locates buttons/links/elements containing a given label.
      - `findInput(page, fieldName)` – finds inputs by label, placeholder, or other heuristics.
  - **Execution**
    - Performs Page actions:
      - `page.goto(url)` for navigation.
      - `element.click()` for click operations.
      - `element.fill(value)` or `element.type(value)` for text entry.
  - **Artifact capture**
    - After each step (whether successful or not), captures:
      - Screenshot to `pre/step-<n>.png` or `post/step-<n>.png`.
      - DOM snapshot to `pre/step-<n>.html` or `post/step-<n>.html`.
  - **Error handling & retries**
    - If an action fails (e.g. selector not found, timeout), may:
      - Retry once.
      - Record a `failureReason` (e.g. "Element with text 'Login' not found").
      - Mark the step as `ok: false` but still capture artifacts to aid debugging.

- **Output shape (per step)**
  - Returns an object similar to:
    - `{ stepNumber, instruction, action, screenshotPath, domPath, ok, failureReason }`.

---

## `src/uiObserver.js` – Network Observation

- **Role**
  - Observes HTTP network activity during each environment run and writes logs to disk.

- **Key responsibilities**
  - Attach listeners to a Playwright `page`:
    - `page.on('request', ...)`
    - `page.on('response', ...)`
  - For each event, record structured data (URL, method, status code, headers, timing).
  - Append or flush this data into files in `pre/` or `post/` directories:
    - `session-network.json` – in-progress or incremental logs.
    - `session-final-network.json` – final snapshot when the run completes.

- **Why this matters**
  - The comparator can inspect network differences:
    - More/fewer API calls.
    - Requests missing or additional compared to the baseline.
  - Provides observability into how the migrated UI interacts with backend services.

---

## `src/comparator.js` – Pre/Post Comparison Logic

- **Role**
  - Takes **two sequences of step execution results** (pre and post) plus network metrics and produces **high-level verdicts** per step.

- **Input**
  - Aggregated step results for pre and post, each including:
    - `stepNumber`
    - `instruction`
    - `ok` flags
    - Artifact paths
    - Potentially network counts or summaries.

- **Comparison Logic (conceptual)**
  - For each step number:
    - If both pre and post runs succeeded but artifacts are present:
      - Mark step as `PASS`, with a neutral comment (e.g. "Both environments behaved similarly").
    - If pre succeeded but post failed:
      - Mark step as `FAIL`.
      - Include an AI-style comment highlighting the failure and `failureReason`.
    - If both failed:
      - Mark `FAIL`, but with context that the baseline is also broken.
    - Compare network counts (e.g. number of HTTP requests) and note significant differences.

- **Output**
  - Produces an array of objects (conceptually mapped later to backend `StepResult`):
    - `{ stepNumber, status, preScreenshotPath, postScreenshotPath, aiComment, preNetworkCount, postNetworkCount, failureReason }`.
  - Also generates a `summary` object:
    - `totalSteps`
    - `failedSteps`
    - Possibly total duration or other aggregate metrics.

---

## `src/reporter.js` – Report Writer

- **Role**
  - Writes the final structured report to `storage/<runId>/report.json`.

- **Key responsibilities**
  - Ensure the `storage/<runId>/` directory exists.
  - Accept an in-memory representation such as:
    - `{ runId, steps: [...], summary: {...} }`.
  - Serialize this structure to JSON with stable formatting.
  - Handle file I/O errors gracefully and propagate them back to the caller (so `runner.js` can signal failure).

---

## Example End-to-End Agent Run

1. Backend starts the agent:
   - `node agent/src/index.js --runId=... --preMigrationUrl=... --postMigrationUrl=...`.
2. `index.js` parses args and calls `runner.run(...)`.
3. `runner.js`:
   - Reads `storage/<runId>/input.json`.
   - Prepares `pre/` and `post/` directories.
   - Launches Playwright browsers and attaches `uiObserver` for network logging.
   - Calls `stepExecutor` for each instruction in both environments, capturing screenshots and DOM.
4. After both runs, `runner.js` calls `comparator.compareRuns(...)`.
5. `comparator.js` produces per-step comparison objects and a summary.
6. `reporter.js` writes these into `storage/<runId>/report.json`.
7. Process exits with status:
   - `0` if all went as expected (even if some steps `FAIL` in the report).
   - Non-zero if there was a fatal error (e.g. cannot read input, browser cannot start).

The backend then ingests `report.json` and exposes results through its REST API (see `backend.md` for details).
