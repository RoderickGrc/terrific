
import React, { useState } from 'react';
import {
    Film, Image as ImageIcon, Play, Camera, ChevronLeft, ChevronRight, ChevronDown,
    Activity, XCircle, FileText, Github, LayoutList, Plus, Trash2, Pencil, AlertCircle, AlertTriangle, CheckCircle2,
    Wand2, Link as LinkIcon
} from 'lucide-react';
import { QAEvent, EventType, DocumentationData, DocStatus } from '../../types';
import { Button } from '../ui/Button';

interface ReplayViewerProps {
    viewMode: 'video' | 'screenshots' | 'analysis';
    setViewMode: (mode: 'video' | 'screenshots' | 'analysis') => void;
    screenshots: QAEvent[];
    currentScreenshotIdx: number;
    onPrevScreenshot: () => void;
    onNextScreenshot: () => void;
    onManualCapture: () => void;
    isPlaying: boolean;
    togglePlay: () => void;
    sessionEvents: QAEvent[];

    // Documentation Props
    docData: DocumentationData;
    setDocData: React.Dispatch<React.SetStateAction<DocumentationData>>;
    isGenerating: 'flow' | 'qa' | 'suggestions' | null;
    onGenerateReport: (type: 'flow' | 'qa' | 'suggestions') => void;

    // Video Integration Props
    videoUrl?: string | null;
    videoRef?: React.RefObject<HTMLVideoElement>;
    currentTime: number;
}

