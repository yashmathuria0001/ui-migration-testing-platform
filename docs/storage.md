# Storage Structure and Data Flow

The `storage/` directory is the **shared filesystem boundary** between the **Spring Boot backend** and the **Node.js Playwright agent**.  
Every test run gets its own subdirectory under `storage/`, keeping artifacts isolated, reproducible, and easy to inspect.

The base path is configured in the backend via `application.properties` (e.g. `platform.storage.basePath=../storage`), and the agent uses a matching relative path when invoked from the project root.

---

## Per-Run Directory Layout

For each test run (identified by a UUID `runId`), the following structure is created:

- **`storage/<runId>/`**
  - **`input.json`** – **written by the backend** before launching the agent.
    - Fields:
      - `runId` – unique ID of the test run.
      - `preMigrationUrl` – URL of the pre-migration app.
      - `postMigrationUrl` – URL of the post-migration app.
      - `steps` – ordered array of UI instructions as strings.
  - **`pre/`** – artifacts from the **pre-migration** application:
    - `step-<n>.html` – DOM snapshot after step `n`.
    - `step-<n>.png` – screenshot after step `n`.
    - `session-network.json` – rolling log of network events.
    - `session-final-network.json` – final snapshot of network activity at the end of the run.
  - **`post/`** – artifacts from the **post-migration** application (same structure as `pre/`):
    - `step-<n>.html`
    - `step-<n>.png`
    - `session-network.json`
    - `session-final-network.json`
  - **`report.json`** – **written by the agent** after both runs complete.
    - Typical structure:
      - `runId` – test run ID.
      - `steps` – array of per-step results, each containing:
        - `stepNumber`
        - `instruction`
        - `status` (`PASS` / `FAIL`)
        - `preScreenshotPath`, `postScreenshotPath`
        - Additional metrics (e.g. network request counts, failure reason).
      - `summary` – overall stats:
        - `totalSteps`
        - `failedSteps`
        - Optional duration or other highlights.
  - **`agent.log`** – **optional log file** containing stdout/stderr from the agent process.
    - Extremely useful for debugging Playwright/browser issues or parsing errors.

> Note: Screenshot and DOM paths recorded in `report.json` are filesystem paths and are **not automatically served** by the backend; a separate mechanism would be needed if you want to expose images directly over HTTP.

---

## Data Flow Between Backend and Agent

End-to-end, the `storage/` directory links the Java and Node.js worlds:

1. **Backend → Storage**
   - `TestRunService` / `AgentOrchestrationService` construct the `storage/<runId>/` folder.
   - Backend writes `input.json` with:
     - Run metadata (ID, URLs).
     - Ordered list of steps taken from the persisted `TestCase`.

2. **Agent → Storage (Pre & Post Runs)**
   - Agent reads `input.json`.
   - Creates `pre/` and `post/` subdirectories.
   - Runs the same steps twice:
     - Once against `preMigrationUrl` → writes artifacts to `pre/`.
     - Once against `postMigrationUrl` → writes artifacts to `post/`.
   - Network observer writes `session-network.json` and `session-final-network.json` for each environment.

3. **Agent → Storage (Report)**
   - After executing all steps and performing comparisons, agent writes `report.json` in `storage/<runId>/`.
   - Optionally also writes `agent.log`.

4. **Storage → Backend**
   - Backend waits for the agent process to finish (within the configured timeout).
   - Reads `report.json`.
   - Maps each step entry into a `StepResult` entity and updates the corresponding `TestRun` status (COMPLETED/FAILED).

The backend does **not** directly read individual HTML/screenshot/network files; instead, it relies on the structured summary in `report.json` and stores paths to artifacts on disk in `StepResult` records for later use.

---

## Example Directory Tree

Below is a concrete example of what a single test run’s storage directory might look like:

```text
storage/
  36174bd6-5a2e-4b2c-9d71-123456789abc/
    input.json
    pre/
      step-1.html
      step-1.png
      step-2.html
      step-2.png
      session-network.json
      session-final-network.json
    post/
      step-1.html
      step-1.png
      step-2.html
      step-2.png
      session-network.json
      session-final-network.json
    report.json
    agent.log
```

This structure ensures that **every artifact** for a given test run is:

- **Isolated** – no cross-contamination between runs.
- **Traceable** – each file is tied to a specific `runId` and `stepNumber`.
- **Reproducible** – you can re-run comparisons or perform manual analysis later.

