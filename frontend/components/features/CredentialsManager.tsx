import React, { useState, useEffect } from 'react';
import { BrowserProfile } from '../../types';
import { X, Layers, Plus, Trash2, Globe, HardDrive, RefreshCw, Power } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { api } from '../../src/services/api';
import { useWorkspace } from '../../WorkspaceContext';

interface BrowserProfileManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect?: (profile: BrowserProfile) => void;
}

export const BrowserProfileManager: React.FC<BrowserProfileManagerProps> = ({ isOpen, onClose, onSelect }) => {
    const { workspaceHash } = useWorkspace();
    const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newProfile, setNewProfile] = useState<Partial<BrowserProfile>>({});
    const [configuringId, setConfiguringId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            const loadProfiles = async () => {
                try {
                    const data = await api.listCredentials(workspaceHash);
                    setProfiles(data);
                } catch (err) {
                    console.error('Failed to load profiles:', err);
                } finally {
                    setIsLoading(false);
                }
            };
            loadProfiles();
        }
    }, [isOpen, workspaceHash]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!newProfile.alias || !newProfile.startUrl) return;

        try {
            const profile = await api.createCredential({
                alias: newProfile.alias,
                targetUrl: newProfile.startUrl,
                username: newProfile.description
            }, workspaceHash);

            setProfiles(prev => [...prev, profile]);
            setIsAdding(false);
            setNewProfile({});
        } catch (err) {
            console.error('Failed to create profile:', err);
            alert('Failed to create profile');
        }
    };

    const launchConfigurator = async (id: string) => {
        // Show instructions before launching
        alert(
            '📋 Instructions:\n\n' +
            '1. A browser will open automatically\n' +
            '2. Navigate and login / configure cookies\n' +
            '3. When finished, CLOSE THE BROWSER\n' +
            '4. State will be saved automatically\n\n' +
            '⚠️ Do not close this window while configuring'
        );

        setConfiguringId(id);
        try {
            await api.launchCredential(id, workspaceHash);
            // Refresh the profile to get updated state
            const updatedProfiles = await api.listCredentials(workspaceHash);
            setProfiles(updatedProfiles);
            alert('✅ State saved successfully');
        } catch (err) {
            console.error('Failed to launch configurator:', err);
            alert('❌ Failed to launch configurator: ' + (err as Error).message);
        } finally {
            setConfiguringId(null);
        }
    };

    const clearState = (id: string) => {
        setProfiles(prev => prev.map(p => p.id === id ? { ...p, hasState: false, lastUpdated: undefined, storageSize: undefined } : p));
    };

    const deleteProfile = async (id: string) => {
        if (!confirm('Delete this profile? This cannot be undone.')) return;
        try {
            await api.deleteCredential(id, workspaceHash);
            setProfiles(prev => prev.filter(p => p.id !== id));
        } catch (err) {
            console.error('Failed to delete profile:', err);
            alert('Failed to delete profile');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/10">
                            <Layers className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-100">Browser Profiles</h2>
                            <p className="text-xs text-zinc-500">Manage persistent sessions, cookies, and local storage.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Add New Section */}
                    {isAdding ? (
                        <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-medium text-zinc-300">New Profile Configuration</h3>
                                <button onClick={() => setIsAdding(false)} className="text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-zinc-500">Profile Alias *</label>
                                    <input
                                        type="text"
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 placeholder:text-zinc-700 transition-all"
                                        placeholder="e.g. Admin Staging Environment"
                                        value={newProfile.alias || ''}
                                        onChange={e => setNewProfile({ ...newProfile, alias: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-zinc-500">Start URL *</label>
                                    <input
                                        type="text"
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 placeholder:text-zinc-700 transition-all"
                                        placeholder="https://..."
                                        value={newProfile.startUrl || ''}
                                        onChange={e => setNewProfile({ ...newProfile, startUrl: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-zinc-500">Description (Optional)</label>
                                    <textarea
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 placeholder:text-zinc-700 min-h-[80px] resize-none transition-all"
                                        placeholder="Describe the state context (e.g., 'User logged in with 2FA, Dark Mode enabled')..."
                                        value={newProfile.description || ''}
                                        onChange={e => setNewProfile({ ...newProfile, description: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/50">
                                <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                                <Button size="sm" onClick={handleSave} disabled={!newProfile.alias || !newProfile.startUrl}>Create Profile</Button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="w-full py-3 border border-dashed border-zinc-800 rounded-xl text-zinc-500 hover:text-indigo-400 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all flex items-center justify-center gap-2 text-sm font-medium group"
                        >
                            <Plus size={16} className="group-hover:scale-110 transition-transform" />
                            Create New Browser Profile
                        </button>
                    )}

                    {/* List */}
                    <div className="space-y-3">
                        {profiles.length === 0 && !isAdding && (
                            <div className="text-center py-12 border border-zinc-800/50 rounded-xl bg-zinc-900/50">
                                <HardDrive className="mx-auto h-8 w-8 text-zinc-700 mb-3" />
                                <p className="text-zinc-500 text-sm">No profiles configured.</p>
                            </div>
                        )}

                        {profiles.map(prof => (
                            <div key={prof.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4 transition-all hover:border-zinc-700 group">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        {/* Status Indicator */}
                                        <div className="mt-1">
                                            {prof.isVerified ? (
                                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" title="State Saved" />
                                            ) : (
                                                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 border border-zinc-600" title="Empty State" />
                                            )}
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium text-zinc-200 text-[15px]">{prof.alias}</h3>
                                                {prof.isVerified ? (
                                                    <Badge variant="success" className="text-[10px] px-1.5 py-0 h-4">Configured</Badge>
                                                ) : (
                                                    <Badge variant="neutral" className="text-[10px] px-1.5 py-0 h-4">Empty</Badge>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-1 text-xs text-zinc-500">
                                                <span className="flex items-center gap-1.5 font-mono text-zinc-600">
                                                    <Globe size={10} /> {prof.targetUrl}
                                                </span>
                                                {(prof.username || prof.email) && (
                                                    <p className="text-zinc-400 leading-relaxed max-w-md">{prof.username || prof.email}</p>
                                                )}
                                                {prof.isVerified && prof.storageState && (
                                                    <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-500">
                                                        <span>Size: {(new Blob([prof.storageState]).size / 1024).toFixed(1)} KB</span>
                                                        {prof.createdAt && <span>Created: {new Date(prof.createdAt).toLocaleDateString()}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between border-t border-zinc-900 pt-3 mt-1">
                                    <div className="flex items-center gap-2">
                                        {prof.isVerified ? (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => onSelect && onSelect(prof)}
                                                    className="h-8"
                                                >
                                                    Use Profile
                                                </Button>
                                                <button
                                                    onClick={() => launchConfigurator(prof.id)}
                                                    disabled={configuringId === prof.id}
                                                    className="text-xs font-medium text-zinc-500 hover:text-white px-2 transition-colors disabled:opacity-50"
                                                >
                                                    {configuringId === prof.id ? 'Launching...' : 'Re-configure'}
                                                </button>
                                            </>
                                        ) : (
                                            <Button
                                                size="sm"
                                                className="h-8 bg-zinc-100 hover:bg-white text-black border-transparent"
                                                onClick={() => launchConfigurator(prof.id)}
                                                isLoading={configuringId === prof.id}
                                            >
                                                {configuringId === prof.id ? 'Launching Browser...' : 'Launch Configurator'}
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1">
                                        {prof.hasState && (
                                            <button
                                                onClick={() => clearState(prof.id)}
                                                className="p-1.5 text-zinc-600 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                                                title="Clear Saved State"
                                            >
                                                <Power size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteProfile(prof.id)}
                                            className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                            title="Delete Profile"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </div>
        </div>
    );
};