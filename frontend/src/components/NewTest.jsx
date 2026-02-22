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
  { id: 'prepare', label: 'Test Input Setup', detail: 'Uploading/creating test case from JSON or Excel.' },
  { id: 'script', label: 'Script Generation', detail: 'Generating Playwright automation script from steps.' },
  { id: 'playwright', label: 'Playwright Execution', detail: 'Running PRE and POST UI flows and capturing screenshots.' },
  { id: 'analysis', label: 'AI Comparison', detail: 'Comparing PRE vs POST and calculating risk/severity.' },
  { id: 'report', label: 'Final Report', detail: 'Building step-wise result summary and completion payload.' },
];

const initialStages = () =>
  STAGE_DEFS.map((stage) => ({ ...stage, status: 'pending', note: '' }));

function normalizeRunStatus(status) {
  const s = String(status || '').toUpperCase();
  if (!s) return 'UNKNOWN';
  return s;
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
  const [currentRunId, setCurrentRunId] = useState(null);

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
          ? 'Execution failed'
          : mismatch.length > 0
            ? `${mismatch.length} step(s) changed after migration`
            : 'No regression detected in compared steps',
    };
  }, [report]);

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
    setCurrentRunId(null);
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

      setCurrentRunId(testRunId);
      setStageStatus(0, 'done', `Prepared test run: ${testRunId}`);
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
                ? `Completed in ${finalReport.executionDurationMs || 0} ms`
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
          <h2>Migration Test Orchestrator</h2>
          <p>Run UI migration tests from Excel or JSON, track execution stages, and inspect visual + AI step comparison.</p>
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
          <div className="status-chip">Backend status: {backendStatus}</div>
          {currentRunId && <p className="muted">Run ID: {currentRunId}</p>}

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

          <div className="report-meta">
            <span>Total Steps: {summary.total}</span>
            <span>Mismatched: {summary.mismatch}</span>
            <span>Severity: {report.severity || 'LOW'}</span>
            <span>Risk: {report.riskScore ?? 0}</span>
          </div>

          {report?.combinedReportPath && (
            <a className="report-link" href={resolveAgentAssetUrl(report.combinedReportPath)} target="_blank" rel="noreferrer">
              Open Full HTML Report <ExternalLink size={14} />
            </a>
          )}

          <div className="step-report-grid">
            {(report.results || []).map((result, index) => {
              const aiNote =
                result.difference && result.difference.trim()
                  ? result.difference
                  : report.aiExplanation ||
                    'AI observed no major behavior difference for this step.';
              const comparisonStatus =
                String(result.comparisonStatus || '').toUpperCase() ||
                (result.preStatus === result.postStatus ? 'PASS' : 'FAIL');

              return (
                <article className="step-report-card" key={`${result.stepName}-${index}`}>
                  <header>
                    <div>
                      <span className="step-count">Step {index + 1}</span>
                      <h4>{result.stepName}</h4>
                    </div>
                    <div className="pair-status">
                      <span className={result.preStatus === 'PASS' ? 'pass' : 'fail'}>PRE: {result.preStatus}</span>
                      <span className={result.postStatus === 'PASS' ? 'pass' : 'fail'}>POST: {result.postStatus}</span>
                      <span className={comparisonStatus === 'PASS' ? 'pass' : 'fail'}>
                        COMPARISON: {comparisonStatus}
                      </span>
                    </div>
                  </header>

                  <div className="shot-pair">
                    <div className="shot-box">
                      <label>Pre Migration</label>
                      {result.preScreenshotPath ? (
                        <img src={resolveAgentAssetUrl(result.preScreenshotPath)} alt={`Pre ${result.stepName}`} loading="lazy" />
                      ) : (
                        <div className="shot-empty"><ImageIcon size={18} /> No image</div>
                      )}
                    </div>

                    <div className="shot-box">
                      <label>Post Migration</label>
                      {result.postScreenshotPath ? (
                        <img src={resolveAgentAssetUrl(result.postScreenshotPath)} alt={`Post ${result.stepName}`} loading="lazy" />
                      ) : (
                        <div className="shot-empty"><ImageIcon size={18} /> No image</div>
                      )}
                    </div>
                  </div>

                  <div className="ai-note">
                    <strong>AI Analysis:</strong>
                    <p>{aiNote}</p>
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
