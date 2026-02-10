const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const { executeSteps } = require('./stepExecutor');
const { createUiObserver } = require('./uiObserver');
const { compareRuns } = require('./comparator');
const { writeReport } = require('./reporter');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function safeWriteJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8');
}

function nowMs() {
  return Date.now();
}

async function loadStepsFromBackendStorage(runId) {
  // Deterministic first: allow backend to drop an input file for the agent
  // If missing, default to zero steps (we already navigate to baseUrl).
  const candidate = path.join(process.cwd(), 'storage', String(runId), 'input.json');
  const data = readJsonIfExists(candidate);
  if (data && Array.isArray(data.steps) && data.steps.length > 0) return data.steps;
  return [];
}

async function run({ runId, preMigrationUrl, postMigrationUrl }) {
  const started = nowMs();

  const storageRoot = path.join(process.cwd(), 'storage', String(runId));
  const preDir = path.join(storageRoot, 'pre');
  const postDir = path.join(storageRoot, 'post');
  ensureDir(preDir);
  ensureDir(postDir);

  const steps = await loadStepsFromBackendStorage(runId);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const preObserver = createUiObserver({ outDir: preDir });
    await preObserver.attach(page);
    const preRun = await executeSteps({
      page,
      baseUrl: preMigrationUrl,
      steps,
      outDir: preDir
    });
    await preObserver.detach();

    await page.close();
    await context.close();

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    const postObserver = createUiObserver({ outDir: postDir });
    await postObserver.attach(page2);
    const postRun = await executeSteps({
      page: page2,
      baseUrl: postMigrationUrl,
      steps,
      outDir: postDir
    });
    await postObserver.detach();

    await page2.close();
    await context2.close();

    const comparison = compareRuns({ steps, preRun, postRun });
    const report = {
      runId: String(runId),
      steps: comparison.stepResults,
      summary: {
        totalSteps: steps.length,
        failedSteps: comparison.stepResults.filter((s) => s.status === 'FAIL').length,
        durationMs: nowMs() - started
      }
    };

    const reportPath = path.join(storageRoot, 'report.json');
    writeReport(reportPath, report);
  } finally {
    await browser.close();
  }
}

module.exports = { run, safeWriteJson };

