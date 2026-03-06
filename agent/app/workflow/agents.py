from __future__ import annotations

import json
import time
from pathlib import Path
from collections.abc import AsyncGenerator, Callable
from typing import Any

from google.adk.agents import BaseAgent, SequentialAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types
from typing_extensions import override

from app.core.logging_utils import log
from app.core.settings import REPORTS_DIR, SCREENSHOTS_DIR
from app.integrations.spring_client import fetch_credentials, mark_completed, mark_running
from app.services.playwright_runner import execute_playwright, extract_structured_steps
from app.services.regression_analysis import (
    analyze_regression,
    generate_overall_interpretation,
    generate_step_interpretation,
    sanitize_user_visible_text,
)
from app.services.script_generation import generate_playwright_script


StateHandler = Callable[[dict[str, Any]], None]


def _compute_visual_delta(pre_image_path: Path, post_image_path: Path) -> float | None:
    """Returns byte-difference ratio (0.0 same, 1.0 very different)."""
    if not pre_image_path.exists() or not post_image_path.exists():
        return None

    pre_bytes = pre_image_path.read_bytes()
    post_bytes = post_image_path.read_bytes()
    if not pre_bytes or not post_bytes:
        return None

    min_len = min(len(pre_bytes), len(post_bytes))
    max_len = max(len(pre_bytes), len(post_bytes))
    if min_len == 0:
        return None

    # Sample every 97th byte for speed while staying deterministic.
    sampled_indexes = range(0, min_len, 97)
    sampled_total = 0
    sampled_diff = 0
    for idx in sampled_indexes:
        sampled_total += 1
        if pre_bytes[idx] != post_bytes[idx]:
            sampled_diff += 1

    if sampled_total == 0:
        return None

    content_diff = sampled_diff / sampled_total
    length_diff = abs(len(pre_bytes) - len(post_bytes)) / max_len
    return min(1.0, (content_diff * 0.8) + (length_diff * 0.2))


def _normalize_comparison_label(regression: bool) -> str:
    return "Difference Found" if regression else "Match"


def _should_compare_visuals(step_name: str, pre_entry: dict[str, Any], post_entry: dict[str, Any]) -> bool:
    # Prefer explicit runtime step intent from generated script output.
    pre_kind = str(pre_entry.get("stepKind") or "").strip().lower()
    post_kind = str(post_entry.get("stepKind") or "").strip().lower()
    step_kind = pre_kind or post_kind
    if step_kind:
        return step_kind == "verification"

    # Safe fallback: only verification/assertion-style steps should use visual comparison.
    lowered = str(step_name or "").strip().lower()
    verification_tokens = (
        "verify",
        "should show",
        "is visible",
        "should be visible",
        "validate",
        "validation",
        "check",
        "assert",
    )
    return any(token in lowered for token in verification_tokens)


def _is_sensitive_step(step_name: str) -> bool:
    lowered = str(step_name or "").strip().lower()
    username_markers = ("enter username", "fill username", "type username", "enter email")
    password_markers = ("enter password", "fill password", "type password")
    return any(marker in lowered for marker in username_markers + password_markers)


class StateStepAgent(BaseAgent):
    """Small ADK agent that executes one deterministic workflow step."""

    handler: StateHandler

    @override
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        self.handler(ctx.session.state)
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            branch=ctx.branch,
            content=types.Content(
                role="model", parts=[types.Part(text=f"{self.name} completed")]
            ),
        )


def _mark_running_step(state: dict[str, Any]) -> None:
    test_id = state["test_run_id"]
    log(f"[{test_id}] Marking test as RUNNING")
    mark_running(test_id)


def _generate_script_step(state: dict[str, Any]) -> None:
    test_id = state["test_run_id"]
    log(f"[{test_id}] Generating Playwright script")
    script_path = generate_playwright_script(test_id, state["steps"])
    state["script_path"] = str(script_path)


def _fetch_credentials_step(state: dict[str, Any]) -> None:
    test_id = state["test_run_id"]
    log(f"[{test_id}] Fetching credentials from backend")
    credentials = fetch_credentials(test_id)
    state["test_username"] = credentials.get("username", "")
    state["test_password"] = credentials.get("password", "")


def _pre_execution_step(state: dict[str, Any]) -> None:
    test_id = state["test_run_id"]
    log(f"[{test_id}] Running PRE execution")
    script_path = state["script_path"]
    artifact_run_id = str(state.get("artifact_run_id") or f"{test_id}_{state['start_time_ms']}")
    state["artifact_run_id"] = artifact_run_id
    (SCREENSHOTS_DIR / "pre" / artifact_run_id).mkdir(parents=True, exist_ok=True)
    pre_result = execute_playwright(
        Path(script_path),
        state["pre_url"],
        artifact_run_id,
        "pre",
        username=str(state.get("test_username") or ""),
        password=str(state.get("test_password") or ""),
    )
    state["pre_result"] = pre_result
    state["pre_structured"] = pre_result.get("step_results") or extract_structured_steps(pre_result.get("report"))


