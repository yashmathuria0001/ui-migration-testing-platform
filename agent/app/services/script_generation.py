from __future__ import annotations

from pathlib import Path

from groq import Groq

from app.core.settings import GENERATED_DIR, GROQ_API_KEY, GROQ_MODEL


def _get_client() -> Groq:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")
    return Groq(api_key=GROQ_API_KEY)


def generate_playwright_script(test_id: str, steps: list[str]) -> Path:
    if _should_use_deterministic_script(steps):
        script = _fallback_script(steps)
        file_path = GENERATED_DIR / f"test_{test_id}.spec.js"
        file_path.write_text(script, encoding="utf-8")
        return file_path

    prompt = f"""
You are a senior Playwright automation engineer building tests for an AI regression system.

Generate a complete, valid Playwright test file.

Rules:
1. Use ES module syntax with `import {{ test, expect }} from '@playwright/test'`.
2. Use `await page.goto(process.env.BASE_URL)`.
3. Use semantic Playwright locators.
4. Wrap each action block in `test.step` with try/catch.
5. On step failure, log and continue.
6. Save screenshots to `screenshots/${{process.env.RUN_LABEL}}/${{process.env.TEST_RUN_ID}}/step_<number>.png`.
7. Print final JSON with `console.log('STEP_RESULTS:', JSON.stringify(stepResults));`.
8. For login actions, use `process.env.TEST_USERNAME` and `process.env.TEST_PASSWORD`; never hardcode credentials.
9. Return only JavaScript code.

Steps:
{steps}
"""

    invalid_patterns = [
        "input[",
        "page.fill('input",
        "page.click('button",
        "button[type=",
        "name=\"username\"",
    ]

    client = _get_client()
    script = ""

    for _ in range(3):
        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.05,
            )
            script = response.choices[0].message.content.strip()
            script = script.replace("```javascript", "").replace("```", "")
            if not any(pattern in script for pattern in invalid_patterns):
                break
        except Exception:
            script = ""
            continue
    else:
        script = _fallback_script(steps)

    file_path = GENERATED_DIR / f"test_{test_id}.spec.js"
    file_path.write_text(script, encoding="utf-8")
    return file_path


