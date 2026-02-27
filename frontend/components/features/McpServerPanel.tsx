import React, { useState, useEffect } from 'react';
import {
  Copy, CheckCircle2,
  Terminal, ChevronDown, ChevronRight, Settings
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

const MCP_STORAGE_KEY = 'terrific_mcp_enabled';

export const McpServerPanel: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [serverPath, setServerPath] = useState<string>("");

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(MCP_STORAGE_KEY);
    if (saved === 'true') {
      setIsEnabled(true);
    }

    // Absolute path to the backend (user must set for their machine)
    const backendPath = 'C:\\\\path\\\\to\\\\your\\\\backend';
    setServerPath(`${backendPath}\\\\dist\\\\mcp\\\\index.js`);
  }, []);

  // Save state to localStorage when changed
  const handleToggle = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    localStorage.setItem(MCP_STORAGE_KEY, String(newState));
  };

  const configForClaudeDesktop = {
    mcpServers: {
      terrific: {
        type: "stdio",
        command: "node",
        args: [serverPath],
        cwd: "C:\\\\path\\\\to\\\\your\\\\backend"
      }
    }
  };

  const handleCopyConfig = () => {
    const configStr = JSON.stringify(configForClaudeDesktop, null, 2);
    navigator.clipboard.writeText(configStr);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  return (
    <div className="bg-zinc-900/50 backdrop-blur-sm border border-white/5 rounded-2xl shadow-sm transition-all duration-300">

      {/* Header */}
      <div className="p-6 md:p-8 pb-4 flex items-start justify-between relative z-10">
        <div className="flex items-start gap-4">
          <div className={`
            p-3 rounded-xl transition-all duration-300 border
            ${isEnabled
              ? 'bg-white border-white text-black shadow-lg shadow-white/10'
              : 'bg-zinc-800 border-zinc-700 text-zinc-500'}
          `}>
            <Terminal size={20} fill={isEnabled ? "currentColor" : "none"} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">MCP Server</h3>
            <p className="text-sm text-zinc-400 mt-1 max-w-[260px] leading-relaxed">
              Model Context Protocol server for AI-assisted debugging with Claude Desktop and other MCP clients.
            </p>
          </div>
        </div>

        {/* Toggle Switch - Monochromatic Style */}
        <button
          onClick={handleToggle}
          className={`
            relative w-12 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 focus:ring-white
            ${isEnabled ? 'bg-white' : 'bg-zinc-700'}
          `}
        >
          <span className={`
            absolute left-1 top-1 w-5 h-5 rounded-full transition-transform duration-300 shadow-sm
            ${isEnabled ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white'}
          `} />
        </button>
      </div>

      {/* Content Area */}
      <div className={`
        relative z-10 overflow-hidden transition-all duration-500 ease-in-out
        ${isEnabled ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-50'}
      `}>
        <div className="px-6 md:px-8 pb-6 md:pb-8 space-y-6">

          <div className="h-px bg-white/5 w-full" />

          {/* Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center w-3 h-3">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              <span className="text-xs font-mono text-zinc-300 uppercase tracking-wider">
                MCP Server Active
              </span>
            </div>
            <Badge variant="success" className="h-5 px-1.5">Ready</Badge>
          </div>

          {/* Instructions Toggle */}
          <div className="space-y-2">
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-full group"
            >
              {showInstructions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="group-hover:underline decoration-zinc-700 underline-offset-2">Setup Instructions for Claude Desktop</span>
            </button>

            {showInstructions && (
              <div className="bg-black/20 rounded-xl border border-white/5 p-4 animate-in slide-in-from-top-2 space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-zinc-300">1. Locate your Claude Desktop config:</p>
                  <code className="text-[10px] font-mono text-zinc-500 block pl-3">
                    %APPDATA%\Claude\claude_desktop_config.json (Windows)
                  </code>
                  <code className="text-[10px] font-mono text-zinc-500 block pl-3">
                    ~/.config/Claude/claude_desktop_config.json (macOS/Linux)
                  </code>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-zinc-300">2. Add this configuration:</p>
                  <div className="relative">
                    <pre className="text-[10px] font-mono text-zinc-400 leading-relaxed bg-zinc-950/50 p-3 rounded-lg overflow-x-auto">
{`{
  "mcpServers": {
    "terrific": {
      "type": "stdio",
      "command": "node",
      "args": ["\\\\\\\\...\\\\\\dist\\\\\\mcp\\\\\\index.js"],
      "cwd": "\\\\\\\\...\\\\\\backend"
    }
  }
}`}
                    </pre>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-zinc-300">3. Restart Claude Desktop</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-zinc-300">4. Available MCP Tools:</p>
                  <ul className="text-[10px] font-mono text-zinc-500 pl-3 space-y-0.5">
                    <li>• live_debug_gateway_health()</li>
                    <li>• start_fullstack_debug_session()</li>
                    <li>• start_debug_session()</li>
                    <li>• stop_session()</li>
                    <li>• get_session_metadata()</li>
                    <li>• get_session_logs()</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Copy Config Button */}
          <div className="pt-2 space-y-3">
            <Button
              variant="secondary"
              size="sm"
              className={`w-full justify-between py-2.5 px-3 group ${copiedConfig ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10' : ''}`}
              onClick={handleCopyConfig}
            >
              <span className="flex items-center gap-2">
                {copiedConfig ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copiedConfig ? 'Configuration Copied' : 'Copy MCP Configuration'}
              </span>
              <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded text-zinc-500 group-hover:text-zinc-300">
                For Claude Desktop
              </span>
            </Button>
            <p className="text-[10px] text-zinc-600 mt-2 text-center">
              Add this to your Claude Desktop config to enable Terrific MCP tools.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
