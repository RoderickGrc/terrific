import React, { useEffect, useRef, useState, useCallback } from 'react';
// @ts-ignore - react-window types have issues
import { VariableSizeList } from 'react-window';
// @ts-ignore - autosizer types have issues  
import AutoSizer from 'react-virtualized-auto-sizer';
import { QAEvent, EventType } from '../../types';
import { isServerLogError } from '../../src/utils/eventHelpers';
import { processEvents, ProcessedEvent } from '../../src/utils/eventProcessing';
import {
  Globe, Terminal, MousePointer2, RefreshCw,
  Camera, Flag, Bug, Navigation, Server,
  ChevronDown, Activity, ArrowDown,
  Keyboard, MousePointerClick, ScanLine, MessageSquare
} from 'lucide-react';

interface TimelineMatrixProps {
  events: QAEvent[];
  className?: string;
  onEventClick?: (event: QAEvent) => void;
  activeEventId?: string | null;
  autoScroll?: boolean;
}

// 7 Tracks Definition - Reordered SVR to first position
const TRACKS = [
  { id: 'SVR', label: 'SVR', icon: Server, color: 'text-orange-500', bg: 'bg-orange-500' },
  { id: 'NET', label: 'NET', icon: Globe, color: 'text-emerald-500', bg: 'bg-emerald-500' },
  { id: 'CON', label: 'CON', icon: Terminal, color: 'text-blue-500', bg: 'bg-blue-500' },
  { id: 'ACT', label: 'ACT', icon: MousePointer2, color: 'text-zinc-300', bg: 'bg-zinc-100' },
  { id: 'NAV', label: 'NAV', icon: Navigation, color: 'text-violet-500', bg: 'bg-violet-500' },
  { id: 'IMG', label: 'IMG', icon: Camera, color: 'text-cyan-400', bg: 'bg-cyan-400' },
  { id: 'OPS', label: 'OPS', icon: Flag, color: 'text-amber-500', bg: 'bg-amber-500' },
];

const getTrackForEvent = (type: EventType): number => {
  switch (type) {
    case EventType.SERVER_LOG: return 0;
    case EventType.NETWORK: return 1;
    case EventType.CONSOLE: return 2;
    case EventType.ACTION: return 3;
    case EventType.PAGE_RELOAD: return 4;
    case EventType.SCREENSHOT:
    case EventType.CRAWL: return 5;
    case EventType.NOTE:
    case EventType.FLAG:
    case EventType.BUG: return 6;
    default: return 3;
  }
};

