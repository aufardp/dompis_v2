'use client';

import * as React from 'react';
import { cn } from '@/app/libs/utils';

type ButtonVariant = 'default' | 'outline' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'icon';

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(({ className, variant = 'default', size = 'default', ...props }, ref) => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-50';

  const variants: Record<ButtonVariant, string> = {
    default:
      'bg-blue-600 text-white hover:bg-blue-700 border border-blue-600/40',
    outline:
      'bg-surface text-(--text-primary) hover:bg-surface-2 border border-(--border)',
    ghost: 'text-(--text-secondary) hover:bg-surface-2',
  };

  const sizes: Record<ButtonSize, string> = {
    default: 'h-10 px-3.5 py-2',
    sm: 'h-9 px-3 py-2 text-xs',
    icon: 'h-10 w-10',
  };

  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
});

Button.displayName = 'Button';
