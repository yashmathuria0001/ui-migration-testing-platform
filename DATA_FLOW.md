# Data Flow Architecture - UI Migration Testing Platform

This document explains how data flows across the **Frontend**, **Backend**, and **Agent** components of the UI Migration Testing Platform.

---

## System Overview

The platform consists of three main components:

1. **Frontend** (React + Vite) - User interface for creating and viewing tests
2. **Backend** (Spring Boot + MongoDB) - REST API and test orchestration
3. **Agent** (Python FastAPI + Playwright) - Automated test execution and AI analysis

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                             │
│  ┌────────────────┐              ┌──────────────────┐               │
│  │  NewTest.jsx   │              │  Dashboard.jsx   │               │
│  │  - Create test │              │  - View results  │               │
│  │  - Run tests   │              │  - Show metrics  │               │
│  └────────────────┘              └──────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
          ↓                                        ↑
    POST /api/testruns/upload              GET /api/test-runs
    POST /api/testruns/create               GET /api/test-runs/stats
    POST /api/testruns/{id}/execute         GET /api/assets (proxy)
          ↓                                        ↑
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Spring Boot)                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Controllers:                                                   │  │
│  │ - TestRunController (CRUD operations)                        │  │
│  │ - ExecutionOrchestratorController (execute & orchestrate)    │  │
│  │ - ExecutionController (status callbacks)                     │  │
│  │ - UploadController (Excel parsing)                           │  │
│  │ - AssetProxyController (screenshot proxy)                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Services:                                                      │  │
│  │ - TestRunService (business logic)                            │  │
│  │ - AgentClientService (HTTP calls to Agent)                   │  │
│  │ - ExcelParserService (Excel → Test steps)                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Data: MongoDB                                                  │  │
│  │ - TestRun model (with results, screenshots, status)          │  │
│  │ - StepResult model (individual step outcomes)                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
          ↕                                        ↕
    POST /generate-script                  PUT /api/execution/{id}/start
    (runs playwright tests)                PUT /api/execution/{id}/complete
                                           PUT /api/execution/{id}/fail
          ↑                                        ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   AGENT (Python FastAPI)                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ API Endpoints:                                                 │  │
│  │ - POST /generate-script (LLM → test script generation)       │  │
│  │ - GET /health (health check)                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Components:                                                    │  │
│  │ - llm_generator.py (Groq LLM → Playwright code)             │  │
│  │ - main.py (Playwright execution & screenshot capture)        │  │
│  │ - regression_ai.py (AI-powered regression analysis)          │  │
│  │ - result_builder.py (JSON report structuring)                │  │
│  │ - spring_callback.py (Backend communication)                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ File Storage:                                                  │  │
│  │ - /screenshots/{pre|post}/{test_id}/step_N.png              │  │
│  │ - /reports/{pre|post}/report_{test_id}.html                 │  │
│  │ - /generated_tests/test_{test_id}.spec.js                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Sequences

### 1. Test Creation & Execution Flow

#### 1.1 User Creates Test via Excel Upload

```
Frontend (NewTest.jsx)
    ↓
    User clicks "Upload Excel" → selects file
    ↓
    [POST] /api/testruns/upload
    (file + preMigrationUrl + postMigrationUrl)
    ↓
Backend (UploadController)
    ↓
    1. Save file to temp storage
    2. Parse Excel → extract test steps
    3. Create TestRun record in MongoDB
       - Status: IDLE
       - Steps: [list from Excel]
       - URLs: preMigrationUrl, postMigrationUrl
    ↓
    Response: { id: "test_run_uuid", steps: [...], ... }
    ↓
Frontend
    ↓
    testRunId = response.id
```

#### 1.2 User Creates Test via JSON

```
Frontend (NewTest.jsx)
    ↓
    User clicks "Upload JSON" → selects file
    ↓
    Frontend parses JSON locally
    Extract: preMigrationUrl, postMigrationUrl, steps[]
    ↓
    [POST] /api/testruns/create
    { preMigrationUrl, postMigrationUrl, steps }
    ↓
Backend (TestRunController)
    ↓
    1. Create TestRun record in MongoDB
       - Status: IDLE
       - Steps: [from request]
       - URLs: from request
    ↓
    Response: { id: "test_run_uuid", steps: [...], ... }
    ↓
Frontend
    ↓
    testRunId = response.id
```

#### 1.3 Execute Test

