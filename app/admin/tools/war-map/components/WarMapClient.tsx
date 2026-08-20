'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
  CircleMarker,
  Polyline,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Supercluster from 'supercluster';
import {
  Funnel,
  Layers,
  X,
  ExternalLink,
  ChevronDown,
  LocateFixed,
  Network,
} from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useWarMapFilterOptions } from '@/app/hooks/useDropdownOptions';
import { JENIS_TIKET_LIST } from '@/app/config/jenis-tiket';
import TicketDetailDrawer from '@/app/admin/components/dashboard/TicketDetailDrawer';
import type { PointFeature } from 'supercluster';
import type { KmlIconKey, KmlLayerItem } from '@/app/libs/kml/client-types';
import {
  computeOdpAlerts,
  DEFAULT_ODP_ALERT_OPTIONS,
  nearestOdp,
  type DisturbancePointLike,
  type OdpAlert,
  type OdpNearbyPoint,
} from '@/app/libs/kml/geo';
import LayerManagerPanel from './LayerManagerPanel';
import DeleteSchemaModal from './DeleteSchemaModal';
import MeasureTool from './MeasureTool';
import MeasurePanel from './MeasurePanel';
import MeasureLayer from './MeasureLayer';
import MeasureMapEvents from './MeasureMapEvents';
import { useMeasure } from './useMeasure';

export interface WarMapPoint {
  id: number;
  serviceNo: string;
  customerName: string | null;
  alamat: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  deviceName: string | null;
  barcodeDc: string | null;
  workzone: string | null;
  taggedCount: number;
  historyCount60d: number;
  isHot: boolean;
  updatedAt: string;
  lastTicket: {
    id: number;
    incident: string;
    statusUpdate: string | null;
    closedAt: string | null;
  } | null;
}

export interface WarMapHistoryItem {
  id: number;
  incident: string;
  serviceNo: string;
  customerName: string | null;
  alamat: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  deviceName: string | null;
  barcodeDc: string | null;
  workzone: string | null;
  source: string;
  taggedAt: string;
  technicianName: string | null;
  rca: string | null;
  subRca: string | null;
  descriptionSolution: string | null;
  closedAt: string | null;
}

export interface KmlPointFeature {
  id: number;
  name: string;
  folderPath: string;
  descriptionRaw: string | null;
  sublayerId: number;
  isOdc: boolean;
  iconKey: KmlIconKey;
  iconColor: string | null;
  iconScale: number | null;
  latitude: number;
  longitude: number;
}

export interface KmlLineFeature {
  id: number;
  name: string;
  folderPath: string;
  descriptionRaw: string | null;
  parsedMetadata: Record<string, string> | null;
  styleColor: string | null;
  lineColor: string | null;
  lineWidth: number | null;
  sublayerId: number;
  coordinates: [number, number][];
}

type PointFeatureProps = {
  properties: WarMapPoint;
};

const CLUSTER_RADIUS = 48;
const MIN_CLUSTER_ZOOM = 2;
const HOT_THRESHOLD = 3;

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'open', label: 'Open' },
  { value: 'on_progress', label: 'On Progress' },
  { value: 'pending', label: 'Pending' },
  { value: 'close', label: 'Closed' },
];

