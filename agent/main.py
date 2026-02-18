import os
import subprocess
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from llm_generator import generate_playwright_script
from spring_callback import mark_running, mark_completed, mark_failed

app = FastAPI()


class ScriptRequest(BaseModel):
    testRunId: str
    preUrl: str
    postUrl: str
    steps: list[str]


def execute_test(file_path: str, base_url: str):
    """
    Runs Playwright test against given base URL.
    """

    env = os.environ.copy()
    env["BASE_URL"] = base_url

    result = subprocess.run(
        ["npx", "playwright", "test", file_path],
        capture_output=True,
        text=True,
        timeout=60,
        env=env
    )

    return {
        "success": result.returncode == 0,
        "output": result.stdout,
        "error": result.stderr
    }


@app.post("/generate-script")
def generate_script(request: ScriptRequest):

    if not request.testRunId:
        raise HTTPException(status_code=400, detail="testRunId is required")

    test_id = request.testRunId

    # 1️⃣ Mark RUNNING in Spring
    mark_running(test_id)

    # 2️⃣ Generate Playwright code
    playwright_code = generate_playwright_script(request.steps)

    # 3️⃣ Save test file
    os.makedirs("generated_tests", exist_ok=True)
    file_path = f"generated_tests/test_{test_id}.spec.js"

    with open(file_path, "w") as f:
        f.write(playwright_code)

    try:

        # 4️⃣ Execute PRE migration
        pre_result = execute_test(file_path, request.preUrl)

        # 5️⃣ Execute POST migration
        post_result = execute_test(file_path, request.postUrl)

        # 6️⃣ Compare results
        difference = None

        if pre_result["success"] != post_result["success"]:
            difference = "Status mismatch between pre and post"

        elif pre_result["output"] != post_result["output"]:
            difference = "Execution output differs"

        success = pre_result["success"] and post_result["success"]

        report_path = f"/reports/report_{test_id}.html"

        # 7️⃣ Update Spring
        if success:
            mark_completed(test_id)
        else:
            mark_failed(test_id, difference or "Migration difference detected")

        return {
            "status": "SUCCESS" if success else "FAILED",
            "testRunId": test_id,
            "preStatus": pre_result["success"],
            "postStatus": post_result["success"],
            "difference": difference,
            "preOutput": pre_result["output"],
            "postOutput": post_result["output"],
            "reportPath": report_path
        }

    except Exception as e:
        mark_failed(test_id, str(e))

        return {
            "status": "FAILED",
            "testRunId": test_id,
            "error": str(e)
        }