```
Frontend (NewTest.jsx)
    ↓
    User clicks "Run Test" button
    ↓
    [POST] /api/testruns/{testRunId}/execute
    ↓
Backend (ExecutionOrchestratorController)
    ↓
    1. Fetch TestRun from MongoDB
    2. Call markAsRunning(testRunId)
    3. Call AgentClientService.executeAgent(testRun)
    ↓
Agent (main.py)
    ↓
    Receives request:
    {
        testRunId: "uuid",
        preUrl: "http://...",
        postUrl: "http://...",
        steps: ["Click login", "Enter email", ...]
    }
    ↓
    1. Mark RUNNING: PUT /api/execution/{testRunId}/start
    ↓
Backend (ExecutionController)
    ↓
    Update TestRun.status = RUNNING
    ↓
Agent (main.py continues)
    ↓
    2. Generate Playwright Script
       - Call llm_generator.generate_playwright_script(steps)
       - Groq API generates test code from steps
    ↓
Agent (llm_generator.py)
    ↓
    Uses Groq API with prompt:
    "Convert these steps to Playwright JavaScript:
     - Step 1
     - Step 2
     ..."
    ↓
    Returns: JavaScript test code (raw string)
    ↓
Agent (main.py continues)
    ↓
    3. Inject screenshot capture code
       - Inject __screenshot helper function
       - Inject screenshot calls after each step
    ↓
    4. Save generated test file
       /generated_tests/test_{testRunId}.spec.js
    ↓
    5. Execute PRE test
       - Run: npx playwright test test_{testRunId}.spec.js
       - Set env vars: BASE_URL=preUrl, TEST_RUN_ID=testRunId, RUN_LABEL=pre
       - Capture: /screenshots/pre/{testRunId}/step_N.png
       - Capture JSON report
    ↓
    6. Execute POST test
       - Run: npx playwright test test_{testRunId}.spec.js
       - Set env vars: BASE_URL=postUrl, TEST_RUN_ID=testRunId, RUN_LABEL=post
       - Capture: /screenshots/post/{testRunId}/step_N.png
       - Capture JSON report
    ↓
    7. Build Results
       - Extract step statuses from Playwright JSON reports
       - For each step: compare pre vs post status
       - Call result_builder.build_structured_summary()
    ↓
Agent (result_builder.py)
    ↓
    Structures summary:
    {
        totalSteps: 5,
        passed: 4,
        failed: 1,
        errors: [...]
    }
    ↓
Agent (main.py continues)
    ↓
    8. AI Regression Analysis
       - Call regression_ai.analyze_regression(preSummary, postSummary)
    ↓
Agent (regression_ai.py)
    ↓
    Uses Groq API to analyze:
    "Pre and post test summaries - is there regression?
     Pre: {summary}
     Post: {summary}
     Return JSON: { regressionDetected, severity, explanation }"
    ↓
    Returns: JSON string with regression analysis
    ↓
Agent (main.py continues)
    ↓
    9. Generate HTML Report
       - Call write_simple_html_report()
       - Create: /reports/report_{testRunId}.html
    ↓
    10. Mark COMPLETED
        - PUT /api/execution/{testRunId}/complete
        - Send payload with all results:
          {
              testRunId,
              results: [{stepName, preStatus, postStatus, difference, ...}],
              regressionDetected,
              severity,
              explanation,
              riskScore,
              executionDurationMs,
              preRawOutput,
              postRawOutput,
              reportPath
          }
    ↓
Backend (ExecutionController)
    ↓
    1. Fetch TestRun by testRunId
    2. Update fields from payload:
       - results: [array of StepResult]
       - regressionDetected
       - severity
       - explanation
       - riskScore
       - status: COMPLETED
       - completedAt: now
       - preRawOutput, postRawOutput
    ↓
    3. Save updated TestRun to MongoDB
    ↓
Frontend (NewTest.jsx)
    ↓
    Poll GET /api/testruns/{testRunId}
    ↓
    When status becomes COMPLETED:
    - Display report
    - Show step results (pre vs post status)
    - Show AI explanation
    - Show screenshots
    - Show risk score
```

---

### 2. Dashboard View Flow

