'use client';

import { Ruler } from 'lucide-react';
import type { MeasureMode } from './useMeasure';
import { measureModeColor } from './useMeasure';

export default function MeasureTool({
  active,
  mode,
  onToggle,
}: {
  active: boolean;
  mode: MeasureMode;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title='Ukur jarak / estimasi titik putus'
      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[10px] font-bold shadow-sm transition ${
        active
          ? 'border-transparent text-white'
          : 'border-(--border) bg-(--surface) text-indigo-600 hover:bg-(--surface-2)'
      }`}
      style={active ? { background: measureModeColor(mode) } : undefined}
    >
      <Ruler size={13} />
    </button>
  );
}
