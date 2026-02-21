interface StatsCardProps {
  title: string;
  value: number | string;
  icon: string;
}

export default function StatsCard({ title, value, icon }: StatsCardProps) {
  return (
    <div className='flex items-center justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900'>
      <div>
        <p className='text-sm tracking-wider text-slate-500 uppercase'>
          {title}
        </p>
        <p className='mt-1 text-3xl font-bold'>{value}</p>
      </div>
      <span className='material-symbols-outlined text-2xl'>{icon}</span>
    </div>
  );
}
