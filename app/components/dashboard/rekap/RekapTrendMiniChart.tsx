'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

type TrendDay = {
  date: string;
  masuk: number;
  close: number;
};

type SeriesKey = 'masuk' | 'close';

const SERIES_COLOR: Record<SeriesKey, string> = {
  masuk: '#3b82f6',
  close: '#10b981',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

function wibDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(dt);
}

function dayName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dt);
}

export default function RekapTrendMiniChart({
  bucket,
  branch,
}: {
  bucket?: string;
  branch?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.rekapWorkorderTrend(
      `${bucket || 'all'}:${branch || 'all'}`,
    ),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (bucket && bucket !== 'all') params.set('bucket', bucket);
      if (branch) params.set('branch', branch);
      const url = params.toString()
        ? `/api/dashboard/rekap-workorder/trend?${params.toString()}`
        : '/api/dashboard/rekap-workorder/trend';
      const res = await fetchWithAuth(url);
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Failed');
      return json.data as TrendDay[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const days = useMemo(() => data ?? [], [data]);
  const maxValue = useMemo(
    () => Math.max(1, ...days.map((d) => Math.max(d.masuk, d.close))) * 1.15,
    [days],
  );
  const totalMasuk = useMemo(
    () => days.reduce((s, d) => s + d.masuk, 0),
    [days],
  );
  const totalClose = useMemo(
    () => days.reduce((s, d) => s + d.close, 0),
    [days],
  );

  const n = days.length;
  const toY = useMemo(
    () => (v: number) => 100 - (v / maxValue) * 100,
    [maxValue],
  );
  const toX = useMemo(
    () => (i: number) => ((i + 0.5) / Math.max(1, n)) * 100,
    [n],
  );
  const linePoints = useMemo(
    () => (key: SeriesKey) =>
      days.map((d, i) => `${toX(i)},${toY(d[key])}`).join(' '),
    [days, toX, toY],
  );
  const areaPoints = useMemo(
    () => (key: SeriesKey) =>
      `${linePoints(key)} ${toX(n - 1)},100 ${toX(0)},100`,
    [linePoints, n, toX],
  );

  if (isLoading) {
    return <div className='h-20 animate-pulse rounded-xl bg-(--surface-2)' />;
  }

  if (days.length === 0) {
    return (
      <p className='text-[11px] text-(--text-muted)'>
        Belum ada data tren 7 hari.
      </p>
    );
  }

  return (
    <div>
      <div className='flex items-baseline gap-3'>
        <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase'>
          Tren 7 hari
        </p>
        <p className='flex items-baseline gap-2 text-[10px] text-(--text-muted)'>
          <span className='flex items-center gap-1'>
            <span className='h-1.5 w-1.5 rounded-full bg-blue-500' />
            <span className='font-mono font-semibold text-(--text-primary) tabular-nums'>
              {formatNumber(totalMasuk)}
            </span>
            Open
          </span>
          <span className='flex items-center gap-1'>
            <span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
            <span className='font-mono font-semibold text-(--text-primary) tabular-nums'>
              {formatNumber(totalClose)}
            </span>
            Close
          </span>
        </p>
      </div>

      <div className='mt-2'>
        <div
          role='img'
          aria-label={`Tren 7 hari — masuk ${formatNumber(totalMasuk)} · close ${formatNumber(totalClose)}`}
          className='relative h-16'
        >
          <svg
            className='absolute inset-0 h-full w-full'
            viewBox='0 0 100 100'
            preserveAspectRatio='none'
            aria-hidden='true'
          >
            <defs>
              <linearGradient id='trendMasukFill' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='0%' stopColor='#3b82f6' stopOpacity='0.18' />
                <stop offset='100%' stopColor='#3b82f6' stopOpacity='0' />
              </linearGradient>
              <linearGradient id='trendCloseFill' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='0%' stopColor='#10b981' stopOpacity='0.18' />
                <stop offset='100%' stopColor='#10b981' stopOpacity='0' />
              </linearGradient>
            </defs>

            {[25, 50, 75].map((gy) => (
              <line
                key={gy}
                x1='0'
                x2='100'
                y1={gy}
                y2={gy}
                stroke='rgba(148,163,184,0.14)'
                strokeDasharray='2 3'
                vectorEffect='non-scaling-stroke'
              />
            ))}

            <polygon points={areaPoints('close')} fill='url(#trendCloseFill)' />
            <polygon points={areaPoints('masuk')} fill='url(#trendMasukFill)' />

            <polyline
              points={linePoints('close')}
              fill='none'
              stroke={SERIES_COLOR.close}
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
              vectorEffect='non-scaling-stroke'
            />
            <polyline
              points={linePoints('masuk')}
              fill='none'
              stroke={SERIES_COLOR.masuk}
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
              vectorEffect='non-scaling-stroke'
            />
          </svg>

          <div className='absolute inset-0 grid grid-cols-7'>
            {days.map((day, i) => (
              <div key={day.date} className='relative'>
                {(['masuk', 'close'] as SeriesKey[]).map((key) => (
                  <span
                    key={key}
                    title={`${wibDayLabel(day.date)}, ${dayName(day.date)} — ${key} ${formatNumber(day[key])}`}
                    className='absolute h-1.5 w-1.5 rounded-full'
                    style={{
                      left: '50%',
                      top: `${toY(day[key])}%`,
                      transform: 'translate(-50%, -50%)',
                      background: SERIES_COLOR[key],
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className='mt-1 grid grid-cols-7'>
          {days.map((day) => (
            <span
              key={day.date}
              className='text-center text-[8px] font-semibold tracking-wide text-(--text-muted) uppercase'
            >
              {wibDayLabel(day.date)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
