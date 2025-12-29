import React, { useEffect, useRef, useState, useMemo } from 'react';
import { QAEvent, EventType } from '../../types';
import { isServerLogError } from '../../src/utils/eventHelpers';
import {
    Server, Globe, Terminal, MousePointer2, Camera, Flag,
    ChevronRight, ChevronDown, Bug, MessageSquare, RefreshCw,
    MousePointerClick, Keyboard, ScanLine, Activity,
    Copy, EyeOff, Eye, Trash2, CheckSquare, Pencil, X, Check
} from 'lucide-react';

interface ActivityFeedProps {
    events: QAEvent[];
    className?: string;
    autoScroll?: boolean;
    onEventClick?: (event: QAEvent) => void;
    activeEventId?: string | null;
    onEventsChange?: (updatedEvents: QAEvent[]) => void;
}

const getEventIcon = (event: QAEvent) => {
    switch (event.type) {
        case EventType.SERVER_LOG:
            const isSvrError = isServerLogError(event);
            return <Server size={14} className={isSvrError ? "text-red-400" : "text-orange-400"} />;
        case EventType.NETWORK:
            const isNetError = /^(4|5)\d{2}/.test(event.message);
            return <Globe size={14} className={isNetError ? "text-red-400" : "text-emerald-400"} />;
        case EventType.CONSOLE:
            const isConError = event.message.toLowerCase().includes('error');
            return <Terminal size={14} className={isConError ? "text-red-400" : "text-blue-400"} />;
        case EventType.ACTION:
            if (event.message.toLowerCase().includes('type')) return <Keyboard size={14} className="text-zinc-400" />;
            return <MousePointerClick size={14} className="text-zinc-400" />;
        case EventType.PAGE_RELOAD: return <RefreshCw size={14} className="text-violet-400" />;
        case EventType.SCREENSHOT: return <Camera size={14} className="text-cyan-400" />;
        case EventType.CRAWL: return <ScanLine size={14} className="text-cyan-400" />;
        case EventType.BUG: return <Bug size={14} className="text-red-500" />;
        case EventType.FLAG: return <Flag size={14} className="text-amber-500" />;
        case EventType.NOTE: return <MessageSquare size={14} className="text-indigo-400" />;
        default: return <Activity size={14} className="text-zinc-500" />;
    }
};

