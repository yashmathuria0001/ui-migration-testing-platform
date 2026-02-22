from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from app.core.settings import BASE_DIR, PLAYWRIGHT_TIMEOUT_SECONDS


def execute_playwright(script_file: Path, base_url: str, test_id: str, label: str) -> dict[str, Any]:
    env = os.environ.copy()
    env["BASE_URL"] = base_url
    env["TEST_RUN_ID"] = test_id
    env["RUN_LABEL"] = label

    result = subprocess.run(
        ["npx", "playwright", "test", str(script_file), "--reporter=json"],
        cwd=BASE_DIR,
        capture_output=True,
        text=True,
        env=env,
        timeout=PLAYWRIGHT_TIMEOUT_SECONDS,
    )

    parsed_report = _extract_report(result.stdout)

    return {
        "success": result.returncode == 0,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "report": parsed_report,
        "step_results": extract_step_results_from_stdout(result.stdout),
    }


def _extract_report(stdout: str) -> dict[str, Any] | None:
    try:
        start = stdout.find("{")
        end = stdout.rfind("}")
        if start == -1 or end == -1:
            return None
        return json.loads(stdout[start : end + 1])
    except Exception:
        return None


def extract_step_results_from_stdout(stdout: str) -> list[dict[str, Any]]:
    if not stdout:
        return []

    # Generated scripts print: STEP_RESULTS: <json-array>
    matches = re.findall(r"STEP_RESULTS:\s*(\[[\s\S]*?\])", stdout)
    if not matches:
        return []

    for raw in reversed(matches):
        try:
            parsed = json.loads(raw)
            normalized: list[dict[str, Any]] = []
            for item in parsed:
                status = str(item.get("status", "FAIL")).upper()
                error_message = item.get("error")
                lowered = str(error_message or "").lower()
                normalized.append(
                    {
                        "stepName": item.get("step"),
                        "status": status if status in {"PASS", "FAIL"} else "FAIL",
                        "durationMs": None,
                        "errorMessage": error_message,
                        "timeout": "timeout" in lowered,
                        "selectorError": any(
                            token in lowered
                            for token in ["locator", "not found", "strict mode violation"]
                        ),
                    }
                )
            return normalized
        except Exception:
            continue

    return []


def extract_structured_steps(report_json: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not report_json:
        return []

    steps: list[dict[str, Any]] = []

    for suite in report_json.get("suites", []):
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                for result in test.get("results", []):
                    test_level_error = None
                    if result.get("errors"):
                        test_level_error = result["errors"][0].get("message")

                    for step in result.get("steps", []):
                        error_msg = None
                        if step.get("error"):
                            error_msg = step["error"].get("message")

                        final_error = error_msg or test_level_error or ""
                        lowered = final_error.lower()

                        steps.append(
                            {
                                "stepName": step.get("title"),
                                "status": "PASS" if not final_error else "FAIL",
                                "durationMs": step.get("duration"),
                                "errorMessage": final_error or None,
                                "timeout": "timeout" in lowered,
                                "selectorError": any(
                                    token in lowered
                                    for token in ["locator", "page.fill", "not found"]
                                ),
                            }
                        )

    return steps
