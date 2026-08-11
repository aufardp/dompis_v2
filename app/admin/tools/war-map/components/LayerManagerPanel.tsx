'use client';

import Link from 'next/link';
import { ChevronDown, Layers, MapPin, Cable, Plus, Trash2, Search, Eye, EyeOff } from 'lucide-react';
import type { KmlLayerItem } from '@/app/libs/kml/client-types';

interface LayerManagerPanelProps {
  layers: KmlLayerItem[];
  loading: boolean;
  error: string | null;
  canManage: boolean;
  expanded: number[];
  onToggleExpand: (id: number) => void;
  onDelete: (id: number) => void;
  sublayerVisible: Record<number, boolean>;
  onToggleSublayer: (sublayerId: number) => void;
  layerVisible: Record<number, boolean>;
  onToggleLayer: (id: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  odpAlertEnabled: boolean;
  onToggleOdpAlert: (value: boolean) => void;
  odpRadiusKm: number;
  onOdpRadiusKmChange: (value: number) => void;
  children?: React.ReactNode;
}

export default function LayerManagerPanel({
  layers,
  loading,
  error,
  canManage,
  expanded,
  onToggleExpand,
  onDelete,
  sublayerVisible,
  onToggleSublayer,
  layerVisible,
  onToggleLayer,
  search,
  onSearchChange,
  odpAlertEnabled,
  onToggleOdpAlert,
  odpRadiusKm,
  onOdpRadiusKmChange,
  children,
}: LayerManagerPanelProps) {
  const filtered = layers.filter((l) =>
    (l.title + ' ' + (l.workzoneTag ?? ''))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className='w-full space-y-3 rounded-2xl border border-(--border) bg-(--surface) p-3.5'>
      <div className='flex items-center justify-between'>
        <p className='text-[11px] font-bold tracking-widest text-(--text-tertiary) uppercase'>
          Skema KML
        </p>
        {canManage && (
          <Link
            href='/admin/tools/import-kml'
            className='inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white transition hover:bg-indigo-500'
          >
            <Plus className='h-3 w-3' />
            Tambah Skema
          </Link>
        )}
      </div>

      {layers.length > 1 && (
        <label className='relative block'>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-(--text-tertiary)' />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder='Cari skema...'
            className='w-full rounded-xl border border-(--border) bg-(--surface) py-2 pr-3 pl-8 text-[12px] font-medium text-(--text-primary) focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 focus:outline-none'
          />
        </label>
      )}

      <div className='rounded-xl border border-(--border) bg-(--surface) px-3 py-2.5'>
        <div className='flex items-center justify-between gap-2'>
          <div className='min-w-0'>
            <p className='text-[11px] font-bold text-(--text-primary)'>
              Peringatan ODP
            </p>
            <p className='text-[10px] text-(--text-tertiary)'>
              ODP dikelilingi gangguan
            </p>
          </div>
          <button
            type='button'
            role='switch'
            aria-checked={odpAlertEnabled}
            onClick={() => onToggleOdpAlert(!odpAlertEnabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              odpAlertEnabled ? 'bg-red-500' : 'bg-zinc-400 dark:bg-zinc-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                odpAlertEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        {odpAlertEnabled && (
          <div className='mt-2'>
            <label className='block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
              Radius Deteksi
            </label>
            <select
              value={odpRadiusKm}
              onChange={(e) => onOdpRadiusKmChange(Number(e.target.value))}
              className='mt-1 w-full rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5 text-[12px] font-semibold text-(--text-primary) focus:border-red-400 focus:ring-2 focus:ring-red-400/20 focus:outline-none'
            >
              <option value={0.1}>100 meter</option>
              <option value={0.05}>50 meter</option>
            </select>
          </div>
        )}
      </div>

      {loading && (
        <p className='py-2 text-[11px] text-(--text-muted)'>Memuat skema...</p>
      )}

      {!loading && error && (
        <p className='rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400'>
          {error}
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className='rounded-xl border border-dashed border-(--border) px-3 py-6 text-center'>
          <Layers className='mx-auto mb-2 h-5 w-5 text-(--text-tertiary)' />
          <p className='text-[11px] text-(--text-secondary)'>
            {layers.length === 0
              ? 'Belum ada skema KML. Import topologi ODC/ODP/kabel lewat Tools.'
              : 'Tidak ada skema cocok dengan pencarian.'}
          </p>
        </div>
      )}

      <div className='space-y-1.5'>
        {filtered.map((layer) => {
          const isOpen = expanded.includes(layer.id);
          const layerIsVisible = layerVisible[layer.id] ?? false;
          return (
            <div
              key={layer.id}
              className='overflow-hidden rounded-xl border border-(--border) bg-(--surface-2)'
            >
              <button
                type='button'
                onClick={() => onToggleExpand(layer.id)}
                className='flex w-full items-center gap-2 px-3 py-2 text-left'
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-(--text-tertiary) transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
                <div
                  className={`min-w-0 flex-1 ${layerIsVisible ? '' : 'opacity-50'}`}
                >
                  <p className='truncate text-[12px] font-bold text-(--text-primary)'>
                    {layer.title}
                  </p>
                  <p className='text-[10px] text-(--text-tertiary)'>
                    {layer.pointCount} titik · {layer.lineCount} kabel
                    {layer.workzoneTag ? ` · ${layer.workzoneTag}` : ''}
                  </p>
                </div>
                <span
                  role='button'
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLayer(layer.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      onToggleLayer(layer.id);
                    }
                  }}
                  className={`shrink-0 rounded-full p-1.5 transition ${
                    layerIsVisible
                      ? 'text-indigo-500 hover:bg-indigo-500/10'
                      : 'text-(--text-tertiary) hover:bg-indigo-500/10 hover:text-indigo-500'
                  }`}
                  title={layerIsVisible ? 'Sembunyikan skema' : 'Tampilkan skema'}
                >
                  {layerIsVisible ? (
                    <Eye className='h-3.5 w-3.5' />
                  ) : (
                    <EyeOff className='h-3.5 w-3.5' />
                  )}
                </span>
                {canManage && (
                  <span
                    role='button'
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(layer.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        onDelete(layer.id);
                      }
                    }}
                    className='shrink-0 rounded-full p-1.5 text-(--text-tertiary) transition hover:bg-red-500/10 hover:text-red-500'
                    title='Hapus skema'
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                  </span>
                )}
              </button>

              {isOpen && (
                <div
                  className={`space-y-1 border-t border-(--border) bg-(--surface) px-3 py-2 ${
                    layerIsVisible ? '' : 'opacity-60'
                  }`}
                >
                  {layer.sublayers.map((sub) => {
                    const visible = sublayerVisible[sub.id] ?? sub.defaultVisible;
                    return (
                      <label
                        key={sub.id}
                        className='flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-(--surface-2)'
                      >
                        <input
                          type='checkbox'
                          checked={visible}
                          onChange={() => onToggleSublayer(sub.id)}
                          className='h-3.5 w-3.5 accent-indigo-600'
                        />
                        {sub.geometryKind === 'point' ? (
                          <MapPin className='h-3.5 w-3.5 shrink-0 text-indigo-500' />
                        ) : (
                          <Cable className='h-3.5 w-3.5 shrink-0 text-emerald-500' />
                        )}
                        <span className='min-w-0 flex-1 truncate text-[11px] font-semibold text-(--text-secondary)'>
                          {sub.folderPath}
                        </span>
                        <span className='shrink-0 text-[10px] text-(--text-tertiary)'>
                          {sub.featureCount} fitur
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {children}
    </div>
  );
}
