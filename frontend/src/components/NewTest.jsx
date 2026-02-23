import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Upload,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Image as ImageIcon,
  ExternalLink,
  LoaderCircle,
  FileJson,
  FileSpreadsheet,
} from 'lucide-react';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || 'http://localhost:8000';
const AGENT_ASSET_BASE_URL = import.meta.env.VITE_AGENT_ASSET_BASE_URL || 'http://localhost:5000';

const api = axios.create({ baseURL: `${BACKEND_BASE_URL}/api` });

const STAGE_DEFS = [
  { id: 'prepare', label: 'Preparing Test', detail: 'Reading your uploaded test case and validating input.' },
  { id: 'script', label: 'Building Flow', detail: 'Preparing step execution flow for both versions.' },
  { id: 'playwright', label: 'Running Checks', detail: 'Running all steps on old and new screens with snapshots.' },
  { id: 'analysis', label: 'Comparing Results', detail: 'Checking whether both versions behave the same for each step.' },
  { id: 'report', label: 'Publishing Report', detail: 'Preparing final comparison summary with suggestions.' },
];

const initialStages = () =>
  STAGE_DEFS.map((stage) => ({ ...stage, status: 'pending', note: '' }));

function normalizeRunStatus(status) {
  const s = String(status || '').toUpperCase();
  if (!s) return 'UNKNOWN';
  return s;
}

function buildOverallSummary(report, summary) {
  const severity = String(report?.severity || 'LOW').toUpperCase();
  const score = Number(report?.riskScore ?? 0);
  const mismatch = Number(summary?.mismatch ?? 0);
  const total = Number(summary?.total ?? 0);
  const base = String(report?.aiExplanation || '').trim();

  if (report?.status === 'FAILED') {
    return {
      headline: 'Run could not be completed',
      description:
        'The full comparison did not finish. Please run the test again so a complete side-by-side result can be generated.',
      testerGuidance:
        'Check that both URLs are reachable, then rerun this case to produce a full summary and recommendations.',
    };
  }

  if (mismatch === 0) {
    return {
      headline: 'Migration behavior looks consistent',
      description:
        base || 'All compared steps behaved the same before and after the update.',
      testerGuidance:
        `No differences were found across ${total} checked step(s). You can proceed with confidence and keep this report as release evidence.`,
    };
  }

  return {
    headline: `${mismatch} difference(s) need review`,
    description:
      base ||
      `Some steps behaved differently after the update. This may impact user trust if left unresolved.`,
    testerGuidance:
      `Priority: ${severity} (score ${score}/100). Review each highlighted step below, apply the suggested fix, and rerun this test to confirm alignment.`,
  };
}

function buildDetailedTopAnalysis(report, summary) {
  const results = Array.isArray(report?.results) ? report.results : [];
  const mismatchSteps = results.filter((row) => {
    const status = String(row.comparisonStatus || '').toUpperCase();
    if (status === 'FAIL') return true;
    if (status === 'PASS') return false;
    return row.preStatus !== row.postStatus;
  });
  const matchedCount = Math.max(0, (summary?.total || 0) - (summary?.mismatch || 0));
  const severity = String(report?.severity || 'LOW').toUpperCase();
  const confidence = Number(report?.riskScore ?? 0);

  const observations = [];
  observations.push(
    `${matchedCount} of ${summary?.total || 0} step(s) behaved the same before and after the update.`
  );
  if ((summary?.mismatch || 0) > 0) {
    observations.push(
      `${summary?.mismatch || 0} step(s) showed a visible or behavioral difference and require review.`
    );
    const names = mismatchSteps.map((s) => s.stepName).filter(Boolean).slice(0, 3);
    if (names.length > 0) {
      observations.push(`Main differences were found in: ${names.join(', ')}.`);
    }
  } else {
    observations.push('No meaningful differences were detected in this run.');
  }

  const impact =
    (summary?.mismatch || 0) === 0
      ? 'User experience is currently stable across both versions for the steps tested.'
      : severity === 'HIGH'
        ? 'These differences can create user confusion or block important tasks, so they should be fixed before release.'
        : 'These differences may reduce consistency and trust, so they should be addressed in the next update cycle.';

  const nextActions = [];
  if ((summary?.mismatch || 0) > 0) {
    nextActions.push('Review each failed step below and apply the suggested fix.');
    nextActions.push('Re-run this same test case after fixes to confirm behavior is aligned.');
    nextActions.push('Prioritize steps that affect primary user actions first.');
  } else {
    nextActions.push('Keep this report as validation evidence for migration sign-off.');
    nextActions.push('Run the same case again after any future UI changes.');
  }

  return {
    severity,
    confidence,
    observations,
    impact,
    nextActions,
  };
}

