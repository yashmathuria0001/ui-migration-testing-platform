# Backend Module – Detailed Documentation

## Overview

The `backend` module is a **Spring Boot** application that manages the full lifecycle of UI migration tests:

- **Defines and persists test cases** as ordered sequences of UI instructions.
- **Creates and tracks test runs** for a given test case and pair of URLs (pre-/post-migration).
- **Orchestrates the external Node.js Playwright agent**, writing inputs and reading outputs via the shared `storage/` directory.
- **Persists step-level results** (status, screenshots, comments) and **exposes them via REST APIs**.

It uses Spring Boot (Web, Data JPA), H2 for persistence, and Java 21, with a clean separation into configuration, controller, service, repository, DTO, and model layers.

---

## High-Level Architecture & Data Flow

1. **Test Case Management**
   - Client sends `POST /api/testcases` with a name, description, and ordered list of step instructions.
   - Backend validates the request, creates a `TestCase` entity, and associated `TestStep` entities.
   - Persisted via JPA repositories into the H2 database.

2. **Test Run Creation & Orchestration**
   - Client sends `POST /api/testruns` with:
     - `testCaseId`
     - `preMigrationUrl`
     - `postMigrationUrl`
   - Backend:
     - Creates a `TestRun` entity with status `CREATED`, then transitions to `RUNNING`.
     - Writes `storage/<runId>/input.json` with run metadata and the list of steps.
     - Launches the Node.js agent as an external process (command + working dir configurable via `application.properties`) using `@Async` so the HTTP request can return quickly.

3. **Agent Execution (external)**
   - The agent reads `input.json`, executes each step in both environments (pre/post), and writes:
     - Artifacts (screenshots, DOM, network logs) under `storage/<runId>/pre/` and `storage/<runId>/post/`.
     - A consolidated `storage/<runId>/report.json` with per-step comparison status and comments.

4. **Result Ingestion**
   - After the agent process exits (successfully or with error), the backend:
     - Reads `report.json` if present.
     - Maps each step result into a `StepResult` entity linked to the `TestRun`.
     - Updates the `TestRun` status to `COMPLETED` or `FAILED` depending on outcome / timeouts.

5. **Result Exposure**
   - Client calls `GET /api/testruns/{runId}/results`.
   - Backend assembles a `TestRunResultsResponse` containing:
     - Run metadata (URLs, status, timestamps).
     - An ordered list of `StepResultResponse` objects, including screenshot paths and AI comments.

---

## Module Structure

### Backend Root Files

- **`pom.xml`**
  - Maven build configuration.
  - Declares dependencies including:
    - Spring Boot starter modules: web, data-jpa, validation.
    - H2 database for local persistence.
    - Lombok for boilerplate code reduction.
    - Testing dependencies (Spring Boot Test, JUnit).
  - Sets Java version (21), packaging, and Maven plugins.

- **`.gitattributes` / `.gitignore`**
  - Git configuration.
  - `.gitignore` excludes build artifacts (e.g. `target/`), IDE files, and local storage.

- **`mvnw` / `mvnw.cmd` and `.mvn/wrapper/maven-wrapper.properties`**
  - Maven wrapper scripts and configuration.
  - Allow consistent project builds without requiring Maven to be pre-installed globally.

---

## Configuration & Resources

### `src/main/resources/application.properties`

- **Database & JPA**
  - Configures an **H2 in-memory or file-based database** (depending on profile).
  - Enables schema creation, SQL logging as needed.

- **Server**
  - Sets HTTP server port (e.g. `8080`).

- **Storage & Agent Integration**
  - `platform.storage.basePath` – base directory for storing per-run folders (typically `../storage` from the backend module).
  - `platform.agent.command` – command used to start the Node.js agent (e.g. `node agent/src/index.js`).
  - `platform.agent.workingDir` – working directory for running the agent (e.g. project root).
  - `platform.agent.timeoutSeconds` – max time to wait for the agent process before marking the run as failed.

---

## Java Package Structure (`com.uimigration.platform`)

### 1. Application Entrypoint

- **`BackendApplication.java`**
  - Standard Spring Boot `@SpringBootApplication`.
  - Contains the `main` method invoking `SpringApplication.run`.
  - Serves as the central configuration and bootstrap point for Spring.

---

### 2. `config` Package – Cross-Cutting Configuration

- **`config/AsyncConfig.java`**
  - Enables asynchronous processing via `@EnableAsync`.
  - Configures task executor (thread pool) used by `@Async` methods, particularly for **running the agent process in the background**.
  - Helps keep HTTP requests responsive while long-running test executions happen asynchronously.

- **`config/CorsConfig.java`**
  - Defines global CORS settings for the REST API.
  - Typically allows:
    - Requests from a frontend origin (or all origins in development).
    - Common HTTP methods: GET, POST, PUT, DELETE, OPTIONS.
    - Necessary headers (e.g. `Content-Type`, `Authorization` if relevant).
  - Ensures frontend clients can interact with the backend without browser CORS issues.

