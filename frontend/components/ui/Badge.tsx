import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'neutral';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className = '' }) => {
  const styles = {
    default: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/10',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/10',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/10',
    error: 'bg-red-500/15 text-red-300 border-red-500/10',
    neutral: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-medium border ${styles[variant]} ${className}`}>
      {children}
    </span>
  );
};