def _post_execution_step(state: dict[str, Any]) -> None:
    test_id = state["test_run_id"]
    log(f"[{test_id}] Running POST execution")
    script_path = state["script_path"]
    artifact_run_id = str(state.get("artifact_run_id") or f"{test_id}_{state['start_time_ms']}")
    state["artifact_run_id"] = artifact_run_id
    (SCREENSHOTS_DIR / "post" / artifact_run_id).mkdir(parents=True, exist_ok=True)
    post_result = execute_playwright(
        Path(script_path),
        state["post_url"],
        artifact_run_id,
        "post",
        username=str(state.get("test_username") or ""),
        password=str(state.get("test_password") or ""),
    )
    state["post_result"] = post_result
    state["post_structured"] = post_result.get("step_results") or extract_structured_steps(post_result.get("report"))


def _regression_analysis_step(state: dict[str, Any]) -> None:
    test_id = state["test_run_id"]
    log(f"[{test_id}] Running regression analysis")

    analysis = analyze_regression(
        state["steps"],
        state.get("pre_structured", []),
        state.get("post_structured", []),
    )

    state["regression_detected"] = bool(analysis.get("regressionDetected", False))
    state["severity"] = analysis.get("severity", "LOW")
    state["risk_score"] = int(analysis.get("riskScore", 20))
    state["explanation"] = analysis.get("aiExplanation", "Analysis unavailable")
    state["step_comparisons"] = analysis.get("stepComparisons", [])