const EDITABLE_TYPES = [EventType.BUG, EventType.FLAG, EventType.NOTE];

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
    events,
    className = '',
    autoScroll = true,
    activeEventId,
    onEventClick,
    onEventsChange
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastClickedId, setLastClickedId] = useState<string | null>(null);

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const isLastSelectedHidden = useMemo(() => {
        if (!lastClickedId) return false;
        const ev = events.find(e => e.id === lastClickedId);
        return !!ev?.isPruned;
    }, [lastClickedId, events]);

    useEffect(() => {
        if (autoScroll && scrollRef.current && activeEventId) {
            const container = scrollRef.current;
            const el = document.getElementById(`evt-${activeEventId}`);

            if (el && container) {
                const elTop = el.offsetTop;
                const elBottom = elTop + el.offsetHeight;
                const containerTop = container.scrollTop;
                const containerBottom = containerTop + container.offsetHeight;

                if (elTop < containerTop) {
                    container.scrollTo({ top: elTop, behavior: 'smooth' });
                } else if (elBottom > containerBottom) {
                    container.scrollTo({ top: elBottom - container.offsetHeight, behavior: 'smooth' });
                }
            } else if (events.length > 0 && events[events.length - 1]?.id === activeEventId) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            }
        }
    }, [activeEventId, autoScroll, events, expandedId]);

    const handleSelection = (e: React.MouseEvent, event: QAEvent) => {
        e.stopPropagation();
        const isShift = e.shiftKey;
        const isCtrl = e.ctrlKey || e.metaKey;

        let newSelected = new Set(selectedIds);

        if (isShift && lastClickedId) {
            const currentIndex = events.findIndex(ev => ev.id === event.id);
            const lastIndex = events.findIndex(ev => ev.id === lastClickedId);
            const start = Math.min(currentIndex, lastIndex);
            const end = Math.max(currentIndex, lastIndex);

            const rangeIds = events.slice(start, end + 1).map(ev => ev.id);
            rangeIds.forEach(id => newSelected.add(id));
        } else if (isCtrl) {
            if (newSelected.has(event.id)) {
                newSelected.delete(event.id);
            } else {
                newSelected.add(event.id);
            }
        } else {
            newSelected = new Set([event.id]);
        }

        setSelectedIds(newSelected);
        setLastClickedId(event.id);
        if (onEventClick) onEventClick(event);
    };

    const handleExpansion = (e: React.MouseEvent, event: QAEvent) => {
        e.stopPropagation();
        if (!event.details) return;
        setExpandedId(expandedId === event.id ? null : event.id);
    };

    const handleStartEdit = (e: React.MouseEvent, event: QAEvent) => {
        e.stopPropagation();
        setEditingId(event.id);
        setEditValue(event.message);
    };

    const handleSaveEdit = (id: string) => {
        if (!onEventsChange) return;
        const updated = events.map(e => e.id === id ? { ...e, message: editValue } : e);
        onEventsChange(updated);
        setEditingId(null);
    };

    const handleBulkCopy = () => {
        const text = events
            .filter(e => selectedIds.has(e.id))
            .map(e => `[${e.timestamp}] ${e.type}: ${e.message}`)
            .join('\n');
        navigator.clipboard.writeText(text);
    };

    const handleBulkPruning = () => {
        if (!onEventsChange) return;
        const targetHideState = !isLastSelectedHidden;
        const updated = events.map(e =>
            selectedIds.has(e.id) ? { ...e, isPruned: targetHideState } : e
        );
        onEventsChange(updated);
        setSelectedIds(new Set());
    };

    const handleBulkDelete = () => {
        if (!onEventsChange) return;
        const updated = events.filter(e => !selectedIds.has(e.id));
        onEventsChange(updated);
        setSelectedIds(new Set());
    };

    const selectAll = () => {
        setSelectedIds(new Set(events.map(e => e.id)));
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    return (
        <div className={`flex flex-col min-h-0 bg-transparent ${className}`}>

            {selectedIds.size > 0 ? (
                <div className="flex items-center justify-between h-10 border-b border-indigo-500/30 bg-indigo-500/10 shrink-0 z-30 px-4 animate-in slide-in-from-top-1">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{selectedIds.size} Selected</span>
                        <button onClick={clearSelection} className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2">Clear</button>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleBulkCopy}
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            title="Copy selected"
                        >
                            <Copy size={14} />
                        </button>
                        <button
                            onClick={handleBulkPruning}
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            title={isLastSelectedHidden ? "Show selected" : "Hide selected"}
                        >
                            {isLastSelectedHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            className="p-1.5 rounded hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors"
                            title="Delete selected"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex items-center h-10 border-b border-white/5 bg-zinc-900/30 shrink-0 z-20 backdrop-blur-sm px-4">
                    <div className="w-[70px] shrink-0 text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Time</div>
                    <div className="w-[40px] shrink-0 text-center text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Evt</div>
                    <div className="flex-1 text-zinc-500 text-[10px] font-bold uppercase tracking-wider pl-4">Detail</div>
                    <button onClick={selectAll} title="Select All" className="text-zinc-600 hover:text-zinc-400 transition-colors ml-2">
                        <CheckSquare size={12} />
                    </button>
                </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth relative min-h-0">
                <div className="relative min-h-full pb-20">
                    {events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-700 space-y-2">
                            <Activity size={24} className="opacity-20" />
                            <span className="text-xs font-mono">No events filtered</span>
                        </div>
                    ) : (
                        events.map((event) => {
                            const isActive = activeEventId === event.id;
                            const isSelected = selectedIds.has(event.id);
                            const isExpanded = expandedId === event.id;
                            const isEditing = editingId === event.id;
                            const date = new Date(event.timestamp);
                            const timeStr = `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().substring(0, 2)}`;

                            const isError =
                                (event.type === EventType.NETWORK && /^(4|5)\d{2}/.test(event.message)) ||
                                (event.type === EventType.CONSOLE && event.message.toLowerCase().includes('error')) ||
                                (isServerLogError(event)) ||
                                (event.type === EventType.BUG);

                            const hasDetails = !!event.details;
                            const isEditable = EDITABLE_TYPES.includes(event.type);

                            return (
                                <div key={event.id} id={`evt-${event.id}`} className="group border-b border-white/5 relative">
                                    <div className={`flex items-stretch min-h-[40px] transition-colors ${isActive ? 'bg-zinc-800' : ''} ${isSelected ? 'bg-indigo-600/5' : ''}`}>

                                        {/* Selection Zone: Time & Evt */}
                                        <div
                                            onClick={(e) => handleSelection(e, event)}
                                            className={`flex items-start px-4 py-3 cursor-pointer select-none shrink-0 transition-colors ${isSelected ? 'bg-white/5' : 'hover:bg-zinc-800/30'}`}
                                        >
                                            {/* Selection Indicator */}
                                            {isSelected && (
                                                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-500/60" />
                                            )}

                                            {/* Timestamp */}
                                            <div className={`w-[70px] shrink-0 font-mono text-[11px] mt-0.5 transition-colors ${isSelected ? 'text-indigo-400' : 'text-zinc-500'}`}>
                                                {timeStr}
                                            </div>

                                            {/* Event Icon */}
                                            <div className="w-[40px] shrink-0 flex justify-center">
                                                <div className={`
                                            w-6 h-6 rounded-md flex items-center justify-center transition-all
                                            ${isActive ? 'bg-zinc-700 border border-zinc-600' : 'bg-zinc-900 border border-zinc-800'}
                                            ${isSelected ? 'border-indigo-500/40 ring-1 ring-indigo-500/20' : 'group-hover:border-zinc-700'}
                                        `}>
                                                    {getEventIcon(event)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expansion/Edit Zone: Detail */}
                                        <div
                                            onClick={(e) => isEditing ? e.stopPropagation() : handleExpansion(e, event)}
                                            className={`flex-1 flex items-start gap-2 pl-4 pr-4 py-3 select-none transition-colors ${hasDetails && !isEditing ? 'cursor-pointer hover:bg-zinc-800/30' : (isEditing ? 'cursor-default' : 'cursor-default')} ${event.isPruned ? 'opacity-40 grayscale-[0.5]' : ''}`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                {isEditing ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            autoFocus
                                                            className="flex-1 bg-zinc-950 border border-indigo-500 rounded px-2 py-1 text-[12px] text-zinc-100 outline-none"
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleSaveEdit(event.id);
                                                                if (e.key === 'Escape') setEditingId(null);
                                                            }}
                                                        />
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleSaveEdit(event.id); }}
                                                            className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                                                            className="p-1 text-zinc-500 hover:bg-zinc-800 rounded"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className={`text-[12px] font-medium break-all whitespace-pre-wrap leading-snug block ${isActive ? 'text-zinc-100' : (isError ? 'text-red-400' : 'text-zinc-400 group-hover:text-zinc-300')}`}>
                                                        {event.message}
                                                        {event.isPruned && <span className="ml-2 text-[10px] text-zinc-600 font-mono italic font-normal">(Hidden)</span>}
                                                    </span>
                                                )}
                                            </div>

                                            {!isEditing && (
                                                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                                    {isEditable && (
                                                        <button
                                                            onClick={(e) => handleStartEdit(e, event)}
                                                            className="p-1 text-zinc-600 hover:text-indigo-400 hover:bg-zinc-800 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                            title="Edit message"
                                                        >
                                                            <Pencil size={12} />
                                                        </button>
                                                    )}
                                                    {hasDetails && (
                                                        <div className={`transition-colors ${isExpanded ? 'text-indigo-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded Details Content */}
                                    {hasDetails && isExpanded && !isEditing && (
                                        <div className="bg-zinc-900/50 p-3 animate-in slide-in-from-top-1 duration-200 shadow-inner">
                                            <div className="bg-zinc-950 p-3 rounded-lg border border-white/5 overflow-x-auto custom-scrollbar relative">
                                                <pre className="text-[10px] font-mono text-zinc-400 whitespace-pre-wrap break-all">
                                                    {event.details}
                                                </pre>
                                                {event.type === EventType.SCREENSHOT && (
                                                    <div className="mt-2 border border-zinc-800 rounded overflow-hidden">
                                                        <img src="https://picsum.photos/300/180" alt="Preview" className="w-full opacity-80" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};