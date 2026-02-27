import { promises as fs } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

export interface Workspace {
  id: string;           // Hash like "x827xhsd"
  path: string;         // Full path to .terrific directory
  createdAt: string;
  lastAccessedAt: string;
}

export interface WorkspacesData {
  workspaces: Record<string, Workspace>;
  defaultWorkspace: string | null;
}

export class WorkspaceRegistry {
  private static instance: WorkspaceRegistry | null = null;
  private workspacesFile: string;
  private workspaces: Record<string, Workspace> = {};
  private defaultWorkspace: string | null = null;
  private initialized: boolean = false;

  private constructor() {
    // Store workspaces.json in the project root directory (parent of sessions)
    // We use the config.sessionsDir which is already set to the correct location
    this.workspacesFile = join(config.sessionsDir, '../workspaces.json');
    this.initialize();
  }

  /** Get the singleton instance of WorkspaceRegistry */
  static getInstance(): WorkspaceRegistry {
    if (!WorkspaceRegistry.instance) {
      WorkspaceRegistry.instance = new WorkspaceRegistry();
    }
    return WorkspaceRegistry.instance;
  }

  /** Reset the singleton instance (for testing purposes) */
  static reset(): void {
    WorkspaceRegistry.instance = null;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.load();
      this.initialized = true;
      console.log(`[WorkspaceRegistry] Initialized with ${Object.keys(this.workspaces).length} workspaces`);
    } catch (error) {
      console.error('[WorkspaceRegistry] Failed to initialize:', error);
      // Continue with empty workspaces
      this.workspaces = {};
      this.defaultWorkspace = null;
      this.initialized = true;
    }
  }

  /** Get or create workspace for a given path */
  async getOrCreateWorkspace(path: string): Promise<Workspace> {
    // Wait for initialization
    while (!this.initialized) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Normalize path to .terrific directory
    const normalizedPath = path.endsWith('.terrific')
      ? path
      : join(path, '.terrific');

    // Check if workspace already exists for this path
    const existing = Object.values(this.workspaces).find(w => w.path === normalizedPath);
    if (existing) {
      existing.lastAccessedAt = new Date().toISOString();
      await this.save();
      console.log(`[WorkspaceRegistry] Found existing workspace: ${existing.id} -> ${normalizedPath}`);
      return existing;
    }

    // Create new workspace with random 8-char hash
    const id = this.generateHash();
    const workspace: Workspace = {
      id,
      path: normalizedPath,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };

    this.workspaces[id] = workspace;
    await this.save();
    console.log(`[WorkspaceRegistry] Created new workspace: ${id} -> ${normalizedPath}`);
    return workspace;
  }

  /** Get workspace by hash */
  getWorkspace(id: string): Workspace | null {
    const workspace = this.workspaces[id];
    if (workspace) {
      workspace.lastAccessedAt = new Date().toISOString();
      // Fire and forget save
      this.save().catch(err => console.error('[WorkspaceRegistry] Failed to save lastAccessedAt:', err));
    }
    return workspace || null;
  }

  /** List all workspaces */
  listWorkspaces(): Workspace[] {
    return Object.values(this.workspaces).sort(
      (a, b) => new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
    );
  }

  /** Generate random 8-character hash */
  private generateHash(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let hash = '';
    for (let i = 0; i < 8; i++) {
      hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return hash;
  }

  /** Load workspaces from file */
  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.workspacesFile, 'utf-8');
      const data = JSON.parse(content) as WorkspacesData;
      this.workspaces = data.workspaces || {};
      this.defaultWorkspace = data.defaultWorkspace || null;
      console.log(`[WorkspaceRegistry] Loaded ${Object.keys(this.workspaces).length} workspaces from ${this.workspacesFile}`);
    } catch (error) {
      // File doesn't exist yet, start fresh
      console.log('[WorkspaceRegistry] No existing workspaces file, starting fresh');
      this.workspaces = {};
      this.defaultWorkspace = null;
    }
  }

  /** Save workspaces to file */
  private async save(): Promise<void> {
    try {
      // Ensure the directory exists
      const workspacesDir = join(this.workspacesFile, '..');
      await fs.mkdir(workspacesDir, { recursive: true });

      const data: WorkspacesData = {
        workspaces: this.workspaces,
        defaultWorkspace: this.defaultWorkspace,
      };
      await fs.writeFile(this.workspacesFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[WorkspaceRegistry] Failed to save workspaces:', error);
    }
  }
}
