'use client';

interface TeknisiData {
  id_user: number;
  nama: string | null;
  nik: string | null;
  active_tickets: number;
}

interface PlotTeknisiModalProps {
  open: boolean;
  cluster: { id: number; name: string } | null;
  search: string;
  onSearchChange: (value: string) => void;
  selected: number[];
  teknisi: TeknisiData[];
  loading: boolean;
  onClose: () => void;
  onToggle: (teknisiId: number) => void;
  onSave: () => void;
  filteredTeknisi: TeknisiData[];
  getWorkloadLabel: (activeTickets: number) => { text: string; color: string };
  getWorkloadBadge: (activeTickets: number) => string;
  selectedDate: string;
}

export default function PlotTeknisiModal({
  open,
  cluster,
  search,
  onSearchChange,
  selected,
  teknisi,
  loading,
  onClose,
  onToggle,
  onSave,
  filteredTeknisi,
  getWorkloadLabel,
  getWorkloadBadge,
  selectedDate,
}: PlotTeknisiModalProps) {
  if (!open || !cluster) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <div className='bg-surface w-full max-w-lg rounded-2xl border border-(--border) shadow-xl'>
        <div className='flex items-center justify-between border-b border-(--border) px-5 py-4'>
          <div>
            <h3 className='text-lg font-semibold text-(--text-primary)'>
              Plot Teknisi — {cluster.name}
            </h3>
            <p className='text-xs text-(--text-secondary)'>
              {new Date(selectedDate).toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className='rounded-lg p-1 text-(--text-muted) hover:bg-white/5 hover:text-(--text-primary)'
          >
            <svg
              className='h-5 w-5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              strokeWidth={2}
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>

        <div className='max-h-96 overflow-y-auto px-5 py-4'>
          {selected.length > 0 && (
            <div className='mb-4'>
              <p className='mb-2 text-xs font-medium text-(--text-secondary)'>
                Teknisi terpilih:
              </p>
              <div className='flex flex-wrap gap-2'>
                {selected.map((tid) => {
                  const t = teknisi.find((x) => x.id_user === tid);
                  return (
                    <span
                      key={tid}
                      className='inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400'
                    >
                      {t?.nama || `#${tid}`}
                      <button
                        onClick={() => onToggle(tid)}
                        className='ml-0.5 hover:text-red-500'
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className='mb-3'>
            <input
              type='text'
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder='Cari nama atau NIK teknisi...'
              className='bg-surface-2 w-full rounded-lg border border-(--border) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500 focus:outline-none'
            />
          </div>

          {loading ? (
            <div className='space-y-2'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className='h-12 rounded-lg border border-(--border) bg-slate-100/70 dark:bg-slate-800/70'
                />
              ))}
            </div>
          ) : filteredTeknisi.length === 0 ? (
            <div className='py-8 text-center text-sm text-(--text-secondary)'>
              Tidak ada teknisi ditemukan
            </div>
          ) : (
            <div className='space-y-1'>
              {filteredTeknisi.map((t) => {
                const isSelected = selected.includes(t.id_user);
                const workload = getWorkloadLabel(t.active_tickets);
                const badge = getWorkloadBadge(t.active_tickets);
                return (
                  <label
                    key={t.id_user}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-(--border) hover:bg-white/5'
                    }`}
                  >
                    <div className='flex items-center gap-3'>
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isSelected && (
                          <svg
                            className='h-3 w-3 text-white'
                            fill='none'
                            viewBox='0 0 24 24'
                            stroke='currentColor'
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              d='M5 13l4 4L19 7'
                            />
                          </svg>
                        )}
                      </div>
                      <div>
                        <span className='text-sm font-medium text-(--text-primary)'>
                          {t.nama}
                        </span>
                        {t.nik && (
                          <p className='text-[10px] text-(--text-muted)'>
                            {t.nik}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}
                      >
                        {workload.text}
                      </span>
                      <span className='text-xs text-(--text-secondary)'>
                        {t.active_tickets} tiket
                      </span>
                    </div>
                    <input
                      type='checkbox'
                      checked={isSelected}
                      onChange={() => onToggle(t.id_user)}
                      className='sr-only'
                    />
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className='flex justify-end gap-2 border-t border-(--border) px-5 py-4'>
          <button
            onClick={onClose}
            className='rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-white/10'
          >
            Batal
          </button>
          <button
            onClick={onSave}
            disabled={loading}
            className='rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50'
          >
            {loading ? 'Menyimpan...' : 'Simpan Plot'}
          </button>
        </div>
      </div>
    </div>
  );
}