```
Frontend (Dashboard.jsx)
    ↓
    Mount component → useEffect
    ↓
    [GET] /api/test-runs?page=0&size=20
    [GET] /api/test-runs/stats
    ↓
Backend (TestRunController)
    ↓
    1. Query MongoDB with pagination
    2. Return paginated TestRun objects:
       {
           content: [
               {
                   id, status, severity, regressionDetected,
                   riskScore, createdAt, results[],
                   aiExplanation, preStatus, postStatus,
                   ...
               },
               ...
           ],
           totalElements, totalPages
       }
    3. Query stats:
       {
           totalRuns, passed, failed, regressions, highSeverity
       }
    ↓
Frontend (Dashboard.jsx)
    ↓
    1. Display summary cards (total, passed, failed, regressions)
    2. Display table of test runs
    3. Allow pagination
    4. When user clicks row → expand drawer
    ↓
    [GET] /api/assets/screenshots/pre/{testRunId}/step_1.png
    (via AssetProxyController)
    ↓
    Show:
    - AI explanation
    - Step results (pre vs post)
    - Risk score visualization
    - Screenshot previews
    - Raw logs
```

---

### 3. Screenshot Access Flow

```
Frontend Component
    ↓
    Needs to display screenshot from agent
    Example: /screenshots/pre/{testRunId}/step_1.png
    ↓
    Browser makes request to:
    GET /api/assets/screenshots/pre/{testRunId}/step_1.png
    ↓
Backend (AssetProxyController)
    ↓
    1. Extract path: screenshots/pre/{testRunId}/step_1.png
    2. Construct agent URL: http://localhost:5000/screenshots/...
    3. Fetch from agent using RestTemplate
    4. Return file content with proper headers
    ↓
    OR if CORS issue:
    Use Agent's mounted static files directly
    ↓
Frontend
    ↓
    Display image in <img> tag
```

---

## Data Models

### TestRun (MongoDB)

```java
@Document(collection = "test_runs")
public class TestRun {
    @Id
    private String id;                          // UUID
    private String status;                      // IDLE, RUNNING, COMPLETED, FAILED
    private String preMigrationUrl;
    private String postMigrationUrl;
    private List<String> steps;                 // Test steps
    private boolean regressionDetected;
    private String severity;                    // LOW, MEDIUM, HIGH
    private String aiExplanation;
    private int riskScore;                      // 0-100
    private List<StepResult> results;           // Per-step outcomes
    private boolean preStatus;                  // Overall pre-migration status
    private boolean postStatus;                 // Overall post-migration status
    private String preRawOutput;                // Playwright raw output
    private String postRawOutput;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime completedAt;
    private long executionDurationMs;
    private String reportPath;                  // HTML report location
    private String errorMessage;                // If execution failed
}
```

### StepResult (MongoDB Embedded)

```java
public class StepResult {
    private String stepName;
    private String preStatus;                   // PASS, FAIL, SKIPPED
    private String postStatus;
    private String difference;                  // AI-generated difference note
    private String preScreenshotPath;           // /screenshots/pre/{testId}/step_N.png
    private String postScreenshotPath;          // /screenshots/post/{testId}/step_N.png
}
```

### Agent Request (ScriptRequest)

```python
class ScriptRequest(BaseModel):
    testRunId: str                              # UUID
    preUrl: str                                 # http://old-app.com
    postUrl: str                                # http://new-app.com
    steps: list[str]                            # Test steps
```

### Agent Response (JSON)

```json
{
    "success": true,
    "regressionDetected": true,
    "severity": "HIGH",
    "explanation": "...",
    "results": [
        {
            "stepName": "Click login button",
            "preStatus": "PASS",
            "postStatus": "FAIL",
            "difference": "Button not found after migration"
        }
    ],
    "riskScore": 85,
    "executionDurationMs": 15000,
    "preRawOutput": "...",
    "postRawOutput": "..."
}
```

---

## API Endpoints

### Frontend → Backend

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| POST | `/api/testruns/upload` | Upload Excel file | FormData (file, URLs) |
| POST | `/api/testruns/create` | Create test from JSON | JSON (URLs, steps) |
| POST | `/api/testruns/{id}/execute` | Start test execution | Empty |
| GET | `/api/test-runs` | Fetch all runs (paginated) | Query params: page, size |
| GET | `/api/test-runs/stats` | Fetch summary stats | Empty |
| GET | `/api/test-runs/{id}` | Fetch single run details | Empty |
| GET | `/api/assets/screenshots/**` | Proxy screenshot from agent | Empty |

### Backend → Agent

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| POST | `/generate-script` | Generate & execute test | ScriptRequest JSON |
| PUT | `/api/execution/{id}/start` | Mark test as running | Empty |
| PUT | `/api/execution/{id}/complete` | Complete test with results | CompleteExecutionRequest |
| PUT | `/api/execution/{id}/fail` | Mark test as failed | FailExecutionRequest |

### Agent Internal