export const TimelineMatrix: React.FC<TimelineMatrixProps> = ({
  events,
  className = '',
  onEventClick,
  activeEventId,
  autoScroll = true
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const [showResumeFeed, setShowResumeFeed] = useState(false);
  const resumeFeedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lastSeenEventIndex, setLastSeenEventIndex] = useState(0);

  // Pre-process events for better performance
  const processedEvents = React.useMemo(() => {
    const processed = processEvents(events);
    return processed;
  }, [events]);

  // 🔧 PERFORMANCE FIX: Limit rendered events to prevent DOM explosion
  const MAX_RENDERED_EVENTS = 500;
  const eventsToRender = processedEvents.length > MAX_RENDERED_EVENTS
    ? processedEvents.slice(-MAX_RENDERED_EVENTS)
    : processedEvents;
  const hasHiddenEvents = processedEvents.length > MAX_RENDERED_EVENTS;

  // 🔧 ROBUST FIX: Detect manual scroll UP using wheel event
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleWheelUp = (e: WheelEvent) => {
      if (e.deltaY < 0) { // Scroll hacia arriba = usuario quiere subir
        setIsUserAtBottom(false);
      }
    };

    container.addEventListener('wheel', handleWheelUp, { passive: true });
    return () => container.removeEventListener('wheel', handleWheelUp);
  }, []);

  // Use IntersectionObserver ONLY to detect arriving at bottom
  // 🔧 SIMPLIFIED: No flags, no race conditions
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isUserAtBottom) {
          // User arrived at bottom (by scroll or by clicking Resume Feed)
          setIsUserAtBottom(true);
          setLastSeenEventIndex(events.length);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [events.length, isUserAtBottom]);

  // Auto-scroll effect: Only scroll if user was already at bottom
  // 🔧 SIMPLIFIED: No flags needed, wheel event prevents false positives
  useEffect(() => {
    if (autoScroll && isUserAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll, isUserAtBottom]);

  // Delayed "Resume Live Feed" button logic
  useEffect(() => {
    if (isUserAtBottom) {
      // User is at bottom, hide button immediately
      if (resumeFeedTimeoutRef.current) {
        clearTimeout(resumeFeedTimeoutRef.current);
        resumeFeedTimeoutRef.current = null;
      }
      setShowResumeFeed(false);
    } else {
      // User scrolled up, wait 2 seconds before showing button
      // Clear existing timer and start new one
      if (resumeFeedTimeoutRef.current) {
        clearTimeout(resumeFeedTimeoutRef.current);
      }

      resumeFeedTimeoutRef.current = setTimeout(() => {
        setShowResumeFeed(true);
      }, 2000);
    }

    return () => {
      if (resumeFeedTimeoutRef.current) {
        clearTimeout(resumeFeedTimeoutRef.current);
      }
    };
  }, [isUserAtBottom, events.length, lastSeenEventIndex]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'auto'
      });

      setIsUserAtBottom(true);
      setShowResumeFeed(false);
      setLastSeenEventIndex(events.length);
    }
  }, [events.length]);





  const handleRowClick = (event: QAEvent) => {
    if (!event.details) return;
    setExpandedId(expandedId === event.id ? null : event.id);
    if (onEventClick) onEventClick(event);
  };

  const renderTrackPoint = (event: QAEvent, trackIndex: number, isErrorState: boolean, isActive: boolean) => {
    const errorColorClass = "text-red-500";
    const errorBgClass = "bg-red-500";

    const trackColorClass = TRACKS[trackIndex].color;
    const trackBgClass = TRACKS[trackIndex].bg;

    const finalIconClass = `transition-transform duration-300 ${isErrorState ? errorColorClass : trackColorClass}`;
    const finalBgClass = isErrorState ? errorBgClass : trackBgClass;

    if (event.type === EventType.BUG) return <Bug size={14} className="text-red-500" />;
    if (event.type === EventType.FLAG) return <Flag size={14} className="text-amber-500" />;
    if (event.type === EventType.NOTE) return <MessageSquare size={13} className="text-indigo-400" />;

    if (event.type === EventType.PAGE_RELOAD) return <RefreshCw size={12} className={finalIconClass} />;

    if (event.type === EventType.SCREENSHOT) return <Camera size={13} className={finalIconClass} />;
    if (event.type === EventType.CRAWL) return <ScanLine size={13} className={finalIconClass} />;

    if (event.type === EventType.ACTION) {
      const msg = event.message.toLowerCase();
      if (msg.includes('click')) return <MousePointerClick size={13} className={finalIconClass} />;
      if (msg.includes('type') || msg.includes('key')) return <Keyboard size={13} className={finalIconClass} />;
      return <div className={`w-2.5 h-2.5 rounded-full ${finalBgClass} ${isActive ? 'shadow-[0_0_12px_currentColor]' : ''}`} />;
    }

    return (
      <div className={`
            rounded-full 
            w-2.5 h-2.5
            ${finalBgClass} 
            ${isActive ? 'shadow-[0_0_12px_currentColor]' : ''}
        `} />
    );
  };

  return (
    <div className={`flex flex-col h-full bg-zinc-950 relative ${className}`}>
      {/* Matrix Header - Fixed */}
      <div className="flex items-center px-4 py-3 border-b border-zinc-900 bg-zinc-950/95 backdrop-blur z-20 sticky top-0 shadow-sm shrink-0">
        <div className="w-24 text-[10px] font-mono text-zinc-600 text-right pr-6 uppercase tracking-wider shrink-0">Timestamp</div>

        {/* Track Headers */}
        <div className="flex-none grid grid-cols-7 w-[350px] gap-0 mr-6">
          {TRACKS.map((track) => (
            <div key={track.id} className="flex flex-col items-center justify-center group cursor-help opacity-50 hover:opacity-100 transition-opacity" title={track.label}>
              <track.icon size={12} className={track.color} />
              <span className="text-[9px] font-bold text-zinc-700 mt-1">{track.label}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Event Log</div>
      </div>

      {/* Matrix Body - Scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-thin bg-zinc-950"
      >
        {/* Content Wrapper for correct sizing of absolute mesh */}
        <div className="relative min-h-full">

          {/* Vertical Mesh Lines */}
          <div className="absolute inset-0 flex pointer-events-none pl-28">
            <div className="w-[350px] grid grid-cols-7 h-full">
              {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="border-r border-zinc-900/40 h-full w-full flex justify-center">
                  <div className="w-px h-full bg-zinc-900/30" />
                </div>
              ))}
            </div>
          </div>

          <div className="relative pb-20 min-h-[400px]">
            {events.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 pointer-events-none">
                <Activity size={64} strokeWidth={1} />
                <span className="text-sm font-mono mt-4 tracking-widest uppercase">Awaiting Telemetry</span>
              </div>
            )}

            {/* 🔧 PERFORMANCE: Hidden events indicator */}
            {hasHiddenEvents && (
              <div className="sticky top-0 z-30 bg-amber-900/20 border-b border-amber-700/50 px-4 py-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-mono text-amber-400">
                  Showing last {MAX_RENDERED_EVENTS} of {processedEvents.length} events for performance
                </span>
              </div>
            )}



            {eventsToRender.map((event) => {
              const isActive = activeEventId === event.id;
              const hasDetails = !!event.details;

              // Use pre-computed properties
              const trackIndex = event._trackIndex;
              const isErrorState = event._isError;
              const timeStr = event._timeStr;
              const msStr = event._msStr;

              return (
                <div key={event.id} className="group relative z-10">
                  {/* Timeline Row */}
                  <div
                    onClick={() => handleRowClick(event)}
                    className={`
                            relative flex items-center py-3 px-4 transition-all border-b border-zinc-900/40
                            ${hasDetails ? 'cursor-pointer' : 'cursor-default'}
                            ${isActive ? 'bg-zinc-900' : (hasDetails ? 'hover:bg-zinc-900/20' : '')}
                            ${!isActive && isErrorState ? 'bg-red-500/5 hover:bg-red-500/10' : ''} 
                        `}
                  >
                    {/* Timestamp */}
                    <div className="w-24 flex flex-col items-end pr-6 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                      <span className={`font-mono text-[11px] leading-none ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`}>{timeStr}</span>
                      <span className="font-mono text-[9px] text-zinc-700 leading-none mt-0.5">.{msStr}</span>
                    </div>

                    {/* The Grid Points */}
                    <div className="flex-none w-[350px] grid grid-cols-7 relative mr-6">
                      {[0, 1, 2, 3, 4, 5, 6].map((colIndex) => {
                        if (colIndex !== trackIndex) return <div key={colIndex} />;

                        return (
                          <div key={colIndex} className="flex items-center justify-center">
                            <div className={`
                                            relative z-10 flex items-center justify-center transition-all duration-300
                                            ${isActive ? 'scale-125' : (hasDetails ? 'group-hover:scale-125' : '')}
                                        `}>
                              {renderTrackPoint(event, trackIndex, isErrorState, isActive)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Message Content */}
                    <div className="flex-1 min-w-0 flex items-center justify-between relative">
                      <div className="flex flex-col">
                        <span className={`font-mono text-xs truncate transition-colors 
                                    ${isActive ? 'text-zinc-100 font-medium' : ''}
                                    ${!isActive && isErrorState ? 'text-red-400' : ''}
                                    ${!isActive && !isErrorState ? 'text-zinc-400 group-hover:text-zinc-300' : ''}
                                `}>
                          {event.message}
                        </span>
                      </div>

                      {hasDetails && (
                        <div className={`text-zinc-600 transition-transform duration-200 ${expandedId === event.id ? 'rotate-180' : ''}`}>
                          <ChevronDown size={14} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail View */}
                  {hasDetails && expandedId === event.id && (
                    <div className="bg-black/20 border-b border-zinc-900/50 py-4 px-4 pl-36 animate-in slide-in-from-top-2 duration-200">
                      <div className={`bg-zinc-950 rounded border p-3 shadow-inner ${isErrorState ? 'border-red-900/40' : 'border-zinc-800'}`}>
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-900">
                          <div className={`w-2 h-2 rounded-full ${isErrorState ? 'bg-red-500' : TRACKS[trackIndex].bg}`} />
                          <span className="text-[10px] font-mono text-zinc-500 uppercase">{event.type} Details</span>
                        </div>

                        <pre className={`text-[11px] font-mono whitespace-pre-wrap leading-relaxed ${isErrorState ? 'text-red-300' : 'text-zinc-300'}`}>
                          {event.details}
                        </pre>

                        {event.type === EventType.SCREENSHOT && (
                          <div className="mt-4 rounded border border-zinc-800 overflow-hidden">
                            <img src="https://picsum.photos/600/340" alt="Capture" className="w-full opacity-90 hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Sentinel for IntersectionObserver */}
          <div ref={bottomSentinelRef} className="h-1" />
        </div>
      </div>

      {/* Resume Auto-Scroll Button */}
      {showResumeFeed && events.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-2">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-full shadow-lg shadow-indigo-500/30 transition-all active:scale-95"
          >
            <ArrowDown size={14} className="animate-bounce" />
            Resume Live Feed
            {events.length > lastSeenEventIndex && (
              <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                +{events.length - lastSeenEventIndex} new
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};