- **`config/JacksonConfig.java`**
  - Customizes the Jackson `ObjectMapper` used by Spring Boot.
  - Typical responsibilities:
    - Register Java time modules for proper date/time handling.
    - Configure serialization features (e.g. disabling timestamps for dates).
    - Handle optional types if used in DTOs/entities.
  - Ensures consistent JSON representation across the API.

---

### 3. `controller` Package – REST API Layer

- **`controller/TestCaseController.java`**
  - Exposes endpoints under a path like `/api/testcases`.
  - Typical endpoints:
    - `POST /api/testcases`
      - Request body: `TestCaseRequest`.
      - Delegates to `TestCaseService.createTestCase`.
      - Returns `TestCaseResponse` with generated ID and step details.
    - `GET /api/testcases/{id}`
      - Path variable: test case UUID.
      - Delegates to `TestCaseService.getTestCase`.
      - Returns `TestCaseResponse`.
  - Performs request/response translation, leaving business logic to the service layer.

- **`controller/TestRunController.java`**
  - Exposes endpoints under a path like `/api/testruns`.
  - Typical endpoints:
    - `POST /api/testruns`
      - Request body: `TestRunRequest`.
      - Delegates to `TestRunService.createTestRun`, which creates the run and triggers agent orchestration.
      - Returns a minimal `TestRunResponse` (run ID + initial status).
    - `GET /api/testruns/{runId}/results`
      - Path variable: run UUID.
      - Delegates to `TestRunService.getTestRunResults`.
      - Returns `TestRunResultsResponse` including step-level `StepResultResponse` objects.
  - Acts as the boundary between HTTP and the domain model.

---

### 4. `dto` Package – Data Transfer Objects

DTOs decouple API payloads from persistence models and enforce validation and shape of inputs/outputs.

- **`dto/TestCaseRequest.java`**
  - Used in `POST /api/testcases`.
  - Fields:
    - `String name` – display name of the test case.
    - `String description` – human-readable description / intent.
    - `List<String> steps` – ordered list of textual step instructions (e.g. `"open /login"`, `"enter john into username"`).
  - May use validation annotations (e.g. `@NotBlank`, `@Size`).

- **`dto/TestCaseResponse.java`**
  - Response representation of a test case.
  - Fields:
    - `UUID id`
    - `String name`
    - `String description`
    - `List<TestStepResponse> steps` – ordered step details.

- **`dto/TestStepResponse.java`**
  - Represents a single step within a test case.
  - Fields:
    - `UUID id` – step ID.
    - `int stepNumber` – 1-based ordering of the step.
    - `String instruction` – instruction string to be executed by the agent.

- **`dto/TestRunRequest.java`**
  - Used in `POST /api/testruns`.
  - Fields:
    - `UUID testCaseId` – links to an existing `TestCase`.
    - `String preMigrationUrl` – base URL of the old system.
    - `String postMigrationUrl` – base URL of the new system.

- **`dto/TestRunResponse.java`**
  - Short response immediately after creating a test run.
  - Fields:
    - `UUID runId`
    - `TestRunStatus status` – usually `CREATED` or `RUNNING` at creation time.

- **`dto/TestRunResultsResponse.java`**
  - Detailed view of a finished or in-progress run.
  - Fields:
    - `UUID runId`
    - `UUID testCaseId`
    - `String preMigrationUrl`
    - `String postMigrationUrl`
    - `TestRunStatus status`
    - `Instant createdAt`
    - `List<StepResultResponse> stepResults` – ordered list of step outcomes.

- **`dto/StepResultResponse.java`**
  - API representation of a persisted `StepResult`.
  - Fields:
    - `UUID id`
    - `int stepNumber`
    - `StepStatus status` – `PASS` or `FAIL`.
    - `String preScreenshotPath` – path to pre-migration screenshot on disk.
    - `String postScreenshotPath` – path to post-migration screenshot.
    - `String aiComment` – explanation of why the step passed/failed (from agent comparator).

---

### 5. `model` Package – JPA Entities & Enums

These classes represent the persisted domain model in the database.

- **`model/TestCase.java`**
  - Entity mapped to `test_cases` (exact table name depends on JPA strategy).
  - Core fields:
    - `UUID id`
    - `String name`
    - `String description`
  - Relationships:
    - `@OneToMany(mappedBy = "testCase", cascade = ...)` to `List<TestStep> steps`, ordered by `stepNumber`.

- **`model/TestStep.java`**
  - Represents a single step in a test case.
  - Fields:
    - `UUID id`
    - `int stepNumber` – numeric order of the step.
    - `String instruction` – textual action executed by the agent.
  - Relationships:
    - `@ManyToOne` to `TestCase` (foreign key `test_case_id`).

- **`model/TestRun.java`**
  - Represents one execution of a test case against a pair of environments.
  - Fields:
    - `UUID id`
    - `UUID testCaseId` – reference to the logical test case (not necessarily a JPA relation; may be stored as scalar).
    - `String preMigrationUrl`
    - `String postMigrationUrl`
    - `TestRunStatus status`
    - `Instant createdAt`
  - Captures overall state of a run but not per-step detail.

