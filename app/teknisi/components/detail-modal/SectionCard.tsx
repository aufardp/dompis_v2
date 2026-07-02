import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface SectionCardProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
  iconBgColor?: 'blue' | 'green' | 'purple' | 'orange' | 'slate';
}

const bgColorClasses: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  green: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400',
  purple:
    'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400',
  orange:
    'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
  slate: 'bg-(--surface-2) text-(--text-secondary)',
};

export default function SectionCard({
  title,
  icon: Icon,
  children,
  className = '',
  iconBgColor = 'slate',
}: SectionCardProps) {
  return (
    <div
      className={clsx(
        'overflow-hidden rounded-2xl border border-(--border) bg-(--surface)',
        className,
      )}
    >
      <div
        className={clsx(
          'flex items-center gap-2.5 border-b border-(--border) px-3.5 py-2.5',
          bgColorClasses[iconBgColor],
        )}
      >
        <div className='flex h-7 w-7 items-center justify-center rounded-lg'>
          <Icon size={15} />
        </div>
        <span className='text-[11px] font-semibold tracking-widest uppercase'>
          {title}
        </span>
      </div>
      <div className='px-3.5 py-3'>{children}</div>
    </div>
  );
}
