import { LayoutDashboard, FlaskConical, Menu } from 'lucide-react';
import './DashboardLayout.css';

export default function DashboardLayout({ view, setView, children }) {
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <FlaskConical size={24} />
          <span>Smart Parity</span>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </button>
          <button
            className={`nav-item ${view === 'new-test' ? 'active' : ''}`}
            onClick={() => setView('new-test')}
          >
            <FlaskConical size={20} />
            <span>New Test</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="version">v1.0</span>
        </div>
      </aside>
      <div className="main-area">
        <header className="top-header">
          <button className="menu-toggle" aria-label="Toggle menu">
            <Menu size={24} />
          </button>
          <h1 className="page-title">
            {view === 'dashboard' ? 'SmartParity Dashboard' : 'Smart Parity'}
          </h1>
        </header>
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
