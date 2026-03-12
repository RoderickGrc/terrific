
import React, { useState, useEffect, useRef } from 'react';
import {
  Search, XCircle, ListFilter, Plus, X, ChevronDown, Check, ArrowDownCircle, Sparkles,
  Server, Globe, Terminal, MousePointerClick, RefreshCw, Camera, ScanLine, Bug, Flag, MessageSquare,
  Eye, EyeOff
} from 'lucide-react';
import { Button } from '../ui/Button';
import { ActivityFeed } from '../features/ActivityFeed';
import { QAEvent, ActiveFilter, FilterProperty, FilterOperator, EventType, LogicOperator } from '../../types';

// Filter Constants
const FILTER_PROPERTIES: { id: FilterProperty; label: string }[] = [
  { id: 'type', label: 'Type' },
  { id: 'smart_group', label: 'Smart Group' },
  { id: 'message', label: 'Message' },
  { id: 'timestamp', label: 'Time' },
];

const FILTER_OPERATORS: { id: FilterOperator; label: string }[] = [
  { id: 'is', label: 'Is' },
  { id: 'is_not', label: 'Is not' },
  { id: 'contains', label: 'Contains' },
  { id: 'does_not_contain', label: 'Does not contain' },
  { id: 'starts_with', label: 'Starts with' },
  { id: 'ends_with', label: 'Ends with' },
];

const TYPE_OPERATORS: { id: FilterOperator; label: string }[] = [
  { id: 'is', label: 'Is one of' },
  { id: 'is_not', label: 'Is not one of' },
];

const GROUP_OPERATORS: { id: FilterOperator; label: string }[] = [
  { id: 'is', label: 'Is' },
  { id: 'is_not', label: 'Is not' },
];

const SMART_GROUP_OPTIONS = [
  { id: 'errors', label: 'All Errors (Net, Console, Server)' },
  { id: 'messages', label: 'User Annotations (Flag, Note, Bug)' }
];

const EVENT_TYPE_OPTIONS = Object.values(EventType);

const getTypeIcon = (type: string) => {
  switch (type) {
    case EventType.SERVER_LOG: return <Server size={12} className="text-orange-400" />;
    case EventType.NETWORK: return <Globe size={12} className="text-emerald-400" />;
    case EventType.CONSOLE: return <Terminal size={12} className="text-blue-400" />;
    case EventType.ACTION: return <MousePointerClick size={12} className="text-zinc-400" />;
    case EventType.PAGE_RELOAD: return <RefreshCw size={12} className="text-violet-400" />;
    case EventType.SCREENSHOT: return <Camera size={12} className="text-cyan-400" />;
    case EventType.SNAPSHOT: return <ScanLine size={12} className="text-cyan-400" />;
    case EventType.BUG: return <Bug size={12} className="text-red-500" />;
    case EventType.FLAG: return <Flag size={12} className="text-amber-500" />;
    case EventType.NOTE: return <MessageSquare size={12} className="text-indigo-400" />;
    default: return <div className="w-3 h-3 rounded-full bg-zinc-600" />;
  }
};

interface ReplaySidebarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  activeFilters: ActiveFilter[];
  setActiveFilters: (filters: ActiveFilter[]) => void;
  onPreviewFilter: (filter: Partial<ActiveFilter> | null) => void;
  filteredEvents: QAEvent[];
  activeEventId: string | null;
  autoScroll: boolean;
  setAutoScroll: (scroll: boolean) => void;
  // Passed Props for Filter Toggle
  showHidden: boolean;
  setShowHidden: (show: boolean) => void;
  onEventsChange: (events: QAEvent[]) => void;
  onEventClick: (event: QAEvent) => void;
  sessionId?: string;
  workspaceHash?: string | null;
}

