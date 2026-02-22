from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class WorkflowInput(BaseModel):
    test_run_id: str
    pre_url: str
    post_url: str
    steps: list[str]


class WorkflowResult(BaseModel):
    test_run_id: str
    execution_duration_ms: int
    regression_detected: bool
    severity: str
    risk_score: int
    explanation: str
    step_comparisons: list[dict[str, Any]]