const STATUS_CONFIG: Record<DocStatus, { label: string, color: string, icon: any }> = {
    blocked: { label: 'Blocked', color: 'text-red-400 bg-red-400/10 border-red-500/20', icon: AlertCircle },
    failed: { label: 'Failed', color: 'text-orange-400 bg-orange-400/10 border-orange-500/20', icon: XCircle },
    degraded: { label: 'Degraded', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-500/20', icon: AlertTriangle },
    success: { label: 'Success', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20', icon: CheckCircle2 },
    unassigned: { label: 'Unassigned', color: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20', icon: Activity },
};

export const ReplayViewer: React.FC<ReplayViewerProps> = ({
    viewMode,
    setViewMode,
    screenshots,
    currentScreenshotIdx,
    onPrevScreenshot,
    onNextScreenshot,
    onManualCapture,
    isPlaying,
    togglePlay,
    sessionEvents,
    docData,
    setDocData,
    isGenerating,
    onGenerateReport,
    videoUrl,
    videoRef,
    currentTime
}) => {
    const [editingField, setEditingField] = useState<'title' | 'description' | null>(null);
    const [addingLinkType, setAddingLinkType] = useState<'notion' | 'github' | 'linear' | null>(null);
    const [linkInput, setLinkInput] = useState('');

    const handleAddLink = () => {
        if (!addingLinkType || !linkInput) return;
        setDocData(prev => ({
            ...prev,
            links: [...prev.links, { type: addingLinkType, url: linkInput }]
        }));
        setAddingLinkType(null);
        setLinkInput('');
    };

    const removeLink = (index: number) => {
        setDocData(prev => ({
            ...prev,
            links: prev.links.filter((_, i) => i !== index)
        }));
    };

    const StatusIcon = STATUS_CONFIG[docData.status].icon;

    return (
        <>
            <div className="px-8 pt-6 pb-2 shrink-0 flex items-center justify-between">
                <div className="inline-flex bg-zinc-900 border border-white/5 p-1 rounded-lg">
                    <button onClick={() => setViewMode('video')} className={`flex items-center gap-2 px-4 py-1.5 rounded-[6px] text-[13px] font-medium transition-all ${viewMode === 'video' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}><Film size={14} /> Video</button>
                    <button onClick={() => setViewMode('screenshots')} className={`flex items-center gap-2 px-4 py-1.5 rounded-[6px] text-[13px] font-medium transition-all ${viewMode === 'screenshots' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}><ImageIcon size={14} /> Screenshots <span className="bg-zinc-800 text-zinc-400 text-[10px] px-1.5 rounded-full ml-1">{screenshots.length}</span></button>
                    <button onClick={() => setViewMode('analysis')} className={`flex items-center gap-2 px-4 py-1.5 rounded-[6px] text-[13px] font-medium transition-all ${viewMode === 'analysis' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}><FileText size={14} /> Documentation</button>
                </div>
            </div>

            <div className={`flex-1 flex flex-col p-8 pt-4 pb-0 relative min-h-0 overflow-hidden`}>
                <div className={`flex-1 relative rounded-xl border border-white/10 overflow-hidden group flex items-center justify-center transition-all ${(viewMode === 'analysis') ? 'bg-zinc-900/50 border-none' : 'bg-black shadow-2xl'}`}>

                    {viewMode === 'video' && (
                        <div className="w-full h-full relative flex items-center justify-center">
                            <div className="relative w-full h-full max-w-full max-h-full aspect-video">
                                {videoUrl ? (
                                    <video
                                        ref={videoRef}
                                        src={videoUrl}
                                        className="w-full h-full object-contain"
                                        onClick={togglePlay}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-500">
                                        <Film size={48} className="opacity-20" />
                                        <p className="ml-4 font-mono text-sm uppercase tracking-widest">No Video Available</p>
                                    </div>
                                )}
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={onManualCapture} className="bg-black/60 backdrop-blur-md hover:bg-white text-white hover:text-black border border-white/20 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all"><Camera size={14} /> Capture Frame</button>
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center cursor-pointer pointer-events-none">
                                    {!isPlaying && videoUrl && <div className="bg-white/10 p-5 rounded-full backdrop-blur-md border border-white/10 shadow-xl pointer-events-auto" onClick={togglePlay}><Play size={32} fill="white" className="ml-1" /></div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {viewMode === 'screenshots' && (
                        <div className="w-full h-full relative flex items-center justify-center">
                            <div className="relative w-full h-full max-w-full max-h-full aspect-video">
                                {screenshots.length > 0 ? (
                                    <>
                                        <img src={`https://picsum.photos/seed/${screenshots[currentScreenshotIdx]?.id || 'null'}/800/450`} className="w-full h-full object-contain" alt="Screenshot" />
                                        <button onClick={onPrevScreenshot} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all z-30 border border-white/10"><ChevronLeft size={20} /></button>
                                        <button onClick={onNextScreenshot} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all z-30 border border-white/10"><ChevronRight size={20} /></button>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center text-zinc-500 gap-3 h-full"><Camera size={32} className="opacity-50" /><p>No screenshots captured.</p></div>
                                )}
                            </div>
                        </div>
                    )}

                    {viewMode === 'analysis' && (
                        <div className="w-full h-full overflow-y-auto custom-scrollbar p-8 absolute inset-0 bg-zinc-950">
                            <div className="max-w-6xl mx-auto space-y-8">

                                {/* Header: Title & Status */}
                                <div className="flex items-start justify-between gap-8">
                                    <div className="flex-1 space-y-2 group">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                            Session Title
                                            <button onClick={() => setEditingField('title')} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity">
                                                <Pencil size={10} />
                                            </button>
                                        </label>
                                        {editingField === 'title' ? (
                                            <input
                                                autoFocus
                                                className="text-3xl font-bold bg-transparent outline-none w-full text-white tracking-tight placeholder:text-zinc-700"
                                                value={docData.title}
                                                onChange={e => setDocData(prev => ({ ...prev, title: e.target.value }))}
                                                onBlur={() => setEditingField(null)}
                                                onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                            />
                                        ) : (
                                            <h1 className="text-3xl font-bold text-white tracking-tight cursor-text" onClick={() => setEditingField('title')}>{docData.title}</h1>
                                        )}
                                    </div>

                                    <div className="space-y-2 shrink-0 relative group/status">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block text-right">Status</label>
                                        <button className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${STATUS_CONFIG[docData.status].color}`}>
                                            <StatusIcon size={14} />
                                            {STATUS_CONFIG[docData.status].label.toUpperCase()}
                                            <ChevronDown size={14} className="opacity-50" />
                                        </button>

                                        {/* Status Dropdown */}
                                        <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover/status:opacity-100 group-hover/status:visible transition-all z-50 overflow-hidden">
                                            {(Object.keys(STATUS_CONFIG) as DocStatus[]).map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => setDocData(prev => ({ ...prev, status: s }))}
                                                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs text-left hover:bg-white/5 transition-colors ${docData.status === s ? 'text-white font-bold' : 'text-zinc-500'}`}
                                                >
                                                    {STATUS_CONFIG[s].icon && React.createElement(STATUS_CONFIG[s].icon, { size: 14 })}
                                                    {s.toUpperCase()}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Description Section */}
                                <div className="space-y-2 group">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                        Description
                                        <button onClick={() => setEditingField('description')} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity">
                                            <Pencil size={10} />
                                        </button>
                                    </label>
                                    {editingField === 'description' ? (
                                        <textarea
                                            autoFocus
                                            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl p-6 text-sm text-zinc-300 leading-relaxed outline-none resize-none font-sans"
                                            style={{ minHeight: '120px' }}
                                            value={docData.description}
                                            onChange={e => setDocData(prev => ({ ...prev, description: e.target.value }))}
                                            onBlur={() => setEditingField(null)}
                                        />
                                    ) : (
                                        <div
                                            onClick={() => setEditingField('description')}
                                            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl p-6 hover:border-white/10 transition-colors cursor-text min-h-[120px]"
                                        >
                                            <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{docData.description}</p>
                                        </div>
                                    )}
                                </div>

                                {/* References Section */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">References</label>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setAddingLinkType('notion')} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 hover:bg-white/5 transition-all text-xs font-medium">
                                            <FileText size={14} /> Notion
                                        </button>
                                        <button onClick={() => setAddingLinkType('github')} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 hover:bg-white/5 transition-all text-xs font-medium">
                                            <Github size={14} /> Github
                                        </button>
                                        <button onClick={() => setAddingLinkType('linear')} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 hover:bg-white/5 transition-all text-xs font-medium">
                                            <LayoutList size={14} /> Linear
                                        </button>

                                        {/* Existing Links */}
                                        {docData.links.map((link, idx) => (
                                            <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg group relative">
                                                {link.type === 'notion' && <FileText size={14} className="text-zinc-400" />}
                                                {link.type === 'github' && <Github size={14} className="text-zinc-400" />}
                                                {link.type === 'linear' && <LayoutList size={14} className="text-zinc-400" />}
                                                <span className="text-xs text-zinc-200 font-medium truncate max-w-[120px]">{link.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                                <button onClick={() => removeLink(idx)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Trash2 size={8} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Link Input */}
                                    {addingLinkType && (
                                        <div className="flex items-center gap-2 p-2 bg-zinc-900 border border-indigo-500/30 rounded-lg max-w-md animate-in slide-in-from-left-2 mt-2">
                                            <LinkIcon size={14} className="text-zinc-500 ml-2" />
                                            <input
                                                autoFocus
                                                className="bg-transparent border-none outline-none text-xs text-white flex-1 placeholder:text-zinc-600"
                                                placeholder={`Paste ${addingLinkType} URL...`}
                                                value={linkInput}
                                                onChange={e => setLinkInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleAddLink()}
                                            />
                                            <Button size="sm" className="h-7 text-[10px]" onClick={handleAddLink}>Save</Button>
                                            <button onClick={() => setAddingLinkType(null)} className="p-1 text-zinc-500 hover:text-white"><Plus size={14} className="rotate-45" /></button>
                                        </div>
                                    )}
                                </div>

                                {/* Reports Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                                    <ReportPanel
                                        title="Process Flow"
                                        actionLabel="Generate Process Flow"
                                        description="Generate a specialized process flow report using session context."
                                        content={docData.reports.flow}
                                        isGenerating={isGenerating === 'flow'}
                                        onGenerate={() => onGenerateReport('flow')}
                                    />
                                    <ReportPanel
                                        title="QA Analysis"
                                        actionLabel="Generate QA Analysis"
                                        description="Generate a specialized qa analysis report using session context."
                                        content={docData.reports.qa}
                                        isGenerating={isGenerating === 'qa'}
                                        onGenerate={() => onGenerateReport('qa')}
                                    />
                                    <ReportPanel
                                        title="Suggestions"
                                        actionLabel="Generate Suggestions"
                                        description="Generate a specialized suggestions report using session context."
                                        content={docData.reports.suggestions}
                                        isGenerating={isGenerating === 'suggestions'}
                                        onGenerate={() => onGenerateReport('suggestions')}
                                    />
                                </div>

                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

const ReportPanel = ({ title, description, actionLabel, content, isGenerating, onGenerate }: any) => {
    return (
        <div className="flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors group">
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-900 bg-zinc-900/30 flex items-center gap-2">
                <Wand2 size={16} className="text-zinc-500" />
                <h4 className="text-sm font-bold text-zinc-200">{title}</h4>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-5 min-h-[240px] flex flex-col">
                {content ? (
                    <div className="prose prose-sm prose-invert max-w-none animate-in fade-in duration-500 flex-1">
                        <div className="text-zinc-400 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                            {content}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 opacity-60 group-hover:opacity-100 transition-opacity">
                        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                            <Wand2 size={20} className="text-zinc-600" />
                        </div>
                        <p className="text-xs text-zinc-500 max-w-[180px] leading-relaxed">
                            {description}
                        </p>
                    </div>
                )}
            </div>

            {/* Action Footer */}
            <div className="p-4 border-t border-zinc-900 bg-zinc-900/20">
                <Button
                    variant={content ? 'secondary' : 'primary'} // White button when empty, dark when content exists
                    className="w-full justify-center"
                    size="md"
                    onClick={onGenerate}
                    isLoading={isGenerating}
                >
                    {content ? 'Regenerate Report' : actionLabel}
                </Button>
            </div>
        </div>
    );
};
