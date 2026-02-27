import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '../..');
const terrificHome = process.platform === 'win32'
  ? join(homedir(), 'Documents', '.terrific')
  : join(homedir(), '.terrific');

const legacyWorkspacesFile = join(projectRoot, 'workspaces.json');
const legacyCredentialsFile = join(projectRoot, 'credentials.json');

export const config = {
  port: process.env.PORT || 4568,
  sessionsDir: join(terrificHome, 'sessions'),
  credentialsFile: join(terrificHome, 'credentials.json'),
  workspacesFile: join(terrificHome, 'workspaces.json'),
  globalConfigFile: join(terrificHome, 'config.json'),
  terrificHome,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4567',
};

async function moveLegacyFile(legacyPath: string, destinationPath: string): Promise<void> {
  try {
    await fs.access(legacyPath);
  } catch {
    return;
  }

  try {
    await fs.access(destinationPath);
    return;
  } catch {
    // Destination does not exist yet
  }

  try {
    await fs.rename(legacyPath, destinationPath);
    console.log(`[RuntimeStorage] Moved legacy file: ${legacyPath} -> ${destinationPath}`);
  } catch (error: any) {
    if (error?.code === 'EXDEV') {
      await fs.copyFile(legacyPath, destinationPath);
      await fs.unlink(legacyPath);
      console.log(`[RuntimeStorage] Moved legacy file across volumes: ${legacyPath} -> ${destinationPath}`);
      return;
    }
    throw error;
  }
}

async function ensureJsonFile(path: string, defaultData: unknown): Promise<void> {
  try {
    await fs.access(path);
    return;
  } catch {
    await fs.writeFile(path, JSON.stringify(defaultData, null, 2), 'utf-8');
  }
}

export async function initializeRuntimeStorage(): Promise<void> {
  await fs.mkdir(config.terrificHome, { recursive: true });
  await fs.mkdir(config.sessionsDir, { recursive: true });

  await moveLegacyFile(legacyWorkspacesFile, config.workspacesFile);
  await moveLegacyFile(legacyCredentialsFile, config.credentialsFile);

  await ensureJsonFile(config.workspacesFile, {
    workspaces: {},
    defaultWorkspace: null,
  });
  await ensureJsonFile(config.credentialsFile, []);
  await ensureJsonFile(config.globalConfigFile, {});
}

// Best-effort bootstrapping for modules that use config directly.
initializeRuntimeStorage().catch((error) => {
  console.error('[RuntimeStorage] Failed to initialize runtime storage:', error);
});

/**
 * Calculate session directory name with format: YYYY-MM-DD_HH-MM-SS_UUID
 * @param sessionId - The session UUID
 * @param createdAt - ISO timestamp string (optional, defaults to current time)
 * @returns Directory name in format YYYY-MM-DD_HH-MM-SS_UUID
 */
export function getSessionDirName(sessionId: string, createdAt?: string): string {
  const date = createdAt ? new Date(createdAt) : new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = date.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS
  return `${dateStr}_${timeStr}_${sessionId}`;
}
