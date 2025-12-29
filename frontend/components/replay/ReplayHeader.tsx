import React from 'react';
import { ChevronLeft, Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Session } from '../../types';

interface ReplayHeaderProps {
  session: Session;
  onBack: () => void;
  onExportContext?: () => void;
  onDelete?: () => void;
}

export const ReplayHeader: React.FC<ReplayHeaderProps> = ({ session, onBack, onExportContext, onDelete }) => {
  return (
    <header className="h-16 border-b border-white/5 bg-zinc-900/80 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 z-40 relative sticky top-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-[15px] tracking-tight text-white">{session.name}</h1>
            <Badge variant="success">Completed</Badge>
          </div>
          <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
            {session.id} • {new Date(session.startTime).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onExportContext}>
          <Download size={14} className="mr-2" /> Context
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete}>Delete</Button>
      </div>
    </header>
  );
};