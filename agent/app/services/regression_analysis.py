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


def _build_exact_change(step_name: str, pre_status: str, post_status: str, regression: bool) -> str:
    if not regression:
        return f"No exact change detected in '{step_name}'. The user-facing behavior stayed the same."
    if pre_status != post_status:
        return (
            f"In '{step_name}', the outcome changed between the old and new version for the same action."
        )
    return (
        f"In '{step_name}', the action result looked different between versions even though both completed."
    )


def _build_runtime_evidence(step_name: str, regression: bool) -> str:
    if regression:
        return (
            f"For '{step_name}', the conclusion is based on side-by-side before/after screenshots and the observed result state in both versions."
        )
    return (
        f"For '{step_name}', screenshots and observed step outcome were consistent across both versions."
    )


def generate_step_interpretation(
    *,
    step_name: str,
    comparison_status: str,
    pre_status: str,
    post_status: str,
    visual_delta: float | None,
    pre_error: str | None,
    post_error: str | None,
    prior_difference_hint: str | None,
    prior_runtime_evidence: str | None,
    prior_fix_hint: str | None,
) -> dict[str, str]:
    is_fail = str(comparison_status).upper() == "FAIL"
    label = "Difference Found" if is_fail else "Match"
    visual_summary = (
        "not available"
        if visual_delta is None
        else f"{round(float(visual_delta) * 100, 2)}% visual delta"
    )

    prompt = f"""
You are writing a migration comparison explanation for a non-technical tester.

Verdict is fixed and must not be changed:
- comparisonStatus: {comparison_status}
- comparisonLabel: {label}

Runtime evidence:
- stepName: {step_name}
- preStatus: {pre_status}
- postStatus: {post_status}
- visualObservation: {visual_summary}
- preError: {pre_error or ""}
- postError: {post_error or ""}
- priorDifferenceHint: {prior_difference_hint or ""}
- priorRuntimeEvidenceHint: {prior_runtime_evidence or ""}
- priorFixHint: {prior_fix_hint or ""}

Return ONLY strict JSON:
{{
  "comparisonLabel": "Match or Difference Found",
  "exactChange": "1-2 plain sentences",
  "detailedDifference": "3-5 plain sentences, no technical jargon",
  "runtimeEvidence": "2-4 plain sentences explaining what was observed during run",
  "detailedFix": "3-5 plain sentences with practical fix guidance when fail, else empty string"
}}

Rules:
- Do not mention code, selectors, APIs, frameworks, logs, DOM, CSS, or performance metrics.
- Use easy language for business/test users.
- If comparisonStatus is FAIL: explain mismatch impact and provide actionable fix.
- If comparisonStatus is PASS: clearly state behavior matched and keep detailedFix empty.
- Keep wording consistent with verdict.
"""

    try:
        response = _get_client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.35,
        )
        raw = response.choices[0].message.content.strip()
        cleaned = raw.replace("```json", "").replace("```", "")
        parsed = json.loads(cleaned)
    except Exception:
        parsed = {}

    exact_change = re.sub(r"\s+", " ", str(parsed.get("exactChange") or "").strip())
    detailed_difference = re.sub(r"\s+", " ", str(parsed.get("detailedDifference") or "").strip())
    runtime_evidence = re.sub(r"\s+", " ", str(parsed.get("runtimeEvidence") or "").strip())
    detailed_fix = re.sub(r"\s+", " ", str(parsed.get("detailedFix") or "").strip())

    if not exact_change or _contains_technical_terms(exact_change):
        exact_change = _build_exact_change(step_name, pre_status, post_status, is_fail)
    if not detailed_difference or _contains_technical_terms(detailed_difference):
        detailed_difference = _build_plain_difference(step_name, pre_status, post_status, is_fail)
    if not runtime_evidence or _contains_technical_terms(runtime_evidence):
        runtime_evidence = _build_runtime_evidence(step_name, is_fail)

    if is_fail:
        if not detailed_fix or _contains_technical_terms(detailed_fix):
            detailed_fix = _build_plain_fix(step_name, True)
    else:
        detailed_fix = ""

    return {
        "comparisonLabel": label,
        "exactChange": exact_change,
        "detailedDifference": detailed_difference,
        "runtimeEvidence": runtime_evidence,
        "detailedFix": detailed_fix,
    }


