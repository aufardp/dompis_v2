const statusConfig = {
  // STATUS_UPDATE lowercase values (single source of truth)
  open: {
    label: 'Open',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-400',
  },
  assigned: {
    label: 'Assigned',
    dotClass: 'bg-blue-400',
    textClass: 'text-blue-400',
  },
  on_progress: {
    label: 'On Progress',
    dotClass: 'bg-cyan-400',
    textClass: 'text-cyan-400',
  },
  pending: {
    label: 'Pending',
    dotClass: 'bg-orange-400',
    textClass: 'text-orange-400',
  },
  closed: {
    label: 'Closed',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-400',
  },
  // Legacy/fallback values
  unassigned: {
    label: 'Unassigned',
    dotClass: 'bg-red-400',
    textClass: 'text-red-400',
  },
  picked_up: {
    label: 'Picked Up',
    dotClass: 'bg-blue-400',
    textClass: 'text-blue-400',
  },
  cancelled: {
    label: 'Cancelled',
    dotClass: 'bg-gray-400',
    textClass: 'text-gray-400',
  },
  close: {
    label: 'Closed',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-400',
  },
};

export default function StatusBadge({ status }: { status: string }) {
  const key = (status ?? '').trim().toLowerCase();
  const config = statusConfig[key as keyof typeof statusConfig] ?? {
    label: status || '-',
    dotClass: 'bg-[#6b7a99]',
    textClass: 'text-[#6b7a99]',
  };

  return (
    <span className='flex items-center gap-1.5 text-[11px]'>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dotClass}`}
      />
      <span className={config.textClass}>{config.label}</span>
    </span>
  );
}
