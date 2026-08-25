'use client';

import { useMemo } from 'react';
import type { DurasiBucketKey, DurasiDetailTarget, DurasiPanelType } from './durasi-types';

interface SASummary {
  name: string;
  counts: number[];
}
interface PanelArea {
  name: string;
  region: string;
  sas: SASummary[];
}
interface PanelData {
  type: string;
  label: string;
  buckets: string[];
  areas: PanelArea[];
  totals: number[];
  grandTotal?: number;
}

interface DurasiHeatmapProps {
  panels: PanelData[];
  bucketKey: DurasiBucketKey;
  bucketLabel: string;
  onCellClick?: (target: DurasiDetailTarget) => void;
}

// Severity 0..1: rata-rata posisi tiket di skala bucket panel itu sendiri
// (0 = semua di bucket paling segar, 1 = semua di bucket paling lama/EXPIRED).
// Null berarti tidak ada tiket sama sekali — beda dari 0 (sehat), jadi
// dirender netral, bukan hijau.
function severity(counts: number[]): number | null {
  const total = counts.reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  const maxIndex = counts.length - 1;
  if (maxIndex <= 0) return 0;
  const weighted = counts.reduce((s, v, i) => s + v * i, 0);
  return weighted / total / maxIndex;
}

function severityColor(score: number | null): string {
  if (score === null) return 'bg-(--surface-2)';
  if (score < 0.2) return 'bg-emerald-500/80';
  if (score < 0.4) return 'bg-lime-500/80';
  if (score < 0.6) return 'bg-yellow-500/80';
  if (score < 0.8) return 'bg-orange-500/80';
  return 'bg-red-600/85';
}

function sumCounts(area: PanelArea, bucketCount: number): number[] {
  return area.sas.filter(Boolean).reduce(
    (acc, sa) => sa.counts.map((c, i) => acc[i] + c),
    new Array<number>(bucketCount).fill(0),
  );
}

export default function DurasiHeatmap({ panels, bucketKey, bucketLabel, onCellClick }: DurasiHeatmapProps) {
  const areaNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const panel of panels) {
      for (const area of panel.areas) {
        if (!seen.has(area.name)) {
          seen.add(area.name);
          names.push(area.name);
        }
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [panels]);

  if (panels.length === 0 || areaNames.length === 0) {
    return <div className="py-8 text-center text-sm text-(--text-muted)">Tidak ada tiket open</div>;
  }

  const panelAreaMap = panels.map((panel) => {
    const map = new Map<string, PanelArea>();
    for (const area of panel.areas) map.set(area.name, area);
    return map;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-[10px] sm:text-[11px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[90px] bg-(--surface) px-2 py-1 text-left font-semibold uppercase tracking-[0.14em] text-(--text-muted)">
              Area
            </th>
            {panels.map((panel) => (
              <th
                key={panel.type}
                className="min-w-[34px] px-1 py-1 text-center font-semibold text-(--text-muted)"
                title={panel.label}
              >
                <span className="block truncate">{panel.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {areaNames.map((areaName) => (
            <tr key={areaName}>
              <td className="sticky left-0 z-10 min-w-[90px] truncate bg-(--surface) px-2 py-1 font-medium text-(--text-primary)" title={areaName}>
                {areaName}
              </td>
              {panels.map((panel, panelIdx) => {
                const area = panelAreaMap[panelIdx].get(areaName);
                const counts = area ? sumCounts(area, panel.buckets.length) : new Array(panel.buckets.length).fill(0);
                const total = counts.reduce((s, v) => s + v, 0);
                const score = severity(counts);
                const worstBucketIndex = panel.buckets.length - 1;
                const clickable = total > 0 && Boolean(onCellClick);
                return (
                  <td key={panel.type} className="p-0">
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() =>
                        clickable &&
                        onCellClick?.({
                          bucket: bucketKey,
                          bucketLabel,
                          panelType: panel.type as DurasiPanelType,
                          panelLabel: panel.label,
                          area: areaName,
                          sa: null,
                          bucketIndex: worstBucketIndex,
                          bucketName: panel.buckets[worstBucketIndex] ?? '-',
                        })
                      }
                      title={`${panel.label} · ${areaName}: ${total} tiket`}
                      className={`h-5 w-full rounded sm:h-6 ${severityColor(score)} ${clickable ? 'cursor-pointer transition-transform hover:scale-110' : 'cursor-default'}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
