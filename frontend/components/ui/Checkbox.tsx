import React from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, className = '', ...props }) => {
  return (
    <label className={`flex items-center cursor-pointer group ${className}`}>
      <div className="relative">
        <input
          type="checkbox"
          className="peer sr-only"
          {...props}
        />
        <div className="w-5 h-5 border-2 border-border-light dark:border-border-dark rounded transition-all duration-200 
          peer-checked:bg-black dark:peer-checked:bg-white 
          peer-checked:border-black dark:peer-checked:border-white 
          group-hover:border-black dark:group-hover:border-white
          group-hover:bg-surface-light dark:group-hover:bg-surface-dark
          peer-checked:group-hover:bg-black dark:peer-checked:group-hover:bg-white
          flex items-center justify-center">
          <Check className="w-3 h-3 text-white dark:text-black opacity-0 peer-checked:opacity-100 transition-opacity duration-200 stroke-[3px]" />
        </div>
      </div>
      {label && (
        <span className="ml-3 text-[15px] text-black dark:text-white select-none">
          {label}
        </span>
      )}
    </label>
  );
};
