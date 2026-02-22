from __future__ import annotations

import json
import re
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
from app.integrations.spring_client import mark_completed, mark_running
from app.services.playwright_runner import execute_playwright, extract_structured_steps
from app.services.regression_analysis import analyze_regression
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


def _build_step_conclusion(
    step_name: str,
    pre_status: str,
    post_status: str,
    *,
    ai_hint: str | None,
    ai_fix: str | None,
    visual_delta: float | None,
    pre_error: str | None,
    post_error: str | None,
) -> str:
    has_failure = pre_status == "FAIL" or post_status == "FAIL" or pre_status != post_status
    has_visual_diff = visual_delta is not None and visual_delta >= 0.08
    regression = has_failure or has_visual_diff
    status_line = (
        f"In '{step_name}', users may see different behavior between the old and new version."
        if regression
        else f"In '{step_name}', the user outcome is consistent across both versions."
    )

    if pre_error or post_error:
        issue_line = (
            f"Pre issue: {pre_error or 'none'}. "
            f"Post issue: {post_error or 'none'}."
        )
    elif has_visual_diff:
        issue_line = (
            "Users may notice that this step looks or behaves differently after migration."
        )
    elif visual_delta is not None:
        issue_line = "This step appears visually consistent in both versions."
    else:
        issue_line = "Screenshot comparison is not available for this step."

    if ai_hint and not regression:
        plain_hint = re.sub(r"\s+", " ", ai_hint.strip())
        bad_terms = ("ms", "millisecond", "selector", "api", "playwright", "react", "dom", "latency")
        if any(term in plain_hint.lower() for term in bad_terms):
            plain_hint = ""
    else:
        plain_hint = ""

    if plain_hint:
        hint_line = f"Conclusion: {plain_hint}"
    elif regression:
        hint_line = (
            "Conclusion: this step is not fully aligned between pre and post migration and should be corrected."
        )
    else:
        hint_line = "Conclusion: this step is stable and matches expected user behavior."

    if regression:
        fix_value = ai_fix.strip() if ai_fix and ai_fix.strip() else (
            "Update the post-migration screen flow so this step behaves the same way users experienced before migration."
        )
        fix_line = f"Suggested fix: {fix_value}"
        return f"{status_line} {issue_line} {hint_line} {fix_line}"
    return f"{status_line} {issue_line} {hint_line}"


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


def _pre_execution_step(state: dict[str, Any]) -> None:
    test_id = state["test_run_id"]
    log(f"[{test_id}] Running PRE execution")
    script_path = state["script_path"]
    pre_result = execute_playwright(Path(script_path), state["pre_url"], test_id, "pre")
    state["pre_result"] = pre_result
    state["pre_structured"] = pre_result.get("step_results") or extract_structured_steps(pre_result.get("report"))


def _post_execution_step(state: dict[str, Any]) -> None:
    test_id = state["test_run_id"]
    log(f"[{test_id}] Running POST execution")
    script_path = state["script_path"]
    post_result = execute_playwright(Path(script_path), state["post_url"], test_id, "post")
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
        pre_entry = pre_structured[index - 1] if index <= len(pre_structured) else {}
        post_entry = post_structured[index - 1] if index <= len(post_structured) else {}
        pre_status = str(pre_entry.get("status", "SKIPPED"))
        post_status = str(post_entry.get("status", "SKIPPED"))
        pre_error = (pre_entry.get("errorMessage") or "").strip()
        post_error = (post_entry.get("errorMessage") or "").strip()

        ai_comparison = comparison_by_step.get(str(step_name).strip().lower())
        if not ai_comparison and (index - 1) < len(step_comparisons):
            ai_comparison = step_comparisons[index - 1]

        pre_rel = Path("pre") / test_id / f"step_{index}.png"
        post_rel = Path("post") / test_id / f"step_{index}.png"
        visual_delta = _compute_visual_delta(
            SCREENSHOTS_DIR / pre_rel,
            SCREENSHOTS_DIR / post_rel,
        )

        has_status_mismatch = pre_status != post_status
        has_error_mismatch = pre_error != post_error
        has_step_visual_regression = visual_delta is not None and visual_delta >= 0.08
        step_regression = has_status_mismatch or has_error_mismatch or has_step_visual_regression
        comparison_status = "FAIL" if step_regression else "PASS"

        if has_status_mismatch or has_error_mismatch:
            behavior_mismatch_count += 1
        if has_step_visual_regression:
            visual_regression_count += 1

        difference = _build_step_conclusion(
            step_name=step_name,
            pre_status=pre_status,
            post_status=post_status,
            ai_hint=(
                str(ai_comparison.get("difference"))
                if ai_comparison and ai_comparison.get("difference")
                else None
            ),
            ai_fix=(
                str(ai_comparison.get("recommendedFix"))
                if ai_comparison and ai_comparison.get("recommendedFix")
                else None
            ),
            visual_delta=visual_delta,
            pre_error=pre_error or None,
            post_error=post_error or None,
        )

        step_results.append(
            {
                "stepName": step_name,
                "preStatus": pre_status,
                "postStatus": post_status,
                "comparisonStatus": comparison_status,
                "difference": difference,
                "regression": step_regression,
                "preScreenshotPath": f"/screenshots/{pre_rel.as_posix()}",
                "postScreenshotPath": f"/screenshots/{post_rel.as_posix()}",
            }
        )

    computed_regression = behavior_mismatch_count > 0 or visual_regression_count > 0
    state["regression_detected"] = computed_regression
    if computed_regression:
        state["severity"] = "HIGH" if behavior_mismatch_count > 0 else "MEDIUM"
        state["risk_score"] = max(
            int(state.get("risk_score", 0)),
            min(95, 30 + (behavior_mismatch_count * 20) + (visual_regression_count * 8)),
        )
        state["explanation"] = (
            f"Detected {behavior_mismatch_count} behavior mismatches and "
            f"{visual_regression_count} visual mismatches between pre and post."
        )
    else:
        state["severity"] = "LOW"
        state["risk_score"] = min(int(state.get("risk_score", 25)), 25)
        state["explanation"] = "Pre and post behavior matched for all compared steps."

    step_comparisons_payload = [
        {
            "stepName": row["stepName"],
            "preStatus": row["preStatus"],
            "postStatus": row["postStatus"],
            "comparisonStatus": row.get("comparisonStatus", "PASS"),
            "difference": row["difference"],
            "regression": bool(row.get("regression", False)),
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
    )


def build_workflow_agent() -> SequentialAgent:
    return SequentialAgent(
        name="ui_migration_workflow",
        description="Executes UI migration regression workflow using deterministic ADK sub-agents.",
        sub_agents=[
            StateStepAgent(name="mark_running", description="Marks run as RUNNING", handler=_mark_running_step),
            StateStepAgent(name="generate_script", description="Generates Playwright script", handler=_generate_script_step),
            StateStepAgent(name="execute_pre", description="Runs pre-migration execution", handler=_pre_execution_step),
            StateStepAgent(name="execute_post", description="Runs post-migration execution", handler=_post_execution_step),
            StateStepAgent(name="analyze_regression", description="Computes AI regression summary", handler=_regression_analysis_step),
            StateStepAgent(name="mark_completed", description="Marks run as COMPLETED", handler=_mark_completed_step),
        ],
    )
