import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = '', ...props }) => {
    return (
        <div className="space-y-1.5 flex-1">
            {label && (
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400 ml-1">
                    {label}
                </label>
            )}
            <div className="relative group">
                <select
                    className={`
            w-full h-11 px-4 
            bg-white dark:bg-zinc-900 
            border border-zinc-200 dark:border-zinc-800 
            rounded-xl text-[15px]
            text-zinc-900 dark:text-zinc-100
            appearance-none cursor-pointer
            transition-all duration-200
            hover:border-indigo-500/50 dark:hover:border-indigo-500/50
            focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
                    {...props}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 group-hover:text-indigo-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
        </div>
    );
};
