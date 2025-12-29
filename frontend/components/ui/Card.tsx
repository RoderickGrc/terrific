import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hoverable = false, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-6 transition-all duration-200 ${
        hoverable
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-black dark:hover:border-white hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};
