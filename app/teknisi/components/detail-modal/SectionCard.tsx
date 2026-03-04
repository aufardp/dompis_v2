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
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-100 bg-white ${className}`}
    >
      {/* Section header */}
      <div
        className={`flex items-center gap-2.5 border-b border-slate-100 px-4 py-3 ${bgColorClasses[iconBgColor]}`}
      >
        <div className='flex h-7 w-7 items-center justify-center rounded-lg text-sm'>
          {icon}
        </div>
        <span className='text-[11px] font-black tracking-widest uppercase'>
          {title}
        </span>
      </div>
      {/* Section body */}
      <div className='px-4 py-3'>{children}</div>
    </div>
  );
}
