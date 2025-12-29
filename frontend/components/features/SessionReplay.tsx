import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  EventType, QAEvent, ActiveFilter, DocumentationData, Session
} from '../../types';
import { isServerLogError } from '../../src/utils/eventHelpers';
import { api } from '../../src/services/api';
import { generateQaReport } from '../../src/services/qaReport';

import { ReplayHeader } from '../replay/ReplayHeader';
import { ReplayViewer } from '../replay/ReplayViewer';
import { ReplayTimeline } from '../replay/ReplayTimeline';
import { ReplayConsole } from '../replay/ReplayConsole';
import { ReplaySidebar } from '../replay/ReplaySidebar';
import { Button } from '../ui/Button';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export const SessionReplay: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);

  // Session state
  const [session, setSession] = useState<Session | null>(null);
  const [sessionEvents, setSessionEvents] = useState<QAEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // in milliseconds
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  // UI state
  const [viewMode, setViewMode] = useState<'video' | 'screenshots' | 'analysis'>('video');
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [currentScreenshotIdx, setCurrentScreenshotIdx] = useState(0);

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [previewFilter, setPreviewFilter] = useState<Partial<ActiveFilter> | null>(null);

  // Console Inputs
  const [noteInput, setNoteInput] = useState('');

  // Documentation State
  const [isGenerating, setIsGenerating] = useState<'flow' | 'qa' | 'suggestions' | null>(null);
  const [docData, setDocData] = useState<DocumentationData>({
    title: 'Loading...',
    description: '',
    status: 'unassigned',
    links: [],
    reports: {}
  });

  // --- DATA LOADING ---
  useEffect(() => {
    if (!id) return;
    const loadSession = async () => {
      try {
        setIsLoading(true);
        const data = await api.getSession(id);
        const sortedEvents = [...data.events].sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setSession(data);
        setSessionEvents(sortedEvents);
        setDocData(prev => ({
          ...prev,
          title: data.name || `Session #${data.id}`,
          description: data.description || ''
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, [id]);

  // --- COMPUTED VALUES ---
  const hasVideo = session?.config?.recordVideo === true;

  const videoUrl = useMemo(() => {
    if (!hasVideo || !id) return null;
    const filename = session?.videoFilename || 'video.webm';
    return `${API_BASE_URL}/api/sessions/${id}/files/${filename}`;
  }, [hasVideo, id, session?.videoFilename]);

  const duration = useMemo(() => {
    if (!session) return 0;
    if (hasVideo && videoDuration !== null && !isNaN(videoDuration)) {
      return videoDuration * 1000;
    }
    if (!sessionEvents.length) return 0;
    const startTime = session.startTime;
    const maxTimestamp = Math.max(...sessionEvents.map(event => new Date(event.timestamp).getTime()));
    return Math.max(0, maxTimestamp - startTime);
  }, [session, hasVideo, videoDuration, sessionEvents]);

  const DURATION_SEC = duration / 1000;

  const progress = useMemo(() => {
    return duration > 0 ? (currentTime / duration) * 100 : 0;
  }, [currentTime, duration]);

  const screenshots = useMemo(() => sessionEvents.filter(e => e.type === EventType.SCREENSHOT), [sessionEvents]);

  // --- FILTERING LOGIC ---
  const effectiveFilters = useMemo(() => {
    const filters = [...activeFilters];
    if (previewFilter && previewFilter.property) filters.push(previewFilter as ActiveFilter);
    return filters;
  }, [activeFilters, previewFilter]);

  const filteredEvents = useMemo(() => {
    let list = sessionEvents;
    if (!showHidden) list = list.filter(e => !e.isPruned);
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(e => e.message.toLowerCase().includes(lower) || e.type.toLowerCase().includes(lower) || e.details?.toLowerCase().includes(lower));
    }
    if (effectiveFilters.length > 0) {
      list = list.filter(e => {
        const checkFilter = (filter: ActiveFilter) => {
          let targetValue = '';
          if (filter.property === 'smart_group') {
            const group = filter.value as string;
            let isMatch = false;
            if (group === 'errors') {
              const isNetError = e.type === EventType.NETWORK && /^(4|5)\d{2}/.test(e.message);
              const isConError = e.type === EventType.CONSOLE && e.message.toLowerCase().includes('error');
              const isSvrError = isServerLogError(e);
              isMatch = isNetError || isConError || isSvrError;
            } else if (group === 'messages') {
              isMatch = [EventType.FLAG, EventType.NOTE, EventType.BUG].includes(e.type);
            }
            return filter.operator === 'is' ? isMatch : !isMatch;
          }
          if (filter.property === 'type') {
            targetValue = e.type;
            if (Array.isArray(filter.value)) {
              if (filter.value.length === 0) return true;
              const isMatch = filter.value.includes(targetValue);
              return filter.operator === 'is' ? isMatch : !isMatch;
            }
          }
          if (filter.property === 'message') targetValue = e.message;
          else if (filter.property === 'timestamp') targetValue = e.timestamp;
          targetValue = (targetValue || '').toLowerCase();
          const query = (typeof filter.value === 'string' ? filter.value : '').toLowerCase();
          switch (filter.operator) {
            case 'is': return targetValue === query;
            case 'is_not': return targetValue !== query;
            case 'contains': return targetValue.includes(query);
            case 'does_not_contain': return !targetValue.includes(query);
            case 'starts_with': return targetValue.startsWith(query);
            case 'ends_with': return targetValue.endsWith(query);
            default: return true;
          }
        };
        let match = checkFilter(effectiveFilters[0]);
        for (let i = 1; i < effectiveFilters.length; i++) {
          const f = effectiveFilters[i];
          const currentMatch = checkFilter(f);
          if (f.logic === 'OR') match = match || currentMatch;
          else match = match && currentMatch;
        }
        return match;
      });
    }
    return list;
  }, [sessionEvents, searchTerm, showHidden, effectiveFilters]);

  // --- TIMELINE MARKER LOGIC ---
  const eventMarkers = useMemo(() => {
    const getPriority = (event: QAEvent) => {
      if (event.type === EventType.BUG) return { z: 50, bg: 'bg-red-500', s: 'rect' };
      if (event.type === EventType.FLAG) return { z: 45, bg: 'bg-amber-500', s: 'rect' };
      if (event.type === EventType.NOTE) return { z: 40, bg: 'bg-indigo-500', s: 'rect' };
      const isNetError = event.type === EventType.NETWORK && /^(4|5)\d{2}/.test(event.message);
      const isConError = event.type === EventType.CONSOLE && event.message.toLowerCase().includes('error');
      const isSvrError = isServerLogError(event);
      if (isNetError || isConError || isSvrError) return { z: 35, bg: 'bg-red-600 border border-black', s: 'circle-lg' };
      if (event.type === EventType.SCREENSHOT) return { z: 32, bg: 'bg-cyan-400 border border-black/20', s: 'circle-lg' };
      if (event.type === EventType.CRAWL) return { z: 29, bg: 'bg-cyan-600/70', s: 'square' };
      if (event.type === EventType.PAGE_RELOAD) return { z: 30, bg: 'bg-violet-500', s: 'circle-md' };
      if (event.type === EventType.ACTION && event.message.toLowerCase().includes('click')) return { z: 25, bg: 'bg-zinc-300', s: 'circle-sm' };
      return { z: 10, bg: 'bg-zinc-700', s: 'circle-xs' };
    };

    return filteredEvents.map(event => {
      if (!session) return null;
      const eventTime = new Date(event.timestamp).getTime();
      const offset = (eventTime - session.startTime);
      const percent = duration > 0 ? (offset / duration) * 100 : 0;
      const { z, bg, s } = getPriority(event);
      return { id: event.id, percent, bg, shape: s, zIndex: z, type: event.type, message: event.message };
    }).filter(Boolean).sort((a: any, b: any) => a.zIndex - b.zIndex);
  }, [filteredEvents, session, duration]);

  // --- PLAYBACK SYNC ---
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime(t => {
          if (t >= duration) { setIsPlaying(false); return duration; }
          return Math.min(t + 100, duration);
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  useEffect(() => {
    if (videoRef.current) {
      const videoTime = currentTime / 1000;
      if (Math.abs(videoRef.current.currentTime - videoTime) > 0.5) {
        videoRef.current.currentTime = videoTime;
      }
      if (isPlaying) videoRef.current.play().catch(() => { });
      else videoRef.current.pause();
    }
  }, [currentTime, isPlaying]);

  useEffect(() => {
    if (!session) return;
    if (isPlaying || activeEventId === null) {
      if (sessionEvents.length > 0) {
        const closest = sessionEvents.reduce((prev, curr) => {
          const currT = new Date(curr.timestamp).getTime() - session.startTime;
          const prevT = new Date(prev.timestamp).getTime() - session.startTime;
          return Math.abs(currT - currentTime) < Math.abs(prevT - currentTime) ? curr : prev;
        });
        if (closest && closest.id !== activeEventId) setActiveEventId(closest.id);
      }
    }
  }, [currentTime, sessionEvents, session, isPlaying, activeEventId]);

  // --- ACTION HANDLERS ---
  const handleAddNewEvent = async (type: EventType, message: string) => {
    if (!id || !session) return;
    try {
      const timestamp = session.startTime + currentTime;
      let newEvent: QAEvent;
      if (type === EventType.SCREENSHOT) {
        newEvent = await api.captureScreenshot(id, undefined, timestamp);
      } else if (type === EventType.NOTE || type === EventType.BUG || type === EventType.FLAG) {
        newEvent = await api.addNote(id, message, type as any, timestamp);
      } else {
        // Local fallback for other types if no dedicated API
        newEvent = { id: Math.random().toString(36).substr(2, 9), type, message, timestamp: new Date(timestamp).toISOString() };
      }

      setSessionEvents(prev => [...prev, newEvent].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
      setActiveEventId(newEvent.id);
      setNoteInput('');
    } catch (err) {
      console.error("Failed to add event:", err);
    }
  };

  const handleGenerateReport = async (type: 'flow' | 'qa' | 'suggestions') => {
    if (!id || !session) return;
    setIsGenerating(type);
    try {
      let reportContent = '';
      if (type === 'qa') {
        reportContent = await api.generateQaReport(id, {
          filteredEvents: filteredEvents,
          activeFilters: Array.from(new Set(filteredEvents.map(e => e.type))),
          screenshots: screenshots.map(s => ({ url: `${API_BASE_URL}/api/sessions/${id}/files/${JSON.parse(s.details || '{}').filename}`, timestamp: s.timestamp }))
        });
      } else {
        // Mock or use other generators if available
        await new Promise(r => setTimeout(r, 1500));
        reportContent = "Report generation for " + type + " is coming soon.";
      }
      setDocData(prev => ({
        ...prev,
        reports: { ...prev.reports, [type]: reportContent }
      }));
    } catch (err) {
      console.error("Failed to generate report:", err);
    } finally {
      setIsGenerating(null);
    }
  };

  const togglePlay = () => setIsPlaying(!isPlaying);

  const handleScrub = (percent: number) => {
    setCurrentTime((percent / 100) * duration);
  };

  const handleExportContext = async () => {
    if (!id) return;
    try {
      // Extract unique event types from filtered events to respect active filters
      const eventTypes = Array.from(new Set(filteredEvents.map(e => e.type))) as EventType[];

      // Only pass filters if they're actually filtering (not showing all events)
      const filters = eventTypes.length < sessionEvents.length ? eventTypes : undefined;

      const { blob, filename } = await api.exportSessionContext(id, filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export context:', error);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm("Are you sure you want to delete this session?")) return;
    try {
      await api.deleteSession(id);
      navigate('/');
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  if (isLoading) return <div className="h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div></div>;
  if (error) return <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center p-8"><h1 className="text-red-400 text-2xl font-bold mb-4">Error Loading Session</h1><p className="text-zinc-500 mb-8">{error}</p><Button onClick={() => navigate('/')}>Back Home</Button></div>;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <ReplayHeader
        session={session!}
        onBack={() => navigate('/')}
        onExportContext={handleExportContext}
        onDelete={handleDelete}
      />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-zinc-950">
          <ReplayViewer
            viewMode={viewMode}
            setViewMode={setViewMode}
            screenshots={screenshots}
            currentScreenshotIdx={currentScreenshotIdx}
            onPrevScreenshot={() => setCurrentScreenshotIdx(prev => (prev - 1 + screenshots.length) % screenshots.length)}
            onNextScreenshot={() => setCurrentScreenshotIdx(prev => (prev + 1) % screenshots.length)}
            onManualCapture={() => handleAddNewEvent(EventType.SCREENSHOT, "Manual Screenshot Capture")}
            isPlaying={isPlaying}
            togglePlay={togglePlay}
            sessionEvents={sessionEvents}
            docData={docData}
            setDocData={setDocData}
            isGenerating={isGenerating}
            onGenerateReport={handleGenerateReport}
            videoUrl={videoUrl}
            videoRef={videoRef}
            currentTime={currentTime}
          />
          {(viewMode === 'video' || viewMode === 'screenshots') && (
            <>
              <ReplayTimeline
                progress={progress} duration={DURATION_SEC} currentTime={currentTime / 1000} isPlaying={isPlaying} setIsPlaying={setIsPlaying}
                onScrub={handleScrub} onSkipForward={() => setCurrentTime(Math.min(duration, currentTime + 5000))} onSkipBack={() => setCurrentTime(Math.max(0, currentTime - 5000))}
                eventMarkers={eventMarkers} onMarkerClick={(id, pct) => { handleScrub(pct); setActiveEventId(id); }}
              />
              <ReplayConsole noteInput={noteInput} setNoteInput={setNoteInput} onAddEvent={handleAddNewEvent} />
            </>
          )}
        </div>
        <ReplaySidebar
          searchTerm={searchTerm} setSearchTerm={setSearchTerm} activeFilters={activeFilters} setActiveFilters={setActiveFilters}
          onPreviewFilter={setPreviewFilter} filteredEvents={filteredEvents} activeEventId={activeEventId} autoScroll={autoScroll}
          setAutoScroll={setAutoScroll} showHidden={showHidden} setShowHidden={setShowHidden} onEventsChange={setSessionEvents}
          onEventClick={(e) => {
            const offset = (new Date(e.timestamp).getTime() - session!.startTime);
            setCurrentTime(offset);
            setActiveEventId(e.id);
            if (e.type === EventType.SCREENSHOT) {
              setViewMode('screenshots');
              const idx = screenshots.findIndex(s => s.id === e.id);
              if (idx !== -1) setCurrentScreenshotIdx(idx);
            } else setViewMode('video');
          }}
        />
      </div>
    </div>
  );
};
