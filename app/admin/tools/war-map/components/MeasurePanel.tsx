'use client';

import { useEffect, useRef, useState } from 'react';
import { Ruler, X, Undo2, RotateCcw, Check, GripHorizontal } from 'lucide-react';
import type { MeasureController } from './useMeasure';
import { measureModeColor } from './useMeasure';
import CoordLink from './CoordLink';
import type { MeasureDirection } from './useMeasure';
import { formatDistanceKm, formatDistanceMeters } from '@/app/libs/warmap/measure';

const MODE_OPTIONS: { value: 'line' | 'cable' | 'estimate'; label: string }[] = [
  { value: 'line', label: 'Garis Lurus' },
  { value: 'cable', label: 'Sepanjang Kabel' },
  { value: 'estimate', label: 'Estimasi Putus' },
];

export default function MeasurePanel({ ctrl }: { ctrl: MeasureController }) {
  const [input, setInput] = useState('');
  const [unit, setUnit] = useState<'m' | 'km'>('m');
  const modeColor = measureModeColor(ctrl.mode);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const panel = panelRef.current;
    if (!panel) return;
    const parent = panel.offsetParent as HTMLElement | null;
    if (!parent) return;
    const rect = panel.getBoundingClientRect();
    const pRect = parent.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left - pRect.left,
      startTop: rect.top - pRect.top,
    };
    setPos({ left: dragRef.current.startLeft, top: dragRef.current.startTop });
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel) return;
    const parent = panel.offsetParent as HTMLElement | null;
    if (!parent) return;
    const pRect = parent.getBoundingClientRect();
    const maxX = Math.max(0, pRect.width - panel.offsetWidth - 8);
    const maxY = Math.max(0, pRect.height - panel.offsetHeight - 8);
    setPos({
      left: Math.min(Math.max(0, drag.startLeft + (e.clientX - drag.startX)), maxX),
      top: Math.min(Math.max(0, drag.startTop + (e.clientY - drag.startY)), maxY),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  // sinkron saat hook me-reset input (clear/undo/ganti mode)
  useEffect(() => {
    if (ctrl.estimateInput === '') setInput('');
  }, [ctrl.estimateInput]);

  const applyInput = (raw: string, u: 'm' | 'km') => {
    setInput(raw);
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < 0) {
      ctrl.setEstimateInput('');
      return;
    }
    ctrl.setEstimateInput(String(u === 'km' ? n * 1000 : n));
  };

  return (
    <div
      ref={panelRef}
      className={`absolute z-1000 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-xl dark:border-indigo-500/25 dark:bg-slate-900 ${
        pos
          ? ''
          : 'bottom-20 left-1/2 -translate-x-1/2 lg:bottom-3'
      } ${dragging ? 'cursor-grabbing select-none' : ''}`}
      style={pos ? { left: pos.left, top: pos.top } : undefined}
    >
      {/* Header */}
      <div
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        className='flex cursor-grab touch-none items-center justify-between border-b px-3 py-2 select-none'
        style={{
          backgroundColor: `${modeColor}1a`,
          borderColor: `${modeColor}33`,
        }}
      >
        <p
          className='flex items-center gap-1.5 text-[11px] font-bold'
          style={{ color: modeColor }}
        >
          <GripHorizontal className='h-3.5 w-3.5 opacity-60' />
          <Ruler className='h-3.5 w-3.5' />
          Ukur Jarak
        </p>
        <button
          onClick={ctrl.deactivate}
          className='rounded-full p-1 transition hover:bg-black/5 dark:hover:bg-white/10'
          aria-label='Tutup alat ukur'
        >
          <X className='h-4 w-4' style={{ color: modeColor }} />
        </button>
      </div>

      {/* Mode */}
      <div className='flex gap-1.5 px-3 pt-2.5'>
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => ctrl.setMode(opt.value)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
              ctrl.mode === opt.value
                ? 'text-white'
                : 'border border-(--border) bg-(--surface) text-(--text-secondary) hover:bg-(--surface-2)'
            }`}
            style={ctrl.mode === opt.value ? { background: measureModeColor(opt.value) } : undefined}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className='max-h-[40dvh] space-y-2.5 overflow-y-auto px-3 py-2.5'>
        {ctrl.mode === 'estimate' ? (
          <EstimateSection ctrl={ctrl} input={input} unit={unit} applyInput={applyInput} setUnit={setUnit} setInput={setInput} />
        ) : (
          <>
            {ctrl.mode === 'cable' && (
              <p
                className='rounded-lg px-2 py-1.5 text-[10px] font-semibold'
                style={{
                  backgroundColor: `${modeColor}1a`,
                  color: modeColor,
                }}
              >
                {ctrl.cableName
                  ? `Kabel: ${ctrl.cableName}`
                  : 'Klik pada kabel untuk mengunci jalur pengukuran.'}
              </p>
            )}

            {ctrl.vertices.length >= 2 ? (
              <div className='space-y-1'>
                {ctrl.segments.map((s, i) => (
                  <div
                    key={i}
                    className='space-y-0.5 rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5'
                  >
                    <div className='flex items-center justify-between text-[10px] text-slate-500'>
                      <span>
                        Titik {i + 1} → {i + 2}
                      </span>
                      <span className='font-bold tabular-nums text-slate-700 dark:text-slate-200'>
                        {formatDistanceKm(s.distKm)}
                      </span>
                    </div>
                    <div className='text-[9px] text-slate-400'>
                      <CoordLink lat={s.b[0]} lng={s.b[1]} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className='text-[10px] text-slate-400'>
                Klik pada peta untuk menambah titik.
              </p>
            )}

            {ctrl.vertices.length >= 1 && (
              <div className='flex items-end justify-between border-t border-(--border) pt-2'>
                <div>
                  <p className='text-[9px] font-bold tracking-widest text-slate-400 uppercase'>
                    Total
                  </p>
                  <p className='text-lg font-extrabold text-indigo-600 tabular-nums dark:text-indigo-400'>
                    {formatDistanceKm(ctrl.totalKm)}
                  </p>
                </div>
                <div className='flex gap-1.5'>
                  <PanelButton onClick={ctrl.undo} disabled={ctrl.vertices.length === 0}>
                    <Undo2 className='h-3.5 w-3.5' />
                    Undo
                  </PanelButton>
                  <PanelButton onClick={ctrl.clear} disabled={ctrl.vertices.length === 0}>
                    <RotateCcw className='h-3.5 w-3.5' />
                    Clear
                  </PanelButton>
                  {ctrl.finished ? (
                    <PanelButton onClick={ctrl.resume} accent>
                      Lanjutkan
                    </PanelButton>
                  ) : (
                    <PanelButton onClick={ctrl.finish} disabled={ctrl.vertices.length === 0} accent>
                      <Check className='h-3.5 w-3.5' />
                      Selesai
                    </PanelButton>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {ctrl.hint && (
          <p className='rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'>
            {ctrl.hint}
          </p>
        )}
      </div>
    </div>
  );
}

function PanelButton({
  onClick,
  disabled,
  accent,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        accent
          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
          : 'border border-(--border) bg-(--surface) text-(--text-secondary) hover:bg-(--surface-2)'
      }`}
    >
      {children}
    </button>
  );
}

