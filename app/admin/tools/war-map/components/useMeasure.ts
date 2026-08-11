'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import {
  type LatLng,
  distKm,
  cumulativeLengthsKm,
  distanceAlongPolylineAtPoint,
  pointAlongPolyline,
  samplePolylineBetween,
  polylineLengthKm,
  bearingDeg,
  buildCablesFromLines,
} from '@/app/libs/warmap/measure';

export type MeasureMode = 'line' | 'cable' | 'estimate';
export type MeasureDirection = 'from_start' | 'from_reference';

export const MEASURE_COLORS = {
  line: '#4f46e5',
  cable: '#0891b2',
  estimateReference: '#0d9488',
  estimateRoute: '#f97316',
  estimatePoint: '#dc2626',
} as const;

export function measureModeColor(mode: MeasureMode): string {
  if (mode === 'cable') return MEASURE_COLORS.cable;
  if (mode === 'estimate') return MEASURE_COLORS.estimateReference;
  return MEASURE_COLORS.line;
}

export interface SnapPoint {
  latitude: number;
  longitude: number;
}

export interface CableEntry {
  id: number;
  name: string;
  coords: LatLng[];
  cum: number[];
}

export interface MeasureSnap {
  point: LatLng;
  type: 'vertex' | 'cable' | 'raw';
  cableId: number | null;
  cableName: string | null;
  sAlong: number;
}

export interface MeasureSegment {
  a: LatLng;
  b: LatLng;
  distKm: number;
  cumulativeKm: number;
}

export interface EstimateResult {
  point: LatLng;
  fromStartKm: number;
  fromReferenceKm: number;
  toEndKm: number;
  totalKm: number;
  referenceKm: number;
  clamped: boolean;
  bearingDeg: number;
}

const SNAP_PX = 12;
export const MAX_MEASURE_VERTICES = 50;

/** Pilih titik snap terdekat (dalam radius pixel) terhadap klik user. */
export function snapToNetwork(
  latlng: LatLng,
  map: LeafletMap,
  cableIndex: CableEntry[],
  points: SnapPoint[],
  kmlPoints: SnapPoint[],
  requireCable: boolean,
): MeasureSnap {
  const click = map.latLngToContainerPoint(L.latLng(latlng[0], latlng[1]));
  let best: MeasureSnap = {
    point: latlng,
    type: 'raw',
    cableId: null,
    cableName: null,
    sAlong: 0,
  };
  let bestPx = Infinity;

  if (!requireCable) {
    const considerVertex = (p: SnapPoint) => {
      const cp = map.latLngToContainerPoint(L.latLng(p.latitude, p.longitude));
      const d = cp.distanceTo(click);
      if (d < SNAP_PX && d < bestPx) {
        bestPx = d;
        best = {
          point: [p.latitude, p.longitude],
          type: 'vertex',
          cableId: null,
          cableName: null,
          sAlong: 0,
        };
      }
    };
    for (const p of kmlPoints) considerVertex(p);
    for (const p of points) considerVertex(p);
  }

  for (const cable of cableIndex) {
    for (let i = 0; i < cable.coords.length - 1; i++) {
      const res = project(cable, i, latlng);
      const cp = map.latLngToContainerPoint(
        L.latLng(res.point[0], res.point[1]),
      );
      const d = cp.distanceTo(click);
      if (d < SNAP_PX && d < bestPx) {
        bestPx = d;
        best = {
          point: res.point,
          type: 'cable',
          cableId: cable.id,
          cableName: cable.name,
          sAlong: res.sAlong,
        };
      }
    }
  }

  return best;
}

function project(
  cable: CableEntry,
  i: number,
  p: LatLng,
): { point: LatLng; sAlong: number } {
  const a = cable.coords[i];
  const b = cable.coords[i + 1];
  const dLat = b[0] - a[0];
  const dLng = b[1] - a[1];
  const segLenKm = distKm(a, b);
  // parameterisasi linear di ruang lat/lng (sudah cukup untuk skala kecil)
  let t = 0;
  if (dLat !== 0 || dLng !== 0) {
    const dx = p[1] - a[1];
    const dy = p[0] - a[0];
    const dot = dx * dLng + dy * dLat;
    const lenSq = dLng * dLng + dLat * dLat;
    t = Math.max(0, Math.min(1, dot / lenSq));
  }
  const point: LatLng = [a[0] + t * dLat, a[1] + t * dLng];
  const sAlong =
    cable.cum[i] + (segLenKm === 0 ? 0 : t * (cable.cum[i + 1] - cable.cum[i]));
  return { point, sAlong };
}