| Method | Endpoint | Purpose |
|--------|----------|---------|
| Groq API | (LLM service) | Generate Playwright script from steps |
| Groq API | (LLM service) | Analyze regression between pre/post |
| Playwright CLI | (local) | Execute test and capture screenshots |

---

## Configuration & Environment

### Frontend (.env)

```env
VITE_BACKEND_BASE_URL=http://localhost:8000
VITE_AGENT_ASSET_BASE_URL=http://localhost:5000
```

### Backend (application.yml)

```yaml
spring:
  data:
    mongodb:
      uri: mongodb://localhost:27017/ui-migration
  application:
    name: backend
server:
  port: 8000
  cors:
    allowed-origins: http://localhost:5173
```

### Agent (.env)

```env
GROQ_API_KEY=<your-key>
SPRING_BASE_URL=http://localhost:8000
```

---

## Key Data Transformations

### 1. Excel → Test Steps

```
Excel File
    ↓
ExcelParserService.parseTestSteps()
    ↓
List<String> steps
    ↓
Stored in TestRun.steps
```

### 2. Test Steps → Playwright Code

```
List<String> steps
    ↓
llm_generator.generate_playwright_script(steps)
    ↓
Groq LLM API
    ↓
JavaScript test code (string)
    ↓
Injected with screenshot helpers
    ↓
Saved: /generated_tests/test_{testId}.spec.js
```

### 3. Playwright Output → Structured Results

```
JSON Reporter Output
    ↓
main.py: extract_numbered_step_statuses()
    ↓
List of step pass/fail statuses
    ↓
build_step_results()
    ↓
List<StepResult> with differences & screenshots
```

### 4. Pre vs Post Summaries → AI Analysis

```
Pre Summary (structured)
    ↓
Post Summary (structured)
    ↓
regression_ai.analyze_regression()
    ↓
Groq LLM API
    ↓
JSON with: {
    regressionDetected,
    severity,
    explanation,
    stepNotes (per-step)
}
```

---

## Error Handling Flow

### Execution Fails in Agent

```
Agent (main.py)
    ↓
    Exception caught in try-except
    ↓
    spring_callback.mark_failed(test_id, error_message)
    ↓
Backend (ExecutionController)
    ↓
    PUT /api/execution/{testId}/fail
    {
        errorMessage: "Playwright timeout: step not found"
    }
    ↓
    Update TestRun:
    - status: FAILED
    - errorMessage: error_message
    ↓
Frontend
    ↓
    GET /api/test-runs/{testId}
    ↓
    Display error message to user
```

---

## Screenshot Storage & Serving

### Pre-Migration Screenshots

```
Agent captures: /screenshots/pre/{testId}/step_1.png
Stored locally on agent server
↓
Frontend requests: GET /api/assets/screenshots/pre/{testId}/step_1.png
↓
Backend AssetProxyController:
- Proxies request to agent
- Returns image data
↓
Frontend displays in <img> tag
```

### Post-Migration Screenshots

```
Agent captures: /screenshots/post/{testId}/step_1.png
Stored locally on agent server
↓
Frontend requests: GET /api/assets/screenshots/post/{testId}/step_1.png
↓
Backend AssetProxyController:
- Proxies request to agent
- Returns image data
↓
Frontend displays in <img> tag
```

---

## Performance Considerations

1. **Async Execution**: Test runs execute asynchronously; frontend polls for updates
2. **Screenshot Caching**: Frontend caches screenshot URLs; use cache-busting if needed
3. **Pagination**: Test runs are paginated (20 per page) to avoid large transfers
4. **Timeout Guard**: Agent enforces 60-second timeout per test to prevent hanging
5. **Environment Isolation**: Pre/post screenshots stored separately to prevent conflicts

---

## Summary

Data flows through the system in this pattern:

1. **User Input** → Frontend component (NewTest/Dashboard)
2. **Test Creation** → Backend creates TestRun record (MongoDB)
3. **Test Execution** → Backend calls Agent with test details
4. **Script Generation** → Agent uses Groq LLM to create Playwright script
5. **Test Execution** → Agent runs script twice (pre & post URLs)
6. **Screenshot Capture** → Agent captures step-by-step screenshots
7. **AI Analysis** → Agent analyzes regression using Groq LLM
8. **Results Storage** → Agent sends results back to Backend
9. **Database Update** → Backend saves results to MongoDB
10. **Results Display** → Frontend fetches and displays results from Backend

Each component has clear responsibilities, and communication happens via well-defined REST APIs. Data is transformed at each stage (Excel → steps → script → results → analysis → display).
