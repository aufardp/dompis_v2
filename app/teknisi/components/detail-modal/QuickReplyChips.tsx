'use client';

const QUICK_TEMPLATES = [
  'Ganti patchcord',
  'Bersihkan konektor',
  'Re-splicing kabel',
  'Restart ONT',
  'Ganti ONT',
  'Perbaikan sambungan longgar',
];

interface Props {
  onPick: (text: string) => void;
}

export default function QuickReplyChips({ onPick }: Props) {
  return (
    <div className='mb-2 flex flex-wrap gap-1.5'>
      {QUICK_TEMPLATES.map((t) => (
        <button
          key={t}
          type='button'
          onClick={() => onPick(t)}
          className='rounded-full border border-(--border) bg-(--surface-2) px-2.5 py-1 text-[11px] font-medium text-(--text-secondary) transition-colors hover:bg-(--surface-3) hover:text-(--text-primary)'
        >
          {t}
        </button>
      ))}
    </div>
  );
}