function EstimateSection({
  ctrl,
  input,
  unit,
  applyInput,
  setUnit,
  setInput,
}: {
  ctrl: MeasureController;
  input: string;
  unit: 'm' | 'km';
  applyInput: (raw: string, u: 'm' | 'km') => void;
  setUnit: (u: 'm' | 'km') => void;
  setInput: (s: string) => void;
}) {
  const est = ctrl.estimate;
  const modeColor = measureModeColor(ctrl.mode);
  const meters = Number.parseFloat(ctrl.estimateInput) || 0;
  return (
    <div className='space-y-2.5'>
      <p
        className='rounded-lg px-2 py-1.5 text-[10px] font-semibold'
        style={{
          backgroundColor: `${modeColor}1a`,
          color: modeColor,
        }}
      >
        {ctrl.cableName
          ? `Kabel: ${ctrl.cableName}`
          : 'Klik pada kabel untuk memilih kabel & titik referensi.'}
      </p>

      {ctrl.cableName && ctrl.reference && (
        <>
          <div className='flex items-center gap-1.5'>
            <input
              type='number'
              min={0}
              value={input}
              onChange={(e) => applyInput(e.target.value, unit)}
              placeholder='0'
              className='w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900'
            />
            <div className='flex shrink-0 overflow-hidden rounded-lg border border-(--border)'>
              {(['m', 'km'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => {
                    setUnit(u);
                    const meters = Number.parseFloat(ctrl.estimateInput);
                    if (Number.isFinite(meters) && meters >= 0) {
                      setInput(String(u === 'km' ? meters / 1000 : meters));
                      ctrl.setEstimateInput(String(meters));
                    }
                  }}
                  className={`px-2 py-1.5 text-[10px] font-bold uppercase ${
                    unit === u
                      ? 'bg-indigo-600 text-white'
                      : 'bg-(--surface) text-(--text-secondary)'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className='flex gap-1.5'>
            <DirectionChip
              label='Dari awal kabel'
              active={ctrl.direction === 'from_start'}
              onClick={() => ctrl.setDirection('from_start' as MeasureDirection)}
            />
            <DirectionChip
              label='Dari referensi → ODC'
              active={ctrl.direction === 'from_reference'}
              onClick={() => ctrl.setDirection('from_reference' as MeasureDirection)}
            />
          </div>

          {est ? (
            <div className='space-y-1 rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-500/25 dark:bg-red-500/10'>
              <p className='text-[10px] font-bold text-red-700 dark:text-red-400'>
                ⚡ Estimasi titik putus
              </p>
              <p className='text-[10px] text-slate-600 dark:text-slate-300'>
                {formatDistanceMeters(
                  (ctrl.direction === 'from_start'
                    ? est.fromStartKm
                    : est.fromReferenceKm) * 1000,
                )}{' '}
                {ctrl.direction === 'from_start' ? 'dari awal kabel' : 'dari referensi'}
              </p>
              <p className='text-[10px] text-slate-600 dark:text-slate-300'>
                Referensi:{' '}
                <span className='font-bold'>
                  {formatDistanceMeters(est.referenceKm * 1000)}
                </span>{' '}
                dari awal kabel
              </p>
              <p className='text-[10px] text-slate-600 dark:text-slate-300'>
                Koordinat: <CoordLink lat={est.point[0]} lng={est.point[1]} />
              </p>
              <p className='text-[10px] text-slate-500'>
                Sisa ke ujung kabel:{' '}
                <span className='font-bold'>{formatDistanceKm(est.toEndKm)}</span>{' '}
                · Panjang kabel: {formatDistanceKm(est.totalKm)}
              </p>
              {est.clamped && (
                <div className='space-y-0.5'>
                  <p className='text-[10px] font-semibold text-amber-700 dark:text-amber-400'>
                    Permintaan {formatDistanceMeters(meters)} · Panjang kabel{' '}
                    {formatDistanceKm(est.totalKm)} → titik di ujung kabel.
                  </p>
                  {ctrl.direction === 'from_reference' && (
                    <p className='text-[10px] font-semibold text-amber-700 dark:text-amber-400'>
                      Referensi berjarak{' '}
                      {formatDistanceKm(est.totalKm - est.referenceKm)} dari ujung
                      kabel — jarak tersisa tidak cukup.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className='text-[10px] text-slate-400'>
              Masukkan jarak untuk menandai titik putus.
            </p>
          )}

          <div className='flex items-end justify-between border-t border-(--border) pt-2'>
            <p className='text-[10px] text-slate-400'>
              Klik kabel lain untuk mengganti referensi.
            </p>
            <div className='flex gap-1.5'>
              <PanelButton onClick={ctrl.undo}>
                <RotateCcw className='h-3.5 w-3.5' />
                Reset
              </PanelButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DirectionChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'border border-(--border) bg-(--surface) text-(--text-secondary) hover:bg-(--surface-2)'
      }`}
    >
      {label}
    </button>
  );
}
