import os
import subprocess
import json
import uuid
import re
import time
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any, Dict, List

from llm_generator import generate_playwright_script
from spring_callback import mark_running, mark_completed, mark_failed
from regression_ai import analyze_regression
from result_builder import build_structured_summary

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment isolation folders (Task 17) - use absolute paths
_agent_dir = os.path.dirname(os.path.abspath(__file__))
_screenshots_dir = os.path.join(_agent_dir, "screenshots")
_reports_dir = os.path.join(_agent_dir, "reports")
_generated_dir = os.path.join(_agent_dir, "generated_tests")
for d in [
    os.path.join(_screenshots_dir, "pre"),
    os.path.join(_screenshots_dir, "post"),
    os.path.join(_reports_dir, "pre"),
    os.path.join(_reports_dir, "post"),
    os.path.join(_generated_dir, "pre"),
    os.path.join(_generated_dir, "post"),
    _screenshots_dir,
    _reports_dir,
    _generated_dir,
]:
    os.makedirs(d, exist_ok=True)
app.mount("/screenshots", StaticFiles(directory=_screenshots_dir), name="screenshots")
app.mount("/reports", StaticFiles(directory=_reports_dir), name="reports")


# Task 15: Agent health endpoint
@app.get("/health")
def health():
    return {"status": "UP", "version": "1.0"}


class ScriptRequest(BaseModel):
    testRunId: str
    preUrl: str
    postUrl: str
    steps: list[str]


# --------------------------------------------
# 🔥 Execute Playwright and safely extract JSON
# --------------------------------------------
def execute_test(file_path: str, base_url: str, test_run_id: str, run_label: str, env_type: str = "PRE"):

    env = os.environ.copy()
    env["BASE_URL"] = base_url
    env["TEST_RUN_ID"] = test_run_id
    env["RUN_LABEL"] = run_label
    env["ENV_TYPE"] = env_type  # PRE or POST for screenshot paths

    # Task 14: Timeout guard - 60s
    # Run from agent directory so screenshots land in agent/screenshots/
    agent_dir = os.path.dirname(os.path.abspath(__file__))
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
        timeout=60,
        env=env,
        cwd=agent_dir
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


def _flatten_playwright_steps(step_obj: dict) -> list[dict]:
    """
    Playwright JSON reporter step nodes can contain nested `steps`.
    We flatten so we can find our numbered steps regardless of nesting.
    """
    out: list[dict] = []
    stack = [step_obj]
    while stack:
        node = stack.pop()
        out.append(node)
        children = node.get("steps") or []
        for child in reversed(children):
            if isinstance(child, dict):
                stack.append(child)
    return out


def extract_numbered_step_statuses(report: Optional[Dict[str, Any]], steps_count: int) -> List[Optional[bool]]:
    """
    Returns a list of length steps_count.
    Each entry is:
      - True  => step passed
      - False => step failed (error present)
      - None  => step not found in report (e.g., test crashed before reaching it)
    """
    statuses: List[Optional[bool]] = [None] * steps_count
    if not report:
        return statuses

    # Collect all step nodes across all test results.
    step_nodes: list[dict] = []
    for suite in (report.get("suites") or []):
        for spec in (suite.get("specs") or []):
            for test in (spec.get("tests") or []):
                for res in (test.get("results") or []):
                    for s in (res.get("steps") or []):
                        if isinstance(s, dict):
                            step_nodes.extend(_flatten_playwright_steps(s))

    numbered = re.compile(r"^\s*(\d+)\.\s+")

    for node in step_nodes:
        title = node.get("title") or ""
        m = numbered.match(title)
        if not m:
            continue
        idx = int(m.group(1))
        if 1 <= idx <= steps_count:
            statuses[idx - 1] = False if node.get("error") else True

    return statuses


def build_step_results(
    steps: List[str],
    pre_statuses: List[Optional[bool]],
    post_statuses: List[Optional[bool]],
    test_id: str,
    ai_step_notes: Optional[Dict[int, str]] = None,
):
    results: List[Dict[str, Any]] = []

    for i, step_name in enumerate(steps, start=1):
        pre_ok = pre_statuses[i - 1] if i - 1 < len(pre_statuses) else None
        post_ok = post_statuses[i - 1] if i - 1 < len(post_statuses) else None

        def to_label(v: Optional[bool]) -> str:
            if v is True:
                return "PASS"
            if v is False:
                return "FAIL"
            return "SKIPPED"

        pre_label = to_label(pre_ok)
        post_label = to_label(post_ok)

        # Prefer AI-generated, user-friendly note when available
        diff = ""
        if ai_step_notes and i in ai_step_notes:
            diff = ai_step_notes[i]
        elif pre_label != post_label:
            if pre_label == "PASS" and post_label == "FAIL":
                diff = "This step worked before, but fails after migration."
            elif pre_label == "FAIL" and post_label == "PASS":
                diff = "This step fails on the old UI, but works on the new UI."
            else:
                diff = "This step behaves differently between the two versions."

        results.append({
            "stepName": step_name,
            "preStatus": pre_label,
            "postStatus": post_label,
            "difference": diff,
            "preScreenshotPath": f"/screenshots/pre/{test_id}/step_{i}.png",
            "postScreenshotPath": f"/screenshots/post/{test_id}/step_{i}.png",
        })

    return results


