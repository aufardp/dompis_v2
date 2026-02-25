import { Check } from 'lucide-react';
import { Teknisi } from '@/app/types/teknisi';

interface Props {
  tech: Teknisi;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}

export default function TechnicianCard({
  tech,
  isSelected,
  isCurrent,
  onSelect,
}: Props) {
  return (
    <button
      type='button'
      onClick={onSelect}
      className={
        'group flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition focus:ring-2 focus:ring-blue-500/40 focus:outline-none ' +
        (isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:bg-gray-50')
      }
      aria-pressed={isSelected}
    >
      <div className='min-w-0'>
        <p className='truncate font-medium text-gray-900'>{tech.nama || '-'}</p>
        <p className='mt-0.5 text-xs text-gray-500'>NIK: {tech.nik || '-'}</p>
        {isCurrent && (
          <span className='mt-1.5 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700'>
            Currently assigned
          </span>
        )}
      </div>

      <div
        className={
          'mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border transition ' +
          (isSelected
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-gray-300 bg-white text-transparent group-hover:border-gray-400')
        }
        aria-hidden='true'
      >
        <Check size={14} />
      </div>
    </button>
  );
}