def _mark_completed_step(state: dict[str, Any]) -> None:
    test_id = state["test_run_id"]
    artifact_run_id = str(state.get("artifact_run_id") or f"{test_id}_{state['start_time_ms']}")
    duration = int(time.time() * 1000) - int(state["start_time_ms"])
    state["execution_duration_ms"] = duration

    pre_structured = state.get("pre_structured", [])
    post_structured = state.get("post_structured", [])
    step_comparisons = state.get("step_comparisons", [])

    comparison_by_step: dict[str, dict[str, Any]] = {}
    for comparison in step_comparisons:
        key = str(comparison.get("stepName", "")).strip().lower()
        if key:
            comparison_by_step[key] = comparison

    step_results: list[dict[str, Any]] = []
    visual_regression_count = 0
    behavior_mismatch_count = 0

    for index, step_name in enumerate(state.get("steps", []), start=1):
        safe_step_name = sanitize_user_visible_text(step_name)
        if _is_sensitive_step(safe_step_name):
            continue
        pre_entry = pre_structured[index - 1] if index <= len(pre_structured) else {}
        post_entry = post_structured[index - 1] if index <= len(post_structured) else {}
        pre_status = str(pre_entry.get("status", "SKIPPED"))
        post_status = str(post_entry.get("status", "SKIPPED"))
        pre_error = (pre_entry.get("errorMessage") or "").strip()
        post_error = (post_entry.get("errorMessage") or "").strip()

        ai_comparison = comparison_by_step.get(str(step_name).strip().lower())
        if not ai_comparison and (index - 1) < len(step_comparisons):
            ai_comparison = step_comparisons[index - 1]

        pre_rel = Path("pre") / artifact_run_id / f"step_{index}.png"
        post_rel = Path("post") / artifact_run_id / f"step_{index}.png"
        pre_abs = SCREENSHOTS_DIR / pre_rel
        post_abs = SCREENSHOTS_DIR / post_rel
        visual_delta = _compute_visual_delta(
            pre_abs,
            post_abs,
        )

        has_status_mismatch = pre_status != post_status
        has_error_mismatch = pre_error != post_error
        consider_visual = _should_compare_visuals(safe_step_name, pre_entry, post_entry)
        has_step_visual_regression = (
            consider_visual and visual_delta is not None and visual_delta >= 0.08
        )
        step_regression = has_status_mismatch or has_error_mismatch or has_step_visual_regression
        comparison_status = "FAIL" if step_regression else "PASS"

        if has_status_mismatch or has_error_mismatch:
            behavior_mismatch_count += 1
        if has_step_visual_regression:
            visual_regression_count += 1

        interpretation = generate_step_interpretation(
            step_name=safe_step_name,
            comparison_status=comparison_status,
            pre_status=pre_status,
            post_status=post_status,
            visual_delta=visual_delta,
            pre_error=pre_error or None,
            post_error=post_error or None,
            prior_difference_hint=(
                sanitize_user_visible_text(str(ai_comparison.get("difference")))
                if ai_comparison and ai_comparison.get("difference")
                else None
            ),
            prior_runtime_evidence=(
                sanitize_user_visible_text(str(ai_comparison.get("runtimeEvidence")))
                if ai_comparison and ai_comparison.get("runtimeEvidence")
                else None
            ),
            prior_fix_hint=(
                sanitize_user_visible_text(str(ai_comparison.get("recommendedFix")))
                if ai_comparison and ai_comparison.get("recommendedFix")
                else None
            ),
        )

        ai_comparison_label = interpretation.get(
            "comparisonLabel",
            _normalize_comparison_label(step_regression),
        )
        ai_exact_change = interpretation.get("exactChange", "")
        ai_detailed_difference = interpretation.get("detailedDifference", "")
        ai_runtime_evidence = interpretation.get("runtimeEvidence", "")
        ai_detailed_fix = interpretation.get("detailedFix", "")
        difference = ai_detailed_difference

        step_results.append(
            {
                "stepName": safe_step_name,
                "preStatus": pre_status,
                "postStatus": post_status,
                "comparisonStatus": comparison_status,
                "comparisonLabel": ai_comparison_label,
                "difference": sanitize_user_visible_text(difference),
                "exactChange": sanitize_user_visible_text(ai_exact_change),
                "detailedDifference": sanitize_user_visible_text(ai_detailed_difference),
                "runtimeEvidence": sanitize_user_visible_text(ai_runtime_evidence),
                "detailedFix": sanitize_user_visible_text(ai_detailed_fix),
                "regression": step_regression,
                "preScreenshotPath": f"/screenshots/{pre_rel.as_posix()}" if pre_abs.exists() else None,
                "postScreenshotPath": f"/screenshots/{post_rel.as_posix()}" if post_abs.exists() else None,
            }
        )

    computed_regression = behavior_mismatch_count > 0 or visual_regression_count > 0
    state["regression_detected"] = computed_regression
    overall_payload = generate_overall_interpretation(
        regression_detected=computed_regression,
        behavior_mismatch_count=behavior_mismatch_count,
        visual_mismatch_count=visual_regression_count,
        total_steps=len(step_results),
        step_summaries=[
            {
                "stepName": row["stepName"],
                "comparisonStatus": row["comparisonStatus"],
                "comparisonLabel": row.get("comparisonLabel", ""),
                "exactChange": row.get("exactChange", ""),
                "detailedDifference": row.get("detailedDifference", ""),
            }
            for row in step_results
        ],
    )
    state["severity"] = str(overall_payload.get("severity", "LOW"))
    state["risk_score"] = int(overall_payload.get("riskScore", 0))
    state["explanation"] = str(overall_payload.get("aiExplanation", "Analysis unavailable"))
    state["overall_analysis"] = overall_payload.get("overallAnalysis", {})

    step_comparisons_payload = [
        {
            "stepName": row["stepName"],
            "preStatus": row["preStatus"],
            "postStatus": row["postStatus"],
            "comparisonStatus": row.get("comparisonStatus", "PASS"),
            "comparisonLabel": row.get("comparisonLabel", "Match"),
            "difference": row["difference"],
            "exactChange": row.get("exactChange", ""),
            "detailedDifference": row.get("detailedDifference", row["difference"]),
            "runtimeEvidence": row.get("runtimeEvidence", ""),
            "detailedFix": row.get("detailedFix", ""),
            "regression": bool(row.get("regression", False)),
            "preScreenshotPath": row.get("preScreenshotPath"),
            "postScreenshotPath": row.get("postScreenshotPath"),
        }
        for row in step_results
    ]

    runtime_dir = REPORTS_DIR / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = runtime_dir / f"workflow_{test_id}.json"
    snapshot_path.write_text(
        json.dumps(
            {
                "testRunId": test_id,
                "regressionDetected": bool(state.get("regression_detected", False)),
                "severity": str(state.get("severity", "LOW")),
                "riskScore": int(state.get("risk_score", 0)),
                "explanation": str(state.get("explanation", "Workflow completed")),
                "overallAnalysis": state.get("overall_analysis", {}),
                "stepComparisons": step_comparisons_payload,
            }
        ),
        encoding="utf-8",
    )

    log(f"[{test_id}] Marking test as COMPLETED")
    mark_completed(
        test_id,
        results=step_results,
        pre_status=not computed_regression,
        post_status=not computed_regression,
        regression_detected=state["regression_detected"],
        severity=state["severity"],
        explanation=state["explanation"],
        pre_raw_output=state.get("pre_result", {}).get("stdout", ""),
        post_raw_output=state.get("post_result", {}).get("stdout", ""),
        risk_score=state["risk_score"],
        execution_duration_ms=duration,
        overall_analysis=state.get("overall_analysis", {}),
    )


def build_workflow_agent() -> SequentialAgent:
    return SequentialAgent(
        name="ui_migration_workflow",
        description="Executes UI migration regression workflow using deterministic ADK sub-agents.",
        sub_agents=[
            StateStepAgent(name="mark_running", description="Marks run as RUNNING", handler=_mark_running_step),
            StateStepAgent(name="generate_script", description="Generates Playwright script", handler=_generate_script_step),
            StateStepAgent(name="fetch_credentials", description="Fetches credentials from backend", handler=_fetch_credentials_step),
            StateStepAgent(name="execute_pre", description="Runs pre-migration execution", handler=_pre_execution_step),
            StateStepAgent(name="execute_post", description="Runs post-migration execution", handler=_post_execution_step),
            StateStepAgent(name="analyze_regression", description="Computes AI regression summary", handler=_regression_analysis_step),
            StateStepAgent(name="mark_completed", description="Marks run as COMPLETED", handler=_mark_completed_step),
        ],
    )
