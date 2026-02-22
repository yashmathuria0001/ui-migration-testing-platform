from __future__ import annotations

import json
import re
from typing import Any

from groq import Groq

from app.core.settings import GROQ_API_KEY, GROQ_MODEL


def _get_client() -> Groq:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")
    return Groq(api_key=GROQ_API_KEY)


def _contains_technical_terms(text: str) -> bool:
    lowered = text.lower()
    technical_markers = [
        "ms",
        "millisecond",
        "latency",
        "selector",
        "dom",
        "stack trace",
        "http",
        "api",
        "react",
        "vite",
        "playwright",
        "assert",
        "locat",
        "render",
        "css",
        "javascript",
        "typescript",
        "framework",
    ]
    return any(marker in lowered for marker in technical_markers)


def _build_plain_difference(step_name: str, pre_status: str, post_status: str, regression: bool) -> str:
    if regression:
        return (
            f"In '{step_name}', people may see different behavior after migration. "
            "This can create confusion and reduce trust because the screen or response no longer feels the same. "
            "Please align the post-migration behavior with the expected pre-migration user experience."
        )
    if pre_status == "PASS" and post_status == "PASS":
        return (
            f"In '{step_name}', the user outcome appears consistent in both versions. "
            "No meaningful user-facing difference was detected, so this step is stable."
        )
    return (
        f"In '{step_name}', there is a noticeable behavior change between versions. "
        "Review this step to confirm users still get the same expected outcome."
    )


def _build_plain_fix(step_name: str, regression: bool) -> str:
    if not regression:
        return ""
    return (
        f"Review '{step_name}' and restore the post-migration flow so users see the same result and message as before migration."
    )


def analyze_regression(
    steps: list[str],
    pre_results: list[dict[str, Any]],
    post_results: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = f"""
You are a senior QA regression analyst writing for non-technical business users.

Compare PRE and POST structured execution results step-by-step.

Return STRICT JSON in this format:
{{
  "regressionDetected": true/false,
  "severity": "LOW|MEDIUM|HIGH",
  "riskScore": number,
  "aiExplanation": "short non-technical overall summary",
  "stepComparisons": [
    {{
      "stepName": "...",
      "preStatus": "...",
      "postStatus": "...",
      "difference": "2-4 sentence plain-language explanation of what changed and why it matters",
      "recommendedFix": "plain-language fix recommendation (required when regression=true, else empty string)",
      "regression": true/false,
      "impact": "LOW|MEDIUM|HIGH"
    }}
  ]
}}

Writing style rules:
- Use plain language a common user can understand.
- Avoid technical details, code terms, stack traces, selectors, framework names, or implementation internals.
- Do not mention performance numbers, milliseconds, response times, or system internals.
- Always describe business/user impact in simple terms.
- For each failed/regressed step, provide a concrete fix in 'recommendedFix'.
- For non-regressed steps, keep 'recommendedFix' as empty string.
- Do not include markdown. Return only valid JSON.

Steps:
{json.dumps(steps, indent=2)}

PRE RESULTS:
{json.dumps(pre_results, indent=2)}

POST RESULTS:
{json.dumps(post_results, indent=2)}
"""

    try:
        response = _get_client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        content = response.choices[0].message.content.strip()
        cleaned = content.replace("```json", "").replace("```", "")
        parsed = json.loads(cleaned)
    except Exception:
        fallback_steps: list[dict[str, Any]] = []
        regression_found = False
        for idx, step in enumerate(steps):
            pre_status = str(pre_results[idx].get("status") if idx < len(pre_results) else "UNKNOWN")
            post_status = str(post_results[idx].get("status") if idx < len(post_results) else "UNKNOWN")
            regression = pre_status != post_status or pre_status == "FAIL" or post_status == "FAIL"
            regression_found = regression_found or regression
            fallback_steps.append(
                {
                    "stepName": step,
                    "preStatus": pre_status,
                    "postStatus": post_status,
                    "difference": _build_plain_difference(step, pre_status, post_status, regression),
                    "recommendedFix": _build_plain_fix(step, regression),
                    "regression": regression,
                    "impact": "HIGH" if regression else "LOW",
                }
            )

        parsed = {
            "regressionDetected": regression_found,
            "severity": "HIGH" if regression_found else "LOW",
            "riskScore": 75 if regression_found else 25,
            "aiExplanation": (
                "Some user-facing differences were found and should be corrected."
                if regression_found
                else "No major user-facing behavior differences were found in this run."
            ),
            "stepComparisons": fallback_steps,
        }

    if not parsed.get("aiExplanation"):
        parsed["aiExplanation"] = "No regression detected" if not parsed.get("regressionDetected") else "Regression detected"

    normalized = []
    for idx, step in enumerate(steps):
        item = parsed.get("stepComparisons", [])[idx] if idx < len(parsed.get("stepComparisons", [])) else {}
        pre_status = str(item.get("preStatus") or (pre_results[idx].get("status") if idx < len(pre_results) else "UNKNOWN"))
        post_status = str(item.get("postStatus") or (post_results[idx].get("status") if idx < len(post_results) else "UNKNOWN"))
        regression = bool(item.get("regression", pre_status != post_status))
        difference = str(item.get("difference") or "").strip()
        if not difference or _contains_technical_terms(difference):
            difference = _build_plain_difference(step, pre_status, post_status, regression)

        recommended_fix = str(item.get("recommendedFix") or "").strip()
        if regression and not recommended_fix:
            recommended_fix = _build_plain_fix(step, regression)
        elif not regression:
            recommended_fix = ""

        # Enforce concise non-technical wording even if model returns noisy content.
        difference = re.sub(r"\s+", " ", difference).strip()

        normalized.append(
            {
                "stepName": str(item.get("stepName") or step),
                "preStatus": pre_status,
                "postStatus": post_status,
                "difference": difference,
                "recommendedFix": recommended_fix,
                "regression": regression,
                "impact": str(item.get("impact") or ("HIGH" if regression else "LOW")),
            }
        )

    parsed["stepComparisons"] = normalized

    return parsed
