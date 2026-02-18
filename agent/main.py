import os
import subprocess
import json
import uuid
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from llm_generator import generate_playwright_script
from spring_callback import mark_running, mark_completed, mark_failed
from regression_ai import analyze_regression

app = FastAPI()


class ScriptRequest(BaseModel):
    testRunId: str
    preUrl: str
    postUrl: str
    steps: list[str]


# --------------------------------------------
# 🔥 Execute Playwright and safely extract JSON
# --------------------------------------------
def execute_test(file_path: str, base_url: str):

    env = os.environ.copy()
    env["BASE_URL"] = base_url

    result = subprocess.run(
        [
            "npx",
            "playwright",
            "test",
            file_path,
            "--reporter=json"
        ],
        capture_output=True,
        text=True,
        timeout=90,
        env=env
    )

    report = None

    if result.stdout:
        try:
            # Playwright JSON reporter sometimes prints logs before JSON.
            # So we try to extract JSON block safely.
            first_brace = result.stdout.find("{")
            last_brace = result.stdout.rfind("}")

            if first_brace != -1 and last_brace != -1:
                json_str = result.stdout[first_brace:last_brace + 1]
                report = json.loads(json_str)

        except Exception as e:
            print("Playwright JSON parse error:", str(e))
            print("Raw STDOUT preview:", result.stdout[:500])
            report = None

    return {
        "success": result.returncode == 0,
        "report": report,
        "stdout": result.stdout,
        "stderr": result.stderr
    }


# --------------------------------------------
# 🔥 Main Endpoint
# --------------------------------------------
@app.post("/generate-script")
def generate_script(request: ScriptRequest):

    if not request.testRunId:
        raise HTTPException(status_code=400, detail="testRunId is required")

    test_id = request.testRunId

    # 1️⃣ Mark RUNNING
    mark_running(test_id)

    # 2️⃣ Generate Playwright Script
    playwright_code = generate_playwright_script(request.steps)

    # 🔥 Safety: ensure BASE_URL is used
    if "http://" in playwright_code or "https://" in playwright_code:
        raise HTTPException(
            status_code=500,
            detail="Generated script contains hardcoded URL"
        )

    # 3️⃣ Save test file
    os.makedirs("generated_tests", exist_ok=True)
    file_path = f"generated_tests/test_{test_id}.spec.js"

    with open(file_path, "w") as f:
        f.write(playwright_code)

    try:

        # 4️⃣ Execute PRE
        pre_result = execute_test(file_path, request.preUrl)

        # 5️⃣ Execute POST
        post_result = execute_test(file_path, request.postUrl)

        # --------------------------------------------
        # 🔥 Structured Summary Builder
        # --------------------------------------------
        structured_summary = {
            "pre": {
                "success": pre_result["success"],
                "tests": pre_result["report"]
            },
            "post": {
                "success": post_result["success"],
                "tests": post_result["report"]
            }
        }

        # --------------------------------------------
        # 🔥 AI Regression Intelligence
        # --------------------------------------------
        ai_raw = analyze_regression(
            structured_summary["pre"],
            structured_summary["post"]
        )

        if not ai_raw or not ai_raw.strip():
            raise ValueError("AI returned empty response")

        cleaned = ai_raw.strip()
        cleaned = cleaned.replace("```json", "")
        cleaned = cleaned.replace("```", "").strip()

        try:
            ai_result = json.loads(cleaned)
        except Exception:
            print("AI parsing failed. Raw:", cleaned)
            ai_result = {
                "regressionDetected": True,
                "severity": "HIGH",
                "explanation": "AI parsing failure"
            }

        regression_detected = ai_result.get("regressionDetected", False)
        severity = ai_result.get("severity", "LOW")
        explanation = ai_result.get("explanation", "")

        success = not regression_detected

        report_path = f"/reports/report_{test_id}.html"

        # 7️⃣ Update Spring
        if success:
            mark_completed(test_id)
        else:
            mark_failed(test_id, explanation)

        return {
            "status": "SUCCESS" if success else "FAILED",
            "testRunId": test_id,
            "preStatus": pre_result["success"],
            "postStatus": post_result["success"],
            "regressionDetected": regression_detected,
            "severity": severity,
            "explanation": explanation,
            "reportPath": report_path
        }

    except Exception as e:
        mark_failed(test_id, str(e))
        return {
            "status": "FAILED",
            "testRunId": test_id,
            "error": str(e)
        }
