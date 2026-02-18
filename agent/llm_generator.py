import os
from dotenv import load_dotenv
from groq import Groq

# Load .env variables
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is not set in environment variables")

# ✅ Client MUST be global
client = Groq(api_key=GROQ_API_KEY)


def generate_playwright_script(steps: list[str]) -> str:
    """
    Converts plain English test steps into executable Playwright JS code.
    """

    # Convert steps list to formatted string
    steps_text = "\n".join([f"- {step}" for step in steps])

    prompt = f"""
You are a Senior QA Automation Engineer.

Convert the following plain English test steps into a COMPLETE, EXECUTABLE Playwright JavaScript test file.

INPUT TEST STEPS:
{steps_text}

STRICT RULES:
- Return ONLY raw JavaScript.
- DO NOT use markdown.
- DO NOT wrap in backticks.
- DO NOT add explanations.
- Output must be directly executable by Playwright.
- Use the environment variables:
  - BASE_URL (already set by the runner)
  - TEST_RUN_ID (string)
  - RUN_LABEL (either "pre" or "post")

REQUIRED STRUCTURE:

import {{ test, expect }} from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('AI Generated Test', async ({{ page }}) => {{

    // IMPORTANT:
    // - Each input step MUST be wrapped in `await test.step(...)`
    // - After EACH step, take a full-page screenshot saved to:
    //   screenshots/<RUN_LABEL>/<TEST_RUN_ID>/step_<N>.png  (N starts at 1)
    // - At the start of the test, take an initial screenshot:
    //   await page.screenshot({{ path: `screenshots/${{process.env.ENV_TYPE || 'RUN'}}_${{Date.now()}}.png`, fullPage: true }});
    // - Ensure the directory exists before writing screenshots.
    // - ENV_TYPE is either "PRE" or "POST".
    //
    // Example:
    // await test.step('1. Open login page', async () => {{
    //   await page.goto(process.env.BASE_URL);
    //   await page.waitForLoadState('networkidle');
    //   const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    //   fs.mkdirSync(dir, {{ recursive: true }});
    //   await page.screenshot({{ path: path.join(dir, 'step_1.png'), fullPage: true }});
    // }});

}});

LOGIC RULES:

1. NEVER hardcode full URLs.

2. If step contains full URL:
   Extract only the pathname.
   Example:
   https://example.com/login
   → use:

   await page.goto(process.env.BASE_URL);
   await page.waitForLoadState('networkidle');

3. If step says "Open login page" without URL:
   Use:
   await page.goto(process.env.BASE_URL);
   await page.waitForLoadState('networkidle');

4. Enter username X:
   await page.fill('input[name="username"]', 'X');

5. Enter password Y:
   await page.fill('input[name="password"]', 'Y');

6. Click login button:
   await page.click('button[type="submit"]');
   await page.waitForLoadState('networkidle');

7. Always add final assertion:
   await expect(page).toHaveURL(/.*/);

"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    code = response.choices[0].message.content.strip()

    # Remove markdown if LLM still returns it
    code = code.replace("```javascript", "")
    code = code.replace("```", "").strip()

    # Fix common LLM syntax mistake: `};` instead of `});`
    if code.endswith("};"):
        code = code[:-2] + "});"

    # Ensure file always ends properly
    if not code.endswith("});"):
        code = code.rstrip() + "\n});"

    return code


