/**
 * Logger utility for MCP Server
 * All logs go to stderr for proper MCP stdio communication
 */

export class McpLogger {
  private prefix = '[MCP]';

  private shouldLog(level: string): boolean {
    const envLevel = process.env.MCP_LOG_LEVEL || 'info';
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(envLevel);
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.error(`${this.prefix} DEBUG: ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : '');
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.error(`${this.prefix} INFO: ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : '');
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.error(`${this.prefix} WARN: ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : '');
    }
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(`${this.prefix} ERROR: ${message}`);
      if (error instanceof Error) {
        console.error(`  Message: ${error.message}`);
        if (process.env.MCP_LOG_LEVEL === 'debug' && error.stack) {
          console.error(`  Stack: ${error.stack}`);
        }
      } else if (error) {
        console.error(`  Details:`, error);
      }
      if (data !== undefined) {
        console.error(`  Data:`, JSON.stringify(data, null, 2));
      }
    }
  }

  toolCall(toolName: string, args?: Record<string, unknown>): void {
    this.debug(`Tool called: ${toolName}`, args);
  }

  toolSuccess(toolName: string, duration?: number): void {
    this.debug(`Tool succeeded: ${toolName}`, duration ? { duration: `${duration}ms` } : undefined);
  }

  toolError(toolName: string, error: Error | unknown): void {
    this.error(`Tool failed: ${toolName}`, error);
  }
}

export const logger = new McpLogger();