def generate_overall_interpretation(
    *,
    regression_detected: bool,
    behavior_mismatch_count: int,
    visual_mismatch_count: int,
    total_steps: int,
    step_summaries: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = f"""
You are summarizing a UI migration comparison for a non-technical tester.

Facts:
- regressionDetected: {regression_detected}
- behaviorMismatchCount: {behavior_mismatch_count}
- visualMismatchCount: {visual_mismatch_count}
- totalSteps: {total_steps}
- stepSummaries: {json.dumps(step_summaries, ensure_ascii=True)}

Return ONLY strict JSON:
{{
  "severity": "LOW|MEDIUM|HIGH",
  "riskScore": 0-100 integer,
  "aiExplanation": "2-4 sentences, plain language",
  "overallAnalysis": {{
    "headline": "short plain-language title",
    "description": "2-4 sentence summary for common users",
    "testerGuidance": "2-4 sentence practical guidance",
    "keyObservations": ["bullet 1", "bullet 2", "bullet 3"],
    "userImpact": "2-4 sentence impact explanation",
    "nextActions": ["action 1", "action 2", "action 3"]
  }}
}}

Rules:
- Keep language simple and business-friendly.
- Do not mention code, APIs, frameworks, selectors, logs, or technical internals.
- If regressionDetected is false, keep severity LOW and riskScore <= 30.
- If regressionDetected is true, explain what changed and why it matters.
"""

    fallback = {
        "severity": "HIGH" if behavior_mismatch_count > 0 else ("MEDIUM" if visual_mismatch_count > 0 else "LOW"),
        "riskScore": min(95, 25 + (behavior_mismatch_count * 20) + (visual_mismatch_count * 10)),
        "aiExplanation": (
            "Several differences were found between the old and new version and should be reviewed before release."
            if regression_detected
            else "No user-facing differences were found in this test run."
        ),
        "overallAnalysis": {
            "headline": "Differences found" if regression_detected else "Behavior matches",
            "description": (
                "Some tested steps behaved differently after migration. Review each failed step below."
                if regression_detected
                else "All tested steps behaved the same in both versions."
            ),
            "testerGuidance": (
                "Use the detailed step cards to confirm each mismatch and apply the suggested fix before release."
                if regression_detected
                else "Keep this run as migration evidence and rerun after future UI changes."
            ),
            "keyObservations": [
                f"{total_steps} step(s) were compared.",
                f"{behavior_mismatch_count} behavior mismatch(es) found.",
                f"{visual_mismatch_count} visual mismatch(es) found.",
            ],
            "userImpact": (
                "Differences may confuse users and reduce trust if released without correction."
                if regression_detected
                else "Current user journey is stable for the tested flow."
            ),
            "nextActions": (
                [
                    "Fix failed steps first.",
                    "Rerun the same scenario to confirm alignment.",
                    "Use screenshots to verify visual parity.",
                ]
                if regression_detected
                else [
                    "Keep this report for sign-off evidence.",
                    "Repeat this test after future UI updates.",
                ]
            ),
        },
    }

    try:
        response = _get_client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        cleaned = raw.replace("```json", "").replace("```", "")
        parsed = json.loads(cleaned)
    except Exception:
        parsed = fallback

    severity = str(parsed.get("severity") or fallback["severity"]).upper()
    if severity not in {"LOW", "MEDIUM", "HIGH"}:
        severity = fallback["severity"]

    risk_score = parsed.get("riskScore", fallback["riskScore"])
    try:
        risk_score = int(risk_score)
    except Exception:
        risk_score = int(fallback["riskScore"])
    risk_score = max(0, min(100, risk_score))

    ai_explanation = re.sub(r"\s+", " ", str(parsed.get("aiExplanation") or fallback["aiExplanation"]).strip())
    if not ai_explanation or _contains_technical_terms(ai_explanation):
        ai_explanation = fallback["aiExplanation"]

    overall = parsed.get("overallAnalysis") if isinstance(parsed.get("overallAnalysis"), dict) else {}
    fallback_overall = fallback["overallAnalysis"]

    def _clean_text(value: Any, default: str) -> str:
        cleaned_value = re.sub(r"\s+", " ", str(value or "").strip())
        if not cleaned_value or _contains_technical_terms(cleaned_value):
            return default
        return cleaned_value

    def _clean_list(value: Any, default: list[str]) -> list[str]:
        if not isinstance(value, list):
            return default
        out = [
            re.sub(r"\s+", " ", str(item).strip())
            for item in value
            if str(item).strip()
        ]
        if not out:
            return default
        return out[:5]

    overall_analysis = {
        "headline": _clean_text(overall.get("headline"), str(fallback_overall["headline"])),
        "description": _clean_text(overall.get("description"), str(fallback_overall["description"])),
        "testerGuidance": _clean_text(overall.get("testerGuidance"), str(fallback_overall["testerGuidance"])),
        "keyObservations": _clean_list(overall.get("keyObservations"), list(fallback_overall["keyObservations"])),
        "userImpact": _clean_text(overall.get("userImpact"), str(fallback_overall["userImpact"])),
        "nextActions": _clean_list(overall.get("nextActions"), list(fallback_overall["nextActions"])),
    }

    return {
        "severity": severity,
        "riskScore": risk_score,
        "aiExplanation": ai_explanation,
        "overallAnalysis": overall_analysis,
    }


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
      "comparisonLabel": "Match | Difference Found",
      "difference": "2-4 sentence plain-language explanation of what changed and why it matters",
      "recommendedFix": "plain-language fix recommendation (required when regression=true, else empty string)",
      "exactChange": "one clear sentence describing the exact change that caused difference conclusion",
      "runtimeEvidence": "plain-language summary of evidence used from runtime behavior/screenshots",
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
                    "comparisonLabel": "Difference Found" if regression else "Match",
                    "difference": _build_plain_difference(step, pre_status, post_status, regression),
                    "recommendedFix": _build_plain_fix(step, regression),
                    "exactChange": _build_exact_change(step, pre_status, post_status, regression),
                    "runtimeEvidence": _build_runtime_evidence(step, regression),
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

        exact_change = str(item.get("exactChange") or "").strip()
        if not exact_change:
            exact_change = _build_exact_change(step, pre_status, post_status, regression)

        runtime_evidence = str(item.get("runtimeEvidence") or "").strip()
        if not runtime_evidence:
            runtime_evidence = _build_runtime_evidence(step, regression)

        # Enforce concise non-technical wording even if model returns noisy content.
        difference = re.sub(r"\s+", " ", difference).strip()

        normalized.append(
            {
                "stepName": str(item.get("stepName") or step),
                "preStatus": pre_status,
                "postStatus": post_status,
                "comparisonLabel": str(item.get("comparisonLabel") or ("Difference Found" if regression else "Match")),
                "difference": difference,
                "recommendedFix": recommended_fix,
                "exactChange": exact_change,
                "runtimeEvidence": runtime_evidence,
                "regression": regression,
                "impact": str(item.get("impact") or ("HIGH" if regression else "LOW")),
            }
        )

    parsed["stepComparisons"] = normalized

    return parsed
