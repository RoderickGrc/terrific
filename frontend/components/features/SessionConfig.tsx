import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Clock, Video, Home, Folder, Search, X } from 'lucide-react';
import { RESOLUTIONS } from '../../src/constants';
import { Resolution, Session, WorkspaceSummary } from '../../types';
import { Button } from '../ui/Button';
import { BrowserProfileManager } from './CredentialsManager';
import { Badge } from '../ui/Badge';
import { DebugServerPanel } from './DebugServerPanel';
import { McpServerPanel } from './McpServerPanel';
import { api } from '../../src/services/api';
import { useWorkspace } from '../../WorkspaceContext';
import { buildSessionFileUrl } from '../../src/services/backendUrls';
import type { BrowserProfile } from '../../types';

interface WorkspaceOption {
    id: string;
    path: string;
    displayName: string;
    sessionCount: number;
    isHome?: boolean;
}

export const SessionConfig: React.FC = () => {
    const navigate = useNavigate();
    const { workspaceHash } = useWorkspace();
    const [url, setUrl] = useState('');
    const [sessionName, setSessionName] = useState('');
    const [resolution, setResolution] = useState<Resolution>('Dynamic');
    const [profileId, setProfileId] = useState<string>('');
    const [isCreating, setIsCreating] = useState(false);
    const [showProfileManager, setShowProfileManager] = useState(false);
    const [previousSessions, setPreviousSessions] = useState<Session[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
    const [displayedCount, setDisplayedCount] = useState(12); // Show 12 sessions initially
    const [hasMore, setHasMore] = useState(true);
    const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
    const [workspaceQuery, setWorkspaceQuery] = useState('');
    const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
    const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
    const observerTarget = useRef<HTMLDivElement>(null);

    // Recording mode state (browser will prompt user to choose screen)
    const [recordingMode, setRecordingMode] = useState<'browser' | 'screen'>('browser');

    // Config State
    const [config, setConfig] = useState({
        recordActions: true,
        recordConsole: true,
        recordNetwork: true,
        recordVideo: true,
        snapshotOnReload: false,
        snapshotOnScreenshot: true
    });

    useEffect(() => {
        const loadSessions = async () => {
            try {
                const data = await api.listSessions(workspaceHash);
                const sorted = data.sort((a, b) => b.startTime - a.startTime);
                setPreviousSessions(sorted);
                setHasMore(sorted.length > displayedCount);
            } catch (err) {
                console.error("Failed to load sessions:", err);
            } finally {
                setIsLoadingSessions(false);
            }
        };
        loadSessions();
    }, [workspaceHash]);

    // Intersection Observer for lazy loading
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoadingSessions) {
                    setDisplayedCount((prev) => {
                        const newCount = prev + 12;
                        setHasMore(previousSessions.length > newCount);
                        return newCount;
                    });
                }
            },
            { threshold: 0.1 }
        );

        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [hasMore, isLoadingSessions, previousSessions.length]);

    useEffect(() => {
        const loadProfiles = async () => {
            try {
                const data = await api.listCredentials(workspaceHash);
                setProfiles(data);
            } catch (err) {
                console.error("Failed to load profiles:", err);
            } finally {
                setIsLoadingProfiles(false);
            }
        };
        loadProfiles();
    }, [workspaceHash]);

    useEffect(() => {
        if (!showWorkspaceManager) return;

        const loadWorkspaceOptions = async () => {
            setIsLoadingWorkspaces(true);
            try {
                const [homeSessions, allWorkspaces] = await Promise.all([
                    api.listSessions(),
                    api.listWorkspaces(),
                ]);

                const sortedWorkspaces = [...allWorkspaces].sort(
                    (a, b) => new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
                );

                const seenPaths = new Set<string>();
                const dedupedWorkspaces = sortedWorkspaces.filter((w) => {
                    const key = normalizePathForComparison(w.path);
                    if (seenPaths.has(key)) return false;
                    seenPaths.add(key);
                    return true;
                });

                const workspaceCounts = await Promise.all(
                    dedupedWorkspaces.map(async (workspace: WorkspaceSummary) => {
                        try {
                            const sessions = await api.listSessions(workspace.id);
                            return {
                                id: workspace.id,
                                path: workspace.path,
                                displayName: getWorkspaceDisplayName(workspace.path),
                                sessionCount: sessions.length,
                            };
                        } catch {
                            return {
                                id: workspace.id,
                                path: workspace.path,
                                displayName: getWorkspaceDisplayName(workspace.path),
                                sessionCount: 0,
                            };
                        }
                    })
                );

                setWorkspaceOptions([
                    {
                        id: 'home',
                        path: 'Global context',
                        displayName: 'Home',
                        sessionCount: homeSessions.length,
                        isHome: true,
                    },
                    ...workspaceCounts,
                ]);
            } catch (error) {
                console.error('Failed to load workspaces:', error);
                setWorkspaceOptions([
                    {
                        id: 'home',
                        path: 'Global context',
                        displayName: 'Home',
                        sessionCount: 0,
                        isHome: true,
                    },
                ]);
            } finally {
                setIsLoadingWorkspaces(false);
            }
        };

        loadWorkspaceOptions();
    }, [showWorkspaceManager]);

    const handleStart = async () => {
        if (!url) return;
        setIsCreating(true);
        try {
            const newSession = await api.createSession({
                name: sessionName || undefined,
                initialUrl: url,
                resolution,
                profileId: profileId || undefined,
                recordingMode,
                ...config
            }, workspaceHash);
            const sessionPath = workspaceHash
                ? `/workspace/${workspaceHash}/session/${newSession.id}`
                : `/session/${newSession.id}`;
            navigate(sessionPath);
        } catch (err) {
            console.error("Failed to start session:", err);
            alert(err instanceof Error ? err.message : 'Failed to start session');
        } finally {
            setIsCreating(false);
        }
    };

    const handleProfileSelect = (id: string) => {
        setProfileId(id);
        const profile = profiles.find(c => c.id === id);
        if (profile) {
            setUrl(profile.targetUrl);
        }
    };

    const filteredWorkspaceOptions = workspaceOptions.filter((option) => {
        if (!workspaceQuery.trim()) return true;
        const q = workspaceQuery.toLowerCase();
        return option.displayName.toLowerCase().includes(q) || option.path.toLowerCase().includes(q);
    });

    const openWorkspaceManager = () => {
        setWorkspaceOptions([]);
        setIsLoadingWorkspaces(true);
        setShowWorkspaceManager(true);
    };

    const openWorkspace = (option: WorkspaceOption) => {
        setShowWorkspaceManager(false);
        setWorkspaceQuery('');
        if (option.isHome) {
            navigate('/');
            return;
        }
        navigate(`/workspace/${option.id}`);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
            {/* Hero / Config Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

                {/* Left: Configuration */}
                <div className="lg:col-span-7 space-y-8">
                    <div className="space-y-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start">
                            <div>
                                <h1 className="text-4xl font-bold tracking-tight text-white mb-2">New Session</h1>
                                <p className="text-zinc-400 text-[15px]">Configure your flight recorder environment.</p>
                            </div>

                            <div className="self-start lg:hidden">
                                <button
                                    type="button"
                                    onClick={openWorkspaceManager}
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-300 transition-all hover:border-white/25 hover:text-zinc-100"
                                >
                                    <Folder size={13} />
                                    Manage Workspaces
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 md:p-8 shadow-sm space-y-8">
                        {/* Session Identity */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[13px] font-medium text-zinc-300">Session Name <span className="text-zinc-500 font-normal">(Optional)</span></label>
                                <input
                                    type="text"
                                    placeholder="e.g. Bug: Checkout flow friction"
                                    className="w-full bg-zinc-950/50 border border-white/10 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-all outline-none"
                                    value={sessionName}
                                    onChange={e => setSessionName(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Target & Profile */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                                <label className="text-[13px] font-medium text-zinc-300">Initial URL <span className="text-red-400">*</span></label>
                                <input
                                    type="url"
                                    placeholder="https://example.com"
                                    className="w-full bg-zinc-950/50 border border-white/10 rounded-xl px-4 py-3 text-zinc-100 font-mono text-[13px] placeholder:text-zinc-600 focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-all outline-none"
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex justify-between">
                                    <label className="text-[13px] font-medium text-zinc-300">Browser Profile</label>
                                    <button onClick={() => setShowProfileManager(true)} className="text-[11px] text-white/70 hover:text-white">Manage</button>
                                </div>
                                <select
                                    className="w-full bg-zinc-950/50 border border-white/10 rounded-xl px-4 py-3 text-zinc-300 focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-all outline-none appearance-none"
                                    value={profileId}
                                    onChange={e => handleProfileSelect(e.target.value)}
                                >
                                    <option value="">🚫 No Profile (Clean Slate)</option>
                                    {profiles.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.hasState ? '✅' : '⚪'} {p.alias}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Resolution */}
                        <div className="space-y-1.5">
                            <label className="text-[13px] font-medium text-zinc-300">Viewport Resolution</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {RESOLUTIONS.map(res => (
                                    <button
                                        key={res}
                                        onClick={() => setResolution(res as Resolution)}
                                        className={`py-2.5 px-3 rounded-lg text-[13px] font-medium border transition-all ${resolution === res
                                            ? 'bg-zinc-100 border-zinc-100 text-black shadow-lg'
                                            : 'bg-transparent border-white/10 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                                            }`}
                                    >
                                        {res}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Recording Mode - Only show if recordVideo is enabled */}
                        {config.recordVideo && (
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <label className="text-[13px] font-medium text-zinc-300">Recording Mode</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setRecordingMode('browser')}
                                            className={`py-3 px-4 rounded-lg text-[13px] font-medium border transition-all ${recordingMode === 'browser'
                                                ? 'bg-zinc-100 border-zinc-100 text-black shadow-lg'
                                                : 'bg-transparent border-white/10 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                                                }`}
                                        >
                                            <div className="flex flex-col items-center gap-1.5">
                                                <span className="text-xl">🪟</span>
                                                <span className="font-semibold">Browser Window</span>
                                                <span className="text-[10px] opacity-70">Automatic</span>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => setRecordingMode('screen')}
                                            className={`py-3 px-4 rounded-lg text-[13px] font-medium border transition-all ${recordingMode === 'screen'
                                                ? 'bg-zinc-100 border-zinc-100 text-black shadow-lg'
                                                : 'bg-transparent border-white/10 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                                                }`}
                                        >
                                            <div className="flex flex-col items-center gap-1.5">
                                                <span className="text-xl">🖥️</span>
                                                <span className="font-semibold">Full Screen</span>
                                                <span className="text-[10px] opacity-70">You choose</span>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* Explanation for Full Screen mode */}
                                {recordingMode === 'screen' && (
                                    <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
                                        <p className="text-[11px] text-blue-400 flex items-start gap-2">
                                            <span className="mt-0.5">ℹ️</span>
                                            <span>
                                                Your browser will ask you to <strong>select what to record</strong>:
                                                a tab, window, or entire screen. You can choose any monitor visually.
                                            </span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Toggles Grid */}
                        <div className="pt-6 border-t border-white/5">
                            <label className="text-[13px] font-medium text-zinc-300 block mb-4">Recording Options</label>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                {Object.entries(config).map(([key, val]) => (
                                    <label key={key} className="flex items-center gap-3 group cursor-pointer">
                                        <div className={`w-5 h-5 rounded-[5px] border flex items-center justify-center transition-all ${val ? 'bg-white border-white' : 'bg-transparent border-zinc-700'}`}>
                                            {val && <CheckIcon />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={val}
                                            onChange={() => setConfig(prev => ({ ...prev, [key]: !val }))}
                                        />
                                        <span className="text-[13px] text-zinc-400 group-hover:text-zinc-200 capitalize select-none">
                                            {key.replace(/([A-Z])/g, ' $1').trim()}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4">
                            <Button
                                size="lg"
                                className="w-full py-4 text-[15px]"
                                disabled={!url || isCreating}
                                isLoading={isCreating}
                                onClick={handleStart}
                            >
                                Start Session
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Right: Info / Debug Server */}
                <div className="hidden lg:flex lg:flex-col lg:col-span-5 space-y-8">
                    <div className="flex justify-end items-start min-h-[4.5rem]">
                        <button
                            type="button"
                            onClick={openWorkspaceManager}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-300 transition-all hover:border-white/25 hover:text-zinc-100"
                        >
                            <Folder size={13} />
                            Manage Workspaces
                        </button>
                    </div>

                    <DebugServerPanel />
                    <McpServerPanel />
                </div>
            </div>

            {/* Previous Sessions */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white tracking-tight">Previous Sessions</h2>
                    <Badge variant="neutral">{previousSessions.length} found</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isLoadingSessions ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="animate-pulse bg-zinc-900/50 border border-white/5 rounded-2xl p-6 min-h-[240px]" />
                        ))
                    ) : (
                        <>
                            {previousSessions.slice(0, displayedCount).map(session => (
                                <SessionCard key={session.id} session={session} onClick={() => navigate(workspaceHash ? `/workspace/${workspaceHash}/replay/${session.id}` : `/replay/${session.id}`)} />
                            ))}
                        </>
                    )}

                    {!isLoadingSessions && previousSessions.length === 0 && (
                        <div className="col-span-full border border-white/5 border-dashed rounded-2xl p-12 text-center">
                            <p className="text-zinc-500">No sessions found. Start your first recording above.</p>
                        </div>
                    )}
                </div>

                {/* Intersection Observer Target */}
                {!isLoadingSessions && hasMore && (
                    <div ref={observerTarget} className="col-span-full flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    </div>
                )}
            </div>

            <BrowserProfileManager
                isOpen={showProfileManager}
                onClose={() => setShowProfileManager(false)}
                onSelect={(profile) => {
                    setProfileId(profile.id);
                    if (!url) setUrl(profile.startUrl);
                    setShowProfileManager(false);
                }}
            />

            <WorkspaceManagerModal
                isOpen={showWorkspaceManager}
                isLoading={isLoadingWorkspaces}
                query={workspaceQuery}
                options={filteredWorkspaceOptions}
                currentWorkspaceHash={workspaceHash}
                onQueryChange={setWorkspaceQuery}
                onClose={() => {
                    setShowWorkspaceManager(false);
                    setWorkspaceQuery('');
                }}
                onSelect={openWorkspace}
            />
        </div>
    );
};

interface SessionCardProps {
    session: Session;
    onClick: () => void;
}

const SessionCard: React.FC<SessionCardProps> = ({ session, onClick }) => {
    return (
        <div
            onClick={onClick}
            className="group bg-zinc-900 border border-white/5 hover:border-zinc-700 rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-2xl hover:shadow-black/50 hover:-translate-y-1"
        >
            <div className="relative h-44 bg-zinc-950 overflow-hidden">
                {session.previewImage ? (
                    <img src={session.previewImage ? buildSessionFileUrl(session.id, session.previewImage) : ''} alt="Preview" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500 saturate-0 group-hover:saturate-100" />
                ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                        <Video size={48} className="text-zinc-800" />
                    </div>
                )}

                {session.config.recordVideo && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
                            <Play size={20} fill="currentColor" className="ml-1" />
                        </div>
                    </div>
                )}
                <div className="absolute bottom-3 right-3">
                    <Badge variant={
                        session.status === 'completed' ? 'success' :
                            session.status === 'recording' ? 'warning' :
                                'neutral'
                    }>
                        {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                    </Badge>
                </div>
            </div>

            <div className="p-5 space-y-3">
                <div>
                    <div className="flex justify-between items-start">
                        <h3 className="font-medium text-zinc-100 truncate pr-2 group-hover:text-white transition-colors">
                            {session.name || `Session #${session.id.substring(0, 8)}`}
                        </h3>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                        <Clock size={12} /> {getTimeAgo(session.startTime)}
                    </p>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 bg-black/20 p-2 rounded-lg border border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="truncate">{session.config.initialUrl}</span>
                </div>

                {session.description && (
                    <p className="text-[13px] text-zinc-400 line-clamp-2 leading-relaxed">{session.description}</p>
                )}
            </div>
        </div>
    );
};

function CheckIcon() {
    return <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 4L3.5 6.5L9 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function getTimeAgo(timestamp: number) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

function normalizePathForComparison(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    if (normalized.length >= 2 && normalized[1] === ':') {
        return normalized[0].toUpperCase() + ':' + normalized.slice(2);
    }
    return normalized;
}

function getWorkspaceDisplayName(path: string): string {
    const cleanPath = path.replace(/\\/g, '/');
    const parts = cleanPath.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last) return path;

    if (last === '.terrific' && parts.length > 1) {
        return parts[parts.length - 2];
    }

    return last;
}

interface WorkspaceManagerModalProps {
    isOpen: boolean;
    isLoading: boolean;
    query: string;
    options: WorkspaceOption[];
    currentWorkspaceHash: string | null;
    onQueryChange: (value: string) => void;
    onClose: () => void;
    onSelect: (option: WorkspaceOption) => void;
}

const WorkspaceManagerModal: React.FC<WorkspaceManagerModalProps> = ({
    isOpen,
    isLoading,
    query,
    options,
    currentWorkspaceHash,
    onQueryChange,
    onClose,
    onSelect,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col max-h-[88vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-500/10 rounded-lg border border-sky-500/20">
                            <Folder className="w-5 h-5 text-sky-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-100">Workspace Manager</h2>
                            <p className="text-xs text-zinc-500">Switch between Home and any saved workspace.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 border-b border-zinc-800">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            value={query}
                            onChange={(e) => onQueryChange(e.target.value)}
                            placeholder="Search by workspace name or path..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {isLoading && (
                        <div className="py-10 text-center text-zinc-500 text-sm">Loading workspaces...</div>
                    )}

                    {!isLoading && options.length === 0 && (
                        <div className="py-10 text-center text-zinc-500 text-sm">No workspaces match your search.</div>
                    )}

                    {!isLoading && options.map((option) => {
                        const isActive = option.isHome ? !currentWorkspaceHash : currentWorkspaceHash === option.id;

                        return (
                            <button
                                key={option.id}
                                onClick={() => onSelect(option)}
                                className={`w-full text-left rounded-xl border p-3 transition-all ${isActive
                                    ? 'border-emerald-400/40 bg-emerald-500/10'
                                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                                            {option.isHome ? <Home size={14} className="text-emerald-300" /> : <Folder size={14} className="text-sky-300" />}
                                            <span className="truncate">{option.displayName}</span>
                                        </p>
                                        <p className="text-[11px] text-zinc-500 truncate mt-1">{option.path}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-300">
                                            {option.sessionCount} sessions
                                        </span>
                                        {isActive && (
                                            <span className="rounded-md bg-emerald-400/20 px-2 py-1 text-[10px] uppercase tracking-wide text-emerald-200">
                                                active
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
