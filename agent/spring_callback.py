import os
import requests
from dotenv import load_dotenv

load_dotenv()

SPRING_BASE_URL = os.getenv("SPRING_BASE_URL")


def mark_running(test_id: str):
    url = f"{SPRING_BASE_URL}/api/execution/{test_id}/start"
    requests.put(url)


def mark_completed(
    test_id: str,
    results: list[dict] = None,
    report_path: str = None,
    pre_status: bool = None,
    post_status: bool = None,
    regression_detected: bool = None,
    severity: str = None,
    explanation: str = None,
    pre_report_path: str = None,
    post_report_path: str = None,
    pre_raw_output: str = None,
    post_raw_output: str = None,
    risk_score: int = None,
    execution_duration_ms: int = None,
):
    url = f"{SPRING_BASE_URL}/api/execution/{test_id}/complete"

    payload = {
        "results": results or [],
        "reportPath": report_path,
        "preStatus": pre_status,
        "postStatus": post_status,
        "regressionDetected": regression_detected,
        "severity": severity,
        "explanation": explanation,
        "preReportPath": pre_report_path,
        "postReportPath": post_report_path,
        "preRawOutput": pre_raw_output,
        "postRawOutput": post_raw_output,
        "riskScore": risk_score,
        "executionDurationMs": execution_duration_ms,
    }

    requests.put(url, json=payload)


def mark_failed(test_id: str, error_message: str):
    url = f"{SPRING_BASE_URL}/api/execution/{test_id}/fail"

    payload = {
        "errorMessage": error_message
    }

    requests.put(url, json=payload)
