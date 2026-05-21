'use client';

import Link from 'next/link';
import { ArrowLeft, Home } from 'lucide-react';

interface DashboardPageActionsProps {
  homeHref: string;
}

export default function DashboardPageActions({
  homeHref,
}: DashboardPageActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => history.back()}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali
      </button>
      <Link
        href={homeHref}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
      >
        <Home className="h-4 w-4" />
        Home
      </Link>
    </div>
  );
}

