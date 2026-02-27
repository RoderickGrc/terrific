import { chromium, Browser, BrowserContext, Page, devices } from 'playwright';
import { SessionConfig, SessionContext } from '../types/index.js';
import { join } from 'path';
import { promises as fs } from 'fs';

export class PlaywrightService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launchBrowser(sessionConfig: SessionConfig, sessionContext: SessionContext, storageState?: any): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    // Use session context for directory path
    const sessionDir = sessionContext.sessionDir;

    // Ensure session directory exists for video recording
    // Always create the directory at session start to ensure it exists for all operations
    await fs.mkdir(sessionDir, { recursive: true });

    try {
      this.browser = await chromium.launch({
        headless: false,
        channel: 'chrome', // Use Chrome if available, fallback to chromium
      });
    } catch (error) {
      // Fallback to chromium if Chrome is not available
      this.browser = await chromium.launch({
        headless: false,
      });
    }

    // Default dimensions (null for Dynamic mode)
    let viewport: { width: number; height: number } | null = { width: 1280, height: 720 };
    let userAgent: string | undefined = undefined;
    let deviceScaleFactor: number | undefined = undefined;
    let isMobile: boolean | undefined = undefined;
    let hasTouch: boolean | undefined = undefined;

    // Apply resolution presets
    if (sessionConfig.resolution) {
      switch (sessionConfig.resolution) {
        case 'Dynamic':
          // Dynamic: use browser's native viewport without forcing dimensions
          viewport = null;
          break;
        case 'FHD':
          viewport = { width: 1697, height: 944 };
          break;
        case 'HD':
          viewport = { width: 1280, height: 720 };
          break;
        case 'Tablet':
          const tablet = devices['iPad Pro 11'];
          viewport = tablet.viewport;
          userAgent = tablet.userAgent;
          deviceScaleFactor = tablet.deviceScaleFactor;
          isMobile = tablet.isMobile;
          hasTouch = tablet.hasTouch;
          break;
        case 'Mobile':
          const mobile = devices['iPhone 12'];
          viewport = mobile.viewport;
          userAgent = mobile.userAgent;
          deviceScaleFactor = mobile.deviceScaleFactor;
          isMobile = mobile.isMobile;
          hasTouch = mobile.hasTouch;
          break;
      }
    }

    // Create context options
    const contextOptions: any = {
      userAgent,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      storageState: storageState || undefined,
    };

    // For Dynamic mode, explicitly set viewport to null to disable viewport emulation
    // For other modes, set the specific viewport dimensions
    if (viewport === null) {
      contextOptions.viewport = null; // Explicitly disable viewport emulation
    } else {
      contextOptions.viewport = viewport;
    }

    // Add video recording if enabled AND recordingMode is 'browser' (or not set for backwards compatibility)
    const shouldRecordBrowserVideo = sessionConfig.recordVideo &&
      (!sessionConfig.recordingMode || sessionConfig.recordingMode === 'browser');

    if (shouldRecordBrowserVideo) {
      contextOptions.recordVideo = {
        dir: sessionDir,
        // Only set size if we have a specific viewport (not Dynamic mode)
        ...(viewport ? { size: viewport } : {}),
      };
    }

    this.context = await this.browser.newContext(contextOptions);

    // Verify storage state was applied
    if (storageState) {
      try {
        const appliedState = await this.context.storageState();
      } catch (verifyError) {
      }
    }

    this.page = await this.context.newPage();

    // Inject cursor trace visualization for browser video recordings only
    if (shouldRecordBrowserVideo) {
      const cursorTraceScript = `
        (function() {
          // Create cursor trace element
          const createCursorTrace = () => {
            // Remove existing cursor if any
            const existing = document.getElementById('playwright-cursor-trace');
            if (existing) existing.remove();

            const cursor = document.createElement('div');
            cursor.id = 'playwright-cursor-trace';
            cursor.style.cssText = \`
              position: fixed;
              width: 8px;
              height: 8px;
              background: rgba(255, 50, 50, 0.7);
              border: 1px solid rgba(255, 0, 0, 0.9);
              border-radius: 50%;
              pointer-events: none;
              z-index: 2147483647;
              transform: translate(-50%, -50%);
              transition: width 0.15s ease, height 0.15s ease, background 0.15s ease;
              display: none;
            \`;
            document.documentElement.appendChild(cursor);

            // Track mouse position
            document.addEventListener('mousemove', (e) => {
              cursor.style.display = 'block';
              cursor.style.left = e.clientX + 'px';
              cursor.style.top = e.clientY + 'px';
            });

            // Expand on click
            document.addEventListener('mousedown', () => {
              cursor.style.width = '12px';
              cursor.style.height = '12px';
              cursor.style.background = 'rgba(255, 50, 50, 0.9)';
            });

            document.addEventListener('mouseup', () => {
              cursor.style.width = '8px';
              cursor.style.height = '8px';
              cursor.style.background = 'rgba(255, 50, 50, 0.7)';
            });

            // Hide when mouse leaves window
            document.addEventListener('mouseleave', () => {
              cursor.style.display = 'none';
            });

            document.addEventListener('mouseenter', () => {
              cursor.style.display = 'block';
            });
          };

          // Initialize immediately
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createCursorTrace);
          } else {
            createCursorTrace();
          }

          // Re-inject on navigation (for SPAs)
          const observer = new MutationObserver(() => {
            if (!document.getElementById('playwright-cursor-trace')) {
              createCursorTrace();
            }
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        })();
      `;

      await this.page.addInitScript(cursorTraceScript);
    }

    // Validate and navigate to URL if provided
    if (sessionConfig.initialUrl && sessionConfig.initialUrl.trim()) {
      try {
        const url = sessionConfig.initialUrl.trim();
        // Basic URL validation
        if (url.startsWith('http://') || url.startsWith('https://')) {
          // #region agent log
          const logData = JSON.stringify({
            location: 'playwright.ts:196',
            message: '[ORCHESTRATION] PLAYWRIGHT_NAVIGATE_START',
            data: { sessionId: sessionContext.sessionId, url, timestamp: Date.now() },
            timestamp: Date.now(),
            sessionId: sessionContext.sessionId,
            runId: 'orchestration',
            hypothesisId: 'ORCH'
          });
          const logPath = join(process.cwd(), '.cursor', 'debug.log');
          try {
            await fs.appendFile(logPath, logData + '\n', 'utf8');
          } catch (e) {
            // Ignore file write errors
          }
          // #endregion
          
          await this.page.goto(url, { waitUntil: 'domcontentloaded' });
          
          // #region agent log
          const logData2 = JSON.stringify({
            location: 'playwright.ts:210',
            message: '[ORCHESTRATION] PLAYWRIGHT_NAVIGATE_COMPLETE',
            data: { sessionId: sessionContext.sessionId, url, timestamp: Date.now() },
            timestamp: Date.now(),
            sessionId: sessionContext.sessionId,
            runId: 'orchestration',
            hypothesisId: 'ORCH'
          });
          try {
            await fs.appendFile(logPath, logData2 + '\n', 'utf8');
          } catch (e) {
            // Ignore file write errors
          }
          // #endregion
        } else {
          console.warn(`Invalid URL format: ${url}. Skipping navigation.`);
        }
      } catch (error) {
        console.error(`Error navigating to ${sessionConfig.initialUrl}:`, error);
        // Continue even if navigation fails - user can navigate manually
      }
    }

    return {
      browser: this.browser,
      context: this.context,
      page: this.page,
    };
  }

  async navigateTo(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    await this.page.goto(url);
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.page = null;
  }

  getPage(): Page | null {
    return this.page;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }
}