interface MeasureVertex {
  point: LatLng;
  sAlong: number | null;
}

interface UseMeasureInput {
  kmlLines: {
    id: number;
    name: string;
    folderPath: string;
    sublayerId: number;
    coordinates: [number, number][];
  }[];
  points: SnapPoint[];
  kmlPoints: SnapPoint[];
}

export function useMeasure({ kmlLines, points, kmlPoints }: UseMeasureInput) {
  const [active, setActive] = useState(false);
  const [mode, setModeState] = useState<MeasureMode>('line');
  const [vertices, setVertices] = useState<MeasureVertex[]>([]);
  const [cableId, setCableId] = useState<number | null>(null);
  const [reference, setReference] = useState<LatLng | null>(null);
  const [estimateInput, setEstimateInput] = useState('');
  const [direction, setDirection] = useState<MeasureDirection>('from_start');
  const [hint, setHint] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const cableIndex = useMemo<CableEntry[]>(
    () =>
      buildCablesFromLines(kmlLines).map((c) => ({
        id: c.id,
        name: c.name,
        coords: c.coords,
        cum: cumulativeLengthsKm(c.coords),
      })),
    [kmlLines],
  );

  const cable = useMemo(
    () => cableIndex.find((c) => c.id === cableId) ?? null,
    [cableIndex, cableId],
  );

  const cableName = cable?.name ?? null;

  const resetMeasurement = useCallback(() => {
    setVertices([]);
    setCableId(null);
    setReference(null);
    setEstimateInput('');
    setDirection('from_start');
    setHint(null);
    setFinished(false);
  }, []);

  const deactivate = useCallback(() => {
    setActive(false);
    resetMeasurement();
  }, [resetMeasurement]);

  const toggle = useCallback(() => {
    setActive((v) => {
      if (v) resetMeasurement();
      return !v;
    });
  }, [resetMeasurement]);

  const setMode = useCallback(
    (m: MeasureMode) => {
      setModeState(m);
      setVertices([]);
      setCableId(null);
      setReference(null);
      setEstimateInput('');
      setHint(null);
      setFinished(false);
    },
    [],
  );

  const addPoint = useCallback(
    (snap: MeasureSnap) => {
      setFinished(false);
      if (mode === 'estimate') {
        if (snap.type !== 'cable' || snap.cableId === null) {
          setHint('Klik pada kabel untuk memilih referensi.');
          return;
        }
        setCableId(snap.cableId);
        setReference(snap.point);
        setHint(null);
        return;
      }

      if (mode === 'cable') {
        if (snap.type !== 'cable' || snap.cableId === null) {
          setHint('Klik pada kabel untuk mengukur sepanjang kabel.');
          return;
        }
        if (vertices.length >= MAX_MEASURE_VERTICES) {
          setHint(`Maksimum ${MAX_MEASURE_VERTICES} titik per pengukuran.`);
          return;
        }
        if (cableId !== null && snap.cableId !== cableId) {
          setCableId(snap.cableId);
          setVertices([{ point: snap.point, sAlong: snap.sAlong }]);
          setHint(null);
          return;
        }
        setCableId(snap.cableId);
        setVertices([...vertices, { point: snap.point, sAlong: snap.sAlong }]);
        setHint(null);
        return;
      }

      // mode garis lurus
      if (vertices.length >= MAX_MEASURE_VERTICES) {
        setHint(`Maksimum ${MAX_MEASURE_VERTICES} titik per pengukuran.`);
        return;
      }
      setVertices([...vertices, { point: snap.point, sAlong: null }]);
      setHint(null);
    },
    [mode, cableId, vertices],
  );

  const undo = useCallback(() => {
    setFinished(false);
    setVertices((prev) => prev.slice(0, -1));
    if (mode === 'estimate') {
      setReference(null);
      setEstimateInput('');
      setCableId(null);
    }
  }, [mode]);

  const clear = useCallback(() => {
    resetMeasurement();
  }, [resetMeasurement]);

  const finish = useCallback(() => {
    if (vertices.length >= 1) setFinished(true);
  }, [vertices.length]);

  const resume = useCallback(() => setFinished(false), []);

  const segments = useMemo<MeasureSegment[]>(() => {
    if (vertices.length < 2) return [];
    const out: MeasureSegment[] = [];
    let cum = 0;
    if (mode === 'cable' && cable) {
      for (let i = 1; i < vertices.length; i++) {
        const sA = vertices[i - 1].sAlong;
        const sB = vertices[i].sAlong;
        if (sA === null || sB === null) continue;
        const d = Math.abs(sB - sA);
        cum += d;
        out.push({
          a: vertices[i - 1].point,
          b: vertices[i].point,
          distKm: d,
          cumulativeKm: cum,
        });
      }
      return out;
    }
    for (let i = 1; i < vertices.length; i++) {
      const d = distKm(vertices[i - 1].point, vertices[i].point);
      cum += d;
      out.push({
        a: vertices[i - 1].point,
        b: vertices[i].point,
        distKm: d,
        cumulativeKm: cum,
      });
    }
    return out;
  }, [vertices, mode, cable]);

  const totalKm = useMemo(
    () => (segments.length > 0 ? segments[segments.length - 1].cumulativeKm : 0),
    [segments],
  );

  const segmentLabels = useMemo<
    { at: LatLng; distKm: number }[]
  >(() => {
    if (vertices.length < 2) return [];
    if (mode === 'cable' && cable) {
      const labels: { at: LatLng; distKm: number }[] = [];
      for (let i = 1; i < vertices.length; i++) {
        const sA = vertices[i - 1].sAlong;
        const sB = vertices[i].sAlong;
        if (sA === null || sB === null) continue;
        labels.push({
          at: pointAlongPolyline(cable.coords, cable.cum, (sA + sB) / 2),
          distKm: Math.abs(sB - sA),
        });
      }
      return labels;
    }
    return vertices.slice(1).map((v, i) => {
      const a = vertices[i].point;
      const b = v.point;
      return {
        at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as LatLng,
        distKm: distKm(a, b),
      };
    });
  }, [vertices, mode, cable]);

  const cableRoute = useMemo<LatLng[] | null>(() => {
    if (mode !== 'cable' || !cable || vertices.length < 2) return null;
    const sA = vertices[0].sAlong;
    const sB = vertices[vertices.length - 1].sAlong;
    if (sA === null || sB === null) return null;
    return samplePolylineBetween(cable.coords, cable.cum, sA, sB);
  }, [mode, cable, vertices]);

  const estimate = useMemo<EstimateResult | null>(() => {
    if (mode !== 'estimate' || !cable || reference === null) return null;
    const meters = Number.parseFloat(estimateInput);
    if (!Number.isFinite(meters) || meters < 0) return null;
    const totalKmV = polylineLengthKm(cable.coords);
    const refS = distanceAlongPolylineAtPoint(
      cable.coords,
      cable.cum,
      reference,
    );
    const targetKm =
      direction === 'from_start'
        ? meters / 1000
        : refS + meters / 1000;
    const clamped = targetKm > totalKmV;
    const t = Math.min(targetKm, totalKmV);
    const point = pointAlongPolyline(cable.coords, cable.cum, t);
    return {
      point,
      fromStartKm: t,
      fromReferenceKm: Math.abs(t - refS),
      toEndKm: totalKmV - t,
      totalKm: totalKmV,
      referenceKm: refS,
      clamped,
      bearingDeg: bearingDeg(reference, point),
    };
  }, [mode, cable, reference, estimateInput, direction]);

  const canEstimate =
    mode === 'estimate' && cable !== null && reference !== null;

  return {
    active,
    mode,
    finished,
    vertices: vertices.map((v) => v.point),
    cableId,
    cableName,
    reference,
    estimateInput,
    direction,
    hint,
    segments,
    totalKm,
    segmentLabels,
    cableRoute,
    estimate,
    canEstimate,
    cableIndex,
    toggle,
    deactivate,
    setMode,
    addPoint,
    undo,
    clear,
    finish,
    resume,
    setEstimateInput,
    setDirection,
    hasCables: cableIndex.length > 0,
  };
}

export type MeasureController = ReturnType<typeof useMeasure>;
