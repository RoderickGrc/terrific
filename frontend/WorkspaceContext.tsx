import React, { createContext, useContext, ReactNode } from 'react';

interface WorkspaceContextValue {
  workspaceHash: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaceHash: null,
});

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}

export function WorkspaceProvider({
  workspaceHash,
  children,
}: {
  workspaceHash: string;
  children: ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={{ workspaceHash }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
