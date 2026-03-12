import React, { useRef, useState } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Maximize,
  Server, Globe, Terminal, MousePointerClick, Keyboard, RefreshCw, 
  Camera, ScanLine, Bug, Flag, MessageSquare, Activity
} from 'lucide-react';
import { QAEvent } from '../../types';

interface ReplayTimelineProps {
  progress: number;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  onScrub: (percentage: number) => void;
  onSkipForward: () => void;
  onSkipBack: () => void;
  eventMarkers: {
    id: string;
    percent: number;
    bg: string;
    shape: string;
    zIndex: number;
    type: string;
    message: string;
  }[];
  onMarkerClick: (id: string, percent: number) => void;
}

const getMarkerIcon = (type: string, message: string) => {
  const size = 13;
  switch (type) {
    case 'SERVER_LOG': return <Server size={size} className="text-orange-400" />;
    case 'NETWORK': 
        const isNetError = /^(4|5)\d{2}/.test(message);
        return <Globe size={size} className={isNetError ? "text-red-400" : "text-emerald-400"} />;
    case 'CONSOLE': 
        const isConError = message.toLowerCase().includes('error');
        return <Terminal size={size} className={isConError ? "text-red-400" : "text-blue-400"} />;
    case 'ACTION':
        if (message.toLowerCase().includes('type')) return <Keyboard size={size} className="text-zinc-400" />;
        return <MousePointerClick size={size} className="text-zinc-400" />;
    case 'PAGE_RELOAD': return <RefreshCw size={size} className="text-violet-400" />;
    case 'SCREENSHOT': return <Camera size={size} className="text-cyan-400" />;
    case 'SNAPSHOT': return <ScanLine size={size} className="text-cyan-400" />;
    case 'BUG': return <Bug size={size} className="text-red-500" />;
    case 'FLAG': return <Flag size={size} className="text-amber-500" />;
    case 'NOTE': return <MessageSquare size={size} className="text-indigo-400" />;
    default: return <Activity size={size} className="text-zinc-500" />;
  }
};

export const ReplayTimeline: React.FC<ReplayTimelineProps> = ({
  progress,
  duration,
  currentTime,
  isPlaying,
  setIsPlaying,
  onScrub,
  onSkipForward,
  onSkipBack,
  eventMarkers,
  onMarkerClick
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);

  const handleMouseEvent = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const newProgress = (x / rect.width) * 100;
    onScrub(newProgress);
  };

  return (
    <div className="px-8 mt-8 space-y-3 shrink-0 select-none">
      <div 
        ref={timelineRef}
        className="relative h-12 group cursor-crosshair flex items-center" 
        onMouseDown={handleMouseEvent}
        onMouseMove={(e) => e.buttons === 1 && handleMouseEvent(e)}
      >
        {/* Track Background */}
        <div className="absolute inset-x-0 h-1 bg-zinc-800/80 rounded-full" />
        
        {/* Progress Fill */}
        <div 
          className="absolute left-0 h-1 bg-white rounded-full pointer-events-none transition-all duration-100 opacity-50" 
          style={{ width: `${progress}%` }} 
        />

        {/* Event Markers (Filtered) */}
        {eventMarkers.map((marker) => {
          let shapeClass = '';
          if (marker.shape === 'rect') {
            shapeClass = 'w-[5px] h-3.5 rounded-[2px] -mt-[0.5px]';
          } else if (marker.shape === 'square') {
            shapeClass = 'w-1.5 h-1.5 rounded-[1px]';
          } else if (marker.shape === 'circle-lg') {
            shapeClass = 'w-2.5 h-2.5 rounded-full';
          } else if (marker.shape === 'circle-md') {
            shapeClass = 'w-1.5 h-1.5 rounded-full';
          } else if (marker.shape === 'circle-sm') {
            shapeClass = 'w-1 h-1 rounded-full opacity-80';
          } else {
            shapeClass = 'w-0.5 h-0.5 rounded-full opacity-40';
          } 

          const isHovered = hoveredMarkerId === marker.id;
          const isLeftEdge = marker.percent < 10;
          const isRightEdge = marker.percent > 90;

          return (
            <div 
              key={marker.id}
              className={`absolute top-1/2 -translate-y-1/2 transition-all duration-200 hover:scale-150 hover:brightness-125 cursor-pointer shadow-sm ${marker.bg} ${shapeClass}`}
              style={{ left: `${marker.percent}%`, zIndex: isHovered ? 100 : marker.zIndex }}
              onMouseEnter={() => setHoveredMarkerId(marker.id)}
              onMouseLeave={() => setHoveredMarkerId(null)}
              onClick={(e) => {
                e.stopPropagation();
                onMarkerClick(marker.id, marker.percent);
              }}
            >
              {isHovered && (
                <div 
                    className={`
                        absolute bottom-full mb-2.5
                        bg-zinc-950 border border-zinc-800 
                        pl-2.5 pr-4 py-2 rounded-lg shadow-xl shadow-black/80
                        flex items-center gap-3
                        z-50 pointer-events-none select-none
                        min-w-max max-w-[240px]
                        animate-in fade-in slide-in-from-bottom-1 zoom-in-95 duration-200 ease-out
                        ${isLeftEdge ? 'left-0 origin-bottom-left' : isRightEdge ? 'right-0 origin-bottom-right' : 'left-1/2 -translate-x-1/2 origin-bottom'}
                    `}
                >
                    <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md bg-zinc-900 border border-zinc-800/50">
                        {getMarkerIcon(marker.type, marker.message)}
                    </div>

                    <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium text-zinc-200 leading-none truncate max-w-[180px]">
                            {marker.message}
                        </span>
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-1.5">
                            {marker.type}
                        </span>
                    </div>
                </div>
              )}
            </div>
          );
        })}

        {/* The Needle (Aguja) */}
        <div 
          className="absolute top-0 bottom-0 w-[1px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-50 pointer-events-none transition-all duration-100"
          style={{ left: `${progress}%` }}
        >
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-lg" />
        </div>
      </div>

      <div className="flex items-center justify-between text-zinc-400">
        <div className="flex items-center gap-5">
          <button onClick={() => setIsPlaying(!isPlaying)} className="hover:text-white transition-colors">
            {isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
          </button>
          <span className="font-mono text-xs text-zinc-300">
            {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} / {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
          </span>
          <div className="h-4 w-px bg-zinc-800 mx-1" />
          <button className="hover:text-white transition-colors" onClick={onSkipBack}><SkipBack size={18} /></button>
          <button className="hover:text-white transition-colors" onClick={onSkipForward}><SkipForward size={18} /></button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium bg-zinc-800 px-2 py-1 rounded">1.0x</span>
          <button className="hover:text-white transition-colors"><Maximize size={18} /></button>
        </div>
      </div>
    </div>
  );
};