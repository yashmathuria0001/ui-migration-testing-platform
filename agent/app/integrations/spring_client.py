from __future__ import annotations

from typing import Any

import requests

from app.core.settings import SPRING_BASE_URL


def _put(path: str, payload: dict[str, Any] | None = None) -> None:
    url = f"{SPRING_BASE_URL}{path}"
    requests.put(url, json=payload, timeout=20)


def mark_running(test_id: str) -> None:
    _put(f"/api/execution/{test_id}/start")


def mark_completed(
    test_id: str,
    *,
    results: list[dict[str, Any]],
    pre_status: bool,
    post_status: bool,
    regression_detected: bool,
    severity: str,
    explanation: str,
    pre_raw_output: str,
    post_raw_output: str,
    risk_score: int,
    execution_duration_ms: int,
    overall_analysis: dict[str, Any],
) -> None:
    payload = {
        "results": results,
        "preStatus": pre_status,
        "postStatus": post_status,
        "regressionDetected": regression_detected,
        "severity": severity,
        "explanation": explanation,
        "preRawOutput": pre_raw_output,
        "postRawOutput": post_raw_output,
        "riskScore": risk_score,
        "executionDurationMs": execution_duration_ms,
        "overallAnalysis": overall_analysis,
    }
    _put(f"/api/execution/{test_id}/complete", payload)


def mark_failed(test_id: str, error_message: str) -> None:
    _put(f"/api/execution/{test_id}/fail", {"errorMessage": error_message})
