from groq import Groq
import os
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def analyze_regression(pre_report, post_report):

    prompt = f"""
You are a Senior QA Architect.

Analyze the following PRE and POST Playwright JSON reports.

Determine:
- regressionDetected: true/false
- severity: LOW, MEDIUM, HIGH
- explanation: Short technical explanation

PRE REPORT:
{pre_report}

POST REPORT:
{post_report}

Return ONLY valid JSON:
{{
  "regressionDetected": true/false,
  "severity": "LOW/MEDIUM/HIGH",
  "explanation": "text"
}}
"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    return response.choices[0].message.content