def write_simple_html_report(test_id: str, pre_url: str, post_url: str, explanation: str, severity: str, results: list[dict]) -> str:
    agent_dir = os.path.dirname(os.path.abspath(__file__))
    reports_dir = os.path.join(agent_dir, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    report_file = os.path.join(reports_dir, f"report_{test_id}.html")

    def esc(s: str) -> str:
        return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    rows = []
    for idx, r in enumerate(results, start=1):
        rows.append(
            f"<tr>"
            f"<td>{idx}</td>"
            f"<td>{esc(r.get('stepName',''))}</td>"
            f"<td>{esc(r.get('preStatus',''))}</td>"
            f"<td>{esc(r.get('postStatus',''))}</td>"
            f"<td>{esc(r.get('difference',''))}</td>"
            f"</tr>"
        )

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UI Migration Report {esc(test_id)}</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; color: #111827; }}
    .muted {{ color: #6b7280; }}
    .card {{ border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border-bottom: 1px solid #e5e7eb; padding: 10px; text-align: left; vertical-align: top; }}
    th {{ background: #f9fafb; }}
  </style>
</head>
<body>
  <h1>UI Migration Report</h1>
  <p class="muted">Test run: {esc(test_id)}</p>
  <div class="card">
    <div><strong>Pre URL:</strong> {esc(pre_url)}</div>
    <div><strong>Post URL:</strong> {esc(post_url)}</div>
  </div>
  <div class="card">
    <h2 style="margin-top:0;">AI Summary</h2>
    <div><strong>Severity:</strong> {esc(severity)}</div>
    <div style="margin-top:8px;">{esc(explanation)}</div>
  </div>
  <div class="card">
    <h2 style="margin-top:0;">Steps</h2>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Step</th><th>Pre</th><th>Post</th><th>Note</th>
        </tr>
      </thead>
      <tbody>
        {''.join(rows)}
      </tbody>
    </table>
  </div>
</body>
</html>"""

    with open(report_file, "w", encoding="utf-8") as f:
        f.write(html)

    return f"/reports/report_{test_id}.html"


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

    # 3️⃣ Save test file (central location - same script runs for pre & post)
    # Task 6: Inject per-step screenshot capture (screenshots/pre|post/{test_id}/step_N.png)
    step_ss_helper = """
    let __step = 0;
    const __screenshot = async (p, n) => {
      const path = require('path');
      const fs = require('fs');
      const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || '');
      fs.mkdirSync(dir, { recursive: true });
      await p.screenshot({ path: path.join(dir, `step_${n}.png`), fullPage: true });
    };
"""
    # Inject helper after "async ({ page }) => {"
    inject_pattern = re.compile(r"(async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{)")
    playwright_code = inject_pattern.sub(r"\1" + step_ss_helper, playwright_code, count=1)

    # Before each step: take screenshot of previous step (step_N = state after step N)
    def inject_step_ss(match):
        num = match.group(1)
        rest = match.group(2)
        if int(num) == 1:
            return match.group(0)
        return f"if (__step > 0) await __screenshot(page, __step); __step = {num}; await test.step('{num}{rest}"

    step_pattern = re.compile(r"await test\.step\('(\d+)(\.[^']*',\s*async\s*\(\)\s*=>\s*\{)")
    playwright_code = step_pattern.sub(lambda m: inject_step_ss(m) if int(m.group(1)) > 1 else m.group(0), playwright_code)

    # Before step 1: set __step = 1
    step1_pattern = re.compile(r"(await test\.step\('1)(\.[^']*',\s*async\s*\(\)\s*=>\s*\{)")
    playwright_code = step1_pattern.sub(r"__step = 1; await test.step('1\2", playwright_code)

    # After last step: take screenshot of final step
    playwright_code = re.sub(r"(\})\s*;\s*$", r"  await __screenshot(page, __step);\n});\n", playwright_code)

    file_path = os.path.join(_agent_dir, "generated_tests", f"test_{test_id}.spec.js")
    with open(file_path, "w") as f:
        f.write(playwright_code)

    exec_start_ms = int(time.time() * 1000)

    try:
        # Task 14: On timeout (60s), subprocess raises TimeoutExpired → caught below, mark failed

        # 4️⃣ Execute PRE
        pre_result = execute_test(f"generated_tests/test_{test_id}.spec.js", request.preUrl, test_id, "pre", "PRE")

        # 5️⃣ Execute POST
        post_result = execute_test(f"generated_tests/test_{test_id}.spec.js", request.postUrl, test_id, "post", "POST")

        # --------------------------------------------
        # 🔥 Structured Summary Builder (Task 4 - do NOT send full raw JSON)
        # --------------------------------------------
        pre_summary = build_structured_summary(pre_result["report"])
        post_summary = build_structured_summary(post_result["report"])

        # --------------------------------------------
        # 🔥 AI Regression Intelligence (Task 5)
        # --------------------------------------------
        ai_raw = analyze_regression(pre_summary, post_summary)

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

        # Task 7: Risk score calculation
        risk_score = 0
        if severity == "HIGH":
            risk_score = 90
        elif severity == "MEDIUM":
            risk_score = 60
        else:
            risk_score = 20

        # Task 16: Execution duration
        exec_end_ms = int(time.time() * 1000)
        execution_duration_ms = exec_end_ms - exec_start_ms

        # Report paths (store pre/post separately)
        pre_report_path = f"/reports/pre/report_{test_id}.json"
        post_report_path = f"/reports/post/report_{test_id}.json"
        if pre_result.get("report"):
            with open(os.path.join(_agent_dir, "reports", "pre", f"report_{test_id}.json"), "w") as f:
                json.dump(pre_result["report"], f, indent=2)
        if post_result.get("report"):
            with open(os.path.join(_agent_dir, "reports", "post", f"report_{test_id}.json"), "w") as f:
                json.dump(post_result["report"], f, indent=2)

        # Raw outputs (truncate for storage)
        pre_raw = (pre_result.get("stdout") or "")[:10000]
        post_raw = (post_result.get("stdout") or "")[:10000]

        # Optional per-step AI notes
        raw_steps = ai_result.get("steps") or []
        ai_step_notes: Dict[int, str] = {}
        if isinstance(raw_steps, list):
            for item in raw_steps:
                if not isinstance(item, dict):
                    continue
                idx = item.get("index")
                note = item.get("note")
                if isinstance(idx, int) and isinstance(note, str) and note.strip():
                    ai_step_notes[idx] = note.strip()

        success = not regression_detected

        pre_step_statuses = extract_numbered_step_statuses(pre_result["report"], len(request.steps))
        post_step_statuses = extract_numbered_step_statuses(post_result["report"], len(request.steps))
        step_results = build_step_results(request.steps, pre_step_statuses, post_step_statuses, test_id, ai_step_notes)

        report_path = write_simple_html_report(
            test_id=test_id,
            pre_url=request.preUrl,
            post_url=request.postUrl,
            explanation=explanation or "",
            severity=severity or "LOW",
            results=step_results,
        )

        # 7️⃣ Update Spring - always mark_completed when we have results (stores regression info)
        mark_completed(
            test_id,
            step_results,
            report_path,
            pre_status=pre_result["success"],
            post_status=post_result["success"],
            regression_detected=regression_detected,
            severity=severity,
            explanation=explanation,
            pre_report_path=pre_report_path,
            post_report_path=post_report_path,
            pre_raw_output=pre_raw,
            post_raw_output=post_raw,
            risk_score=risk_score,
            execution_duration_ms=execution_duration_ms,
        )

        return {
            "status": "SUCCESS" if success else "FAILED",
            "testRunId": test_id,
            "preStatus": pre_result["success"],
            "postStatus": post_result["success"],
            "regressionDetected": regression_detected,
            "severity": severity,
            "explanation": explanation,
            "reportPath": report_path,
            "preReportPath": pre_report_path,
            "postReportPath": post_report_path,
            "preRawOutput": pre_raw,
            "postRawOutput": post_raw,
            "riskScore": risk_score,
            "executionDurationMs": execution_duration_ms,
            "results": step_results,
        }

    except Exception as e:
        mark_failed(test_id, str(e))
        return {
            "status": "FAILED",
            "testRunId": test_id,
            "executionError": str(e)
        }
