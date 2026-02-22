from __future__ import annotations

from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class ScriptRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    test_run_id: str = Field(alias="testRunId")
    pre_url: str = Field(validation_alias=AliasChoices("preMigrationUrl", "preUrl"))
    post_url: str = Field(validation_alias=AliasChoices("postMigrationUrl", "postUrl"))
    steps: list[str]


class ScriptResponse(BaseModel):
    status: str
    testRunId: str
    executionDurationMs: int
    regressionDetected: bool
    severity: str
    riskScore: int
    explanation: str
    stepComparisons: list[dict[str, Any]]
