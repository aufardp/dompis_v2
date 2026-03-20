interface SectionCardProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
  className?: string;
  iconBgColor?: 'blue' | 'green' | 'purple' | 'orange' | 'slate';
}

export default function SectionCard({
  title,
  icon = '📋',
  children,
  className = '',
  iconBgColor = 'slate',
}: SectionCardProps) {
  const bgColorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
    slate: 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {/* Section header */}
      <div
        className={`flex items-center gap-2.5 border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800 ${bgColorClasses[iconBgColor]}`}
      >
        <div className='flex h-7 w-7 items-center justify-center rounded-lg text-sm'>
          {icon}
        </div>
        <span className='text-[11px] font-black tracking-widest uppercase'>
          {title}
        </span>
      </div>
      {/* Section body */}
      <div className='px-3.5 py-3'>{children}</div>
    </div>
  );
}
