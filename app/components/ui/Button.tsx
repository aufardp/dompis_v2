import { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'outline';
  className?: string;
}

export default function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonProps) {
  const base =
    'px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all';

  const variants = {
    primary: 'bg-primary text-white hover:bg-primary/90',
    outline:
      'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
