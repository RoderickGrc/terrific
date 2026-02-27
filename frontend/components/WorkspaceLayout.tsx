import React from 'react';
import { useParams, Outlet } from 'react-router-dom';
import { WorkspaceProvider } from '../WorkspaceContext';

export function WorkspaceLayout() {
  const { workspaceHash } = useParams<{ workspaceHash: string }>();

  if (!workspaceHash) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400">Invalid Workspace</h1>
          <p className="mt-2 text-zinc-400">No workspace hash provided in URL.</p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider workspaceHash={workspaceHash}>
      <Outlet />
    </WorkspaceProvider>
  );
}
