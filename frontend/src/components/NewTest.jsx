import { useMemo, useState } from 'react';
import axios from 'axios';
import { Upload, Play, CheckCircle, XCircle, AlertCircle, Image as ImageIcon, ExternalLink } from 'lucide-react';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || 'http://localhost:8000';
const AGENT_ASSET_BASE_URL = import.meta.env.VITE_AGENT_ASSET_BASE_URL || 'http://localhost:5000';

const api = axios.create({ baseURL: `${BACKEND_BASE_URL}/api` });

export default function NewTest() {
  const [preUrl, setPreUrl] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const [importType, setImportType] = useState('excel');
  const [file, setFile] = useState(null);
  const [jsonSteps, setJsonSteps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setJsonSteps([]);
    if (!f) return;
    if (importType === 'json') {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '{}'));
          const nextPre = typeof parsed.preMigrationUrl === 'string' ? parsed.preMigrationUrl : '';
          const nextPost = typeof parsed.postMigrationUrl === 'string' ? parsed.postMigrationUrl : '';
          const nextSteps = Array.isArray(parsed.steps) ? parsed.steps.filter((s) => typeof s === 'string') : [];
          if (nextPre) setPreUrl(nextPre);
          if (nextPost) setPostUrl(nextPost);
          setJsonSteps(nextSteps);
        } catch {
          setError('Invalid JSON file. Please upload a valid JSON test case.');
        }
      };
      reader.readAsText(f);
    }
  };

  const summary = useMemo(() => {
    const results = report?.results || [];
    const mismatched = results.filter((r) => r.preStatus !== r.postStatus);
    return {
      total: results.length,
      mismatched: mismatched.length,
      ok: report?.status === 'COMPLETED' && mismatched.length === 0,
      topNote:
        report?.status === 'FAILED'
          ? (report?.errorMessage || 'Execution failed.')
          : mismatched.length > 0
            ? `We found ${mismatched.length} step(s) that behave differently after migration.`
            : 'No meaningful differences detected in your steps.',
    };
  }, [report]);

  const resolveAgentAssetUrl = (maybePath) => {
    if (!maybePath) return null;
    if (maybePath.startsWith('http://') || maybePath.startsWith('https://')) return maybePath;
    // Use backend proxy for screenshots to avoid CORS
    if (maybePath.startsWith('/screenshots/')) {
      return `${BACKEND_BASE_URL}/api/assets${maybePath}`;
    }
    return `${AGENT_ASSET_BASE_URL}${maybePath}`;
  };

  const runTest = async () => {
    if (!preUrl || !postUrl) {
      alert('Please provide both URLs.');
      return;
    }
    if (importType === 'excel' && !file) {
      alert('Please upload an Excel file.');
      return;
    }
    if (importType === 'json' && (!file || jsonSteps.length === 0)) {
      alert('Please upload a JSON test case with steps.');
      return;
    }
    setLoading(true);
    setReport(null);
    setError(null);
    try {
      let testRunId = null;
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
      const executeRes = await api.post(`/execution/${testRunId}/run`);
      setReport(executeRes.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'An error occurred during execution.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-test-container">
      <div className="card form-section">
        <div className="input-group">
          <label>Import type</label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { setImportType('excel'); setFile(null); setJsonSteps([]); }}
              style={{
                background: importType === 'excel' ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                color: importType === 'excel' ? 'white' : 'inherit',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              Excel
            </button>
            <button
              type="button"
              onClick={() => { setImportType('json'); setFile(null); setJsonSteps([]); }}
              style={{
                background: importType === 'json' ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                color: importType === 'json' ? 'white' : 'inherit',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              JSON
            </button>
          </div>
        </div>
        <div className="input-group">
          <label>Pre-Migration URL</label>
          <input type="text" placeholder="https://old-ui.example.com" value={preUrl} onChange={(e) => setPreUrl(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Post-Migration URL</label>
          <input type="text" placeholder="https://new-ui.example.com" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Test Cases ({importType === 'excel' ? 'Excel' : 'JSON'})</label>
          <div className="file-input-wrapper">
            <input type="file" accept={importType === 'excel' ? '.xlsx,.xls' : '.json'} onChange={handleFileChange} id="file-upload" />
            <label htmlFor="file-upload" className="file-label">
              <Upload size={18} /> {file ? file.name : `Choose ${importType === 'excel' ? 'Excel' : 'JSON'} File`}
            </label>
          </div>
          {importType === 'json' && jsonSteps.length > 0 && (
            <div style={{ marginTop: '0.5rem', color: 'var(--text-muted-dash)', fontSize: '0.9rem' }}>Loaded {jsonSteps.length} step(s)</div>
          )}
        </div>
        <button className="run-button" onClick={runTest} disabled={loading}>
          {loading ? 'Running Tests...' : <><Play size={18} /> Run Migration Test</>}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {loading && (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Running your test… this can take a minute.</p>
        </div>
      )}

      {report && (
        <div className="report-container">
          <div className="card ai-analysis">
            <h2><AlertCircle className="icon" /> AI analysis</h2>
            <div className={`status-badge ${summary.ok ? 'success' : 'failed'}`}>
              {summary.ok ? 'Looks good' : report.status === 'FAILED' ? 'Could not complete' : 'Differences found'}
            </div>
            <p className="explanation">{summary.topNote}</p>
            {report?.combinedReportPath && (
              <div style={{ marginTop: '0.75rem' }}>
                <a href={resolveAgentAssetUrl(report.combinedReportPath)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  Open full report <ExternalLink size={16} />
                </a>
              </div>
            )}
          </div>
          <div className="step-analysis">
            <h3>Step-by-Step Comparison</h3>
            {report.results && report.results.map((result, index) => (
              <div key={index} className="card step-card">
                <div className="step-header">
                  <span className="step-number">{index + 1}</span>
                  <h4>{result.stepName}</h4>
                  <div className="step-status">
                    {result.preStatus === 'PASS' ? <CheckCircle className="pass" size={16} /> : <XCircle className="fail" size={16} />}
                    <span className="vs">vs</span>
                    {result.postStatus === 'PASS' ? <CheckCircle className="pass" size={16} /> : <XCircle className="fail" size={16} />}
                  </div>
                </div>
                {result.difference && <div className="diff-note"><strong>Note:</strong> {result.difference}</div>}
                <div className="screenshot-comparison">
                  <div className="screenshot-box">
                    <label>Pre-Migration</label>
                    {result.preScreenshotPath ? (
                      <img src={resolveAgentAssetUrl(result.preScreenshotPath)} alt="Pre-migration" loading="lazy" />
                    ) : (
                      <div className="no-image"><ImageIcon /> No Image</div>
                    )}
                  </div>
                  <div className="screenshot-box">
                    <label>Post-Migration</label>
                    {result.postScreenshotPath ? (
                      <img src={resolveAgentAssetUrl(result.postScreenshotPath)} alt="Post-migration" loading="lazy" />
                    ) : (
                      <div className="no-image"><ImageIcon /> No Image</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
