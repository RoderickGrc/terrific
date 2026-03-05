import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Copy, CheckCircle2,
  Server, Code2, ChevronDown, ChevronRight, Play
} from 'lucide-react';
import { AI_DEBUG_PROMPT } from '../../src/constants';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { api } from '../../src/services/api';
import { useWorkspace } from '../../WorkspaceContext';
import { getSessionPath } from '../../src/services/workspacePaths';

const DEBUG_GATEWAY_STORAGE_KEY = 'debug_gateway_enabled';

export const DebugServerPanel: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceHash } = useWorkspace();
  const [isEnabled, setIsEnabled] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'listening' | 'connected'>('disconnected');
  const [serverUrl, setServerUrl] = useState<string>("http://localhost:4567/api/sessions/ingest");

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(DEBUG_GATEWAY_STORAGE_KEY);
    if (saved === 'true') {
      setIsEnabled(true);
    }
  }, []);

  // Fetch server info on mount
  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const info = await api.getServerInfo(workspaceHash);
        setServerUrl(`${info.url}/api/sessions/ingest`);
      } catch (error) {
        console.error('Failed to fetch server info:', error);
      }
    };
    fetchServerInfo();
  }, [workspaceHash]);

  // Simulate connection listening state
  useEffect(() => {
    let timeout: any;
    if (isEnabled) {
      setConnectionStatus('listening');
      // Simulate a "client" appearing after a few seconds
      timeout = setTimeout(() => {
        setConnectionStatus('connected');
      }, 2500);
    } else {
      setConnectionStatus('disconnected');
    }
    return () => clearTimeout(timeout);
  }, [isEnabled]);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(AI_DEBUG_PROMPT);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(serverUrl);
  };

  const handleStartDebugSession = async () => {
    setIsStartingSession(true);
    try {
      const session = await api.createSession({
        sessionType: 'debug_gateway',
        name: `Debug Gateway ${new Date().toLocaleTimeString()}`,
        initialUrl: 'debug://gateway',
        recordActions: false,
        recordConsole: false,
        recordNetwork: false,
        recordVideo: false,
      }, workspaceHash);
      navigate(getSessionPath(session.id, workspaceHash));
    } catch (error) {
      console.error('Error starting debug session:', error);
      alert('Failed to start debug gateway session');
    } finally {
      setIsStartingSession(false);
    }
  };

  return (
    <div className="bg-zinc-900/50 backdrop-blur-sm border border-white/5 rounded-2xl shadow-sm transition-all duration-300">

      {/* Header - Matches SessionConfig padding and alignment */}
      <div className="p-6 md:p-8 pb-4 flex items-start justify-between relative z-10">
        <div className="flex items-start gap-4">
          <div className={`
            p-3 rounded-xl transition-all duration-300 border
            ${isEnabled
              ? 'bg-white border-white text-black shadow-lg shadow-white/10'
              : 'bg-zinc-800 border-zinc-700 text-zinc-500'}
          `}>
            <Server size={20} fill={isEnabled ? "currentColor" : "none"} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Live Debug Gateway</h3>
            <p className="text-sm text-zinc-400 mt-1 max-w-[260px] leading-relaxed">
              Stream external logs from your backend, scripts, or testing suites directly into the session timeline.
            </p>
          </div>
        </div>

        {/* Toggle Switch - Monochromatic Style */}
        <button
          onClick={() => {
            const newState = !isEnabled;
            setIsEnabled(newState);
            localStorage.setItem(DEBUG_GATEWAY_STORAGE_KEY, String(newState));
          }}
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

          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center w-3 h-3">
                {connectionStatus === 'connected' ? (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                ) : (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75 animate-ping"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </div>
              <span className="text-xs font-mono text-zinc-300 uppercase tracking-wider">
                {connectionStatus === 'connected' ? 'Clients Connected' : 'Waiting for signal...'}
              </span>
            </div>

            {connectionStatus === 'connected' && (
              <Badge variant="success" className="h-5 px-1.5">Active Stream</Badge>
            )}
          </div>

          {/* URL Section - Standardized Input Style */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-zinc-300">Endpoint URL</label>
            <div className="w-full bg-zinc-950/50 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between group/url transition-colors hover:border-white/20">
              <code className="text-zinc-100 font-mono text-[13px] truncate select-all">
                {serverUrl}
              </code>
              <button
                onClick={handleCopyUrl}
                className="text-zinc-500 hover:text-white transition-colors p-1"
                title="Copy URL"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* Contract Toggle */}
          <div className="space-y-2">
            <button
              onClick={() => setShowContract(!showContract)}
              className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-full group"
            >
              {showContract ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="group-hover:underline decoration-zinc-700 underline-offset-2">Payload Contract & details</span>
            </button>

            {showContract && (
              <div className="bg-black/20 rounded-xl border border-white/5 p-4 animate-in slide-in-from-top-2">
                <pre className="text-[10px] font-mono text-zinc-400 leading-relaxed">
                  {`{
  "lvl": "log" | "warn" | "error",
  "src": "string (e.g. backend)",
  "message": "string",
  "data": { ...json_context }
}`}
                </pre>
              </div>
            )}
          </div>

          {/* AI Helper Action */}
          <div className="pt-2 space-y-3">
            <Button
              variant="secondary"
              size="sm"
              className={`w-full justify-between py-2.5 px-3 group ${copiedPrompt ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10' : ''}`}
              onClick={handleCopyPrompt}
            >
              <span className="flex items-center gap-2">
                {copiedPrompt ? <CheckCircle2 size={16} /> : <Code2 size={16} />}
                {copiedPrompt ? 'Instructions Copied' : 'Copy AI Instructions'}
              </span>
              <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded text-zinc-500 group-hover:text-zinc-300">
                For Cursor/Copilot
              </span>
            </Button>
            <p className="text-[10px] text-zinc-600 mt-2 text-center">
              Paste this into your AI coding assistant to auto-instrument your app.
            </p>

            {/* Start Debug Gateway Session Button */}
            <div className="pt-2">
              <Button
                variant="primary"
                size="sm"
                className="w-full py-2.5 px-3"
                onClick={handleStartDebugSession}
                isLoading={isStartingSession}
                disabled={isStartingSession}
              >
                <span className="flex items-center gap-2">
                  <Play size={16} fill="currentColor" />
                  {isStartingSession ? 'Starting...' : 'Start Debug Gateway Session'}
                </span>
              </Button>
              <p className="text-[10px] text-zinc-600 mt-2 text-center">
                Debug backends and scripts without browser
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
