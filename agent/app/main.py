from __future__ import annotations

from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.logging_utils import log
from app.core.settings import REPORTS_DIR, SCREENSHOTS_DIR
from app.integrations.spring_client import mark_failed
from app.schemas.execution import ScriptRequest
from app.workflow.runner import WorkflowRunner
from app.workflow.state import WorkflowInput

app = FastAPI()
runner = WorkflowRunner()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve execution artifacts for backend asset proxy (/api/assets -> agent URL)
app.mount("/screenshots", StaticFiles(directory=str(SCREENSHOTS_DIR)), name="screenshots")
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")


@app.post("/generate-script")
async def generate_script(request: ScriptRequest):
    payload = WorkflowInput(
        test_run_id=request.test_run_id,
        pre_url=request.pre_url,
        post_url=request.post_url,
        steps=request.steps,
    )

    try:
        result = await runner.execute(payload)

        return {
            "status": "SUCCESS",
            "testRunId": result.test_run_id,
            "executionDurationMs": result.execution_duration_ms,
            "regressionDetected": result.regression_detected,
            "severity": result.severity,
            "riskScore": result.risk_score,
            "explanation": result.explanation,
            "overallAnalysis": result.overall_analysis,
            "stepComparisons": result.step_comparisons,
        }
    except Exception as exc:
        log(f"[{payload.test_run_id}] Workflow failed: {exc}")
        mark_failed(payload.test_run_id, str(exc))
        return {
            "status": "FAILED",
            "testRunId": payload.test_run_id,
            "error": str(exc),
        }


@app.get("/health")
def health():
    return {
        "status": "UP",
        "service": "ui-migration-adk-agent",
        "timestamp": datetime.now().isoformat(),
    }
