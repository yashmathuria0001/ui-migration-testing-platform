# Repository Structure and Data Flow

This document provides a comprehensive overview of the **UI Migration Testing Platform** repository, including its hierarchical structure, mutual dependencies, and end-to-end execution flows.

## 1. System Architecture

The platform is divided into three primary services that work together to automate UI regression testing during migrations.

```mermaid
graph TD
    subgraph "Frontend (React + Vite)"
        FE_App[App.jsx] --> FE_Layout[DashboardLayout.jsx]
        FE_Layout --> FE_Dash[Dashboard.jsx]
        FE_Layout --> FE_New[NewTest.jsx]
    end

    subgraph "Backend (Spring Boot)"
        BE_ExecCtrl[ExecutionController]
        BE_TestCtrl[TestRunController]
        BE_AssetCtrl[AssetProxyController]
        BE_AgentSvc[AgentClientService]
        BE_TestSvc[TestRunService]
        BE_DB[(MongoDB)]

        BE_ExecCtrl --> BE_TestSvc
        BE_ExecCtrl --> BE_AgentSvc
        BE_TestCtrl --> BE_TestSvc
        BE_TestSvc --> BE_DB
        BE_AssetCtrl --> BE_AgentSvc
    end

    subgraph "Agent (Python FastAPI)"
        AG_Main[main.py]
        AG_Runner[WorkflowRunner]
        AG_ScriptSvc[script_generation.py]
        AG_PW_Runner[playwright_runner.py]
        AG_AI_Svc[regression_analysis.py]
        AG_SpringClient[spring_client.py]
        
        AG_Main --> AG_Runner
        AG_Runner --> AG_ScriptSvc
        AG_Runner --> AG_PW_Runner
        AG_Runner --> AG_AI_Svc
        AG_Runner --> AG_SpringClient
    end

    subgraph "External & Target Apps"
        LLM[Groq LLM]
        PRE_APP[Pre-Migration App :3000]
        POST_APP[Post-Migration App :3001]
    end

    %% Interactions
    FE_New -- "POST /api/execution/{id}/run" --> BE_ExecCtrl
    FE_Dash -- "GET /api/test-runs" --> BE_TestCtrl
    FE_Dash -- "GET /api/assets/**" --> BE_AssetCtrl

    BE_AgentSvc -- "POST /generate-script" --> AG_Main
    BE_AssetCtrl -- "GET /screenshots/**" --> AG_Main

    AG_ScriptSvc -- "Prompt" --> LLM
    AG_PW_Runner -- "Execute Test" --> PRE_APP
    AG_PW_Runner -- "Execute Test" --> POST_APP
    AG_AI_Svc -- "Compare" --> LLM
    AG_SpringClient -- "PUT /api/execution/{id}/complete" --> BE_ExecCtrl
```

---

## 2. Detailed Execution Flow

The following sequence diagram illustrates the lifecycle of a test execution, from the user triggering it on the frontend to the final report generation.

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Agent
    participant LLM
    participant TargetApps as Pre/Post Apps

    User->>Frontend: Click "Run Test"
    Frontend->>Backend: POST /api/execution/{id}/run
    Backend->>Backend: Mark TestRun as RUNNING
    Backend->>Agent: POST /generate-script (steps, urls)
    
    Agent->>Agent: Initialize Workflow
    Agent->>LLM: Generate Playwright Script from Steps
    LLM-->>Agent: JavaScript Test Code
    
    Agent->>TargetApps: Run Playwright (PRE version)
    TargetApps-->>Agent: Screenshots & Raw Logs (PRE)
    
    Agent->>TargetApps: Run Playwright (POST version)
    TargetApps-->>Agent: Screenshots & Raw Logs (POST)
    
    Agent->>LLM: Analyze Regressions (Compare PRE vs POST)
    LLM-->>Agent: AI Explanation, Severity, Risk Score
    
    Agent->>Agent: Build HTML Report
    Agent->>Backend: PUT /api/execution/{id}/complete (Full Results)
    
    Backend->>Backend: Update MongoDB with Results
    Backend-->>Frontend: Success Response
    
    Frontend->>User: Display Results & AI Insights
```

---

## 3. Directory Structure and Responsibilities

### 📂 `frontend/`
The React-based dashboard for user interaction.
- **`src/components/NewTest.jsx`**: Handles test creation and orchestration triggers.
- **`src/components/Dashboard.jsx`**: Visualizes historical runs and detailed analysis.

### 📂 `backend/`
The Java/Spring Boot orchestration layer.
- **`src/main/java/.../controller/ExecutionController.java`**: Orchestrates the run lifecycle.
- **`src/main/java/.../controller/AssetProxyController.java`**: Proxies files from the agent to bypass CORS and centralize access.
- **`src/main/java/.../service/AgentClientService.java`**: Manages communication with the Python Agent.

### 📂 `agent/`
The AI-powered execution engine.
- **`app/services/script_generation.py`**: Bridges natural language business steps to executable Playwright code.
- **`app/services/playwright_runner.py`**: Manages dual-environment execution and artifact collection.
- **`app/services/regression_analysis.py`**: Interprets visual and behavioral differences using LLMs.
- **`app/workflow/runner.py`**: A state-machine approach to ensuring all steps complete or fail gracefully.

### 📂 `urls/`
Contains the target applications under test.
- **`pre migration/`**: The legacy version of the UI.
- **`post migration/`**: The updated version being validated.

---

## 4. Key Dependencies

| Service | Key Technologies | Primary Dependency |
| :--- | :--- | :--- |
| **Frontend** | React, Vite, CSS Modules | Backend API (`:8000`) |
| **Backend** | Spring Boot, MongoDB, RestTemplate | Agent API (`:5001`), MongoDB |
| **Agent** | FastAPI, Playwright, Groq LLM, ADK | Backend Callbacks, Groq API, Target Apps |

---

## 5. Mutual Interlinking

1.  **Orchestration Link**: Backend triggers Agent, but Agent provides callbacks to Backend to update status (`start`, `complete`, `fail`).
2.  **Asset Link**: Frontend requests images from Backend (`/api/assets`), which Backend fetches from Agent (`/screenshots`).
3.  **Data Link**: All three layers share the `TestRun ID` as the primary key for tracking state and artifacts across the distributed system.
