import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'default' | 'icon'; // Added compatibility
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed tracking-tight";

  const variants = {
    // Apple Dark Mode Primary: White bg, Black text
    primary: "bg-white text-black hover:bg-zinc-200 shadow-sm border border-transparent",
    // Secondary: Dark Grey bg, White text
    secondary: "bg-zinc-800 text-white hover:bg-zinc-700 border border-white/5",
    // Outline: Transparent with subtle border
    outline: "bg-transparent border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white",
    // Ghost: No background
    ghost: "bg-transparent text-zinc-400 hover:text-white hover:bg-white/5",
    // Danger: Semantic red text or background
    danger: "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-[13px]",
    md: "px-4 py-2 text-[14px]",
    lg: "px-6 py-3 text-[15px]",
    default: "px-4 py-2 text-[14px]",
    icon: "p-2",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant as keyof typeof variants] || variants.primary} ${sizes[size as keyof typeof sizes] || sizes.md} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};
