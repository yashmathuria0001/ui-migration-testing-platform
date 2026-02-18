from groq import Groq
import os
import json
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def analyze_regression(pre_summary: dict, post_summary: dict) -> str:
    """
    Compare PRE and POST execution summaries.
    Only structured summaries are passed - NOT full raw JSON.
    """
    pre_str = json.dumps(pre_summary, indent=2)
    post_str = json.dumps(post_summary, indent=2)

    prompt = f"""You are an enterprise-grade regression detection AI.

Compare PRE and POST execution summaries.

Return ONLY JSON in this exact shape (no markdown, no explanation):
{{
  "regressionDetected": true/false,
  "severity": "LOW" | "MEDIUM" | "HIGH",
  "explanation": "Clear executive summary",
  "steps": [
    {{ "index": 1, "title": "step title", "note": "Short user-friendly analysis for this step" }},
    ...
  ]
}}

Rules:
- If POST has new failures that PRE did not have → HIGH
- If both fail the same test → LOW
- If failure count increased from PRE to POST → HIGH
- If performance degradation only (same failures, slower) → MEDIUM
- If identical (same pass/fail) → regressionDetected=false

For each step in the failedTests or that differs between PRE and POST:
- index: 1-based step number
- title: the test step title if available
- note: Short, non-technical explanation of what changed (e.g. "Button no longer navigates", "Element missing on new UI")

PRE SUMMARY:
{pre_str}

POST SUMMARY:
{post_str}
"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    return response.choices[0].message.content
