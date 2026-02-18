import { useState } from 'react';
import DashboardLayout from './components/DashboardLayout';
import Dashboard from './components/Dashboard';
import NewTest from './components/NewTest';
import './App.css';

function App() {
  const [view, setView] = useState('dashboard');

  return (
    <DashboardLayout view={view} setView={setView}>
      {view === 'dashboard' ? <Dashboard /> : <NewTest />}
    </DashboardLayout>
  );
}

export default App;
