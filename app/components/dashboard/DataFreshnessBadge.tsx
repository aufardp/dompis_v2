'use client';

import { RefreshCw } from 'lucide-react';

interface DataFreshnessBadgeProps {
  generatedAt: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function parseGeneratedAt(value: string): Date | null {
  const direct = new Date(value);
  if (!isNaN(direct.getTime())) return direct;

  const match = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2})[.:](\d{2})[.:](\d{2})$/,
  );
  if (match) {
    const [, day, month, year, hour, minute, second] = match;
    const parsed = new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`,
    );
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function toWIB(value: string): string {
  const date = parseGeneratedAt(value);
  if (!date) return '-';

  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date);
  } catch { return '-'; }
}

function getFreshness(generatedAt: string): { color: string; warning: boolean } {
  const date = parseGeneratedAt(generatedAt);
  if (!date) return { color: 'bg-slate-400', warning: false };

  const ageMs = Date.now() - date.getTime();
  const ageMin = ageMs / 60_000;
  if (ageMin < 5) return { color: 'bg-emerald-500', warning: false };
  if (ageMin < 15) return { color: 'bg-amber-500', warning: true };
  return { color: 'bg-red-500', warning: true };
}

export default function DataFreshnessBadge({ generatedAt, onRefresh, isRefreshing }: DataFreshnessBadgeProps) {
  const freshness = getFreshness(generatedAt);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${freshness.color}`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${freshness.color}`} />
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {toWIB(generatedAt)} WIB
        </span>
        {freshness.warning && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            Data mungkin tidak terkini
          </span>
        )}
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      )}
    </div>
  );
}
