'use client';

import { useMemo } from 'react';
import L from 'leaflet';
import { CircleMarker, Marker, Polyline, Tooltip } from 'react-leaflet';
import type { MeasureController } from './useMeasure';
import { MEASURE_COLORS, measureModeColor } from './useMeasure';
import CoordLink from './CoordLink';
import {
  type LatLng,
  formatDistanceKm,
  samplePolylineBetween,
} from '@/app/libs/warmap/measure';

function distanceLabelIcon(text: string, color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.35);border:1px solid #fff;">${text}</div>`,
  });
}

function estimateIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:${MEASURE_COLORS.estimatePoint};color:#fff;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);">⚡</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export default function MeasureLayer({ ctrl }: { ctrl: MeasureController }) {
  const modeColor = measureModeColor(ctrl.mode);
  const estimateCable = useMemo(
    () => ctrl.cableIndex.find((c) => c.id === ctrl.cableId) ?? null,
    [ctrl.cableIndex, ctrl.cableId],
  );

  const estimateRoute = useMemo<LatLng[] | null>(() => {
    if (!ctrl.estimate || !estimateCable) return null;
    return samplePolylineBetween(
      estimateCable.coords,
      estimateCable.cum,
      ctrl.estimate.referenceKm,
      ctrl.estimate.fromStartKm,
    );
  }, [ctrl.estimate, estimateCable]);

  const measurePositions = useMemo(() => {
    if (ctrl.mode === 'cable' && ctrl.cableRoute) {
      return ctrl.cableRoute.map(([lat, lng]) => [lat, lng] as LatLng);
    }
    return ctrl.vertices;
  }, [ctrl.mode, ctrl.cableRoute, ctrl.vertices]);

  if (!ctrl.active) return null;

  const dashed =
    ctrl.mode !== 'estimate' && !ctrl.finished && ctrl.vertices.length >= 1;

  return (
    <>
      {ctrl.mode !== 'estimate' && measurePositions.length >= 2 && (
        <Polyline
          positions={measurePositions}
          pathOptions={{
            color: modeColor,
            weight: 4,
            opacity: 0.9,
            dashArray: dashed ? '6 6' : undefined,
          }}
          interactive={false}
        />
      )}

      {ctrl.mode === 'cable' &&
        ctrl.vertices.length >= 2 &&
        ctrl.vertices.map((v, i) => (
          <Polyline
            key={`ms-conn-${i}`}
            positions={[ctrl.vertices[i], v]}
            pathOptions={{ color: modeColor, weight: 2, opacity: 0.55 }}
            interactive={false}
          />
        ))}

      {ctrl.mode !== 'estimate' &&
        ctrl.segmentLabels.map((s, i) => (
          <Marker
            key={`ms-label-${i}`}
            position={s.at}
            icon={distanceLabelIcon(formatDistanceKm(s.distKm), modeColor)}
            interactive={false}
            zIndexOffset={1000}
          />
        ))}

      {ctrl.mode !== 'estimate' && ctrl.vertices.length >= 1 && (
        <CircleMarker
          center={ctrl.vertices[0]}
          radius={9}
          pathOptions={{
            color: '#1e293b',
            weight: 2,
            opacity: 0.9,
            fill: false,
            fillOpacity: 0,
          }}
          interactive={false}
        />
      )}

      {ctrl.mode !== 'estimate' &&
        ctrl.vertices.map((v, i) => (
          <CircleMarker
            key={`ms-v-${i}`}
            center={v}
            radius={5}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillColor: modeColor,
              fillOpacity: 1,
            }}
            interactive={false}
          />
        ))}

      {ctrl.mode === 'estimate' && ctrl.reference && (
        <>
          <CircleMarker
            center={ctrl.reference}
            radius={6}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillColor: MEASURE_COLORS.estimateReference,
              fillOpacity: 1,
            }}
            interactive={false}
          >
            <Tooltip direction='top' opacity={1} interactive={false}>
              <span className='text-[10px] font-bold'>Referensi</span>
            </Tooltip>
          </CircleMarker>

          {estimateRoute && estimateRoute.length >= 2 && (
            <Polyline
              positions={estimateRoute}
              pathOptions={{
                color: MEASURE_COLORS.estimateRoute,
                weight: 3,
                opacity: 0.85,
                dashArray: '4 4',
              }}
              interactive={false}
            />
          )}

          {ctrl.estimate && (
            <Marker
              position={ctrl.estimate.point}
              icon={estimateIcon()}
              interactive={false}
              zIndexOffset={1100}
            >
              <Tooltip direction='top' offset={[0, -18]} opacity={1} interactive>
                <div className='w-52 space-y-0.5'>
                  <p className='text-[11px] font-bold text-red-700 dark:text-red-400'>
                    Estimasi titik putus
                  </p>
                  <p className='text-[10px] text-slate-600 dark:text-slate-300'>
                    {(
                      ctrl.direction === 'from_start'
                        ? ctrl.estimate.fromStartKm
                        : ctrl.estimate.fromReferenceKm
                    ).toLocaleString('id-ID', { maximumFractionDigits: 3 })}{' '}
                    km{' '}
                    {ctrl.direction === 'from_start'
                      ? 'dari awal kabel'
                      : 'dari referensi'}
                  </p>
                  <p className='text-[10px] text-slate-600 dark:text-slate-300'>
                    <CoordLink lat={ctrl.estimate.point[0]} lng={ctrl.estimate.point[1]} />
                  </p>
                  {ctrl.estimate.clamped && (
                    <p className='text-[10px] font-semibold text-amber-700 dark:text-amber-400'>
                      Di-clamp ke ujung kabel (jarak melebihi panjang kabel).
                    </p>
                  )}
                </div>
              </Tooltip>
            </Marker>
          )}
        </>
      )}
    </>
  );
}
