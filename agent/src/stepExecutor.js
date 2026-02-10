const path = require('path');
const fs = require('fs');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function normalizeInstruction(s) {
  return String(s || '').trim();
}

async function withRetryOnce(fn) {
  try {
    return await fn();
  } catch (e1) {
    await new Promise((r) => setTimeout(r, 500));
    return await fn();
  }
}

async function findByVisibleText(page, text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Missing visible text to match');
  // Prefer role-based selectors, then fallback to text selector
  const candidates = [
    () => page.getByRole('button', { name: t, exact: false }).first(),
    () => page.getByRole('link', { name: t, exact: false }).first(),
    () => page.getByText(t, { exact: false }).first()
  ];
  for (const get of candidates) {
    const loc = get();
    try {
      await loc.waitFor({ state: 'visible', timeout: 2000 });
      return loc;
    } catch {
      // keep trying
    }
  }
  return page.getByText(t, { exact: false }).first();
}

async function findInput(page, hint) {
  const h = String(hint || '').trim();
  const candidates = [];
  if (h) {
    candidates.push(() => page.getByLabel(h, { exact: false }).first());
    candidates.push(() => page.getByPlaceholder(h, { exact: false }).first());
    candidates.push(() => page.getByRole('textbox', { name: h, exact: false }).first());
  }
  candidates.push(() => page.getByRole('textbox').first());

  for (const get of candidates) {
    const loc = get();
    try {
      await loc.waitFor({ state: 'visible', timeout: 2000 });
      return loc;
    } catch {
      // keep trying
    }
  }
  return page.getByRole('textbox').first();
}

function parseEnter(instruction) {
  // Supported shapes:
  // "enter <value> into <field>"
  // "enter <value> in <field>"
  // "enter <value>"
  const m = instruction.match(/^enter\s+(.+?)(?:\s+into\s+(.+)|\s+in\s+(.+))?$/i);
  if (!m) return null;
  const value = (m[1] || '').trim();
  const field = (m[2] || m[3] || '').trim();
  return { value, field };
}

function parseClick(instruction) {
  const m = instruction.match(/^click\s+(.+)$/i);
  if (!m) return null;
  return { target: (m[1] || '').trim() };
}

function parseOpen(instruction) {
  const m = instruction.match(/^open(?:\s+(.+))?$/i);
  if (!m) return null;
  return { url: (m[1] || '').trim() };
}

async function captureDom(page, outPath) {
  const html = await page.content();
  fs.writeFileSync(outPath, html, 'utf-8');
}

async function executeSingleStep({ page, baseUrl, instruction, stepNumber, outDir }) {
  const normalized = normalizeInstruction(instruction);
  const lower = normalized.toLowerCase();

  const screenshotPath = path.join(outDir, `step-${stepNumber}.png`);
  const domPath = path.join(outDir, `step-${stepNumber}.html`);

  let action = 'unknown';
  let failureReason = null;

  await withRetryOnce(async () => {
    if (lower === 'open' || lower.startsWith('open ')) {
      action = 'open';
      const parsed = parseOpen(normalized);
      const url = parsed.url && parsed.url.startsWith('http') ? parsed.url : baseUrl;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(300);
      return;
    }

    if (lower.startsWith('click ')) {
      action = 'click';
      const parsed = parseClick(normalized);
      const loc = await findByVisibleText(page, parsed.target);
      await loc.click({ timeout: 10000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
      return;
    }

    if (lower.startsWith('enter ')) {
      action = 'enter';
      const parsed = parseEnter(normalized);
      const input = await findInput(page, parsed.field);
      await input.click({ timeout: 10000 });
      await input.fill(parsed.value, { timeout: 10000 });
      await page.waitForTimeout(200);
      return;
    }

    throw new Error(`Unsupported instruction: "${normalized}"`);
  }).catch((e) => {
    failureReason = String(e && e.message ? e.message : e);
  });

  ensureDir(outDir);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await captureDom(page, domPath);

  return {
    stepNumber,
    instruction: normalized,
    action,
    screenshotPath,
    domPath,
    ok: !failureReason,
    failureReason
  };
}

async function executeSteps({ page, baseUrl, steps, outDir }) {
  const results = [];

  // Always start from baseUrl deterministically
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(300);

  for (let i = 0; i < steps.length; i++) {
    const stepNumber = i + 1;
    const instruction = steps[i];
    const res = await executeSingleStep({ page, baseUrl, instruction, stepNumber, outDir });
    results.push(res);
  }

  return {
    outDir,
    steps: results
  };
}

module.exports = { executeSteps };

