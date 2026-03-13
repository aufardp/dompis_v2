'use client';
import { useState, useEffect } from 'react';
import { getEffectiveTtrMs } from '@/app/libs/tickets/effective';

export type TtrStatus = 'overdue' | 'critical' | 'warning' | 'ok';

export interface TtrCountdown {
  label: string;       // e.g. "02j 34m" atau "-05j 12m" (overdue)
  status: TtrStatus;   // untuk warna badge
  isOverdue: boolean;
  msRemaining: number; // negatif jika overdue
}

export function computeTtrCountdown(ticket: any): TtrCountdown | null {
  const deadlineMs = getEffectiveTtrMs(ticket);
  if (!deadlineMs) return null;

  const now = Date.now();
  const diff = deadlineMs - now;
  const isOverdue = diff < 0;
  const abs = Math.abs(diff);

  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);

  const label = `${isOverdue ? '-' : ''}${h}j ${m}m`;

  // Status thresholds
  const status: TtrStatus = isOverdue
    ? 'overdue'
    : diff < 2 * 3_600_000       // < 2 jam
      ? 'critical'
      : diff < 6 * 3_600_000     // < 6 jam
        ? 'warning'
        : 'ok';

  return { label, status, isOverdue, msRemaining: diff };
}

// Hook versi live (re-render tiap menit)
export function useTtrCountdown(ticket: any): TtrCountdown | null {
  const [countdown, setCountdown] = useState(() => computeTtrCountdown(ticket));

  useEffect(() => {
    // Update setiap 60 detik
    const id = setInterval(() => {
      setCountdown(computeTtrCountdown(ticket));
    }, 60_000);
    return () => clearInterval(id);
  }, [ticket]);

  return countdown;
}
