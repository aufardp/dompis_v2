interface AgeBadgeProps {
  bookingDate: string;
}

export default function AgeBadge({ bookingDate }: AgeBadgeProps) {
  const ms = Date.now() - new Date(bookingDate).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  const level = days > 15 ? 'hot' : days >= 7 ? 'warm' : 'ok';

  const levelClass = {
    hot: 'bg-red-400/20 text-red-400',
    warm: 'bg-amber-400/20 text-amber-400',
    ok: 'bg-emerald-400/20 text-emerald-400',
  }[level];

  return (
    <span
      className={`font-syne rounded-md px-2.5 py-0.5 text-[11px] font-bold ${levelClass}`}
    >
      {days}d {hours}h {minutes}m
    </span>
  );
}