export const ReplaySidebar: React.FC<ReplaySidebarProps> = ({
  searchTerm,
  setSearchTerm,
  activeFilters,
  setActiveFilters,
  onPreviewFilter,
  filteredEvents,
  activeEventId,
  autoScroll,
  setAutoScroll,
  showHidden,
  setShowHidden,
  onEventsChange,
  onEventClick,
  sessionId,
  workspaceHash
}) => {
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [newFilterProp, setNewFilterProp] = useState<FilterProperty>('type');
  const [newFilterOp, setNewFilterOp] = useState<FilterOperator>('is');
  const [newFilterVal, setNewFilterVal] = useState<string | string[]>('');
  const [newFilterLogic, setNewFilterLogic] = useState<LogicOperator>('AND');
  const filterButtonRef = useRef<HTMLDivElement>(null);

  // Initialize defaults
  useEffect(() => {
    if (newFilterProp === 'type' && !Array.isArray(newFilterVal)) {
      setNewFilterVal([]);
    } else if (newFilterProp === 'smart_group' && !SMART_GROUP_OPTIONS.find(o => o.id === newFilterVal)) {
      setNewFilterVal(SMART_GROUP_OPTIONS[0].id);
    } else if (!['type', 'smart_group'].includes(newFilterProp) && Array.isArray(newFilterVal)) {
      setNewFilterVal('');
    }

    if (newFilterProp === 'type') {
      if (!['is', 'is_not'].includes(newFilterOp)) setNewFilterOp('is');
    } else if (newFilterProp === 'smart_group') {
      setNewFilterOp('is');
    }
  }, [newFilterProp]);

  // Preview Logic Hook
  useEffect(() => {
    if (!isFilterMenuOpen) {
      onPreviewFilter(null);
      return;
    }

    let hasValue = false;
    if (newFilterProp === 'type' && Array.isArray(newFilterVal) && newFilterVal.length > 0) hasValue = true;
    else if (newFilterProp === 'smart_group') hasValue = true;
    else if (typeof newFilterVal === 'string' && newFilterVal.trim().length > 0) hasValue = true;

    if (hasValue) {
      onPreviewFilter({
        id: 'preview-temp-filter',
        property: newFilterProp,
        operator: newFilterOp,
        value: newFilterVal,
        logic: activeFilters.length > 0 ? newFilterLogic : undefined
      });
    } else {
      onPreviewFilter(null);
    }
  }, [isFilterMenuOpen, newFilterProp, newFilterOp, newFilterVal, newFilterLogic, activeFilters]);

  // Click Outside Handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterButtonRef.current && !filterButtonRef.current.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    };

    if (isFilterMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterMenuOpen]);

  const handleAddFilter = () => {
    if (newFilterProp === 'type') {
      if (!Array.isArray(newFilterVal) || newFilterVal.length === 0) return;
    } else {
      if (!newFilterVal) return;
    }

    const newFilter: ActiveFilter = {
      id: Math.random().toString(36).substr(2, 9),
      property: newFilterProp,
      operator: newFilterOp,
      value: newFilterVal,
      logic: activeFilters.length > 0 ? newFilterLogic : undefined
    };

    setActiveFilters([...activeFilters, newFilter]);
    setIsFilterMenuOpen(false);
    setNewFilterVal(newFilterProp === 'type' ? [] : (newFilterProp === 'smart_group' ? SMART_GROUP_OPTIONS[0].id : ''));
    setNewFilterOp('is');
  };

  const removeFilter = (id: string) => {
    const updated = activeFilters.filter(f => f.id !== id);
    // If we removed the first filter, the new first filter shouldn't have logic
    if (updated.length > 0 && updated[0].logic) {
      updated[0] = { ...updated[0], logic: undefined };
    }
    setActiveFilters(updated);
  };

  const toggleTypeSelection = (type: string) => {
    if (!Array.isArray(newFilterVal)) return;

    const current = [...newFilterVal];
    const idx = current.indexOf(type);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(type);
    }
    setNewFilterVal(current);
  };

  return (
    <div className="w-[480px] flex flex-col border-l border-white/5 bg-zinc-900/50 backdrop-blur-xl shrink-0 min-h-0 relative">
      <div className="p-3 pb-0 shrink-0 space-y-3 z-50">
        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Quick Search..."
              className="w-full bg-zinc-950/50 border border-transparent focus:border-white/10 focus:bg-zinc-950 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white">
                <XCircle size={12} fill="currentColor" className="opacity-50" />
              </button>
            )}
          </div>

          {/* Advanced Filter Button */}
          <div className="relative" ref={filterButtonRef}>
            <button
              onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${isFilterMenuOpen || activeFilters.length > 0
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                }`}
            >
              <ListFilter size={14} />
              Filter
              {activeFilters.length > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold">
                  {activeFilters.length}
                </span>
              )}
            </button>

            {/* Notion-like Filter Popover */}
            {isFilterMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-[320px] bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Add Filter</h4>
                  <button onClick={() => setIsFilterMenuOpen(false)} className="text-zinc-500 hover:text-white">
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Logic Selector (Only if filters already exist) */}
                  {activeFilters.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 font-medium">Connector</label>
                      <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-700">
                        <button
                          onClick={() => setNewFilterLogic('AND')}
                          className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${newFilterLogic === 'AND' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          AND
                        </button>
                        <button
                          onClick={() => setNewFilterLogic('OR')}
                          className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${newFilterLogic === 'OR' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          OR
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 font-medium">Property</label>
                    <div className="relative">
                      <select
                        className="w-full appearance-none bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                        value={newFilterProp}
                        onChange={e => setNewFilterProp(e.target.value as FilterProperty)}
                      >
                        {FILTER_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 font-medium">Condition</label>
                    <div className="relative">
                      <select
                        className="w-full appearance-none bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                        value={newFilterOp}
                        onChange={e => setNewFilterOp(e.target.value as FilterOperator)}
                      >
                        {(newFilterProp === 'type' ? TYPE_OPERATORS : (newFilterProp === 'smart_group' ? GROUP_OPERATORS : FILTER_OPERATORS)).map(op => (
                          <option key={op.id} value={op.id}>{op.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 font-medium">Value</label>

                    {newFilterProp === 'type' ? (
                      <div className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-1 max-h-48 overflow-y-auto custom-scrollbar">
                        {EVENT_TYPE_OPTIONS.map(t => {
                          const isSelected = Array.isArray(newFilterVal) && newFilterVal.includes(t);
                          return (
                            <div
                              key={t}
                              onClick={() => toggleTypeSelection(t)}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/5'}`}
                            >
                              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-600 bg-transparent'}`}>
                                {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                              </div>
                              <div className="flex items-center gap-2 min-w-0">
                                {getTypeIcon(t)}
                                <span className={`text-xs ${isSelected ? 'text-white font-medium' : 'text-zinc-400'}`}>{t}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : newFilterProp === 'smart_group' ? (
                      <div className="relative">
                        <select
                          className="w-full appearance-none bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                          value={newFilterVal as string}
                          onChange={e => setNewFilterVal(e.target.value)}
                        >
                          {SMART_GROUP_OPTIONS.map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-700"
                        placeholder="Type value..."
                        value={newFilterVal as string}
                        onChange={e => setNewFilterVal(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddFilter()}
                        autoFocus
                      />
                    )}
                  </div>

                  <Button
                    size="sm"
                    className="w-full mt-2"
                    onClick={handleAddFilter}
                    disabled={newFilterProp === 'type' ? (newFilterVal as string[]).length === 0 : !newFilterVal}
                  >
                    <Plus size={14} className="mr-1" /> Add Filter Rule
                  </Button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`p-1.5 rounded-lg transition-all ${showHidden ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            title={showHidden ? "Showing pruned events" : "Hiding pruned events"}
          >
            {showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg transition-all ${autoScroll ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            title="Auto-scroll to playback needle"
          >
            <ArrowDownCircle size={16} />
          </button>
        </div>

        {/* Active Filters List (Notion Style Pills) */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            {activeFilters.map((filter, index) => (
              <React.Fragment key={filter.id}>
                {filter.logic && (
                  <div className="flex items-center px-1">
                    <span className="text-[10px] font-bold text-zinc-600 bg-zinc-800/50 px-1 rounded">{filter.logic}</span>
                  </div>
                )}
                <div className="inline-flex items-center bg-indigo-500/10 border border-indigo-500/20 rounded-md px-2 py-1 max-w-full group/pill">
                  <span className="text-[10px] text-zinc-400 mr-1.5 capitalize shrink-0">{filter.property.replace('smart_group', 'Group')}</span>
                  <span className="text-[10px] text-indigo-300 font-mono mr-1 shrink-0">{filter.operator.replace(/_/g, ' ')}</span>

                  {filter.property === 'smart_group' ? (
                    <span className="flex items-center gap-1 text-[10px] text-white font-medium">
                      <Sparkles size={10} className="text-amber-400" />
                      {SMART_GROUP_OPTIONS.find(o => o.id === filter.value)?.label.split(' ')[0] || filter.value}
                    </span>
                  ) : Array.isArray(filter.value) ? (
                    <div className="flex items-center gap-1 overflow-hidden flex-wrap">
                      <span className="text-[10px] text-white font-medium">[</span>
                      {filter.value.map((v, i) => (
                        <span key={i} className="flex items-center gap-1 bg-black/20 px-1 rounded text-[9px] text-white whitespace-nowrap">
                          {getTypeIcon(v)} {v}
                        </span>
                      ))}
                      <span className="text-[10px] text-white font-medium">]</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-white font-medium max-w-[100px] truncate">"{filter.value}"</span>
                  )}

                  <button onClick={() => removeFilter(filter.id)} className="ml-2 text-indigo-400 hover:text-white shrink-0">
                    <X size={10} />
                  </button>
                </div>
              </React.Fragment>
            ))}
            <button
              onClick={() => setActiveFilters([])}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2 px-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="h-px bg-white/5 w-full shrink-0" />

      <ActivityFeed
        events={filteredEvents}
        className="flex-1 bg-transparent border-none min-h-0"
        activeEventId={activeEventId}
        autoScroll={autoScroll}
        onEventsChange={onEventsChange}
        onEventClick={onEventClick}
        sessionId={sessionId}
        workspaceHash={workspaceHash}
      />
    </div>
  );
};