- **`model/StepResult.java`**
  - Stores the result of executing a single step within a test run.
  - Fields:
    - `UUID id`
    - `UUID testRunId` – link to the parent `TestRun`.
    - `int stepNumber`
    - `StepStatus status`
    - `String preScreenshotPath`
    - `String postScreenshotPath`
    - `String aiComment`
  - Derived from the agent’s `report.json`.

- **`model/StepStatus.java`**
  - Enum values:
    - `PASS`
    - `FAIL`

- **`model/TestRunStatus.java`**
  - Enum values typically include:
    - `CREATED`
    - `RUNNING`
    - `COMPLETED`
    - `FAILED`

---

### 6. `repository` Package – Data Access Layer

Each repository extends Spring Data JPA interfaces, giving CRUD and query methods with minimal boilerplate.

- **`repository/TestCaseRepository.java`**
  - Interface `JpaRepository<TestCase, UUID>`.
  - Provides basic CRUD for `TestCase`.
  - Used by `TestCaseService` to persist and retrieve test cases.

- **`repository/TestStepRepository.java`**
  - Interface `JpaRepository<TestStep, UUID>`.
  - Adds custom method: `List<TestStep> findByTestCaseIdOrderByStepNumberAsc(UUID testCaseId)`.
  - Ensures steps are retrieved in the correct execution order for a given test case.

- **`repository/TestRunRepository.java`**
  - Interface `JpaRepository<TestRun, UUID>`.
  - Provides CRUD for `TestRun` entities.
  - Used to create new runs, update statuses, and look up runs by ID.

- **`repository/StepResultRepository.java`**
  - Interface `JpaRepository<StepResult, UUID>`.
  - Adds method: `List<StepResult> findByTestRunIdOrderByStepNumberAsc(UUID testRunId)`.
  - Retrieves step results in execution order for a given run.

---

### 7. `service` Package – Business Logic & Orchestration

- **`service/TestCaseService.java`**
  - **Responsibilities**:
    - Create a new test case from `TestCaseRequest`.
    - Instantiate and persist `TestCase` and its ordered `TestStep` entities.
    - Retrieve test cases and map them to `TestCaseResponse`.
  - **Key interactions**:
    - Uses `TestCaseRepository` and `TestStepRepository` for persistence.
    - Called by `TestCaseController`.

- **`service/TestRunService.java`**
  - **Responsibilities**:
    - Create new test runs from `TestRunRequest`.
    - Initialize `TestRun` with appropriate status and metadata.
    - Collaborate with `AgentOrchestrationService` to:
      - Write `input.json`.
      - Launch the agent.
      - Ingest `report.json` and convert to `StepResult` entities.
    - Provide aggregate views of run results as `TestRunResultsResponse`.
  - **Key interactions**:
    - Uses `TestRunRepository` and `StepResultRepository`.
    - Called by `TestRunController`.

- **`service/AgentOrchestrationService.java`**
  - **Central orchestration component for the Node.js agent**.
  - **Key responsibilities**:
    - Build the directory `storage/<runId>/` under `platform.storage.basePath`.
    - Construct and write `input.json` containing:
      - `runId`
      - `preMigrationUrl`
      - `postMigrationUrl`
      - Ordered `steps` array based on `TestCase`’s `TestStep`s.
    - Start the external agent process with configured command and working directory.
    - Apply a timeout (from `platform.agent.timeoutSeconds`) and handle process exit codes.
    - Read `report.json` on success and map its contents into:
      - Domain-level summary object (`AgentReport` / `AgentStepResult` inner classes).
      - Persistent `StepResult` entities via `TestRunService` / repositories.
    - On failures or timeouts, set `TestRun` status to `FAILED`.
  - **Technical details**:
    - Typically uses `ProcessBuilder` or equivalent to start the Node.js process.
    - Designed to be run in an `@Async` context so the HTTP layer returns quickly.

---

### 8. Tests

- **`src/test/java/com/uimigration/platform/BackendApplicationTests.java`**
  - Basic Spring Boot test verifying that the application context loads.
  - Ensures configuration and wiring are valid.

---

## End-to-End Backend View

1. **Define** a test case (`POST /api/testcases`) → `TestCaseService` → `TestCase` + `TestStep` persisted.
2. **Start** a run (`POST /api/testruns`) → `TestRunService` + `AgentOrchestrationService`:
   - Create `TestRun`.
   - Write `storage/<runId>/input.json`.
   - Launch agent process asynchronously.
3. **Execute & Compare** (agent-side) – see `agent.md` for full details.
4. **Ingest results** when agent finishes:
   - Read `report.json`.
   - Persist `StepResult` entries.
   - Update `TestRun` status.
5. **Fetch results** (`GET /api/testruns/{runId}/results`) to obtain a structured summary of each step’s outcome, including screenshot paths and AI comments.
