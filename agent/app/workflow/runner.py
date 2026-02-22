from __future__ import annotations

import json
import time
from typing import Any
from uuid import uuid4

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.core.settings import APP_NAME, REPORTS_DIR
from app.workflow.agents import build_workflow_agent
from app.workflow.state import WorkflowInput, WorkflowResult


class WorkflowRunner:
    def __init__(self) -> None:
        self._session_service = InMemorySessionService()
        self._root_agent = build_workflow_agent()
        self._runner = Runner(
            app_name=APP_NAME,
            agent=self._root_agent,
            session_service=self._session_service,
        )

    async def execute(self, payload: WorkflowInput) -> WorkflowResult:
        user_id = f"user-{payload.test_run_id}"
        session_id = f"session-{payload.test_run_id}-{uuid4()}"

        initial_state: dict[str, Any] = {
            "test_run_id": payload.test_run_id,
            "pre_url": payload.pre_url,
            "post_url": payload.post_url,
            "steps": payload.steps,
            "start_time_ms": int(time.time() * 1000),
        }

        await self._session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
            state=initial_state,
        )

        message = types.Content(
            role="user",
            parts=[types.Part(text=f"Execute workflow for {payload.test_run_id}")],
        )

        async for _ in self._runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=message,
        ):
            pass

        session = await self._session_service.get_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
        if not session:
            raise RuntimeError("ADK session not found after workflow execution")

        snapshot_path = REPORTS_DIR / "runtime" / f"workflow_{payload.test_run_id}.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
            return WorkflowResult(
                test_run_id=str(snapshot.get("testRunId", payload.test_run_id)),
                execution_duration_ms=int(time.time() * 1000 - int(initial_state["start_time_ms"])),
                regression_detected=bool(snapshot.get("regressionDetected", False)),
                severity=str(snapshot.get("severity", "LOW")),
                risk_score=int(snapshot.get("riskScore", 0)),
                explanation=str(snapshot.get("explanation", "Workflow completed")),
                step_comparisons=list(snapshot.get("stepComparisons", [])),
            )

        state = session.state or {}
        start_time_ms = int(state.get("start_time_ms", initial_state["start_time_ms"]))
        execution_duration_ms = int(
            state.get("execution_duration_ms", int(time.time() * 1000) - start_time_ms)
        )

        return WorkflowResult(
            test_run_id=str(state.get("test_run_id", payload.test_run_id)),
            execution_duration_ms=execution_duration_ms,
            regression_detected=bool(state.get("regression_detected", False)),
            severity=str(state.get("severity", "LOW")),
            risk_score=int(state.get("risk_score", 0)),
            explanation=str(state.get("explanation", "Workflow completed")),
            step_comparisons=list(state.get("step_comparisons", [])),
        )
