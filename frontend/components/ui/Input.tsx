import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: boolean;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-[13px] text-gray-500 dark:text-gray-400 mb-2">
          {label}
        </label>
      )}
      <input
        className={`w-full bg-transparent border rounded-lg px-4 py-3 text-[15px] text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all duration-200 focus:outline-none focus:border-black dark:focus:border-white focus:ring-4 focus:ring-black/5 dark:focus:ring-white/10 ${
          error 
            ? 'border-red-500 bg-red-500/5' 
            : 'border-border-light dark:border-border-dark'
        } disabled:bg-surface-light dark:disabled:bg-surface-dark disabled:text-gray-400 ${className}`}
        {...props}
      />
    </div>
  );
};
