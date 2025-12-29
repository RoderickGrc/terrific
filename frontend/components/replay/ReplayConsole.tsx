import React from 'react';
import { MessageSquare, Flag, Bug } from 'lucide-react';
import { EventType } from '../../types';

interface ReplayConsoleProps {
  noteInput: string;
  setNoteInput: (val: string) => void;
  onAddEvent: (type: EventType, message: string) => void;
}

export const ReplayConsole: React.FC<ReplayConsoleProps> = ({
  noteInput,
  setNoteInput,
  onAddEvent
}) => {
  return (
    <div className="px-8 pb-8">
      {/* Annotation Bar */}
      <div className="mt-6 flex gap-2">
        <div className="relative flex-1 group">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
            <MessageSquare size={14} />
          </div>
          <input 
            type="text" 
            placeholder="Add a comment, flag or bug report at this timestamp..." 
            className="w-full bg-zinc-900/50 border border-white/10 rounded-lg pl-9 pr-36 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => {
              if(e.key === 'Enter' && noteInput.trim()) {
                onAddEvent(EventType.NOTE, noteInput);
              }
            }}
          />
          <div className="absolute right-1.5 top-1.5 bottom-1.5 flex gap-1">
            <button 
              onClick={() => onAddEvent(EventType.NOTE, noteInput || "Note added")}
              className="px-2 hover:bg-white/10 rounded-md text-zinc-500 hover:text-white transition-colors text-xs font-medium"
              title="Add Note"
            >
              Add Note
            </button>
            <div className="w-px bg-white/10 my-1" />
            <button 
              onClick={() => onAddEvent(EventType.FLAG, noteInput || "Flagged")}
              className="px-2 hover:bg-amber-500/20 rounded-md text-zinc-500 hover:text-amber-400 transition-colors"
              title="Flag Issue"
            >
              <Flag size={14} />
            </button>
            <button 
              onClick={() => onAddEvent(EventType.BUG, noteInput || "Bug reported")}
              className="px-2 hover:bg-red-500/20 rounded-md text-zinc-500 hover:text-red-400 transition-colors"
              title="Report Bug"
            >
              <Bug size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};