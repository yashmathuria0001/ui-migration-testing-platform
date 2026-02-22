from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[2]
APP_NAME = "ui-migration-adk-agent"

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
SPRING_BASE_URL = os.getenv("SPRING_BASE_URL", "http://localhost:8080")

PLAYWRIGHT_TIMEOUT_SECONDS = int(os.getenv("PLAYWRIGHT_TIMEOUT_SECONDS", "180"))

GENERATED_DIR = BASE_DIR / "generated_tests"
SCREENSHOTS_DIR = BASE_DIR / "screenshots"
REPORTS_DIR = BASE_DIR / "reports"

for runtime_dir in (GENERATED_DIR, SCREENSHOTS_DIR, REPORTS_DIR):
    runtime_dir.mkdir(parents=True, exist_ok=True)
