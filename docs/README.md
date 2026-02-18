# UI Migration Testing Platform — Architecture & Documentation

## Overview

The **UI Migration Testing Platform** is an enterprise-grade system for comparing pre-migration and post-migration user interfaces. It automates test execution, captures screenshots, and uses AI to detect regressions with severity assessment and risk scoring.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        React Enterprise Dashboard (Frontend)                      │
│                    Port 5173 | Vite + React + Tailwind CSS                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          │ HTTP (REST)
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     Spring Boot Backend (Orchestrator)                            │
│                         Port 8000 | Java 21                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ TestRun      │ │ Execution    │ │ Upload       │ │ Asset Proxy              │ │
│  │ Controller   │ │ Controller   │ │ Controller   │ │ (Screenshots)            │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────────┘ └────────────┬─────────────┘ │
│         │                │                                                       │
│         └────────────────┴───────────────────┬───────────────────┘               │
│                                              │                                    │
│                              ┌───────────────▼───────────────┐                    │
│                              │     MongoDB (Test Runs)       │                    │
│                              └───────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          │ HTTP (REST)
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     Python Agent (Execution Engine)                               │
│                         Port 5000 | FastAPI                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │ POST /generate-script  │  Generate Playwright script, run PRE & POST,        │ │
│  │                        │  analyze regression, callback to Spring             │ │
│  │ GET  /health           │  Agent health check                                 │ │
│  │ Static: /screenshots   │  Serve screenshots                                 │ │
│  │ Static: /reports       │  Serve HTML/JSON reports                           │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                          │                                        │
│         ┌────────────────────────────────┼────────────────────────────────┐       │
│         ▼                                ▼                                ▼       │
│  ┌─────────────┐              ┌──────────────────┐              ┌──────────────┐  │
│  │ LLM         │              │ Playwright       │              │ Groq LLM     │  │
│  │ Generator   │              │ (npx playwright) │              │ Regression   │  │
│  │ (Groq)      │              │ PRE + POST run   │              │ AI           │  │
│  └─────────────┘              └──────────────────┘              └──────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Frontend (React + Vite)

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| Vite 7 | Build tool & dev server |
| Axios | HTTP client |
| Lucide React | Icons |
| Tailwind CSS | Styling |

**Structure:**
- **Dashboard** — Summary cards (Total Runs, Passed, Failed, Regressions, High Severity), paginated test runs table, detail drawer with AI explanation, pre/post status, failed tests, raw logs, screenshots, risk score
- **New Test** — Form to create and run migration tests (Excel or JSON import)
- **DashboardLayout** — Sidebar navigation, top header, main content area

**Configuration:**
- `VITE_BACKEND_BASE_URL` — Spring backend URL (default: `http://localhost:8000`)
- `VITE_AGENT_ASSET_BASE_URL` — Agent URL for reports (default: `http://localhost:5000`)

Screenshots are loaded via the backend proxy (`/api/assets/screenshots/**`) to avoid CORS issues.

---

### 2. Backend (Spring Boot)

| Technology | Purpose |
|------------|---------|
| Spring Boot 4 | Web framework |
| Spring Data MongoDB | Persistence |
| Apache POI | Excel parsing |
| Java 21 | Runtime |

