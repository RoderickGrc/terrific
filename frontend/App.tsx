import React from 'react';
import { HashRouter as Router, Routes, Route, Outlet } from 'react-router-dom';
import { SessionConfig } from './components/features/SessionConfig';
import { ActiveSession } from './components/features/ActiveSession';
import { SessionReplay } from './components/features/SessionReplay';
import { WorkspaceLayout } from './components/WorkspaceLayout';

const Layout = () => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <Outlet />
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Default routes (no workspace - uses backend directory) */}
          <Route index element={<SessionConfig />} />
          <Route path="session/:id" element={<ActiveSession />} />
          <Route path="replay/:id" element={<SessionReplay />} />

          {/* Workspace-scoped routes */}
          <Route path="workspace/:workspaceHash" element={<WorkspaceLayout />}>
            <Route index element={<SessionConfig />} />
            <Route path="session/:id" element={<ActiveSession />} />
            <Route path="replay/:id" element={<SessionReplay />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}
