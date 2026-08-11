'use client';

import { useCallback, useEffect } from 'react';
import L from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';
import type { MeasureController, SnapPoint } from './useMeasure';
import { snapToNetwork } from './useMeasure';
import type { LatLng } from '@/app/libs/warmap/measure';

export default function MeasureMapEvents({
  ctrl,
  points,
  kmlPoints,
}: {
  ctrl: MeasureController;
  points: SnapPoint[];
  kmlPoints: SnapPoint[];
}) {
  const map = useMap();

  const measuring = ctrl.active && !ctrl.finished;

  useEffect(() => {
    if (measuring) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
    return () => {
      map.doubleClickZoom.enable();
    };
  }, [measuring, map]);

  const handleClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!measuring) return;
      const latlng: LatLng = [e.latlng.lat, e.latlng.lng];
      const requireCable = ctrl.mode === 'cable' || ctrl.mode === 'estimate';
      const snap = snapToNetwork(
        latlng,
        map,
        ctrl.cableIndex,
        points,
        kmlPoints,
        requireCable,
      );
      ctrl.addPoint(snap);
    },
    [measuring, ctrl, map, points, kmlPoints],
  );

  const handleDblClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!ctrl.active) return;
      L.DomEvent.stopPropagation(e.originalEvent);
      ctrl.finish();
    },
    [ctrl],
  );

  useMapEvents({
    click: handleClick,
    dblclick: handleDblClick,
  });

  return null;
}
