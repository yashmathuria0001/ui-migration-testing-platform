"""
Structured result builder for Playwright JSON reports.
Do NOT send full raw JSON to LLM - only structured summary.
"""


def build_structured_summary(playwright_json: dict | None) -> dict:
    """
    Extract a compact structured summary from Playwright JSON report.
    Returns a dict suitable for LLM consumption without raw JSON bloat.

    Returns:
        {
            "totalTests": int,
            "passed": int,
            "failed": int,
            "failedTests": [
                {"title": "...", "error": "...", "location": "..."},
                ...
            ]
        }
    """
    if not playwright_json:
        return {
            "totalTests": 0,
            "passed": 0,
            "failed": 0,
            "failedTests": [],
        }

    total = 0
    passed = 0
    failed = 0
    failed_tests = []

    suites = playwright_json.get("suites") or []
    for suite in suites:
        specs = suite.get("specs") or []
        for spec in specs:
            tests = spec.get("tests") or []
            for test in tests:
                total += 1
                results = test.get("results") or []
                for res in results:
                    status = res.get("status", "")
                    ok = status in ("passed", "expected")
                    if ok:
                        passed += 1
                    else:
                        failed += 1
                        title = test.get("title") or "Unknown"
                        error = ""
                        loc = ""
                        if res.get("error"):
                            err_obj = res["error"]
                            if isinstance(err_obj, str):
                                error = err_obj[:500]
                            elif isinstance(err_obj, dict):
                                error = (err_obj.get("message") or err_obj.get("value") or str(err_obj))[:500]
                        if res.get("location"):
                            loc_obj = res["location"]
                            if isinstance(loc_obj, dict):
                                loc = loc_obj.get("file", "") or ""
                            else:
                                loc = str(loc_obj)[:200]
                        failed_tests.append({
                            "title": str(title)[:200],
                            "error": error,
                            "location": loc,
                        })

    return {
        "totalTests": total,
        "passed": passed,
        "failed": failed,
        "failedTests": failed_tests,
    }
