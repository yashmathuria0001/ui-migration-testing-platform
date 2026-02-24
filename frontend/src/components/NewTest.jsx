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
  Github,
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

function getOverallAnalysis(report) {
  const source = (report?.overallAnalysis && typeof report.overallAnalysis === 'object')
    ? report.overallAnalysis
    : {};
  const clean = (value, fallback = '') => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback;
  };
  const list = (value) =>
    Array.isArray(value)
      ? value.map((item) => clean(item)).filter(Boolean)
      : [];

  return {
    headline: clean(source.headline, 'Overall Analysis'),
    description: clean(source.description, clean(report?.aiExplanation, 'Analysis unavailable.')),
    testerGuidance: clean(source.testerGuidance, 'Review highlighted steps and rerun after fixes.'),
    observations: list(source.keyObservations),
    impact: clean(source.userImpact, clean(report?.aiExplanation, '')),
    nextActions: list(source.nextActions),
  };
}

function getAgentAnalysisText(value, fallback = 'Not provided by agent.') {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

export default function NewTest() {
  const [appId, setAppId] = useState('');
  const [appCredentials, setAppCredentials] = useState('');
  const [preUrl, setPreUrl] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const [importType, setImportType] = useState('excel');
  const [file, setFile] = useState(null);
  const [jsonSteps, setJsonSteps] = useState([]);
  const [githubRepository, setGithubRepository] = useState('');
  const [githubFilePath, setGithubFilePath] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');
  const [githubToken, setGithubToken] = useState('');
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

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setJsonSteps([]);
    setError(null);

    if (!f) return;

    if (importType === 'json') {
      try {
        const parsed = JSON.parse(await f.text());
        const nextAppId = typeof parsed.appId === 'string' ? parsed.appId : '';
        const nextAppCredentials = typeof parsed.appCredentials === 'string' ? parsed.appCredentials : '';
        const nextPre = typeof parsed.preMigrationUrl === 'string' ? parsed.preMigrationUrl : '';
        const nextPost = typeof parsed.postMigrationUrl === 'string' ? parsed.postMigrationUrl : '';
        const nextSteps = Array.isArray(parsed.steps)
          ? parsed.steps.filter((s) => typeof s === 'string' && s.trim())
          : [];

        if (nextAppId) setAppId(nextAppId);
        if (nextAppCredentials) setAppCredentials(nextAppCredentials);
        if (nextPre) setPreUrl(nextPre);
        if (nextPost) setPostUrl(nextPost);
        setJsonSteps(nextSteps);
      } catch {
        setError('Invalid JSON file. Upload a valid JSON with preMigrationUrl, postMigrationUrl, and steps[]');
      }
      return;
    }

    if (importType === 'excel') {
      try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
        const firstSheetName = sheetNames[0];
        if (!firstSheetName) {
          setError('Excel file has no sheet.');
          return;
        }
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        if (!Array.isArray(rows) || rows.length === 0) {
          setError('Excel file is empty.');
          return;
        }

        const normalized = rows.map((row) =>
          Array.isArray(row) ? row.map((cell) => String(cell || '').trim()) : []
        );
        const metadataRows = sheetNames.flatMap((name) => {
          const current = workbook.Sheets[name];
          const currentRows = XLSX.utils.sheet_to_json(current, { header: 1, raw: false, defval: '' });
          return Array.isArray(currentRows)
            ? currentRows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell || '').trim()) : []))
            : [];
        });

        const findMetaValue = (key) => {
          const wanted = key.toLowerCase();
          for (const row of metadataRows) {
            const left = String(row[0] || '').toLowerCase();
            const right = String(row[1] || '').trim();
            if (left === wanted && right) return right;
          }
          return '';
        };

        const header = normalized[0] || [];
        const firstHeader = String(header[0] || '').toLowerCase();
        const secondHeader = String(header[1] || '').toLowerCase();

        let steps = [];
        if (firstHeader === 'step') {
          steps = normalized
            .slice(1)
            .map((row) => String(row[0] || '').trim())
            .filter(Boolean);
        } else {
          steps = normalized
            .map((row) => String(row[0] || '').trim())
            .filter((cell) => {
              const lower = cell.toLowerCase();
              return cell && !['step', 'appid', 'appcredentials', 'premigrationurl', 'postmigrationurl'].includes(lower);
            });
        }

        if (firstHeader === 'key' && secondHeader === 'value') {
          const maybeStepsStart = normalized.findIndex((row) => String(row[0] || '').toLowerCase() === 'step');
          if (maybeStepsStart >= 0) {
            steps = normalized
              .slice(maybeStepsStart + 1)
              .map((row) => String(row[0] || '').trim())
              .filter(Boolean);
          }
        }

        const nextAppId = findMetaValue('appId');
        const nextAppCredentials = findMetaValue('appCredentials');
        const nextPre = findMetaValue('preMigrationUrl');
        const nextPost = findMetaValue('postMigrationUrl');

        if (nextAppId) setAppId(nextAppId);
        if (nextAppCredentials) setAppCredentials(nextAppCredentials);
        if (nextPre) setPreUrl(nextPre);
        if (nextPost) setPostUrl(nextPost);
        setJsonSteps(steps);
      } catch {
        setError('Invalid Excel file. Use .xlsx/.xls with a step column and optional metadata fields.');
      }
    }
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
  const overallAnalysis = useMemo(() => getOverallAnalysis(report), [report]);

  const getFriendlyRunStatus = (status) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'RUNNING') return 'In Progress';
    if (normalized === 'COMPLETED') return 'Completed';
    if (normalized === 'FAILED') return 'Stopped';
    if (normalized === 'IDLE') return 'Not Started';
    return 'In Progress';
  };

  const resolveAgentAssetUrl = (maybePath, cacheKey) => {
    if (!maybePath) return null;
    const cacheSuffix = cacheKey ? `${maybePath.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(cacheKey))}` : '';
    if (maybePath.startsWith('http://') || maybePath.startsWith('https://')) return `${maybePath}${cacheSuffix}`;
    if (maybePath.startsWith('/screenshots/') || maybePath.startsWith('/reports/')) {
      return `${BACKEND_BASE_URL}/api/assets${maybePath}${cacheSuffix}`;
    }
    return `${AGENT_ASSET_BASE_URL}${maybePath}${cacheSuffix}`;
  };

  const runTest = async () => {
    if (!appId.trim() || !appCredentials.trim()) {
      setError('Please provide App ID and App Credentials before running security checks.');
      return;
    }
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
    if (importType === 'github' && (!githubRepository.trim() || !githubFilePath.trim())) {
      setError('Please provide GitHub repository and file path.');
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
      } else if (importType === 'json') {
        const createRes = await api.post('/testruns/create', {
          preMigrationUrl: preUrl,
          postMigrationUrl: postUrl,
          steps: jsonSteps,
        });
        testRunId = createRes.data.id;
      } else {
        const githubRes = await api.post('/testruns/github', {
          repository: githubRepository.trim(),
          filePath: githubFilePath.trim(),
          branch: githubBranch.trim() || 'main',
          githubToken: githubToken.trim() || undefined,
          preMigrationUrl: preUrl,
          postMigrationUrl: postUrl,
        });
        testRunId = githubRes.data.id;
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
            <button
              type="button"
              className={importType === 'github' ? 'active' : ''}
              onClick={() => {
                setImportType('github');
                setFile(null);
                setJsonSteps([]);
              }}
            >
              <Github size={16} /> GitHub Repo
            </button>
          </div>

          <div className="form-stack">
            <label>
              App ID
              <input
                type="text"
                placeholder="Enter application ID"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
              />
            </label>

            <label>
              App Credentials
              <input
                type="password"
                placeholder="Enter application credentials"
                value={appCredentials}
                onChange={(e) => setAppCredentials(e.target.value)}
              />
            </label>

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

            {importType !== 'github' && (
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
            )}

            {importType === 'github' && (
              <>
                <label>
                  GitHub Repository
                  <input
                    type="text"
                    placeholder="owner/repository"
                    value={githubRepository}
                    onChange={(e) => setGithubRepository(e.target.value)}
                  />
                </label>
                <label>
                  Testcase File Path
                  <input
                    type="text"
                    placeholder="path/to/case.json | case.yml | case.spec.ts"
                    value={githubFilePath}
                    onChange={(e) => setGithubFilePath(e.target.value)}
                  />
                </label>
                <label>
                  Branch
                  <input
                    type="text"
                    placeholder="main"
                    value={githubBranch}
                    onChange={(e) => setGithubBranch(e.target.value)}
                  />
                </label>
                <label>
                  GitHub Token (Optional)
                  <input
                    type="password"
                    placeholder="For private repositories"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                  />
                </label>
              </>
            )}

            {(importType === 'json' || importType === 'excel') && jsonSteps.length > 0 && (
              <p className="muted">Detected {jsonSteps.length} steps from {importType.toUpperCase()}.</p>
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
            <p className="overall-headline">{overallAnalysis.headline}</p>
            <p>{overallAnalysis.description}</p>
            <p className="tester-guidance">
              <strong>Tester Guidance:</strong> {overallAnalysis.testerGuidance}
            </p>
            <div className="overall-grid">
              <div className="overall-block">
                <h5>Key Observations</h5>
                <ul>
                  {overallAnalysis.observations.map((item, idx) => (
                    <li key={`obs-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="overall-block">
                <h5>User Impact</h5>
                <p>{overallAnalysis.impact}</p>
              </div>
            </div>
            <div className="overall-foot">
              <span>Impact Level: {report?.severity || 'LOW'}</span>
              <span>Confidence Score: {report?.riskScore ?? 0}/100</span>
            </div>
            <div className="overall-block">
              <h5>Recommended Next Actions</h5>
              <ol>
                {overallAnalysis.nextActions.map((item, idx) => (
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
            <a className="report-link" href={resolveAgentAssetUrl(report.combinedReportPath, report.executionEndTime)} target="_blank" rel="noreferrer">
              Open Full HTML Report <ExternalLink size={14} />
            </a>
          )}

          <div className="step-report-grid">
            {(report.results || []).map((result, index) => {
              const comparisonStatus =
                String(result?.comparisonStatus || '').toUpperCase() ||
                (result?.preStatus === result?.postStatus ? 'PASS' : 'FAIL');
              const comparisonLabel = getAgentAnalysisText(
                result?.comparisonLabel,
                comparisonStatus === 'PASS' ? 'Match' : 'Difference Found',
              );
              const exactChange = getAgentAnalysisText(result?.exactChange);
              const detailedDifference = getAgentAnalysisText(
                result?.detailedDifference || result?.difference,
              );
              const runtimeEvidence = getAgentAnalysisText(result?.runtimeEvidence);
              const detailedFix = comparisonStatus === 'FAIL'
                ? getAgentAnalysisText(result?.detailedFix, 'Fix recommendation not provided by agent.')
                : getAgentAnalysisText(result?.detailedFix, 'No fix required for this step.');

              return (
                <article className="step-report-card" key={`${result.stepName}-${index}`}>
                  <header>
                    <div>
                      <span className="step-count">Step {index + 1}</span>
                      <h4>{result.stepName}</h4>
                    </div>
                    <div className="pair-status">
                      <span className={comparisonStatus === 'PASS' ? 'pass' : 'fail'}>
                        {comparisonLabel}
                      </span>
                    </div>
                  </header>

                  <div className="shot-pair">
                    <div className="shot-box">
                      <label>Before Update</label>
                      {result.preScreenshotPath ? (
                        <img src={resolveAgentAssetUrl(result.preScreenshotPath, report.executionEndTime)} alt={`Pre ${result.stepName}`} loading="lazy" />
                      ) : (
                        <div className="shot-empty"><ImageIcon size={18} /> No image</div>
                      )}
                    </div>

                    <div className="shot-box">
                      <label>After Update</label>
                      {result.postScreenshotPath ? (
                        <img src={resolveAgentAssetUrl(result.postScreenshotPath, report.executionEndTime)} alt={`Post ${result.stepName}`} loading="lazy" />
                      ) : (
                        <div className="shot-empty"><ImageIcon size={18} /> No image</div>
                      )}
                    </div>
                  </div>

                  <div className="ai-note">
                    <strong>Analysis Report</strong>
                    <div className="analysis-grid">
                      <div className="analysis-block">
                        <h5>Exact Change Found</h5>
                        <p>{exactChange}</p>
                      </div>
                      <div className="analysis-block">
                        <h5>Detailed Difference</h5>
                        <p>{detailedDifference}</p>
                      </div>
                      <div className="analysis-block">
                        <h5>Runtime Evidence Used</h5>
                        <p>{runtimeEvidence}</p>
                      </div>
                      <div className="analysis-block fix">
                        <h5>Detailed Fix Recommendation</h5>
                        <p>{detailedFix}</p>
                      </div>
                    </div>
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
