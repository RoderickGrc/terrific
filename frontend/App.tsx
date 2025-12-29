import React from 'react';
import { HashRouter as Router, Routes, Route, Outlet } from 'react-router-dom';
import { SessionConfig } from './components/features/SessionConfig';
import { ActiveSession } from './components/features/ActiveSession';
import { SessionReplay } from './components/features/SessionReplay';

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
          <Route index element={<SessionConfig />} />
          <Route path="session/:id" element={<ActiveSession />} />
          <Route path="replay/:id" element={<SessionReplay />} />
        </Route>
      </Routes>
    </Router>
  );
}