def _escape_js(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _should_use_deterministic_script(steps: list[str]) -> bool:
    if not steps:
        return True
    joined = " ".join(steps).lower()
    deterministic_markers = [
        "verify",
        "should show",
        "is visible",
        "payment",
        "statement",
        "contact support",
        "send message",
        "logout",
    ]
    return any(marker in joined for marker in deterministic_markers)


def _fallback_action(step_text: str) -> tuple[str, str]:
    text = step_text.lower()
    if "verify" in text or "should show" in text or "is visible" in text:
        escaped = _escape_js(step_text)
        return f"await verifyStep(page, '{escaped}');", "verification"
    if "view statements" in text:
        return "await clickViewStatements(page);", "action"
    if "contact support" in text:
        return "await clickContactSupport(page);", "action"
    if "make a payment" in text:
        return "await clickMakePayment(page);", "action"
    if "logout" in text:
        return "await clickLogout(page);", "action"
    if "send message" in text:
        return "await clickSendMessage(page);", "action"
    if "fill payment date" in text:
        return "await fillPaymentDate(page);", "action"
    if "support email" in text:
        return "await fillSupportEmail(page);", "action"
    if "support phone" in text:
        return "await fillSupportPhone(page);", "action"
    if "inquiry text" in text or "describe your inquiry" in text:
        return "await fillSupportMessage(page);", "action"
    if "open" in text or "goto" in text or "login page" in text:
        return "await page.goto(process.env.BASE_URL);", "navigation"
    if "username" in text or "user name" in text or "email" in text:
        return "await fillUsername(page);", "action"
    if "password" in text or "pass" in text:
        return "await fillPassword(page);", "action"
    if "sign in" in text or "login" in text:
        return "await clickLogin(page);", "action"
    if "submit payment" in text:
        return "await clickSubmitPayment(page);", "action"
    return "await page.waitForTimeout(250);", "action"


def _fallback_script(steps: list[str]) -> str:
    lines: list[str] = [
        "import { test, expect } from '@playwright/test';",
        "",
        "async function tryFill(locator, value) {",
        "  try {",
        "    await locator.first().fill(value, { timeout: 2000 });",
        "    return true;",
        "  } catch (_) {",
        "    return false;",
        "  }",
        "}",
        "",
        "async function fillUsername(page) {",
        "  const value = process.env.TEST_USERNAME || '';",
        "  if (!value) throw new Error('TEST_USERNAME is missing');",
        "  const locators = [",
        "    page.getByRole('textbox', { name: /username|user name|user|email|login/i }),",
        "    page.getByLabel(/username|user name|user|email|login/i),",
        "    page.getByPlaceholder(/username|user name|user|email|login/i),",
        "    page.locator('input[type=\"email\"]'),",
        "    page.locator('input[name*=\"user\" i], input[id*=\"user\" i]'),",
        "    page.locator('input').first()",
        "  ];",
        "  for (const locator of locators) {",
        "    if (await tryFill(locator, value)) return;",
        "  }",
        "  throw new Error('Username field not found');",
        "}",
        "",
        "async function fillPassword(page) {",
        "  const value = process.env.TEST_PASSWORD || '';",
        "  if (!value) throw new Error('TEST_PASSWORD is missing');",
        "  const locators = [",
        "    page.getByLabel(/password|pass/i),",
        "    page.getByPlaceholder(/password|pass/i),",
        "    page.locator('input[type=\"password\"]'),",
        "    page.locator('input[name*=\"pass\" i], input[id*=\"pass\" i]')",
        "  ];",
        "  for (const locator of locators) {",
        "    if (await tryFill(locator, value)) return;",
        "  }",
        "  throw new Error('Password field not found');",
        "}",
        "",
        "async function clickLogin(page) {",
        "  const buttons = [",
        "    page.getByRole('button', { name: /sign in|log in|login|submit/i }),",
        "    page.locator('button[type=\"submit\"]'),",
        "    page.locator('input[type=\"submit\"]')",
        "  ];",
        "  for (const button of buttons) {",
        "    try {",
        "      await button.first().click({ timeout: 2000 });",
        "      await page.waitForTimeout(500);",
        "      return;",
        "    } catch (_) {}",
        "  }",
        "  throw new Error('Login button not found');",
        "}",
        "",
        "async function clickMakePayment(page) {",
        "  await page.getByRole('button', { name: /make a payment/i }).first().click({ timeout: 3000 });",
        "  await expect(page.locator('#root')).toContainText(/payment|submit payment|submitt payment|payment type/i);",
        "}",
        "",
        "async function clickViewStatements(page) {",
        "  await page.getByRole('button', { name: /view statements/i }).first().click({ timeout: 3000 });",
        "  await expect(page.locator('#root')).toContainText(/statement|monthly loan payment/i);",
        "}",
        "",
        "async function clickContactSupport(page) {",
        "  await page.getByRole('button', { name: /contact support/i }).first().click({ timeout: 3000 });",
        "  await expect(page.locator('#root')).toContainText(/contact support|send message|start chat/i);",
        "}",
        "",
        "async function clickLogout(page) {",
        "  await page.getByRole('button', { name: /logout/i }).first().click({ timeout: 3000 });",
        "}",
        "",
        "async function clickSendMessage(page) {",
        "  await page.getByRole('button', { name: /send message/i }).first().click({ timeout: 3000 });",
        "  await page.waitForTimeout(400);",
        "}",
        "",
        "async function clickSubmitPayment(page) {",
        "  await page.getByRole('button', { name: /submit payment|submitt payment/i }).first().click({ timeout: 3000 });",
        "  await page.waitForTimeout(400);",
        "}",
        "",
        "async function fillPaymentDate(page) {",
        "  await page.locator('input[type=\"date\"]').first().fill('2026-03-03', { timeout: 3000 });",
        "}",
        "",
        "async function fillSupportEmail(page) {",
        "  const value = 'any.user@example.com';",
        "  const locators = [",
        "    page.getByRole('textbox', { name: /email|your\\.email@example\\.com/i }),",
        "    page.getByPlaceholder(/email/i),",
        "    page.locator('input[type=\"email\"]')",
        "  ];",
        "  for (const locator of locators) {",
        "    if (await tryFill(locator, value)) return;",
        "  }",
        "  throw new Error('Support email field not found');",
        "}",
        "",
        "async function fillSupportPhone(page) {",
        "  const value = '5551231234';",
        "  const locators = [",
        "    page.getByRole('textbox', { name: /\\(555\\)|phone/i }),",
        "    page.getByPlaceholder(/\\(555\\)|phone/i),",
        "    page.locator('input[type=\"tel\"]')",
        "  ];",
        "  for (const locator of locators) {",
        "    if (await tryFill(locator, value)) return;",
        "  }",
        "  throw new Error('Support phone field not found');",
        "}",
        "",
        "async function fillSupportMessage(page) {",
        "  const value = 'Need help with my account.';",
        "  const locators = [",
        "    page.getByRole('textbox', { name: /describe your inquiry|message/i }),",
        "    page.getByPlaceholder(/describe your inquiry|message/i),",
        "    page.locator('textarea')",
        "  ];",
        "  for (const locator of locators) {",
        "    if (await tryFill(locator, value)) return;",
        "  }",
        "  throw new Error('Support message field not found');",
        "}",
        "",
        "async function verifyStep(page, stepText) {",
        "  const text = stepText.toLowerCase();",
        "  if (text.includes('account login')) {",
        "    await expect(page.getByText(/account login/i)).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('sign in button')) {",
        "    await expect(page.getByRole('button', { name: /sign in|log in|login/i })).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('make a payment')) {",
        "    await expect(page.getByRole('button', { name: /make a payment/i })).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('view statements')) {",
        "    await expect(page.getByRole('button', { name: /view statements/i })).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('contact support')) {",
        "    await expect(page.getByRole('button', { name: /contact support/i })).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('payment date validation') || text.includes('late fee')) {",
        "    await expect(page.getByText(/late fee|payment date is after the due date/i)).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('submit payment')) {",
        "    await expect(page.locator('form')).toContainText(/submit payment/i);",
        "    return;",
        "  }",
        "  if (text.includes('principal paid')) {",
        "    await expect(page.locator('#root')).toContainText(/principal paid/i);",
        "    return;",
        "  }",
        "  if (text.includes('interest paid')) {",
        "    await expect(page.locator('#root')).toContainText(/interest paid/i);",
        "    return;",
        "  }",
        "  if (text.includes('required') && text.includes('validation')) {",
        "    await expect(page.getByText(/please fill in all required/i)).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('payment type')) {",
        "    const select = page.locator('select').filter({ hasText: /regular payment|principal only|extra payment/i });",
        "    if (await select.count()) {",
        "      await expect(select.first()).toBeVisible();",
        "      return;",
        "    }",
        "    const readonly = page.locator('input[readonly]').filter({ hasValue: /regular payment/i });",
        "    if (await readonly.count()) {",
        "      throw new Error('Payment type is read-only instead of dropdown');",
        "    }",
        "    throw new Error('Payment type selector not found');",
        "  }",
        "  if (text.includes('view your monthly loan payment statements')) {",
        "    await expect(page.getByText(/view your monthly loan payment statements/i)).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('message sent')) {",
        "    await expect(page.getByText(/message sent successfully/i)).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('start chat')) {",
        "    await expect(page.getByRole('button', { name: /start chat/i })).toBeVisible();",
        "    return;",
        "  }",
        "  if (text.includes('logout')) {",
        "    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();",
        "    return;",
        "  }",
        "  // Generic verification fallback",
        "  const genericSnippet = stepText.replace(/verify|is visible|should show/gi, '').trim();",
        "  if (!genericSnippet) {",
        "    throw new Error('Unsupported verify step: ' + stepText);",
        "  }",
        "  await expect(page.getByText(new RegExp(genericSnippet.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i'))).toBeVisible();",
        "}",
        "",
        "test('AI Generated Test', async ({ page }) => {",
        "  const stepResults = [];",
        "  await page.setViewportSize({ width: 1440, height: 2200 });",
        "  await page.goto(process.env.BASE_URL);",
        "  await page.waitForLoadState('domcontentloaded');",
        "  await page.waitForTimeout(450);",
    ]

    for index, step in enumerate(steps, start=1):
        safe_step = _escape_js(step)
        action, step_kind = _fallback_action(step)
        screenshot_path = (
            "`screenshots/${process.env.RUN_LABEL}/${process.env.TEST_RUN_ID}/"
            f"step_{index}.png`"
        )
        lines.extend(
            [
                f"  await test.step('{safe_step}', async () => {{",
                "    try {",
                f"      const stepText = '{safe_step}';",
                f"      {action}",
                "      await page.waitForLoadState('domcontentloaded');",
                "      await page.waitForTimeout(450);",
                "      await page.evaluate(() => window.scrollTo(0, 0));",
                f"      await page.screenshot({{ path: {screenshot_path}, fullPage: true }});",
                f"      stepResults.push({{ step: '{safe_step}', status: 'PASS', stepKind: '{step_kind}' }});",
                "    } catch (e) {",
                f"      console.error('Step failed: {safe_step}', e);",
                "      await page.waitForTimeout(350);",
                "      await page.evaluate(() => window.scrollTo(0, 0));",
                f"      await page.screenshot({{ path: {screenshot_path}, fullPage: true }});",
                (
                    f"      stepResults.push({{ step: '{safe_step}', status: 'FAIL', "
                    f"error: e.message, stepKind: '{step_kind}' }});"
                ),
                "    }",
                "  });",
            ]
        )

    lines.extend(
        [
            "  console.log('STEP_RESULTS:', JSON.stringify(stepResults));",
            "  expect(stepResults.length).toBeGreaterThan(0);",
            "});",
            "",
        ]
    )
    return "\n".join(lines)