function parseStepAnalysis(rawText, isPass) {
  const cleaned = String(rawText || '')
    .replace(/\s+/g, ' ')
    .replace(/Pre issue:\s*none\.\s*Post issue:\s*none\./gi, '')
    .replace(/Pre issue:/gi, 'Before update:')
    .replace(/Post issue:/gi, 'After update:')
    .replace(/this step is not fully aligned between pre and post migration/gi, 'this step behaves differently after the update')
    .replace(/user outcome is consistent across both versions/gi, 'users see the same result in both versions')
    .trim();
  if (!cleaned) {
    return {
      description: isPass
        ? 'This step behaved the same before and after the update.'
        : 'This step behaved differently after the update and should be reviewed.',
      fix: isPass
        ? ''
        : 'Align this step in the updated version so users see the same outcome as before.',
    };
  }

  const splitToken = 'Suggested fix:';
  if (cleaned.includes(splitToken)) {
    const [desc, ...fixParts] = cleaned.split(splitToken);
    return {
      description: desc.trim(),
      fix: fixParts.join(splitToken).trim(),
    };
  }

  return {
    description: cleaned,
    fix: isPass
      ? ''
      : 'Align this step in the updated version so users see the same outcome as before.',
  };
}

export default function NewTest() {
  const [preUrl, setPreUrl] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const [importType, setImportType] = useState('excel');
  const [file, setFile] = useState(null);
  const [jsonSteps, setJsonSteps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [stages, setStages] = useState(initialStages);
  const [backendStatus, setBackendStatus] = useState('IDLE');

  const stageIntervalRef = useRef(null);

  const clearStageInterval = () => {
    if (stageIntervalRef.current) {
      clearInterval(stageIntervalRef.current);
      stageIntervalRef.current = null;
    }
  };

  useEffect(() => () => clearStageInterval(), []);

  const setStageStatus = (index, status, note = '') => {
    setStages((prev) =>
      prev.map((stage, i) => {
        if (i === index) {
          return { ...stage, status, note: note || stage.note };
        }
        return stage;
      })
    );
  };

  const setStageChainProgress = (activeIndex) => {
    setStages((prev) =>
      prev.map((stage, idx) => {
        if (idx < activeIndex) return { ...stage, status: 'done' };
        if (idx === activeIndex) return { ...stage, status: 'active' };
        if (stage.status === 'error') return stage;
        return { ...stage, status: 'pending' };
      })
    );
  };

  const startAutoStageProgress = () => {
    clearStageInterval();
    stageIntervalRef.current = setInterval(() => {
      setStages((prev) => {
        const activeIndex = prev.findIndex((s) => s.status === 'active');
        if (activeIndex < 1 || activeIndex >= 3) return prev;

        return prev.map((stage, idx) => {
          if (idx < activeIndex + 1) return { ...stage, status: 'done' };
          if (idx === activeIndex + 1) return { ...stage, status: 'active' };
          return stage;
        });
      });
    }, 2800);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setJsonSteps([]);
    setError(null);

    if (!f || importType !== 'json') return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const nextPre = typeof parsed.preMigrationUrl === 'string' ? parsed.preMigrationUrl : '';
        const nextPost = typeof parsed.postMigrationUrl === 'string' ? parsed.postMigrationUrl : '';
        const nextSteps = Array.isArray(parsed.steps)
          ? parsed.steps.filter((s) => typeof s === 'string' && s.trim())
          : [];

        if (nextPre) setPreUrl(nextPre);
        if (nextPost) setPostUrl(nextPost);
        setJsonSteps(nextSteps);
      } catch {
        setError('Invalid JSON file. Upload a valid JSON with preMigrationUrl, postMigrationUrl, and steps[]');
      }
    };
    reader.readAsText(f);
  };

  const summary = useMemo(() => {
    const results = report?.results || [];
    const mismatch = results.filter((r) => {
      const comparison = String(r.comparisonStatus || '').toUpperCase();
      if (comparison === 'FAIL') return true;
      if (comparison === 'PASS') return false;
      return r.preStatus !== r.postStatus;
    });
    return {
      total: results.length,
      mismatch: mismatch.length,
      pass: report?.status === 'COMPLETED' && mismatch.length === 0,
      label:
        report?.status === 'FAILED'
          ? 'Execution could not be completed'
          : mismatch.length > 0
            ? `${mismatch.length} step(s) show a difference`
            : 'No user-facing differences detected',
    };
  }, [report]);
  const overallSummary = useMemo(() => buildOverallSummary(report, summary), [report, summary]);
  const detailedTopAnalysis = useMemo(
    () => buildDetailedTopAnalysis(report, summary),
    [report, summary],
  );

  const getFriendlyRunStatus = (status) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'RUNNING') return 'In Progress';
    if (normalized === 'COMPLETED') return 'Completed';
    if (normalized === 'FAILED') return 'Stopped';
    if (normalized === 'IDLE') return 'Not Started';
    return 'In Progress';
  };

  const resolveAgentAssetUrl = (maybePath) => {
    if (!maybePath) return null;
    if (maybePath.startsWith('http://') || maybePath.startsWith('https://')) return maybePath;
    if (maybePath.startsWith('/screenshots/') || maybePath.startsWith('/reports/')) {
      return `${BACKEND_BASE_URL}/api/assets${maybePath}`;
    }
    return `${AGENT_ASSET_BASE_URL}${maybePath}`;
  };

  const runTest = async () => {
    if (!preUrl || !postUrl) {
      setError('Please provide both PRE and POST migration URLs.');
      return;
    }
    if (importType === 'excel' && !file) {
      setError('Please upload an Excel file.');
      return;
    }
    if (importType === 'json' && (!file || jsonSteps.length === 0)) {
      setError('Please upload a JSON test case that includes steps.');
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);
    setBackendStatus('RUNNING');
    setStages(initialStages());
    setStageChainProgress(0);

    try {
      let testRunId;

      if (importType === 'excel') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('preMigrationUrl', preUrl);
        formData.append('postMigrationUrl', postUrl);

        const uploadRes = await api.post('/testruns/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        testRunId = uploadRes.data.id;
      } else {
        const createRes = await api.post('/testruns/create', {
          preMigrationUrl: preUrl,
          postMigrationUrl: postUrl,
          steps: jsonSteps,
        });
        testRunId = createRes.data.id;
      }

      setStageStatus(0, 'done', 'Test scenario prepared successfully.');
      setStageStatus(1, 'active');
      startAutoStageProgress();

      const executeRes = await api.post(`/execution/${testRunId}/run`);
      const finalReport = executeRes.data;

      clearStageInterval();
      setReport(finalReport);
      setBackendStatus(normalizeRunStatus(finalReport.status));

      if (finalReport.status === 'COMPLETED') {
        setStages((prev) =>
          prev.map((stage, idx) => ({
            ...stage,
            status: 'done',
            note:
              idx === 4
                ? 'Execution completed. Review the final comparison below.'
                : stage.note,
          }))
        );
      } else {
        const active = stages.findIndex((s) => s.status === 'active');
        setStageStatus(active >= 0 ? active : 4, 'error', finalReport.errorMessage || 'Execution failed.');
      }
    } catch (err) {
      clearStageInterval();
      const message = err.response?.data?.message || err.message || 'An error occurred during execution.';
      setError(message);
      setBackendStatus('FAILED');
      setStages((prev) => {
        const active = prev.findIndex((s) => s.status === 'active');
        const indexToFail = active >= 0 ? active : 0;
        return prev.map((s, idx) => {
          if (idx < indexToFail) return { ...s, status: 'done' };
          if (idx === indexToFail) return { ...s, status: 'error', note: message };
          return s;
        });
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-test-page">
      <section className="hero-banner">
        <div className="hero-top-bar" />
        <div className="hero-content">
          <h2>SmartParity Test Studio</h2>
          <p>Run migration checks from Excel or JSON, follow simple execution stages, and review human-friendly comparison insights.</p>
        </div>
      </section>

      <div className="new-test-grid">
        <section className="panel card soft">
          <h3>Run Configuration</h3>
          <div className="import-toggle" role="tablist" aria-label="Import Type">
            <button
              type="button"
              className={importType === 'excel' ? 'active' : ''}
              onClick={() => {
                setImportType('excel');
                setFile(null);
                setJsonSteps([]);
              }}
            >
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button
              type="button"
              className={importType === 'json' ? 'active' : ''}
              onClick={() => {
                setImportType('json');
                setFile(null);
                setJsonSteps([]);
              }}
            >
              <FileJson size={16} /> JSON
            </button>
          </div>

          <div className="form-stack">
            <label>
              PRE Migration URL
              <input
                type="text"
                placeholder="http://localhost:3000"
                value={preUrl}
                onChange={(e) => setPreUrl(e.target.value)}
              />
            </label>

            <label>
              POST Migration URL
              <input
                type="text"
                placeholder="http://localhost:3001"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
              />
            </label>

            <label>
              Test File ({importType.toUpperCase()})
              <div className="file-input-wrap">
                <input
                  id="case-file"
                  type="file"
                  accept={importType === 'excel' ? '.xlsx,.xls' : '.json'}
                  onChange={handleFileChange}
                />
                <label htmlFor="case-file" className="file-pick">
                  <Upload size={16} />
                  {file ? file.name : `Choose ${importType.toUpperCase()} file`}
                </label>
              </div>
            </label>

            {importType === 'json' && jsonSteps.length > 0 && (
              <p className="muted">Detected {jsonSteps.length} steps from JSON.</p>
            )}

            <button className="primary-run" onClick={runTest} disabled={loading}>
              {loading ? <LoaderCircle size={18} className="spin" /> : <Play size={18} />}
              {loading ? 'Executing...' : 'Run Migration Test'}
            </button>
          </div>

          {error && (
            <div className="inline-error">
              <AlertCircle size={18} /> {error}
            </div>
          )}
        </section>

        <section className="panel card soft">
          <h3>Execution Stages</h3>
          <div className="status-chip">Status: {getFriendlyRunStatus(backendStatus)}</div>

          <div className="stage-list">
            {stages.map((stage) => (
              <div key={stage.id} className={`stage-item ${stage.status}`}>
                <div className="stage-icon">
                  {stage.status === 'done' ? (
                    <CheckCircle2 size={16} />
                  ) : stage.status === 'error' ? (
                    <XCircle size={16} />
                  ) : stage.status === 'active' ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <span className="dot" />
                  )}
                </div>
                <div className="stage-body">
                  <strong>{stage.label}</strong>
                  <p>{stage.note || stage.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {report && (
        <section className="panel card report-shell">
          <div className="report-head">
            <div>
              <h3>Final Comparison Report</h3>
              <p>{summary.label}</p>
            </div>
            <div className={`result-pill ${summary.pass ? 'ok' : 'warn'}`}>
              {summary.pass ? 'Stable Migration' : 'Needs Review'}
            </div>
          </div>

          <section className="overall-analysis">
            <h4>Overall Analysis</h4>
            <p className="overall-headline">{overallSummary.headline}</p>
            <p>{overallSummary.description}</p>
            <p className="tester-guidance">
              <strong>Tester Guidance:</strong> {overallSummary.testerGuidance}
            </p>
            <div className="overall-grid">
              <div className="overall-block">
                <h5>Key Observations</h5>
                <ul>
                  {detailedTopAnalysis.observations.map((item, idx) => (
                    <li key={`obs-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="overall-block">
                <h5>User Impact</h5>
                <p>{detailedTopAnalysis.impact}</p>
              </div>
            </div>
            <div className="overall-foot">
              <span>Impact Level: {detailedTopAnalysis.severity}</span>
              <span>Confidence Score: {detailedTopAnalysis.confidence}/100</span>
            </div>
            <div className="overall-block">
              <h5>Recommended Next Actions</h5>
              <ol>
                {detailedTopAnalysis.nextActions.map((item, idx) => (
                  <li key={`next-${idx}`}>{item}</li>
                ))}
              </ol>
            </div>
          </section>

          <div className="report-meta">
            <span>Total Steps: {summary.total}</span>
            <span>Differences Found: {summary.mismatch}</span>
            <span>Impact Level: {report.severity || 'LOW'}</span>
            <span>Confidence Score: {report.riskScore ?? 0}</span>
          </div>

          {report?.combinedReportPath && (
            <a className="report-link" href={resolveAgentAssetUrl(report.combinedReportPath)} target="_blank" rel="noreferrer">
              Open Full HTML Report <ExternalLink size={14} />
            </a>
          )}

          <div className="step-report-grid">
            {(report.results || []).map((result, index) => {
              const comparisonStatus =
                String(result.comparisonStatus || '').toUpperCase() ||
                (result.preStatus === result.postStatus ? 'PASS' : 'FAIL');
              const { description, fix } = parseStepAnalysis(
                result.difference || report.aiExplanation,
                comparisonStatus === 'PASS',
              );

              return (
                <article className="step-report-card" key={`${result.stepName}-${index}`}>
                  <header>
                    <div>
                      <span className="step-count">Step {index + 1}</span>
                      <h4>{result.stepName}</h4>
                    </div>
                    <div className="pair-status">
                      <span className={comparisonStatus === 'PASS' ? 'pass' : 'fail'}>
                        {comparisonStatus === 'PASS' ? 'Match' : 'Difference Found'}
                      </span>
                    </div>
                  </header>

                  <div className="shot-pair">
                    <div className="shot-box">
                      <label>Before Update</label>
                      {result.preScreenshotPath ? (
                        <img src={resolveAgentAssetUrl(result.preScreenshotPath)} alt={`Pre ${result.stepName}`} loading="lazy" />
                      ) : (
                        <div className="shot-empty"><ImageIcon size={18} /> No image</div>
                      )}
                    </div>

                    <div className="shot-box">
                      <label>After Update</label>
                      {result.postScreenshotPath ? (
                        <img src={resolveAgentAssetUrl(result.postScreenshotPath)} alt={`Post ${result.stepName}`} loading="lazy" />
                      ) : (
                        <div className="shot-empty"><ImageIcon size={18} /> No image</div>
                      )}
                    </div>
                  </div>

                  <div className="ai-note">
                    <strong>What This Means:</strong>
                    <p>{description}</p>
                    {comparisonStatus !== 'PASS' && fix && (
                      <p className="ai-fix">
                        <strong>Suggested Fix:</strong> {fix}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
