'use client';

import { AttendanceStatus } from '@/app/types/attendance';
import { formatTimeWIB } from '@/app/utils/datetime';

interface AttendanceBadgeProps {
  status: AttendanceStatus | 'ABSENT';
  check_in_at?: string | null;
  size?: 'sm' | 'md';
}

export default function AttendanceBadge(props: AttendanceBadgeProps) {
  const { status, check_in_at, size = 'md' } = props;
  const timeDisplay = check_in_at ? formatTimeWIB(check_in_at) : null;

  if (status === 'PRESENT') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-green-50 font-medium ${
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
        } text-green-600`}
      >
        <span className='h-2 w-2 rounded-full bg-green-500' />
        Hadir
        {timeDisplay && (
          <span className='text-green-500/70'> · {timeDisplay}</span>
        )}
      </span>
    );
  }

  if (status === 'LATE') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-amber-50 font-medium ${
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
        } text-amber-600`}
      >
        <span className='h-2 w-2 rounded-full bg-amber-500' />
        Terlambat
        {timeDisplay && (
          <span className='text-amber-500/70'> · {timeDisplay}</span>
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-red-50 font-medium ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      } text-red-600`}
    >
      <span className='relative flex h-2 w-2'>
        <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75' />
        <span className='relative inline-flex h-2 w-2 rounded-full bg-red-500' />
      </span>
      Belum Absen
    </span>
  );
}