**Key Controllers:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/testruns/upload` | POST | Create test run from Excel file |
| `/api/testruns/create` | POST | Create test run from JSON (pre/post URLs + steps) |
| `/api/test-runs` | GET | Paginated list of test runs (sorted by `createdAt` DESC) |
| `/api/test-runs/stats` | GET | Aggregate stats (total, passed, failed, regressions, high severity) |
| `/api/test-runs/create` | POST | Create test run (TestRunController) |
| `/api/execution/{id}/start` | PUT | Mark test run as RUNNING |
| `/api/execution/{id}/complete` | PUT | Mark test run as COMPLETED with results |
| `/api/execution/{id}/fail` | PUT | Mark test run as FAILED |
| `/api/execution/{id}` | GET | Get test run by ID |
| `/api/execution/{id}/run` | POST | Full execution (marks running, calls agent, updates DB) |
| `/api/execute/{id}` | POST | Alternative orchestration entry |
| `/api/assets/screenshots/**` | GET | Proxy screenshots from agent to frontend |

**Data Model (TestRun):**
- `id`, `preMigrationUrl`, `postMigrationUrl`, `status` (CREATED, RUNNING, COMPLETED, FAILED)
- `results` — List of `StepResult` (stepName, preStatus, postStatus, difference, preScreenshotPath, postScreenshotPath)
- AI fields: `regressionDetected`, `severity`, `aiExplanation`, `preStatus`, `postStatus`, `preReportPath`, `postReportPath`, `preRawOutput`, `postRawOutput`
- `riskScore` (0–100), `executionDurationMs`

---

### 3. Python Agent (FastAPI)

| Technology | Purpose |
|------------|---------|
| FastAPI | Web framework |
| Groq (LLaMA 3.3) | Script generation & regression analysis |
| Playwright | Browser automation |
| dotenv | Environment config |

**Modules:**

| Module | Responsibility |
|--------|----------------|
| `main.py` | FastAPI app, `/generate-script` endpoint, Playwright execution, step result building |
| `llm_generator.py` | Converts plain-English steps → Playwright JS via Groq |
| `regression_ai.py` | Compares PRE vs POST summaries → JSON (regressionDetected, severity, explanation, per-step notes) |
| `result_builder.py` | Extracts structured summary from Playwright JSON (totalTests, passed, failed, failedTests) |
| `spring_callback.py` | HTTP callbacks to Spring: `mark_running`, `mark_completed`, `mark_failed` |

**Execution Flow:**
1. Receive `ScriptRequest` (testRunId, preUrl, postUrl, steps)
2. Call `mark_running(test_id)` → Spring
3. Generate Playwright script via LLM
4. Inject per-step screenshot logic programmatically
5. Run Playwright **PRE** (base_url = preUrl)
6. Run Playwright **POST** (base_url = postUrl)
7. Build structured summaries with `result_builder`
8. Run regression analysis via `regression_ai`
9. Compute risk score (HIGH=90, MEDIUM=60, LOW=20)
10. Call `mark_completed` with full payload
11. Return JSON response to Spring

**Environment variables:**
- `GROQ_API_KEY` — Groq API key
- `SPRING_BASE_URL` — Spring backend URL (e.g. `http://localhost:8000`)

---

### 4. Playwright Integration

- **Config:** `agent/playwright.config.js` — testDir `./generated_tests`, timeout 30s, headless
- **Screenshots:** Injected logic writes to `screenshots/{pre|post}/{test_id}/step_N.png`
- **Reports:** JSON reporter for parsing; HTML report generated by agent

---

## End-to-End Flow

### Creating and Running a Test

1. **Frontend** → User uploads Excel/JSON or enters URLs + steps
2. **Frontend** → `POST /api/testruns/upload` or `POST /api/testruns/create` → receives `TestRun` with `id`
3. **Frontend** → `POST /api/execution/{id}/run`
4. **Spring** → Marks run as RUNNING, calls `AgentClientService.executeAgent(run)`
5. **Spring** → `GET http://localhost:5000/health` (health check)
6. **Spring** → `POST http://localhost:5000/generate-script` with `AgentRequest`
7. **Agent** → `PUT {SPRING}/api/execution/{id}/start`
8. **Agent** → Generates script, injects screenshots, runs PRE, runs POST
9. **Agent** → Builds summaries, runs regression AI, computes risk score
10. **Agent** → `PUT {SPRING}/api/execution/{id}/complete` with full payload
11. **Agent** → Returns `AgentResponse` to Spring
12. **Spring** → Persists to MongoDB via `markAsCompleted`
13. **Frontend** → Receives updated `TestRun`, displays results and screenshots

### Screenshot Loading

1. Frontend requests: `http://localhost:8000/api/assets/screenshots/pre/{testId}/step_1.png`
2. Spring `AssetProxyController` fetches from `http://localhost:5000/screenshots/pre/{testId}/step_1.png`
3. Spring streams response to frontend (avoids CORS and mixed content)

---

## Project Structure

```
ui-migration-testing-platform/
├── backend/                    # Spring Boot (Java 21)
│   └── src/main/java/com/backend/backend/
│       ├── controller/         # REST controllers
│       ├── service/            # Business logic
│       ├── model/              # TestRun, StepResult
│       ├── dto/                # AgentRequest, AgentResponse, etc.
│       ├── repository/         # MongoDB repository
│       └── config/             # WebConfig, RestTemplate
├── frontend/                   # React + Vite
│   └── src/
│       ├── components/         # Dashboard, NewTest, DashboardLayout
│       ├── App.jsx
│       └── index.css
├── agent/                      # Python FastAPI
│   ├── main.py                 # FastAPI app, execution orchestration
│   ├── llm_generator.py        # Playwright script generation
│   ├── regression_ai.py        # Regression detection LLM
│   ├── result_builder.py       # Structured summary from Playwright JSON
│   ├── spring_callback.py      # Callbacks to Spring
│   ├── playwright.config.js
│   ├── generated_tests/        # Generated Playwright specs
│   ├── screenshots/            # pre/, post/ subdirs
│   └── reports/                # HTML & JSON reports
├── docs/                       # This documentation
└── storage/                    # Test input storage (optional)
```

---

## Getting Started

### Prerequisites

- **Java 21**
- **Node.js 18+** (for frontend & Playwright)
- **Python 3.10+**
- **MongoDB** (local or Atlas)
- **Groq API key**

### Backend

```bash
cd backend
./gradlew bootRun
# Runs on http://localhost:8000
```

### Agent

```bash
cd agent
pip install fastapi uvicorn groq python-dotenv requests pydantic
# Ensure Node.js has Playwright: npx playwright install
echo "GROQ_API_KEY=your_key" > .env
echo "SPRING_BASE_URL=http://localhost:8000" >> .env
uvicorn main:app --reload --host 0.0.0.0 --port 5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

### Environment Summary

| Variable | Where | Purpose |
|----------|-------|---------|
| `server.port` | Backend | Spring port (default 8000) |
| `spring.mongodb.uri` | Backend | MongoDB connection string |
| `GROQ_API_KEY` | Agent | Groq API for LLM |
| `SPRING_BASE_URL` | Agent | Spring URL for callbacks |
| `VITE_BACKEND_BASE_URL` | Frontend | Spring URL |
| `VITE_AGENT_ASSET_BASE_URL` | Frontend | Agent URL (reports) |

---

## Risk Scoring

| Severity | Risk Score |
|----------|------------|
| HIGH | 90 |
| MEDIUM | 60 |
| LOW | 20 |

**Regression rules (AI):**
- POST has new failures → HIGH
- Both fail same test → LOW
- Failure count increased → HIGH
- Performance degradation only → MEDIUM
- Identical results → `regressionDetected: false`

---

## Enterprise Features

- **Timeout guard:** 60s max per Playwright run
- **Health check:** Spring pings agent before execution
- **Execution duration:** Stored in `executionDurationMs`
- **Environment isolation:** Separate `pre/` and `post/` folders for screenshots and reports
- **CORS:** Agent allows all origins; frontend uses backend proxy for screenshots

---

## License & Contact

This project is part of the UI Migration Testing Platform. For questions or contributions, refer to the main repository.
