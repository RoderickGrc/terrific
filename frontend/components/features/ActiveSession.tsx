import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Pause, Square, Camera, Terminal, Flag, Bug, Play,
  AlertCircle, ChevronLeft, MessageSquare, Video
} from 'lucide-react';
import { QAEvent, EventType } from '../../types';
import { TimelineMatrix } from './TimelineMatrix';
import { Button } from '../ui/Button';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { api } from '../../src/services/api';
import { ScreenCaptureService } from '../../src/services/screenCapture';
import { useWorkspace } from '../../WorkspaceContext';
import { getHomePath, getReplayPath } from '../../src/services/workspacePaths';

export const ActiveSession: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workspaceHash } = useWorkspace();
  const [isRecording, setIsRecording] = useState(true);
  const [events, setEvents] = useState<QAEvent[]>([]);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [sessionType, setSessionType] = useState<'browser' | 'debug_gateway'>('browser');
  const [recordingMode, setRecordingMode] = useState<'browser' | 'screen'>('browser');
  const [isScreenCapturing, setIsScreenCapturing] = useState(false);
  const screenCaptureRef = useRef<ScreenCaptureService | null>(null);
  const screenCaptureStateRef = useRef<{
    shouldStart: boolean;
    waitingForFirstEvent: boolean;
    hasStarted: boolean;
  }>({
    shouldStart: false,
    waitingForFirstEvent: false,
    hasStarted: false,
  });

  // Connect to WebSocket with workspace hash
  const { isConnected, events: wsEvents } = useWebSocket(id || null, workspaceHash);

  // Fetch session config and start screen capture FIRST (before Playwright)
  useEffect(() => {
    if (!id) return;
    
    // Use a more robust flag to prevent double execution
    const state = screenCaptureStateRef.current;
    if (state.hasStarted) {
      console.log('[ActiveSession] Already started, skipping initialization');
      return;
    }
    
    // Mark as starting IMMEDIATELY to prevent concurrent executions
    state.hasStarted = true;

    const initializeSession = async () => {
      try {
        const session = await api.getSession(id, workspaceHash);
        setSessionType(session.config.sessionType || 'browser');
        setRecordingMode(session.config.recordingMode || 'browser');
        setSessionName(session.name || session.config?.name || '');

        // For screen recording mode, start capture FIRST, then start browser
        const shouldStart = session.config.recordVideo && session.config.recordingMode === 'screen';
        if (shouldStart) {
          state.shouldStart = true;
          state.waitingForFirstEvent = false; // No longer waiting for events
          
          console.log('[ActiveSession] Starting screen capture FIRST (before Playwright)...');
          
          // #region agent log
          fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActiveSession.tsx:57',message:'[ORCHESTRATION] STARTING_RECORDING_FIRST',data:{sessionId:id},timestamp:Date.now(),sessionId:id,runId:'orchestration',hypothesisId:'ORCH'})}).catch(()=>{});
          // #endregion
          
          try {
            // Check if capture is already active
            if (screenCaptureRef.current?.isRecording()) {
              console.warn('[ActiveSession] Screen capture already active, skipping');
              return;
            }
            
            const captureService = new ScreenCaptureService();
            screenCaptureRef.current = captureService;
            await captureService.startCapture({ sessionId: id });
            setIsScreenCapturing(true);
            
            // Get the actual recording start time for synchronization
            const recordingStartTime = captureService.getStartTime();
            
            console.log('[ActiveSession] Screen capture started, now starting Playwright browser...');
            
            // #region agent log
            fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActiveSession.tsx:72',message:'[ORCHESTRATION] RECORDING_STARTED_CALLING_START_BROWSER',data:{sessionId:id,recordingStartTime},timestamp:Date.now(),sessionId:id,runId:'orchestration',hypothesisId:'ORCH'})}).catch(()=>{});
            // #endregion
            
            // Now start Playwright browser with recording start time for synchronization
            await api.startBrowser(id, recordingStartTime, workspaceHash);
            
            // #region agent log
            fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActiveSession.tsx:77',message:'[ORCHESTRATION] START_BROWSER_CALLED',data:{sessionId:id},timestamp:Date.now(),sessionId:id,runId:'orchestration',hypothesisId:'ORCH'})}).catch(()=>{});
            // #endregion
            
            console.log('[ActiveSession] Browser start requested');
          } catch (error) {
            console.error('[ActiveSession] Failed to start screen capture or browser:', error);
            // Reset flag on error so user can retry
            state.hasStarted = false;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            alert(`Failed to start screen recording: ${errorMessage}`);
          }
        } else {
          // If not screen recording, reset the flag since we didn't start anything
          state.hasStarted = false;
        }
      } catch (error) {
        console.error('[ActiveSession] Error fetching session config:', error);
        // Reset flag on error
        state.hasStarted = false;
      }
    };

    initializeSession();
  }, [id]);

  // Stop screen capture
  const stopScreenCapture = async () => {
    if (screenCaptureRef.current) {
      try {
        await screenCaptureRef.current.stopCapture();
        setIsScreenCapturing(false);
        console.log('[ActiveSession] Screen capture stopped');
      } catch (error) {
        console.error('[ActiveSession] Error stopping screen capture:', error);
      } finally {
        // Cleanup
        screenCaptureRef.current = null;
        screenCaptureStateRef.current.hasStarted = false;
      }
    }
  };

  // Sync WebSocket events to local state
  useEffect(() => {
    setEvents(wsEvents);
  }, [wsEvents]);

  // Handle SESSION_STOPPED event - redirect to replay view
  useEffect(() => {
    const stoppedEvent = wsEvents.find(e => e.type === EventType.SESSION_STOPPED);
    if (stoppedEvent) {
      try {
        const details = JSON.parse(stoppedEvent.details || '{}');
        
        // Use redirectTo from event if available (includes workspace context)
        if (details.redirectTo) {
          console.log('[ActiveSession] Session stopped, using redirectTo:', details.redirectTo);
          navigate(details.redirectTo);
        } else {
          // Fallback: construct URL with workspace context using session.id
          const redirectPath = id
            ? getReplayPath(id, workspaceHash)
            : getHomePath(workspaceHash);
          console.log('[ActiveSession] Session stopped, redirecting to:', redirectPath);
          navigate(redirectPath);
        }
      } catch (error) {
        console.error('[ActiveSession] Error parsing SESSION_STOPPED event:', error);
      }
    }
  }, [wsEvents, id, navigate, workspaceHash]);

  const handlePauseResume = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      if (isRecording) {
        await api.pauseSession(id, workspaceHash);
        setIsRecording(false);
      } else {
        await api.resumeSession(id, workspaceHash);
        setIsRecording(true);
      }
    } catch (error) {
      console.error('Error pausing/resuming session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = async (type: EventType) => {
    if (!id) return;
    const message = note.trim() || (type === EventType.FLAG ? 'Flagged point of interest' : type === EventType.BUG ? 'Bug reported' : 'Note added');
    setIsLoading(true);
    try {
      await api.addNote(id, message, type as any, undefined, workspaceHash);
      setNote('');
    } catch (error) {
      console.error('Error adding note:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScreenshot = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      await api.captureScreenshot(id, undefined, undefined, workspaceHash);
    } catch (error) {
      console.error('Error capturing screenshot:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCrawl = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      await api.captureCrawl(id, workspaceHash);
    } catch (error) {
      console.error('Error capturing crawl:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const finishSession = async () => {
    if (!id) return;
    setIsFinishing(true);
    try {
      // Stop screen capture first if active
      await stopScreenCapture();

      const result = await api.stopSession(id, workspaceHash);
      // Use session.id (UUID) for all operations and navigation
      if (sessionName.trim()) {
        await api.updateSessionName(id, sessionName.trim(), workspaceHash);
      }

      // Construct workspace-aware replay URL using session.id
      const replayPath = getReplayPath(id, workspaceHash);
      navigate(replayPath);
    } catch (error) {
      console.error('Error stopping session:', error);
      setIsFinishing(false);
      setShowFinishModal(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden text-zinc-200 font-sans">

      {/* 1. COMMAND BAR (Top) */}
      <div className="h-16 border-b border-white/5 bg-zinc-900/80 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 z-30 sticky top-0">
        {/* Left: Navigation & Identity */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(getHomePath(workspaceHash))}
            className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
            title="Cancel Session & Return Home"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-[13px] font-bold text-white tracking-wide uppercase">
              {sessionName.trim()
                ? sessionName.trim()
                : (sessionType === 'debug_gateway'
                    ? 'DEBUG GATEWAY'
                    : `SESSION #${id?.replace('new_', '').substring(0, 8)}`)}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`flex h-2 w-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-[10px] font-mono text-zinc-500 uppercase">
                {sessionType === 'debug_gateway'
                  ? 'Logging Active'
                  : (isRecording ? 'Live Recording' : 'Paused')}
              </span>
              {isScreenCapturing && (
                <span className="text-[10px] font-mono text-red-400 ml-2 flex items-center gap-1">
                  <Video size={10} className="animate-pulse" /> SCREEN REC
                </span>
              )}
              <span className="text-[10px] font-mono text-zinc-600 ml-2">{isConnected ? 'CONNECTED' : 'CONNECTING...'}</span>
            </div>
          </div>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-2">
            <button
              onClick={handlePauseResume}
              disabled={isLoading}
              className={`
                            h-9 px-4 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all border
                            ${isRecording
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700'
                  : 'bg-amber-500/10 border-amber-500/50 text-amber-500 hover:bg-amber-500/20'
                }
                        `}
            >
              {isRecording ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              {isRecording ? 'Pause' : 'Resume'}
            </button>

            {sessionType === 'browser' && (
              <>
                <button
                  onClick={handleScreenshot}
                  disabled={isLoading}
                  className="h-9 px-4 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 hover:border-zinc-600 flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all"
                >
                  <Camera size={14} />
                  Snapshot
                </button>

                <button
                  onClick={handleCrawl}
                  disabled={isLoading}
                  className="h-9 px-4 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 hover:border-zinc-600 flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all"
                >
                  <Terminal size={14} />
                  Crawl
                </button>
              </>
            )}
          </div>

          <div className="h-6 w-px bg-zinc-800 mx-1" />

          <Button variant="danger" size="sm" onClick={() => setShowFinishModal(true)} className="gap-2">
            <Square size={12} fill="currentColor" /> Finish
          </Button>
        </div>
      </div>

      {/* 2. TIMELINE MATRIX (Full Screen) */}
      <div className="flex-1 min-h-0 bg-zinc-950 relative">
        <TimelineMatrix events={events} className="h-full" />
      </div>

      {/* 3. REPORT BAR (Bottom) */}
      <div className="bg-zinc-900/80 backdrop-blur-xl border-t border-white/5 p-4 shrink-0 z-30 shadow-2xl">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-2">
          <div className="relative bg-zinc-950/80 border border-white/10 rounded-2xl flex items-center p-1.5 focus-within:ring-2 focus-within:ring-white/20 focus-within:border-transparent transition-all shadow-lg min-h-[56px]">
            <input
              type="text"
              className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-[15px] text-zinc-100 placeholder:text-zinc-600 px-4 h-full min-w-0"
              placeholder="Type observation..."
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleQuickAction(EventType.NOTE);
                }
              }}
            />

            <div className="flex items-center gap-1 shrink-0 bg-zinc-900 rounded-xl p-1 border border-white/5">
              <button
                onClick={() => handleQuickAction(EventType.NOTE)}
                disabled={!note || isLoading}
                className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition-colors disabled:opacity-30 relative group"
                title="Log Note (Enter)"
              >
                <MessageSquare size={18} />
              </button>

              <div className="w-px h-5 bg-white/10 mx-1" />

              <button
                onClick={() => handleQuickAction(EventType.FLAG)}
                disabled={isLoading}
                className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-amber-500/20 text-zinc-500 hover:text-amber-500 transition-colors relative group"
                title="Flag Issue"
              >
                <Flag size={18} />
              </button>

              <button
                onClick={() => handleQuickAction(EventType.BUG)}
                disabled={isLoading}
                className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-500 transition-colors relative group"
                title="Report Bug"
              >
                <Bug size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Finish Modal */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-white">
              <AlertCircle size={24} />
              <h2 className="text-xl font-bold">Wrap Up Session</h2>
            </div>
            <p className="text-[14px] text-zinc-400 mb-6 leading-relaxed">
              You are about to stop recording. Please provide a descriptive name for this session to help with future indexing.
            </p>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">Session Name</label>
                <input
                  autoFocus
                  type="text"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-700 focus:border-white/30 focus:ring-1 focus:ring-white/30 outline-none font-medium"
                  placeholder="e.g. Checkout Flow - 500 Error"
                  value={sessionName}
                  onChange={e => setSessionName(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowFinishModal(false)}>Cancel</Button>
                <Button className="flex-1" onClick={finishSession} isLoading={isFinishing}>
                  {isFinishing ? 'Processing...' : 'Save & Close'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
