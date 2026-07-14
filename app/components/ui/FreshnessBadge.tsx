'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { useTicketEvents, BridgeFreshnessPayload } from '@/app/hooks/useTicketEvents';

export default function FreshnessBadge({
  resource,
}: {
  resource: 'nossa' | 'nossa_closed';
}) {
  const [freshness, setFreshness] = useState<BridgeFreshnessPayload | null>(null);

  useTicketEvents({
    onInvalidate: () => {},
    onBridgeFreshness: (payload) => {
      setFreshness(payload);
    },
  });

  if (!freshness) return null;

  const label = freshness.lagSeconds <= 60
    ? 'Tersinkron < 1 menit lalu'
    : `Tersinkron ${formatDistanceToNow(new Date(freshness.lastSyncedAt), { addSuffix: true, locale: id })}`;

  const isWarning = freshness.lagSeconds > 300;
  const isError = freshness.lagSeconds > 900;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        isError
          ? 'bg-red-50 text-red-700'
          : isWarning
            ? 'bg-amber-50 text-amber-700'
            : 'bg-emerald-50 text-emerald-700'
      }`}
      title={`Last synced: ${freshness.lastSyncedAt}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          isError ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
        }`}
      />
      {label}
    </span>
  );
}