function formatDate(value?: string | null) {
  if (!value) return '-';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function maskName(name: string | null) {
  if (!name) return '-';
  const parts = name.trim().split(' ');
  const first = parts[0] ?? '';
  if (parts.length === 1) {
    return first.length <= 2 ? first : `${first.slice(0, 2)}***`;
  }
  return `${first} ${parts[1]?.charAt(0) ?? ''}***`;
}

// ── Marker icons ────────────────────────────────────────────────

function markerIcon(point: WarMapPoint) {
  const hot = point.isHot || point.historyCount60d >= HOT_THRESHOLD;
  const color = hot ? '#dc2626' : point.lastTicket ? '#2563eb' : '#059669';
  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:flex; align-items:center; justify-content:center;
        width:28px; height:28px; border-radius:50%;
        background:${color}; border:2.5px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
        font-size:11px; font-weight:700; color:white;
      ">${point.historyCount60d >= HOT_THRESHOLD ? point.historyCount60d : ''}</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function clusterIcon(count: number) {
  const size = count >= 100 ? 48 : count >= 50 ? 44 : 38;
  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:flex; align-items:center; justify-content:center;
        width:${size}px; height:${size}px; border-radius:50%;
        background:rgba(79,70,229,0.92); border:3px solid rgba(255,255,255,0.85);
        box-shadow:0 2px 10px rgba(0,0,0,0.4);
        font-size:13px; font-weight:800; color:white;
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Ikon KML — preservasi bentuk asli via SVG lokal (PRD §9.4)
// iconKey dipetakan dari IconStyle.Icon.href file asli (star/pushpin/dot/square/triangle).
// 'star' digambar sebagai paddle gaya Google (plate putih + bintang berwarna).
function kmlShapeSvg(key: NonNullable<KmlIconKey>, fill: string): string {
  const stroke = '#ffffff';
  switch (key) {
    case 'star':
      return `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="5.5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/><path d="M12 4.6l2 4.05 4.47.65-3.23 3.15.76 4.45L12 14.9 7.99 16.9l.76-4.45-3.23-3.15 4.47-.65z" fill="${fill}" stroke="#94a3b8" stroke-width="0.8" stroke-linejoin="round"/></svg>`;
    case 'pushpin':
      return `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M12 1.8a7.4 7.4 0 0 0-7.4 7.4c0 4.9 6.3 11.4 7 12.1a.55.55 0 0 0 .8 0c.7-.7 7-7.2 7-12.1A7.4 7.4 0 0 0 12 1.8zm0 4.4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/></svg>`;
    case 'square':
      return `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/></svg>`;
    case 'triangle':
      return `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.2l10 17.8H2z" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    case 'dot':
    default:
      return `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.4" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/></svg>`;
  }
}

function kmlIcon({
  iconKey,
  color,
  scale,
  isOdc,
  showLabel,
  label,
  alertTier,
}: {
  iconKey: KmlIconKey;
  color: string | null;
  scale: number | null;
  isOdc: boolean;
  showLabel?: boolean;
  label?: string;
  alertTier?: OdpAlert['tier'];
}) {
  const s = Math.min(Math.max(scale ?? 1, 0.5), 2.5);
  const size = Math.round(22 * s);
  const fallbackKey = isOdc ? 'triangle' : 'dot';
  const shape = iconKey ?? fallbackKey;
  const fill = color ?? (isOdc ? '#6366f1' : '#475569');
  const labelHeight = showLabel && label ? 17 : 0;
  const badgeColor = alertTier === 'critical' ? '#dc2626' : '#f59e0b';
  const badge = alertTier
    ? `<div style="position:absolute;top:-3px;right:-3px;width:14px;height:14px;">
         <span class="kml-alert-ping" style="background:${badgeColor};"></span>
         <span class="kml-alert-dot" style="top:3px;left:3px;right:3px;bottom:3px;background:${badgeColor};"></span>
       </div>`
    : '';
  const labelHtml =
    showLabel && label
      ? `<div class="kml-icon-label" style="top:${size + 1}px;">${escapeHtml(label)}</div>`
      : '';
  const totalH = size + labelHeight;
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${size}px;height:${totalH}px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35));">${kmlShapeSvg(shape, fill)}${badge}${labelHtml}</div>`,
    iconSize: [size, totalH],
    iconAnchor: [size / 2, labelHeight > 0 ? size / 2 : size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// ── Map events hook: sync bbox → parent ────────────────────────

function BboxReporter({
  onBboxChange,
  enabled = true,
  nonce = 0,
}: {
  onBboxChange: (
    bbox: { south: number; west: number; north: number; east: number },
    zoom: number,
  ) => void;
  enabled?: boolean;
  nonce?: number;
}) {
  const map = useMap();
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const report = useCallback(() => {
    if (!enabledRef.current) return;
    const bounds = map.getBounds();
    onBboxChange(
      {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      },
      map.getZoom(),
    );
  }, [map, onBboxChange]);

  useEffect(() => {
    report();
  }, [report]);

  // Dipakai jalur fallback (geolokasi ditolak/timeout): laporan viewport
  // otomatis setelah "hold" dilepas, tanpa menunggu moveend dari flyTo.
  useEffect(() => {
    if (enabled && nonce > 0) report();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  useMapEvents({
    moveend: report,
    zoomend: report,
  });

  return null;
}

// ── Cluster click helper ────────────────────────────────────────

function ZoomToCluster({
  cluster,
  onExpand,
  disabled,
}: {
  cluster: {
    latitude: number;
    longitude: number;
    count: number;
    expansionZoom: number;
  };
  onExpand: () => void;
  disabled?: boolean;
}) {
  const map = useMap();
  return (
    <Marker
      position={[cluster.latitude, cluster.longitude]}
      icon={clusterIcon(cluster.count)}
      interactive={!disabled}
      eventHandlers={
        disabled
          ? undefined
          : {
              click: () => {
                map.flyTo(
                  [cluster.latitude, cluster.longitude],
                  cluster.expansionZoom,
                  {
                    duration: 0.5,
                  },
                );
                onExpand();
              },
            }
      }
    />
  );
}

function NetworkFitter({
  bbox,
  nonce,
}: {
  bbox: {
    south: number;
    west: number;
    north: number;
    east: number;
  } | null;
  nonce: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!bbox || nonce === 0) return;
    map.fitBounds(
      [
        [bbox.south, bbox.west],
        [bbox.north, bbox.east],
      ],
      { padding: [36, 36] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);
  return null;
}

// Fokus presisi ke titik koordinat tunggal (mis. ODP saat alert diklik).
// setView menjamin peta memusat tepat ke koordinat sasaran di zoom tetap.
function PointFitter({
  lat,
  lng,
  seq,
  zoom = 16,
}: {
  lat: number | null;
  lng: number | null;
  seq: number;
  zoom?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (lat === null || lng === null || seq === 0) return;
    map.setView([lat, lng], zoom, { animate: true });
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const LOCATE_ZOOM = 13;

// Arahkan peta ke posisi user (geolokasi). Dipicu via seq agar identik
// dengan pola PointFitter/NetworkFitter (tidak memaksa re-render anak).
function LocateController({
  target,
  seq,
}: {
  target: { latitude: number; longitude: number } | null;
  seq: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target || seq === 0) return;
    map.flyTo([target.latitude, target.longitude], LOCATE_ZOOM, {
      duration: 0.8,
    });
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Penanda ODP terdekat dari lokasi user saat "Lihat jaringan" difokuskan.
// CircleMarker pulse (independen dari KmlPointMarker agar tidak mengganggu
// ikon ODP asli / alert tier).
function NearestOdpMarker({
  odpId,
  odpPoints,
}: {
  odpId: number | null;
  odpPoints: Array<{ id: number; latitude: number; longitude: number }>;
}) {
  if (!odpId) return null;
  const odp = odpPoints.find((p) => p.id === odpId);
  if (!odp) return null;
  return (
    <CircleMarker
      center={[odp.latitude, odp.longitude]}
      radius={14}
      pathOptions={{
        color: '#0891b2',
        weight: 3,
        fillColor: '#06b6d4',
        fillOpacity: 0.25,
        opacity: 0.9,
      }}
    />
  );
}

// ── Filter panel ────────────────────────────────────────────────

const BUCKET_OPTIONS = [
  { value: '', label: 'Semua Bucket' },
  { value: 'customer', label: 'Customer' },
  { value: 'proactive', label: 'Proactive' },
  { value: 'unspec', label: 'Unspec' },
];

// Jenis tiket yang valid dalam tiap bucket (sejalan dengan
// OPERATIONAL_BUCKET_DEFINITIONS.jenisTiket1Filter / channel).
// Semua bucket (kosong) → seluruh JENIS_TIKET_LIST.
const BUCKET_JENIS_KEYS: Record<string, readonly string[]> = {
  customer: [
    'reguler',
    'hvc',
    'datin',
    'non-datin',
    'tsel',
    'vpn-ip',
    'dwdm',
    'digital-spbu',
    'astinet',
    'metro-e',
    'indibiz',
    'reseller',
    'wifi-id',
    'sqm-ccan',
  ],
  proactive: ['sqm', 'sqm-ccan'],
  unspec: ['unspec', 'unspec-b2b'],
};

function FilterPanel({
  workzone,
  setWorkzone,
  area,
  setArea,
  status,
  setStatus,
  jenis,
  setJenis,
  bucket,
  setBucket,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  activeOnly,
  setActiveOnly,
  hotOnly,
  setHotOnly,
  showHistory,
  setShowHistory,
}: {
  workzone: string;
  setWorkzone: (v: string) => void;
  area: string;
  setArea: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  jenis: string;
  setJenis: (v: string) => void;
  bucket: string;
  setBucket: (v: string) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  activeOnly: boolean;
  setActiveOnly: (v: boolean) => void;
  hotOnly: boolean;
  setHotOnly: (v: boolean) => void;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
}) {
  const { workzones: workzoneOptions, areas: areaOptions } =
    useWarMapFilterOptions();

  return (
    <div className='w-full space-y-3 rounded-2xl border border-(--border) bg-(--surface) p-3.5'>
      <div className='flex items-center justify-between'>
        <p className='text-[11px] font-bold tracking-widest text-(--text-tertiary) uppercase'>
          Filter
        </p>
        <button
          onClick={() => {
            setWorkzone('');
            setArea('');
            setStatus('');
            setJenis('');
            setBucket('');
            setFromDate('');
            setToDate('');
            setActiveOnly(false);
            setHotOnly(false);
          }}
          className='text-[11px] font-bold text-blue-600 hover:underline'
        >
          Reset
        </button>
      </div>

      <label className='block'>
        <span className='mb-1 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
          Bucket
        </span>
        <select
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          className='w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-[13px] font-semibold text-(--text-primary) focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none'
        >
          {BUCKET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className='block'>
        <span className='mb-1 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
          Jenis Tiket
        </span>
        <select
          value={jenis}
          onChange={(e) => setJenis(e.target.value)}
          className='w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-[13px] font-semibold text-(--text-primary) focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none'
        >
          <option value=''>Semua Jenis</option>
          {JENIS_TIKET_LIST.filter(
            (j) =>
              !bucket ||
              !BUCKET_JENIS_KEYS[bucket] ||
              BUCKET_JENIS_KEYS[bucket].includes(j.key),
          ).map((j) => (
            <option key={j.key} value={j.key}>
              {j.label}
            </option>
          ))}
        </select>
      </label>

      <div className='grid gap-2.5'>
        <label className='block'>
          <span className='mb-1 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
            Workzone
          </span>
          <select
            value={workzone}
            onChange={(e) => setWorkzone(e.target.value)}
            className='w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-[13px] font-semibold text-(--text-primary) focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none'
          >
            <option value=''>Semua Workzone</option>
            {workzoneOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className='block'>
          <span className='mb-1 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
            Area
          </span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className='w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-[13px] font-semibold text-(--text-primary) focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none'
          >
            <option value=''>Semua Area</option>
            {areaOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className='block'>
          <span className='mb-1 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className='w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-[13px] font-semibold text-(--text-primary) focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none'
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className='grid grid-cols-2 gap-2'>
          <label className='block'>
            <span className='mb-1 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
              Dari
            </span>
            <input
              type='date'
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className='w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-[13px] font-semibold text-(--text-primary) focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none'
            />
          </label>
          <label className='block'>
            <span className='mb-1 block text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
              Sampai
            </span>
            <input
              type='date'
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className='w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-[13px] font-semibold text-(--text-primary) focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none'
            />
          </label>
        </div>

        <div className='flex flex-wrap gap-2'>
          <button
            onClick={() => setActiveOnly(!activeOnly)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
              activeOnly
                ? 'bg-blue-600 text-white'
                : 'border border-(--border) bg-(--surface) text-(--text-secondary) hover:bg-(--surface-2)'
            }`}
          >
            Hanya Gangguan Aktif
          </button>
          <button
            onClick={() => setHotOnly(!hotOnly)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
              hotOnly
                ? 'bg-red-600 text-white'
                : 'border border-(--border) bg-(--surface) text-(--text-secondary) hover:bg-(--surface-2)'
            }`}
          >
            Gangguan Berulang ({HOT_THRESHOLD}+/60hr)
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
              showHistory
                ? 'bg-indigo-600 text-white'
                : 'border border-(--border) bg-(--surface) text-(--text-secondary) hover:bg-(--surface-2)'
            }`}
          >
            Tampilkan Histori
          </button>
        </div>
      </div>
    </div>
  );
}

function coordsEqual(
  a: { south: number; west: number; north: number; east: number },
  b: { south: number; west: number; north: number; east: number },
) {
  return (
    Math.abs(a.south - b.south) < 1e-5 &&
    Math.abs(a.west - b.west) < 1e-5 &&
    Math.abs(a.north - b.north) < 1e-5 &&
    Math.abs(a.east - b.east) < 1e-5
  );
}

// Apakah bbox `a` berada di dalam area yang sudah dimuat `b`.
// Dipakai untuk skip refetch saat zoom-in / pan kecil (perf).
function isBboxContained(
  a: { south: number; west: number; north: number; east: number },
  b: {
    south: number;
    west: number;
    north: number;
    east: number;
  } | null,
): boolean {
  if (!b) return false;
  const e = 1e-4; // toleransi epsilon koordinat
  return (
    a.west >= b.west - e &&
    a.east <= b.east + e &&
    a.south >= b.south - e &&
    a.north <= b.north + e
  );
}

// ── KML feature rendering ───────────────────────────────────────

function KmlCoordsFooter({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  return (
    <div className='mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-white/5'>
      <span className='truncate font-mono text-[10px] font-semibold text-slate-600 dark:text-slate-300'>
        {latitude.toFixed(6)}, {longitude.toFixed(6)}
      </span>
      <a
        href={mapsUrl}
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-400'
      >
        <ExternalLink className='h-3 w-3' />
        Google Maps
      </a>
    </div>
  );
}

function KmlPointMarker({
  feature,
  layerTitle,
  showLabel,
  alert,
  measuring,
}: {
  feature: KmlPointFeature;
  layerTitle: string;
  showLabel: boolean;
  alert: OdpAlert | null;
  measuring?: boolean;
}) {
  const isOdc =
    feature.isOdc ||
    feature.name === layerTitle ||
    !feature.folderPath.includes(' > ');
  const zBase = isOdc ? 100 : 0;
  const icon = useMemo(
    () =>
      kmlIcon({
        iconKey: feature.iconKey,
        color: feature.iconColor,
        scale: feature.iconScale,
        isOdc,
        showLabel,
        label: feature.name,
        alertTier: alert?.tier,
      }),
    [
      feature.iconKey,
      feature.iconColor,
      feature.iconScale,
      feature.name,
      isOdc,
      showLabel,
      alert?.tier,
    ],
  );
  return (
    <Marker
      position={[feature.latitude, feature.longitude]}
      icon={icon}
      interactive={!measuring}
      zIndexOffset={alert ? (alert.tier === 'critical' ? 300 : 200) : zBase}
    >
      <Tooltip
        direction='top'
        offset={[0, -16]}
        opacity={1}
        interactive={false}
      >
        <span className='text-[11px] font-bold'>{feature.name}</span>
      </Tooltip>
      {!measuring &&
        (alert ? (
          <OdpAlertPopup
            alert={alert}
            isOdc={isOdc}
            folderPath={feature.folderPath}
            descriptionRaw={feature.descriptionRaw}
          />
        ) : (
          <Popup minWidth={240} maxWidth={300}>
            <div className='w-64 space-y-1.5'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-sm font-bold text-slate-900 dark:text-white'>
                  {feature.name}
                </p>
                <span className='shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-bold text-indigo-600'>
                  {isOdc ? 'ODC' : 'ODP'}
                </span>
              </div>
              <p className='text-[10px] font-semibold text-slate-400'>
                {feature.folderPath}
              </p>
              {feature.descriptionRaw && (
                <pre className='mt-2 max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[10px] leading-4 whitespace-pre-wrap text-slate-600 dark:bg-white/5 dark:text-slate-300'>
                  {feature.descriptionRaw}
                </pre>
              )}
              <KmlCoordsFooter
                latitude={feature.latitude}
                longitude={feature.longitude}
              />
            </div>
          </Popup>
        ))}
    </Marker>
  );
}

function OdpRows({ items }: { items: OdpNearbyPoint[] }) {
  return (
    <div className='max-h-40 overflow-auto'>
      {items.slice(0, 15).map((n, i) => (
        <div
          key={`${n.serviceNo}-${i}`}
          className={`flex items-start gap-2 px-2.5 py-1.5 text-[11px] ${
            i % 2 === 0
              ? 'bg-slate-50 dark:bg-white/5'
              : 'bg-white dark:bg-transparent'
          }`}
        >
          <span
            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
              n.status &&
              ['open', 'assigned', 'on_progress', 'pending'].includes(n.status)
                ? 'bg-red-500'
                : 'bg-slate-300 dark:bg-slate-600'
            }`}
          />
          <div className='min-w-0 flex-1'>
            <p className='truncate font-semibold text-slate-700 dark:text-slate-200'>
              {maskName(n.customerName)}
              {n.incident ? (
                <span className='ml-1 text-[10px] font-normal text-blue-500'>
                  {n.incident}
                </span>
              ) : null}
            </p>
            <p className='text-[10px] text-slate-400'>
              {n.serviceNo} · {n.distanceKm.toFixed(2)} km
              {n.status ? ` · ${n.status.replace('_', ' ')}` : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OdpSection({
  label,
  count,
  accent,
  items,
}: {
  label: string;
  count?: number;
  accent?: string;
  items: OdpNearbyPoint[];
}) {
  return (
    <div className='overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700'>
      <div className='flex items-center justify-between bg-slate-50 px-2.5 py-1.5 text-[9px] font-bold tracking-wide text-slate-400 uppercase dark:bg-white/5'>
        <span>{label}</span>
        {count !== undefined && items.length > 0 && (
          <span
            className='rounded-full px-1.5 py-0.5 text-[9px] font-bold'
            style={{
              background: `${accent ?? '#475569'}20`,
              color: accent ?? '#475569',
            }}
          >
            {count}
          </span>
        )}
      </div>
      <OdpRows items={items} />
    </div>
  );
}

function OdpAlertPopup({
  alert,
  isOdc,
  folderPath,
  descriptionRaw,
}: {
  alert: OdpAlert;
  isOdc: boolean;
  folderPath: string;
  descriptionRaw: string | null;
}) {
  const tierColor = alert.tier === 'critical' ? '#dc2626' : '#f59e0b';
  const attributedSet = useMemo(
    () => new Set(alert.attributed.map((a) => a.serviceNo)),
    [alert.attributed],
  );
  return (
    <Popup minWidth={300} maxWidth={380}>
      <div className='w-80 space-y-2.5'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-sm font-bold text-slate-900 dark:text-white'>
            {alert.name}
          </p>
          <span
            className='rounded-full px-2 py-0.5 text-[9px] font-bold text-white'
            style={{ background: tierColor }}
          >
            {alert.tier === 'critical' ? '⚠ BERISIKO' : 'WASPADA'}
          </span>
        </div>
        <p className='text-[10px] font-semibold text-slate-400'>{folderPath}</p>

        <div className='grid grid-cols-3 gap-1.5'>
          <div className='rounded-lg bg-slate-50 px-2 py-1.5 text-center dark:bg-white/5'>
            <p
              className='text-base font-extrabold tabular-nums'
              style={{ color: tierColor }}
            >
              {alert.totalPoints}
            </p>
            <p className='text-[9px] font-bold text-slate-400 uppercase'>
              Gangguan
            </p>
          </div>
          <div className='rounded-lg bg-blue-50 px-2 py-1.5 text-center dark:bg-blue-500/10'>
            <p className='text-base font-extrabold text-blue-600 tabular-nums dark:text-blue-400'>
              {alert.activeCount}
            </p>
            <p className='text-[9px] font-bold text-slate-400 uppercase'>
              Aktif
            </p>
          </div>
          <div className='rounded-lg bg-purple-50 px-2 py-1.5 text-center dark:bg-purple-500/10'>
            <p className='text-base font-extrabold text-purple-600 tabular-nums dark:text-purple-400'>
              {alert.hotCount}
            </p>
            <p className='text-[9px] font-bold text-slate-400 uppercase'>
              Berulang
            </p>
          </div>
        </div>

        {alert.attributed.length > 0 && (
          <OdpSection
            label={`Terdaftar pada ${isOdc ? 'ODC' : 'ODP'} ini (device_name)`}
            count={alert.attributed.length}
            accent={tierColor}
            items={alert.attributed}
          />
        )}

        {alert.nearby.filter((n) => !attributedSet.has(n.serviceNo)).length >
          0 && (
          <OdpSection
            label={`Gangguan di sekitar ${isOdc ? 'ODC' : 'ODP'} (radius)`}
            items={alert.nearby.filter((n) => !attributedSet.has(n.serviceNo))}
          />
        )}

        {descriptionRaw && (
          <pre className='max-h-24 overflow-auto rounded-lg bg-slate-50 p-2 text-[10px] leading-4 whitespace-pre-wrap text-slate-600 dark:bg-white/5 dark:text-slate-300'>
            {descriptionRaw}
          </pre>
        )}
        <p className='text-[10px] leading-4 text-amber-600 dark:text-amber-400'>
          {alert.totalPoints} titik gangguan terkait {isOdc ? 'ODC' : 'ODP'} ini
          (terdaftar pada {isOdc ? 'ODC' : 'ODP'} + dalam radius deteksi).
          Lakukan pengecekan berkoordinasi dengan tiket sekitar.
        </p>
        <KmlCoordsFooter
          latitude={alert.latitude}
          longitude={alert.longitude}
        />
      </div>
    </Popup>
  );
}

function KmlLinePolyline({
  feature,
  measuring,
}: {
  feature: KmlLineFeature;
  measuring?: boolean;
}) {
  const weight =
    feature.lineWidth != null ? Math.min(Math.max(feature.lineWidth, 1), 5) : 2;
  const color = feature.lineColor ?? feature.styleColor ?? '#94a3b8';
  return (
    <Polyline
      positions={feature.coordinates.map(([lng, lat]) => [lat, lng])}
      interactive={!measuring}
      pathOptions={{
        color,
        weight,
        opacity: 0.85,
      }}
      eventHandlers={
        measuring
          ? undefined
          : {
              mouseover: (e) => {
                e.target.setStyle({
                  weight: Math.min(weight + 1, 6),
                  opacity: 1,
                });
              },
              mouseout: (e) => {
                e.target.setStyle({ weight, opacity: 0.85 });
              },
            }
      }
    >
      <Tooltip sticky opacity={1} interactive={false}>
        <span className='text-[11px] font-bold'>{feature.name}</span>
      </Tooltip>
      {!measuring && (
        <Popup minWidth={260} maxWidth={320}>
          <div className='w-68 space-y-2'>
            <div className='flex items-center justify-between gap-2'>
              <p className='text-sm font-bold text-slate-900 dark:text-white'>
                {feature.name}
              </p>
              <span
                className='h-3 w-5 shrink-0 rounded-sm border border-slate-200 dark:border-slate-600'
                style={{ background: color }}
              />
            </div>
            <p className='text-[10px] font-semibold text-slate-400'>
              {feature.folderPath}
            </p>
            {feature.parsedMetadata && (
              <div className='overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700'>
                {Object.entries(feature.parsedMetadata).map(
                  ([key, value], i) => (
                    <div
                      key={key}
                      className={`flex items-start gap-2 px-2.5 py-1.5 text-[11px] ${
                        i % 2 === 0
                          ? 'bg-slate-50 dark:bg-white/5'
                          : 'bg-white dark:bg-transparent'
                      }`}
                    >
                      <span className='w-32 shrink-0 font-semibold text-slate-500 dark:text-slate-400'>
                        {key}
                      </span>
                      <span className='min-w-0 flex-1 text-slate-700 dark:text-slate-200'>
                        {value}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
            {!feature.parsedMetadata && feature.descriptionRaw && (
              <pre className='max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 text-[10px] leading-4 whitespace-pre-wrap text-slate-600 dark:bg-white/5 dark:text-slate-300'>
                {feature.descriptionRaw}
              </pre>
            )}
          </div>
        </Popup>
      )}
    </Polyline>
  );
}

// ── Bottom sheet mobile (PRD §9.3) ──────────────────────────────

type SheetTab = 'filter' | 'layer';

function MobileSheet({
  openTab,
  onClose,
  onTabChange,
  filterContent,
  layerContent,
}: {
  openTab: SheetTab | null;
  onClose: () => void;
  onTabChange: (tab: SheetTab) => void;
  filterContent: React.ReactNode;
  layerContent: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (openTab) setExpanded(false);
  }, [openTab]);

  if (!openTab) return null;

  return (
    <div className='fixed inset-0 z-1000 lg:hidden'>
      <div
        className='absolute inset-0 bg-black/40 backdrop-blur-[2px]'
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-(--surface) shadow-2xl transition-[height] duration-300 ${
          expanded ? 'h-[90dvh]' : 'h-[45dvh]'
        }`}
      >
        <div className='mx-auto mt-2.5 h-1 w-10 rounded-full bg-(--text-tertiary)/30' />
        <div className='flex shrink-0 items-center gap-2 border-b border-(--border) px-4 py-2'>
          <button
            onClick={() => onTabChange('filter')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
              openTab === 'filter'
                ? 'bg-blue-600 text-white'
                : 'text-(--text-secondary)'
            }`}
          >
            <Funnel className='h-3.5 w-3.5' />
            Filter
          </button>
          <button
            onClick={() => onTabChange('layer')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
              openTab === 'layer'
                ? 'bg-indigo-600 text-white'
                : 'text-(--text-secondary)'
            }`}
          >
            <Layers className='h-3.5 w-3.5' />
            Skema
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className='ml-auto rounded-full border border-(--border) px-3 py-1.5 text-[11px] font-semibold text-(--text-secondary)'
          >
            {expanded ? 'Ciutkan' : 'Perluas'}
          </button>
          <button
            onClick={onClose}
            className='rounded-full p-1.5 text-(--text-secondary) transition hover:bg-(--surface-2)'
            aria-label='Tutup'
          >
            <X className='h-4 w-4' />
          </button>
        </div>
        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-3'>
          {openTab === 'filter' ? filterContent : layerContent}
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────

export default function WarMapClient({
  defaultToLocation = false,
}: {
  defaultToLocation?: boolean;
}) {
  const [points, setPoints] = useState<WarMapPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<{
    bboxKey: string;
    workzone: string;
    area: string;
    status: string;
    jenis: string;
    bucket: string;
    fromDate: string;
    toDate: string;
    activeOnly: boolean;
    hotOnly: boolean;
  } | null>(null);

  const [bbox, setBbox] = useState<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  const [zoom, setZoom] = useState(11);

  const [workzone, setWorkzone] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('');
  const [jenis, setJenis] = useState('');
  const [bucket, setBucket] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [hotOnly, setHotOnly] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [selectedPoint, setSelectedPoint] = useState<WarMapPoint | null>(null);
  const [historyData, setHistoryData] = useState<WarMapHistoryItem[] | null>(
    null,
  );
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Tab switcher (desktop) & bottom sheet (mobile) ──
  const [desktopTab, setDesktopTab] = useState<'filter' | 'layer'>('filter');
  const [sheetTab, setSheetTab] = useState<SheetTab | null>(null);

  // ── KML layer state ──
  const [kmlLayers, setKmlLayers] = useState<KmlLayerItem[]>([]);
  const [kmlLoading, setKmlLoading] = useState(true);
  const [kmlError, setKmlError] = useState<string | null>(null);
  const [kmlCanManage, setKmlCanManage] = useState(false);
  const [kmlExpanded, setKmlExpanded] = useState<number[]>([]);
  const [kmlSearch, setKmlSearch] = useState('');
  // sublayerId -> visible (toggle aktif user)
  const [sublayerVisible, setSublayerVisible] = useState<
    Record<number, boolean>
  >({});
  // layerId -> visible (master view/hide per skema; default semua tersembunyi)
  const [layerVisible, setLayerVisible] = useState<Record<number, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    title: string;
    pointCount: number;
    lineCount: number;
  } | null>(null);
  const [kmlDeleting, setKmlDeleting] = useState(false);
  const [kmlPoints, setKmlPoints] = useState<KmlPointFeature[]>([]);
  const [kmlLines, setKmlLines] = useState<KmlLineFeature[]>([]);
  const [kmlFeaturesLoading, setKmlFeaturesLoading] = useState(false);

  // ── Alat ukur jarak & estimasi titik putus ──
  const measure = useMeasure({ kmlLines, points, kmlPoints });
  const measuring = measure.active && !measure.finished;

  const fetchIdRef = useRef(0);
  const bboxRef = useRef<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kmlFetchIdRef = useRef(0);

  // ── Geolokasi (auto-center saat buka + tombol "Lokasi Saya") ──
  const [myLocation, setMyLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locSeq, setLocSeq] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locNotice, setLocNotice] = useState<string | null>(null);
  // Paksa laporan viewport saat geolokasi dibatalkan (fallback fetch provinsi).
  const [bboxNonce, setBboxNonce] = useState(0);
  // Tahan laporan viewport (fetch awal) sampai geolokasi selesai,
  // agar tidak fetch satu provinsi dulu saat akan langsung pindah ke user.
  const holdBboxRef = useRef(defaultToLocation);
  // Highlight ODP terdekat saat "Lihat jaringan" difokuskan ke lokasi user.
  const [nearestOdpId, setNearestOdpId] = useState<number | null>(null);

  // Proses geolokasi bersama (dipakai auto-center & tombol).
  const locateToCurrent = useCallback(() => {
    if (locating) return;
    setLocNotice(null);
    setNearestOdpId(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocNotice('Geolokasi tidak didukung browser ini.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const loc = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setMyLocation(loc);
        setLocSeq((s) => s + 1);
      },
      () => {
        setLocating(false);
        setLocNotice(
          'Lokasi tidak dapat ditemukan. Periksa izin lokasi lalu coba lagi.',
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, [locating]);

  // Auto-center sekali saat map pertama dibuka (semua role, jika diaktifkan).
  useEffect(() => {
    if (!defaultToLocation) return;
    const timeout = setTimeout(() => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        holdBboxRef.current = false;
        setLocating(false);
        setBboxNonce((n) => n + 1);
        setLocNotice('Geolokasi tidak didukung browser ini.');
        return;
      }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          holdBboxRef.current = false;
          setLocating(false);
          const loc = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          setMyLocation(loc);
          setLocSeq((s) => s + 1);
        },
        () => {
          holdBboxRef.current = false;
          setLocating(false);
          setBboxNonce((n) => n + 1);
          setLocNotice(
            'Lokasi tidak dapat ditemukan. Gunakan tombol "Lokasi Saya".',
          );
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-hilangkan notifikasi lokasi.
  useEffect(() => {
    if (!locNotice) return;
    const t = setTimeout(() => setLocNotice(null), 5000);
    return () => clearTimeout(t);
  }, [locNotice]);

  // bbox yang benar-benar sudah dimuat (untuk skip refetch saat zoom-in).
  const loadedBboxRef = useRef<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  const loadingRef = useRef(false);
  const sseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtersKey = `${workzone}|${area}|${status}|${jenis}|${bucket}|${fromDate}|${toDate}|${activeOnly}|${hotOnly}`;

  const loadPoints = useCallback(
    async (
      currentBbox: {
        south: number;
        west: number;
        north: number;
        east: number;
      },
      opts?: { force?: boolean },
    ) => {
      setLoading(true);
      loadingRef.current = true;
      const id = ++fetchIdRef.current;
      try {
        const params = new URLSearchParams();
        params.set(
          'bbox',
          [
            currentBbox.south,
            currentBbox.west,
            currentBbox.north,
            currentBbox.east,
          ].join(','),
        );
        if (workzone) params.set('workzone', workzone);
        if (area) params.set('area', area);
        if (status) params.set('status', status);
        if (jenis) params.set('jenis', jenis);
        if (bucket) params.set('bucket', bucket);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        if (activeOnly) params.set('activeOnly', 'true');
        if (hotOnly) params.set('hotOnly', 'true');

        const res = await fetchWithAuth(
          `/api/war-map/points?${params.toString()}`,
        );
        if (!res || id !== fetchIdRef.current) return;
        const json = await res.json();
        if (id !== fetchIdRef.current) return;
        if (json?.success) {
          setPoints(json.data?.points ?? []);
          setError(null);
          loadedBboxRef.current = currentBbox;
        } else {
          setPoints([]);
          setError(json?.message ?? 'Gagal mengambil data titik');
        }
        setLastFetched({
          bboxKey: JSON.stringify(currentBbox),
          workzone,
          area,
          status,
          jenis,
          bucket,
          fromDate,
          toDate,
          activeOnly,
          hotOnly,
        });
      } catch {
        if (id === fetchIdRef.current) {
          setPoints([]);
          setError('Terjadi kesalahan saat memuat peta');
        }
      } finally {
        if (id === fetchIdRef.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    [
      workzone,
      area,
      status,
      jenis,
      bucket,
      fromDate,
      toDate,
      activeOnly,
      hotOnly,
    ],
  );

  const handleBboxChange = useCallback(
    (
      b: { south: number; west: number; north: number; east: number },
      z: number,
    ) => {
      const changed = !bboxRef.current || !coordsEqual(bboxRef.current, b);
      bboxRef.current = b;
      if (!changed) return;
      setBbox(b);
      setZoom(z);
    },
    [],
  );

  const bboxKey = bbox ? JSON.stringify(bbox) : null;

  // Reload gangguan saat bbox / filter berubah (debounced + coalesced)
  useEffect(() => {
    if (!bboxKey) return;
    const filtersChanged =
      lastFetched === null ||
      lastFetched.workzone !== workzone ||
      lastFetched.area !== area ||
      lastFetched.status !== status ||
      lastFetched.jenis !== jenis ||
      lastFetched.bucket !== bucket ||
      lastFetched.fromDate !== fromDate ||
      lastFetched.toDate !== toDate ||
      lastFetched.activeOnly !== activeOnly ||
      lastFetched.hotOnly !== hotOnly;
    const bboxChanged =
      lastFetched === null || lastFetched.bboxKey !== bboxKey;
    if (!filtersChanged && !bboxChanged) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const cur = bboxRef.current;
      if (!cur) return;
      // Zoom-in / pan kecil di dalam area yang sudah dimuat → pakai data memori,
      // tidak perlu refetch (klustering memakai points + zoom yang sudah ada).
      if (!filtersChanged && isBboxContained(cur, loadedBboxRef.current)) return;
      void loadPoints(cur);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bboxKey, filtersKey]);

  // Reset jenis jika pilihan jenis tidak valid di bucket yang sedang dipilih
  useEffect(() => {
    if (!bucket) return;
    const allowed = BUCKET_JENIS_KEYS[bucket];
    if (allowed && jenis && !allowed.includes(jenis)) {
      setJenis('');
    }
  }, [bucket, jenis]);

  // ── Load daftar layer KML ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setKmlLoading(true);
      try {
        const res = await fetchWithAuth('/api/war-map/kml-layers');
        if (!res || cancelled) return;
        const json = await res.json();
        if (cancelled) return;
        if (json?.success) {
          setKmlLayers(json.data?.layers ?? []);
          setKmlCanManage(Boolean(json.data?.canManage));
          const initialVisible: Record<number, boolean> = {};
          for (const layer of json.data?.layers ?? []) {
            for (const sub of layer.sublayers) {
              initialVisible[sub.id] = sub.defaultVisible;
            }
          }
          setSublayerVisible(initialVisible);
          setKmlError(null);
        } else {
          setKmlError(json?.message ?? 'Gagal memuat skema KML');
        }
      } catch {
        if (!cancelled) setKmlError('Terjadi kesalahan saat memuat skema KML');
      } finally {
        if (!cancelled) setKmlLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch fitur KML per bbox + sublayer aktif ──
  const visibleSublayerKey = useMemo(
    () =>
      kmlLayers
        .filter((l) => layerVisible[l.id])
        .flatMap((l) =>
          l.sublayers.filter((s) => sublayerVisible[s.id]).map((s) => s.id),
        )
        .sort((a, b) => a - b)
        .join(','),
    [kmlLayers, layerVisible, sublayerVisible],
  );

  useEffect(() => {
    if (!bboxKey) return;
    const hasVisible = kmlLayers.some(
      (l) =>
        layerVisible[l.id] && l.sublayers.some((s) => sublayerVisible[s.id]),
    );
    if (!hasVisible) {
      setKmlPoints([]);
      setKmlLines([]);
      return;
    }

    const id = ++kmlFetchIdRef.current;
    setKmlFeaturesLoading(true);

    const doFetch = async () => {
      const allPoints: KmlPointFeature[] = [];
      const allLines: KmlLineFeature[] = [];
      const viewport = bboxRef.current;
      try {
        for (const layer of kmlLayers) {
          if (!layerVisible[layer.id]) continue;
          const visibleSublayerIds = layer.sublayers
            .filter((s) => sublayerVisible[s.id])
            .map((s) => s.id);
          if (visibleSublayerIds.length === 0) continue;

          const params = new URLSearchParams();
          params.set('sublayer', visibleSublayerIds.join(','));
          if (viewport) {
            params.set(
              'bbox',
              [
                viewport.south,
                viewport.west,
                viewport.north,
                viewport.east,
              ].join(','),
            );
          }

          const res = await fetchWithAuth(
            `/api/war-map/kml-layers/${layer.id}/geojson?${params.toString()}`,
          );
          if (!res) continue;
          const json = await res.json();
          if (!json?.success) continue;

          for (const feature of json.data?.features ?? []) {
            const props = feature.properties;
            if (feature.geometry.type === 'Point') {
              const [lng, lat] = feature.geometry.coordinates;
              allPoints.push({
                id: props.id,
                name: props.name,
                folderPath: props.folderPath,
                descriptionRaw: props.descriptionRaw,
                sublayerId: props.sublayerId,
                isOdc: false,
                iconKey: props.iconKey ?? null,
                iconColor: props.iconColor ?? null,
                iconScale: props.iconScale ?? null,
                latitude: lat,
                longitude: lng,
              });
            } else if (feature.geometry.type === 'LineString') {
              allLines.push({
                id: props.id,
                name: props.name,
                folderPath: props.folderPath,
                descriptionRaw: props.descriptionRaw ?? null,
                parsedMetadata: props.parsedMetadata,
                styleColor: props.styleColor,
                lineColor: props.lineColor ?? null,
                lineWidth: props.lineWidth ?? null,
                sublayerId: props.sublayerId,
                coordinates: feature.geometry.coordinates,
              });
            }
          }
        }
      } catch {
        // fetch error — biarkan data lama
      } finally {
        if (id === kmlFetchIdRef.current) {
          setKmlPoints(allPoints);
          setKmlLines(allLines);
          setKmlFeaturesLoading(false);
        }
      }
    };

    void doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSublayerKey, kmlLayers, bboxKey]);

  const kmlLayerTitleById = useMemo(
    () => new Map(kmlLayers.map((l) => [l.id, l.title])),
    [kmlLayers],
  );
  const kmlSublayerLayerId = useMemo(() => {
    const map = new Map<number, number>();
    for (const layer of kmlLayers) {
      for (const sub of layer.sublayers) {
        map.set(sub.id, layer.id);
      }
    }
    return map;
  }, [kmlLayers]);

  // ── ODP alert (PRD §B) ──
  const [odpAlertEnabled, setOdpAlertEnabled] = useState(true);
  const [odpRadiusKm, setOdpRadiusKm] = useState(0.1);
  const [fitTarget, setFitTarget] = useState<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertFocus, setAlertFocus] = useState<{
    lat: number;
    lng: number;
    seq: number;
  } | null>(null);
  const alertsPanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!alertsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        alertsPanelRef.current &&
        !alertsPanelRef.current.contains(e.target as Node)
      ) {
        setAlertsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [alertsOpen]);

  const odpSublayerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const layer of kmlLayers) {
      for (const sub of layer.sublayers) {
        if (sub.geometryKind === 'point' && /^ODP\b/i.test(sub.folderPath)) {
          ids.add(sub.id);
        }
      }
    }
    return ids;
  }, [kmlLayers]);

  const odpPoints = useMemo(
    () =>
      kmlPoints
        .filter((p) => odpSublayerIds.has(p.sublayerId))
        .map((p) => ({
          id: p.id,
          name: p.name,
          latitude: p.latitude,
          longitude: p.longitude,
        })),
    [kmlPoints, odpSublayerIds],
  );

  const odpAlerts = useMemo<OdpAlert[]>(() => {
    if (!odpAlertEnabled) return [];
    if (odpPoints.length === 0 || points.length === 0) return [];
    const disturbances: DisturbancePointLike[] = points.map((p) => ({
      id: p.id,
      name: p.serviceNo,
      serviceNo: p.serviceNo,
      customerName: p.customerName,
      deviceName: p.deviceName,
      latitude: p.latitude,
      longitude: p.longitude,
      isHot: p.isHot,
      historyCount60d: p.historyCount60d,
      lastTicket: p.lastTicket
        ? {
            statusUpdate: p.lastTicket.statusUpdate,
            incident: p.lastTicket.incident,
          }
        : null,
    }));
    return computeOdpAlerts(odpPoints, disturbances, {
      radiusKm: odpRadiusKm,
      criticalCount: DEFAULT_ODP_ALERT_OPTIONS.criticalCount,
      warnCount: DEFAULT_ODP_ALERT_OPTIONS.warnCount,
    });
  }, [odpAlertEnabled, odpPoints, points, odpRadiusKm]);

  const odpAlertById = useMemo(() => {
    const m = new Map<number, OdpAlert>();
    for (const a of odpAlerts) m.set(a.odpId, a);
    return m;
  }, [odpAlerts]);

  const criticalCount = odpAlerts.filter((a) => a.tier === 'critical').length;
  const warningCount = odpAlerts.filter((a) => a.tier === 'warning').length;

  const primaryLayerBbox = useMemo(() => {
    const active = kmlLayers.find(
      (l) =>
        layerVisible[l.id] &&
        l.sublayers.some((s) => sublayerVisible[s.id] ?? s.defaultVisible),
    );
    return active?.bbox ?? kmlLayers[0]?.bbox ?? null;
  }, [kmlLayers, layerVisible, sublayerVisible]);

  // "Lihat jaringan": dengan lokasi user → fokus ke ODP + area jaringan
  // terdekat; tanpa lokasi → fit seluruh layer (perilaku lama).
  const handleViewNetwork = useCallback(() => {
    const fallback = () => {
      if (!primaryLayerBbox) return;
      setNearestOdpId(null);
      setFitTarget(primaryLayerBbox);
      setFitNonce((n) => n + 1);
    };
    if (!myLocation) {
      setLocNotice('Lokasi belum diketahui — menampilkan seluruh jaringan.');
      fallback();
      return;
    }
    const nearest = nearestOdp(myLocation, odpPoints);
    if (!nearest) {
      setLocNotice('Tidak ada ODP di sekitar lokasi — menampilkan seluruh jaringan.');
      fallback();
      return;
    }
    const { odp, distKm } = nearest;
    setNearestOdpId(odp.id);
    // Bbox ±1.5km di sekitar ODP — cukup tampak jaringan/kabel lokal tanpa
    // harus zoom-out ke seluruh provinsi.
    const latPad = 1.5 / 111;
    const lngPad = 1.5 / (111 * Math.cos((odp.latitude * Math.PI) / 180));
    setFitTarget({
      south: odp.latitude - latPad,
      west: odp.longitude - lngPad,
      north: odp.latitude + latPad,
      east: odp.longitude + lngPad,
    });
    setFitNonce((n) => n + 1);
    setLocNotice(
      distKm < 1
        ? `ODP terdekat: ${odp.name} (±${Math.round(distKm * 1000)} m)`
        : `ODP terdekat: ${odp.name} (±${distKm.toFixed(1)} km)`,
    );
  }, [myLocation, odpPoints, primaryLayerBbox]);

  const index = useMemo(() => {
    const sc = new Supercluster({
      radius: CLUSTER_RADIUS,
      minZoom: 0,
      maxZoom: 18,
      minPoints: 2,
    });
    const features: Array<PointFeature<WarMapPoint>> = points.map((p) => ({
      type: 'Feature',
      properties: p,
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
    }));
    sc.load(features);
    return sc;
  }, [points]);

  const clusters = useMemo(() => {
    if (!bbox) return [];
    return index.getClusters(
      [bbox.west, bbox.south, bbox.east, bbox.north],
      zoom,
    );
  }, [index, bbox, zoom]);

  // SSE: refresh titik saat ada tag baru (debounced agar burst tidak bikin jank)
  useEffect(() => {
    if (!bbox) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/tickets/events');
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as { type: string };
          if (event.type !== 'war-map:new-point') return;
          // Coalesce burst + jangan ganggu saat sedang memuat/mnegukur.
          if (loadingRef.current) return;
          if (sseDebounceRef.current) clearTimeout(sseDebounceRef.current);
          sseDebounceRef.current = setTimeout(() => {
            if (bboxRef.current && !loadingRef.current) {
              void loadPoints(bboxRef.current, { force: true });
            }
          }, 2000);
        } catch {
          /* ignore */
        }
      };
    } catch {
      // SSE tidak tersedia; fallback polling manual
    }
    return () => {
      if (es) es.close();
      if (sseDebounceRef.current) {
        clearTimeout(sseDebounceRef.current);
        sseDebounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, bbox !== null]);

  const handlePointSelect = useCallback((point: WarMapPoint) => {
    setSelectedPoint(point);
    setHistoryData(null);
    setHistoryLoading(true);
    (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/war-map/points/${point.id}/history`,
        );
        if (!res) return;
        const json = await res.json();
        if (json?.success) setHistoryData(json.data?.history ?? []);
      } catch {
        setHistoryData([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  // Detail ticket drawer (poin 4 PRD — link ke detail ticket)
  const [detailTicketId, setDetailTicketId] = useState<number | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<unknown>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const openDetail = useCallback((ticketId: number | null | undefined) => {
    if (!ticketId) return;
    setDrawerDetail(null);
    setDrawerError(null);
    setDetailTicketId(ticketId);
    setDrawerLoading(true);
    fetchWithAuth(`/api/tickets/${ticketId}/detail`)
      .then((res) => (res ? res.json().catch(() => null) : null))
      .then((data) => {
        if (!data) return;
        if (data.success) setDrawerDetail(data.data);
        else setDrawerError(data.message || 'Gagal memuat detail tiket');
      })
      .catch(() => setDrawerError('Terjadi kesalahan jaringan'))
      .finally(() => setDrawerLoading(false));
  }, []);

  const pointCount = points.length;

  const handleDeleteLayer = useCallback(
    (id: number) => {
      const l = kmlLayers.find((x) => x.id === id);
      setDeleteTarget(
        l
          ? {
              id: l.id,
              title: l.title,
              pointCount: l.pointCount,
              lineCount: l.lineCount,
            }
          : { id, title: '(tak dikenal)', pointCount: 0, lineCount: 0 },
      );
    },
    [kmlLayers],
  );

  const confirmDeleteSchema = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const layer = kmlLayers.find((l) => l.id === id);
    const sublayerIds = layer?.sublayers.map((s) => s.id) ?? [];
    setKmlDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/war-map/kml-layers/${id}`, {
        method: 'DELETE',
      });
      if (!res) return;
      const json = await res.json();
      if (json?.success) {
        setKmlLayers((prev) => prev.filter((l) => l.id !== id));
        setLayerVisible((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSublayerVisible((prev) => {
          const next = { ...prev };
          for (const sid of sublayerIds) delete next[sid];
          return next;
        });
        setKmlExpanded((prev) => prev.filter((x) => x !== id));
        setDeleteTarget(null);
      } else {
        alert(json?.message ?? 'Gagal menghapus skema');
      }
    } catch {
      alert('Terjadi kesalahan saat menghapus skema');
    } finally {
      setKmlDeleting(false);
    }
  }, [deleteTarget, kmlLayers]);

  const toggleExpand = useCallback((id: number) => {
    setKmlExpanded((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleSublayer = useCallback((sublayerId: number) => {
    setSublayerVisible((prev) => ({
      ...prev,
      [sublayerId]: !prev[sublayerId],
    }));
  }, []);

  const toggleLayer = useCallback((id: number) => {
    setLayerVisible((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));
  }, []);

  const desktopPanel = (
    <>
      <div className='flex items-center gap-1 rounded-2xl border border-(--border) bg-(--surface) p-1'>
        <button
          onClick={() => setDesktopTab('filter')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-colors ${
            desktopTab === 'filter'
              ? 'bg-blue-600 text-white'
              : 'text-(--text-secondary) hover:bg-(--surface-2)'
          }`}
        >
          <Funnel className='h-3.5 w-3.5' />
          Filter
        </button>
        <button
          onClick={() => setDesktopTab('layer')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-colors ${
            desktopTab === 'layer'
              ? 'bg-indigo-600 text-white'
              : 'text-(--text-secondary) hover:bg-(--surface-2)'
          }`}
        >
          <Layers className='h-3.5 w-3.5' />
          Skema
        </button>
      </div>

      {desktopTab === 'filter' ? (
        <FilterPanel
          workzone={workzone}
          setWorkzone={setWorkzone}
          area={area}
          setArea={setArea}
          status={status}
          setStatus={setStatus}
          jenis={jenis}
          setJenis={setJenis}
          bucket={bucket}
          setBucket={setBucket}
          fromDate={fromDate}
          setFromDate={setFromDate}
          toDate={toDate}
          setToDate={setToDate}
          activeOnly={activeOnly}
          setActiveOnly={setActiveOnly}
          hotOnly={hotOnly}
          setHotOnly={setHotOnly}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
        />
      ) : (
        <LayerManagerPanel
          layers={kmlLayers}
          loading={kmlLoading}
          error={kmlError}
          canManage={kmlCanManage}
          expanded={kmlExpanded}
          onToggleExpand={toggleExpand}
          onDelete={handleDeleteLayer}
          sublayerVisible={sublayerVisible}
          onToggleSublayer={toggleSublayer}
          layerVisible={layerVisible}
          onToggleLayer={toggleLayer}
          search={kmlSearch}
          onSearchChange={setKmlSearch}
          odpAlertEnabled={odpAlertEnabled}
          onToggleOdpAlert={setOdpAlertEnabled}
          odpRadiusKm={odpRadiusKm}
          onOdpRadiusKmChange={setOdpRadiusKm}
        />
      )}
    </>
  );

  const mobileFilterContent = (
    <FilterPanel
      workzone={workzone}
      setWorkzone={setWorkzone}
      area={area}
      setArea={setArea}
      status={status}
      setStatus={setStatus}
      jenis={jenis}
      setJenis={setJenis}
      bucket={bucket}
      setBucket={setBucket}
      fromDate={fromDate}
      setFromDate={setFromDate}
      toDate={toDate}
      setToDate={setToDate}
      activeOnly={activeOnly}
      setActiveOnly={setActiveOnly}
      hotOnly={hotOnly}
      setHotOnly={setHotOnly}
      showHistory={showHistory}
      setShowHistory={setShowHistory}
    />
  );

  const mobileLayerContent = (
    <LayerManagerPanel
      layers={kmlLayers}
      loading={kmlLoading}
      error={kmlError}
      canManage={kmlCanManage}
      expanded={kmlExpanded}
      onToggleExpand={toggleExpand}
      onDelete={handleDeleteLayer}
      sublayerVisible={sublayerVisible}
      onToggleSublayer={toggleSublayer}
      layerVisible={layerVisible}
      onToggleLayer={toggleLayer}
      search={kmlSearch}
      onSearchChange={setKmlSearch}
      odpAlertEnabled={odpAlertEnabled}
      onToggleOdpAlert={setOdpAlertEnabled}
      odpRadiusKm={odpRadiusKm}
      onOdpRadiusKmChange={setOdpRadiusKm}
    />
  );

  return (
    <>
      <div className='relative'>
        {/* Layout responsive: desktop = grid sidebar+map, mobile = full-screen map */}
        <div className='grid gap-3 lg:grid-cols-[300px_1fr]'>
          {/* Kolom kiri — desktop */}
          <div className='hidden lg:block'>
            {desktopPanel}

            <div className='mt-3 rounded-2xl border border-(--border) bg-(--surface) p-3.5'>
              <div className='flex items-center justify-between'>
                <p className='text-[11px] font-bold tracking-widest text-(--text-tertiary) uppercase'>
                  Statistik
                </p>
                {loading && (
                  <span className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600' />
                )}
              </div>
              <div className='mt-2 grid grid-cols-2 gap-2'>
                <div className='rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5'>
                  <p className='text-[10px] font-bold tracking-wide text-slate-400 uppercase'>
                    Titik
                  </p>
                  <p className='text-xl font-bold text-slate-900 tabular-nums dark:text-white'>
                    {pointCount}
                  </p>
                </div>
                <div className='rounded-xl bg-red-50 px-3 py-2.5 dark:bg-red-500/10'>
                  <p className='text-[10px] font-bold tracking-wide text-red-400 uppercase'>
                    Berulang
                  </p>
                  <p className='text-xl font-bold text-red-600 tabular-nums dark:text-red-400'>
                    {points.filter((p) => p.isHot).length}
                  </p>
                </div>
              </div>
              <p className='mt-2 text-[10px] text-slate-400'>
                Terakhir diperbarui: {formatDate(new Date().toISOString())}
              </p>
            </div>
          </div>

          {/* Peta */}
          <div className='relative'>
            <div className='relative z-0 h-[calc(100dvh-220px)] min-h-120 overflow-hidden rounded-2xl border border-(--border)'>
              {error && (
                <div className='absolute top-3 left-3 z-1000 max-w-sm rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400'>
                  {error}
                </div>
              )}
              {kmlFeaturesLoading && kmlLayers.length > 0 && (
                <div className='absolute top-3 right-3 z-1000 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-600 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-400'>
                  <span className='h-3 w-3 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600' />
                  Memuat skema...
                </div>
              )}

              {/* Fit-network (PRD §A4) — kiri atas, di bawah zoom control topleft */}
              <div className='absolute top-21.5 left-3 z-1000 flex flex-col items-start gap-1.5'>
                <button
                  type='button'
                  onClick={locateToCurrent}
                  disabled={locating}
                  className='flex items-center gap-1.5 rounded-xl border border-(--border) bg-(--surface) px-2.5 py-1 text-[10px] font-bold text-blue-600 shadow-sm transition hover:bg-(--surface-2) disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {locating ? (
                    <span className='h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600' />
                  ) : (
                    <LocateFixed size={13} />
                  )}
                  {locating ? 'Mencari lokasi...' : 'Lokasi Saya'}
                </button>
                {kmlLayers.length > 0 && primaryLayerBbox && (
                  <button
                    onClick={handleViewNetwork}
                    disabled={locating}
                    className='flex items-center gap-1.5 rounded-xl border border-(--border) bg-(--surface) px-2.5 py-1 text-[10px] font-bold text-indigo-600 shadow-sm transition hover:bg-(--surface-2) disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    <Network size={13} />
                    Lihat jaringan
                  </button>
                )}
                <MeasureTool
                  active={measure.active}
                  mode={measure.mode}
                  onToggle={measure.toggle}
                />
              </div>

              {/* Notifikasi transient geolokasi */}
              {locNotice && (
                <div className='absolute top-24 left-1/2 z-1000 -translate-x-1/2 rounded-full border border-slate-200 bg-(--surface)/95 px-3 py-1.5 text-[11px] font-semibold text-(--text-secondary) shadow-md'>
                  {locNotice}
                </div>
              )}

              {/* Insight ribbon alert ODP (PRD §B3) */}
              {odpAlertEnabled && (criticalCount > 0 || warningCount > 0) && (
                <div
                  ref={alertsPanelRef}
                  className='absolute top-3 left-1/2 z-1000 -translate-x-1/2'
                >
                  <button
                    onClick={() => setAlertsOpen((v) => !v)}
                    className='flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 shadow-md dark:border-red-500/25 dark:bg-red-500/10'
                  >
                    <span className='relative flex h-2 w-2'>
                      <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75' />
                      <span className='relative inline-flex h-2 w-2 rounded-full bg-red-500' />
                    </span>
                    <p className='text-[11px] font-bold text-red-600 dark:text-red-400'>
                      {criticalCount > 0
                        ? `${criticalCount} ODP berisiko`
                        : `${warningCount} ODP waspada`}
                      {criticalCount > 0 && warningCount > 0
                        ? ` · ${warningCount} waspada`
                        : ''}
                    </p>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-red-500 transition-transform ${alertsOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {alertsOpen && (
                    <div className='absolute top-full left-1/2 mt-2 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-red-200 bg-white shadow-xl dark:border-red-500/25 dark:bg-slate-900'>
                      <div className='flex items-center justify-between border-b border-red-100 px-3 py-2 dark:border-red-500/15'>
                        <p className='text-[10px] font-bold tracking-wide text-red-600 uppercase dark:text-red-400'>
                          Alert dari ODP
                        </p>
                        <p className='text-[10px] font-semibold text-slate-400'>
                          {odpAlerts.length} ODP
                        </p>
                      </div>
                      <div className='max-h-52 overflow-auto p-1'>
                        {odpAlerts.map((a) => {
                          const isCritical = a.tier === 'critical';
                          const color = isCritical ? '#dc2626' : '#f59e0b';
                          return (
                            <button
                              key={a.odpId}
                              onClick={() => {
                                setAlertsOpen(false);
                                setAlertFocus((prev) => ({
                                  lat: a.latitude,
                                  lng: a.longitude,
                                  seq: (prev?.seq ?? 0) + 1,
                                }));
                              }}
                              className='flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-red-50 dark:hover:bg-red-500/10'
                            >
                              <span
                                className='h-2 w-2 shrink-0 rounded-full'
                                style={{ background: color }}
                              />
                              <div className='min-w-0 flex-1'>
                                <p className='truncate text-[11px] font-bold text-slate-800 dark:text-slate-100'>
                                  {a.name}
                                </p>
                                <p className='text-[10px] text-slate-400'>
                                  {isCritical ? 'BERISIKO' : 'WASPADA'} ·{' '}
                                  {a.totalPoints} titik
                                  {a.activeCount > 0
                                    ? ` · ${a.activeCount} aktif`
                                    : ''}
                                </p>
                              </div>
                              <span
                                className='shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white'
                                style={{ background: color }}
                              >
                                {isCritical ? '⚠' : '•'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <MapContainer
                center={[-7.1831, 112.7117]}
                zoom={11}
                className='h-full w-full'
                scrollWheelZoom
              >
                <TileLayer
                  key='osm-street'
                  attribution='&copy; OpenStreetMap contributors'
                  url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                  maxZoom={19}
                />

                <BboxReporter
                  onBboxChange={handleBboxChange}
                  enabled={!holdBboxRef.current}
                  nonce={bboxNonce}
                />

                <NetworkFitter bbox={fitTarget} nonce={fitNonce} />

                <PointFitter
                  lat={alertFocus?.lat ?? null}
                  lng={alertFocus?.lng ?? null}
                  seq={alertFocus?.seq ?? 0}
                />

                <LocateController target={myLocation} seq={locSeq} />

                <MeasureMapEvents
                  ctrl={measure}
                  points={points}
                  kmlPoints={kmlPoints}
                />

                <MeasureLayer ctrl={measure} />

                {/* Layer KML — garis kabel */}
                {kmlLines.map((line) => (
                  <KmlLinePolyline
                    key={`kml-line-${line.id}`}
                    feature={line}
                    measuring={measuring}
                  />
                ))}

                {/* Layer KML — titik ODC/ODP */}
                {kmlPoints.map((pt) => (
                  <KmlPointMarker
                    key={`kml-point-${pt.id}`}
                    feature={pt}
                    layerTitle={
                      kmlLayerTitleById.get(
                        kmlSublayerLayerId.get(pt.sublayerId) ?? 0,
                      ) ?? ''
                    }
                    showLabel={zoom >= 12}
                    alert={odpAlertById.get(pt.id) ?? null}
                    measuring={measuring}
                  />
                ))}

                {clusters.map((cluster, idx) => {
                  const [lng, lat] = cluster.geometry.coordinates;
                  const props =
                    cluster.properties as PointFeatureProps['properties'] & {
                      cluster?: boolean;
                      cluster_id?: number;
                      point_count?: number;
                      point_count_abbreviated?: number;
                    };

                  if (props.cluster) {
                    const count = props.point_count ?? 0;
                    const expansionZoom = index.getClusterExpansionZoom(
                      props.cluster_id as number,
                    );
                    return (
                      <ZoomToCluster
                        key={`c-${props.cluster_id}`}
                        cluster={{
                          latitude: lat,
                          longitude: lng,
                          count,
                          expansionZoom,
                        }}
                        onExpand={() => {}}
                        disabled={measuring}
                      />
                    );
                  }

                  const point = props as unknown as WarMapPoint;
                  const isHot =
                    point.isHot || point.historyCount60d >= HOT_THRESHOLD;

                  return showHistory ? (
                    <CircleMarker
                      key={`p-${point.id}`}
                      center={[point.latitude, point.longitude]}
                      radius={isHot ? 10 : 7}
                      interactive={!measuring}
                      pathOptions={{
                        color: isHot ? '#dc2626' : '#2563eb',
                        fillColor: isHot ? '#dc2626' : '#2563eb',
                        fillOpacity: 0.65,
                        weight: 1.5,
                      }}
                      eventHandlers={
                        measuring
                          ? undefined
                          : { click: () => handlePointSelect(point) }
                      }
                    >
                      {!measuring && (
                        <Popup minWidth={260} maxWidth={320}>
                          <PointPopupContent
                            point={point}
                            historyData={historyData}
                            loading={historyLoading}
                            onOpenDetail={openDetail}
                          />
                        </Popup>
                      )}
                    </CircleMarker>
                  ) : (
                    <Marker
                      key={`p-${point.id}`}
                      position={[point.latitude, point.longitude]}
                      icon={markerIcon(point)}
                      interactive={!measuring}
                      eventHandlers={
                        measuring
                          ? undefined
                          : { click: () => handlePointSelect(point) }
                      }
                    >
                      {!measuring && (
                        <Popup minWidth={260} maxWidth={320}>
                          <PointPopupContent
                            point={point}
                            historyData={historyData}
                            loading={historyLoading}
                            onOpenDetail={openDetail}
                          />
                        </Popup>
                      )}
                    </Marker>
                  );
                })}

                {/* Highlight ODP terdekat — dirender paling akhir agar berada
                    di atas layer marker/KML lain (SVG append order). */}
                <NearestOdpMarker odpId={nearestOdpId} odpPoints={odpPoints} />
              </MapContainer>

              {measure.active && <MeasurePanel ctrl={measure} />}
            </div>

            {/* Legenda jaringan (PRD §A4) */}
            {kmlLayers.length > 0 && (
              <div className='absolute bottom-3 left-3 z-1000 hidden max-w-50 rounded-xl border border-(--border) bg-(--surface)/95 p-2.5 shadow-sm backdrop-blur lg:block'>
                <p className='text-[9px] font-bold tracking-widest text-(--text-tertiary) uppercase'>
                  Legenda
                </p>
                <div className='mt-1.5 space-y-1'>
                  <div className='flex items-center gap-2'>
                    <svg viewBox='0 0 24 24' width='14' height='14'>
                      <path
                        d='M12 3.2l10 17.8H2z'
                        fill='#e10000'
                        stroke='#ffffff'
                        strokeWidth='1'
                        strokeLinejoin='round'
                      />
                    </svg>
                    <span className='text-[10px] font-semibold text-(--text-secondary)'>
                      ODC
                    </span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <svg viewBox='0 0 24 24' width='14' height='14'>
                      <rect
                        x='2'
                        y='2'
                        width='20'
                        height='20'
                        rx='5.5'
                        fill='#f8fafc'
                        stroke='#cbd5e1'
                        strokeWidth='1.2'
                      />
                      <path
                        d='M12 4.6l2 4.05 4.47.65-3.23 3.15.76 4.45L12 14.9 7.99 16.9l.76-4.45-3.23-3.15 4.47-.65z'
                        fill='#475569'
                        stroke='#94a3b8'
                        strokeWidth='0.6'
                        strokeLinejoin='round'
                      />
                    </svg>
                    <span className='text-[10px] font-semibold text-(--text-secondary)'>
                      ODP
                    </span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='inline-block h-0.5 w-5 rounded bg-blue-500' />
                    <span className='text-[10px] font-semibold text-(--text-secondary)'>
                      Kabel / Distribusi
                    </span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='text-[11px] leading-none'>🔴</span>
                    <span className='text-[10px] font-semibold text-(--text-secondary)'>
                      ODP berisiko
                    </span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='text-[11px] leading-none'>🟡</span>
                    <span className='text-[10px] font-semibold text-(--text-secondary)'>
                      ODP waspada
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className='absolute right-3 bottom-3 z-1000 flex flex-col gap-2 lg:hidden'>
              <button
                onClick={() => setSheetTab('filter')}
                className='grid h-12 w-12 place-items-center rounded-full border border-(--border) bg-(--surface) text-blue-600 shadow-lg transition active:scale-95'
                aria-label='Filter'
              >
                <Funnel className='h-5 w-5' />
              </button>
              <button
                onClick={() => setSheetTab('layer')}
                className='grid h-12 w-12 place-items-center rounded-full border border-(--border) bg-(--surface) text-indigo-600 shadow-lg transition active:scale-95'
                aria-label='Skema'
              >
                <Layers className='h-5 w-5' />
              </button>
            </div>
          </div>
        </div>
      </div>

      <MobileSheet
        openTab={sheetTab}
        onClose={() => setSheetTab(null)}
        onTabChange={setSheetTab}
        filterContent={mobileFilterContent}
        layerContent={mobileLayerContent}
      />

      <TicketDetailDrawer
        open={detailTicketId !== null}
        onClose={() => {
          setDetailTicketId(null);
          setDrawerDetail(null);
        }}
        ticket={drawerDetail as never}
        loading={drawerLoading}
        error={drawerError}
        onRetry={() => {
          if (detailTicketId) {
            setDrawerDetail(null);
            setDrawerError(null);
            setDrawerLoading(true);
            fetchWithAuth(`/api/tickets/${detailTicketId}/detail`)
              .then((r) => (r ? r.json().catch(() => null) : null))
              .then((d) => {
                if (d?.success) setDrawerDetail(d.data);
              })
              .catch(() => setDrawerError('Gagal retry'))
              .finally(() => setDrawerLoading(false));
          }
        }}
      />

      <DeleteSchemaModal
        open={deleteTarget !== null}
        schema={deleteTarget}
        deleting={kmlDeleting}
        onDelete={confirmDeleteSchema}
        onClose={() => {
          if (!kmlDeleting) setDeleteTarget(null);
        }}
      />
    </>
  );
}

function PointPopupContent({
  point,
  historyData,
  loading,
  onOpenDetail,
}: {
  point: WarMapPoint;
  historyData: WarMapHistoryItem[] | null;
  loading: boolean;
  onOpenDetail: (ticketId: number | null | undefined) => void;
}) {
  return (
    <div className='w-70 space-y-2'>
      <div className='flex items-center justify-between'>
        <p className='text-sm font-bold text-slate-900 dark:text-white'>
          {maskName(point.customerName)}
        </p>
        {point.isHot && (
          <span className='rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-600'>
            Berulang
          </span>
        )}
      </div>

      {point.lastTicket && (
        <p className='text-[11px] font-semibold text-blue-600'>
          {point.lastTicket.incident}
        </p>
      )}

      {point.lastTicket?.id && (
        <button
          onClick={() => onOpenDetail(point.lastTicket?.id)}
          className='w-full rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20'
        >
          Lihat Detail Ticket
        </button>
      )}

      <div className='space-y-1 text-[11px] text-slate-600 dark:text-slate-300'>
        {point.alamat && <p className='line-clamp-2'>{point.alamat}</p>}
        {point.deviceName && (
          <p>
            ODP: <span className='font-bold'>{point.deviceName}</span>
          </p>
        )}
        {point.barcodeDc && (
          <p>
            Barcode DC: <span className='font-bold'>{point.barcodeDc}</span>
          </p>
        )}
        {point.workzone && <p>Workzone: {point.workzone}</p>}
        <p>
          Histori 60 hari:{' '}
          <span className='font-bold'>{point.historyCount60d}x</span>{' '}
          <span className='text-slate-400'>(total {point.taggedCount}x)</span>
        </p>
        <p className='text-slate-400'>Ditag: {formatDate(point.updatedAt)}</p>
      </div>

      <div className='border-t border-slate-100 pt-2 dark:border-white/10'>
        <p className='mb-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase'>
          Riwayat Gangguan
        </p>
        {loading ? (
          <p className='text-[11px] text-slate-400'>Memuat...</p>
        ) : historyData && historyData.length > 0 ? (
          <ul className='max-h-36 space-y-1.5 overflow-y-auto'>
            {historyData.slice(0, 8).map((h) => (
              <li
                key={h.id}
                className='rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-white/5'
              >
                <p className='flex items-center justify-between gap-2 text-[10px] font-bold'>
                  <span className='truncate text-blue-600'>{h.incident}</span>
                  <span className='shrink-0 text-slate-400'>
                    {formatDate(h.taggedAt)}
                  </span>
                </p>
                {h.rca && (
                  <p className='truncate text-[10px] text-slate-500'>
                    {h.rca}
                    {h.subRca ? ` → ${h.subRca}` : ''}
                  </p>
                )}
                {h.technicianName && (
                  <p className='text-[9.5px] text-slate-400'>
                    oleh {h.technicianName}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-[11px] text-slate-400'>Belum ada histori.</p>
        )}
      </div>
    </div>
  );
}
