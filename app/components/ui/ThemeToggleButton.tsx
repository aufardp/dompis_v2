'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/app/hooks/useTheme';

export default function ThemeToggleButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { isDark, toggle } = useTheme();
  const dim = size === 'md' ? 'h-9 w-9' : 'h-8 w-8';
  const icon = size === 'md' ? 18 : 15;
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`${dim} inline-flex items-center justify-center rounded-lg border border-(--border) bg-(--surface) text-(--text-secondary) transition-colors hover:bg-(--surface-2) hover:text-(--text-primary)`}
    >
      {isDark ? <Sun size={icon} /> : <Moon size={icon} />}
    </button>
  );
}
