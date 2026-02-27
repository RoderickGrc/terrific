import React, { useState } from 'react';
import { Session } from '../../types';
import { Card } from './Card';
import { Badge } from './Badge';
import { useWorkspace } from '../../WorkspaceContext';
import { buildSessionFileUrl } from '../../src/services/backendUrls';

interface SessionCardProps {
    session: Session;
    onClick: (sessionId: string) => void;
    onDelete?: (sessionId: string) => Promise<void>;
    onUpdate?: () => Promise<void>;
}

export const SessionCard: React.FC<SessionCardProps> = ({ session, onClick, onDelete, onUpdate }) => {
    const { workspaceHash } = useWorkspace();
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(session.name || '');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const date = session.createdAt ? new Date(session.createdAt) : new Date(session.startTime);

    // Format date relative or absolute
    const formatDate = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            if (hours === 0) {
                const minutes = Math.floor(diff / (1000 * 60));
                return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
            }
            return `${hours}h ago`;
        }
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;

        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    };

    const getPreviewUrl = () => {
        if (session.previewImage) {
            return buildSessionFileUrl(session.id, session.previewImage, { workspaceHash: workspaceHash || undefined });
        }
        return null;
    };

    const handleTitleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        setEditedName(session.name || `Session #${session.id.substring(0, 8)}`);
    };

    const handleTitleBlur = async () => {
        setIsEditing(false);
        if (editedName !== session.name && editedName.trim()) {
            await saveTitle();
        }
    };

    const handleTitleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await saveTitle();
            setIsEditing(false);
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditedName(session.name || '');
        }
    };

    const saveTitle = async () => {
        if (!editedName.trim()) return;

        setIsUpdating(true);
        try {
            const { api } = await import('../../src/services/api');
            await api.updateSessionName(session.id, editedName, workspaceHash);
            if (onUpdate) {
                await onUpdate();
            }
        } catch (error) {
            console.error('Failed to update session name:', error);
            setEditedName(session.name || '');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDeleting(true);
        try {
            if (onDelete) {
                await onDelete(session.id);
            }
        } catch (error) {
            console.error('Failed to delete session:', error);
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    const cancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteConfirm(false);
    };

    const previewUrl = getPreviewUrl();
    const sessionName = session.name || `Session #${session.id.substring(0, 8)}`;

    return (
        <div className="group cursor-pointer transform transition-all duration-300 hover:-translate-y-1 relative">
            <Card className="overflow-hidden border-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm group-hover:shadow-xl transition-all duration-300 h-full flex flex-col p-0">
                <div
                    onClick={() => !isEditing && !showDeleteConfirm && onClick(session.id)}
                    className="relative aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800"
                >
                    {previewUrl ? (
                        <img
                            src={previewUrl}
                            alt={sessionName}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = ''; // Clear src on error
                                (e.target as HTMLImageElement).classList.add('hidden');
                            }}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10">
                            <div className="flex flex-col items-center gap-2 opacity-40">
                                <svg className="w-8 h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span className="text-xs font-medium">No preview</span>
                            </div>
                        </div>
                    )}

                    <div className="absolute top-3 left-3 flex gap-2">
                        <Badge
                            variant={
                                session.status === 'completed' ? 'default' :
                                    session.status === 'recording' ? 'warning' :
                                        'neutral'
                            }
                            className="backdrop-blur-md bg-white/80 dark:bg-zinc-900/80"
                        >
                            {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                        </Badge>
                    </div>

                    {/* Action buttons - show on hover */}
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={handleTitleClick}
                            className="w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-colors"
                            title="Edit title"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button
                            onClick={handleDelete}
                            className="w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                            title="Delete session"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>

                    {session.videoFilename && (
                        <div className="absolute bottom-3 right-3">
                            <div className="w-8 h-8 rounded-full bg-white/20 dark:bg-black/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-indigo-500 transition-colors duration-300">
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </div>
                        </div>
                    )}
                </div>

                <div
                    onClick={() => !isEditing && !showDeleteConfirm && onClick(session.id)}
                    className="p-4 flex flex-col flex-grow"
                >
                    <div className="flex justify-between items-start gap-2 mb-2">
                        {isEditing ? (
                            <input
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                onBlur={handleTitleBlur}
                                onKeyDown={handleTitleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 font-semibold text-[15px] bg-white dark:bg-zinc-800 border border-indigo-500 rounded px-2 py-1 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                                disabled={isUpdating}
                            />
                        ) : (
                            <h3 className="font-semibold text-[15px] truncate text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {sessionName}
                            </h3>
                        )}
                        <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">
                            {formatDate(date)}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            {session.config.initialUrl}
                        </span>
                    </div>

                    {session.description && (
                        <p className="mt-2 text-[13px] text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                            {session.description}
                        </p>
                    )}
                </div>
            </Card>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-xl flex items-center justify-center z-10"
                >
                    <div className="bg-white dark:bg-zinc-800 rounded-lg p-6 max-w-sm mx-4 shadow-2xl">
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                            Delete Session?
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                            This will permanently delete this session and all its files. This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={cancelDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Deleting...
                                    </>
                                ) : (
                                    'Delete'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
