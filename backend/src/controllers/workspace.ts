import { Request, Response } from 'express';
import { WorkspaceRegistry } from '../services/workspaceRegistry.js';

export class WorkspaceController {
  private workspaceRegistry: WorkspaceRegistry;

  constructor() {
    this.workspaceRegistry = WorkspaceRegistry.getInstance();
  }

  /** Get or create workspace for a given path (called by MCP) */
  async getOrCreateWorkspace(req: Request, res: Response): Promise<void> {
    try {
      const { path } = req.body;

      if (!path || typeof path !== 'string') {
        res.status(400).json({ error: 'path is required in body' });
        return;
      }

      const workspace = await this.workspaceRegistry.getOrCreateWorkspace(path);

      res.json({
        id: workspace.id,
        path: workspace.path,
        sessionsDir: `${workspace.path}/sessions`,
      });
    } catch (error) {
      console.error('[WorkspaceController] Error in getOrCreateWorkspace:', error);
      res.status(500).json({ error: 'Failed to get or create workspace' });
    }
  }

  /** Get workspace by hash (called by frontend) */
  async getWorkspace(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceHash } = req.params;

      const workspace = this.workspaceRegistry.getWorkspace(workspaceHash);

      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      res.json({
        id: workspace.id,
        path: workspace.path,
        sessionsDir: `${workspace.path}/sessions`,
      });
    } catch (error) {
      console.error('[WorkspaceController] Error in getWorkspace:', error);
      res.status(500).json({ error: 'Failed to get workspace' });
    }
  }

  /** List all workspaces */
  async listWorkspaces(req: Request, res: Response): Promise<void> {
    try {
      const workspaces = this.workspaceRegistry.listWorkspaces();

      res.json({
        workspaces: workspaces.map(w => ({
          id: w.id,
          path: w.path,
          createdAt: w.createdAt,
          lastAccessedAt: w.lastAccessedAt,
        })),
      });
    } catch (error) {
      console.error('[WorkspaceController] Error in listWorkspaces:', error);
      res.status(500).json({ error: 'Failed to list workspaces' });
    }
  }
}
