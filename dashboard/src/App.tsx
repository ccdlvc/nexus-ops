import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AlertsProvider } from './context/AlertsContext';
import NavBar from './components/NavBar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Incidents from './pages/Incidents';
import IncidentDetailPage from './pages/IncidentDetailPage';
import Settings from './pages/Settings';
import ReposPage from './pages/ReposPage';
import PortainerPage from './pages/PortainerPage';
import GrafanaPage from './pages/GrafanaPage';
import AWSPage from './pages/AWSPage';
import GCPPage from './pages/GCPPage';
import AzurePage from './pages/AzurePage';
import CloudCostPage from './pages/CloudCostPage';

export default function App() {
  return (
    <BrowserRouter>
      <AlertsProvider>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
          <NavBar />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/incidents" element={<Incidents />} />
                <Route path="/incidents/:id" element={<IncidentDetailPage />} />
                <Route path="/repos" element={<ReposPage />} />
                <Route path="/portainer" element={<PortainerPage />} />
                <Route path="/grafana" element={<GrafanaPage />} />
                <Route path="/aws" element={<AWSPage />} />
                <Route path="/gcp" element={<GCPPage />} />
                <Route path="/azure" element={<AzurePage />} />
                <Route path="/cloud-cost" element={<CloudCostPage />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </div>
      </AlertsProvider>
    </BrowserRouter>
  );
}
