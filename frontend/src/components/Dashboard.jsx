import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import './Dashboard.css';

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || 'http://localhost:8000';
const AGENT_ASSET_BASE_URL = import.meta.env.VITE_AGENT_ASSET_BASE_URL || 'http://localhost:5000';

const api = axios.create({ baseURL: `${BACKEND_BASE_URL}/api` });

function SeverityBadge({ severity }) {
  const cls = severity === 'HIGH' ? 'high' : severity === 'MEDIUM' ? 'medium' : 'low';
  return <span className={`severity-badge ${cls}`}>{severity || '—'}</span>;
}

function resolveAgentUrl(path, cacheKey) {
  if (!path) return null;
  const cacheSuffix = cacheKey ? `${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(cacheKey))}` : '';
  if (path.startsWith('http')) return `${path}${cacheSuffix}`;
  // Use backend proxy for screenshots to avoid CORS
  if (path.startsWith('/screenshots/')) {
    return `${BACKEND_BASE_URL}/api/assets${path}${cacheSuffix}`;
  }
  return `${AGENT_ASSET_BASE_URL}${path}${cacheSuffix}`;
}

export default function Dashboard() {
  const [runs, setRuns] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    passed: 0,
    failed: 0,
    regressions: 0,
    highSeverity: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, statsRes] = await Promise.all([
        api.get('/test-runs', { params: { page, size: 20 } }),
        api.get('/test-runs/stats').catch(() => ({ data: {} })),
      ]);
      const data = runsRes.data;
      setRuns(data.content || []);
      setTotalPages(data.totalPages ?? 0);

      const s = statsRes.data;
      setSummary({
        total: s.totalRuns ?? data.totalElements ?? 0,
        passed: s.passed ?? 0,
        failed: s.failed ?? 0,
        regressions: s.regressions ?? 0,
        highSeverity: s.highSeverity ?? 0,
      });
    } catch (err) {
      console.error(err);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const failedTests = (run) => {
    const results = run?.results || [];
    return results.filter((r) => {
      const comparison = String(r.comparisonStatus || '').toUpperCase();
      if (comparison === 'FAIL') return true;
      return r.postStatus !== r.preStatus;
    });
  };

  const getRunComparisonStatus = (run) => {
    if ((run?.status || '').toUpperCase() === 'FAILED') return 'FAILED';
    if (run?.regressionDetected === true) return 'FAIL';
    if ((run?.status || '').toUpperCase() === 'COMPLETED') return 'PASS';
    return run?.status || 'UNKNOWN';
  };

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      return dt.toLocaleString();
    } catch {
      return String(d);
    }
  };

  return (
    <div className="dashboard">
      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <Activity size={24} className="icon" />
          <span className="value">{summary.total}</span>
          <span className="label">Total Runs</span>
        </div>
        <div className="summary-card success">
          <CheckCircle size={24} className="icon" />
          <span className="value">{summary.passed}</span>
          <span className="label">Passed</span>
        </div>
        <div className="summary-card error">
          <XCircle size={24} className="icon" />
          <span className="value">{summary.failed}</span>
          <span className="label">Failed</span>
        </div>
        <div className="summary-card warning">
          <AlertTriangle size={24} className="icon" />
          <span className="value">{summary.regressions}</span>
          <span className="label">Regressions</span>
        </div>
        <div className="summary-card high">
          <AlertTriangle size={24} className="icon" />
          <span className="value">{summary.highSeverity}</span>
          <span className="label">High Severity</span>
        </div>
      </div>

      {/* Test Run Table */}
      <div className="table-card">
        <h2 className="table-title">Test Runs</h2>
        {loading ? (
          <div className="loading-table">Loading...</div>
        ) : (
          <div className="table-wrap">
            <table className="runs-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Severity</th>
                  <th>Regression</th>
                  <th>Risk Score</th>
                  <th>Last Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className={selectedRun?.id === run.id ? 'selected' : ''}
                    onClick={() => setSelectedRun(run)}
                  >
                    <td className="id-cell">{formatDate(run.createdAt)}</td>
                    <td>
                      {(() => {
                        const comparisonStatus = getRunComparisonStatus(run);
                        return (
                          <span className={`status-badge ${comparisonStatus.toLowerCase()}`}>
                            {comparisonStatus}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <SeverityBadge severity={run.severity} />
                    </td>
                    <td>{run.regressionDetected ? 'Yes' : 'No'}</td>
                    <td>
                      <span className="risk-score">{run.riskScore ?? '—'}</span>
                    </td>
                    <td>{formatDate(run.executionEndTime || run.createdAt)}</td>
                    <td>
                      <ChevronRight size={18} className="chevron" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              disabled={page <= 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>Page {page + 1} of {totalPages}</span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedRun && (
        <div className="drawer-overlay" onClick={() => setSelectedRun(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Run Details</h3>
              <button className="close-btn" onClick={() => setSelectedRun(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="drawer-body">
              <section className="drawer-section">
                <h4>AI Explanation</h4>
                <p className="explanation">
                  {selectedRun.aiExplanation || selectedRun.errorMessage || 'No explanation available.'}
                </p>
              </section>

              <section className="drawer-section">
                <h4>Comparison Status</h4>
                <div className="pre-post-status">
                  <span className={getRunComparisonStatus(selectedRun) === 'PASS' ? 'pass' : 'fail'}>
                    Result: {getRunComparisonStatus(selectedRun)}
                  </span>
                </div>
              </section>

              {failedTests(selectedRun).length > 0 && (
                <section className="drawer-section">
                  <h4>Failed Tests</h4>
                  <ul className="failed-tests-list">
                    {failedTests(selectedRun).map((r, i) => (
                      <li key={i}>
                        <strong>{r.stepName}</strong> — Comparison: {r.comparisonLabel || (String(r.comparisonStatus || '').toUpperCase() === 'PASS' ? 'Match' : 'Difference Found')}
                        {r.difference && <div className="diff">{r.difference}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="drawer-section">
                <h4>Risk Score</h4>
                <div className="risk-bar-wrap">
                  <div
                    className="risk-bar"
                    style={{
                      width: `${selectedRun.riskScore ?? 0}%`,
                      backgroundColor:
                        (selectedRun.riskScore ?? 0) >= 70
                          ? '#ef4444'
                          : (selectedRun.riskScore ?? 0) >= 40
                            ? '#f59e0b'
                            : '#22c55e',
                    }}
                  />
                  <span className="risk-value">{selectedRun.riskScore ?? 0}/100</span>
                </div>
              </section>

              <section className="drawer-section">
                <h4>Screenshot Preview</h4>
                <div className="screenshot-preview">
                  {selectedRun.results?.[0]?.preScreenshotPath ? (
                    <img
                      src={resolveAgentUrl(selectedRun.results[0].preScreenshotPath, selectedRun.executionEndTime)}
                      alt="Pre"
                    />
                  ) : (
                    <div className="no-screenshot">
                      <ImageIcon size={32} /> Pre
                    </div>
                  )}
                  {selectedRun.results?.[0]?.postScreenshotPath ? (
                    <img
                      src={resolveAgentUrl(selectedRun.results[0].postScreenshotPath, selectedRun.executionEndTime)}
                      alt="Post"
                    />
                  ) : (
                    <div className="no-screenshot">
                      <ImageIcon size={32} /> Post
                    </div>
                  )}
                </div>
              </section>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
