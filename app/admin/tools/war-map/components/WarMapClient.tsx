'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  CircleMarker,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Supercluster from 'supercluster';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useWarMapFilterOptions } from '@/app/hooks/useDropdownOptions';
import { JENIS_TIKET_LIST } from '@/app/config/jenis-tiket';
import TicketDetailDrawer from '@/app/admin/components/dashboard/TicketDetailDrawer';
import type { PointFeature } from 'supercluster';

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
  historyCount90d: number;
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
  const hot = point.isHot || point.historyCount90d >= HOT_THRESHOLD;
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
      ">${point.historyCount90d >= HOT_THRESHOLD ? point.historyCount90d : ''}</div>
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

// ── Map events hook: sync bbox → parent ────────────────────────

function BboxReporter({
  onBboxChange,
}: {
  onBboxChange: (
    bbox: { south: number; west: number; north: number; east: number },
    zoom: number,
  ) => void;
}) {
  const map = useMap();
  const report = useCallback(() => {
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
}: {
  cluster: {
    latitude: number;
    longitude: number;
    count: number;
    expansionZoom: number;
  };
  onExpand: () => void;
}) {
  const map = useMap();
  return (
    <Marker
      position={[cluster.latitude, cluster.longitude]}
      icon={clusterIcon(cluster.count)}
      eventHandlers={{
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
            Gangguan Berulang ({HOT_THRESHOLD}+/90hr)
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

// ── Main component ──────────────────────────────────────────────

export default function WarMapClient() {
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

  const fetchIdRef = useRef(0);
  const bboxRef = useRef<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtersKey = `${workzone}|${area}|${status}|${jenis}|${bucket}|${fromDate}|${toDate}|${activeOnly}|${hotOnly}`;

  const loadPoints = useCallback(
    async (currentBbox: {
      south: number;
      west: number;
      north: number;
      east: number;
    }) => {
      setLoading(true);
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
        if (id === fetchIdRef.current) setLoading(false);
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

  // Reload when bbox / filters change (debounced agar tidak boros quota rate-limit)
  useEffect(() => {
    if (!bboxKey) return;
    const changed =
      lastFetched === null ||
      lastFetched.bboxKey !== bboxKey ||
      lastFetched.workzone !== workzone ||
      lastFetched.area !== area ||
      lastFetched.status !== status ||
      lastFetched.jenis !== jenis ||
      lastFetched.bucket !== bucket ||
      lastFetched.fromDate !== fromDate ||
      lastFetched.toDate !== toDate ||
      lastFetched.activeOnly !== activeOnly ||
      lastFetched.hotOnly !== hotOnly;
    if (!changed) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (bboxRef.current) void loadPoints(bboxRef.current);
    }, 400);
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

  // SSE: refresh titik saat ada tag baru
  useEffect(() => {
    if (!bbox) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/tickets/events');
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as { type: string };
          if (event.type === 'war-map:new-point') {
            void loadPoints(bboxRef.current ?? bbox);
          }
        } catch {
          /* ignore */
        }
      };
    } catch {
      // SSE tidak tersedia; fallback polling manual
    }
    return () => {
      if (es) es.close();
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

  return (
    <div className='grid gap-3 lg:grid-cols-[300px_1fr]'>
      <div className='order-2 lg:order-1'>
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

      <div className='order-1 lg:order-2'>
        <div className='relative z-0 h-[calc(100dvh-220px)] min-h-120 overflow-hidden rounded-2xl border border-(--border)'>
          {error && (
            <div className='absolute top-3 left-3 z-1000 max-w-sm rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400'>
              {error}
            </div>
          )}

          <MapContainer
            center={[-7.1831, 112.7117]}
            zoom={11}
            className='h-full w-full'
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              maxZoom={19}
            />

            <BboxReporter onBboxChange={handleBboxChange} />

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
                    key={`c-${props.cluster_id}-${idx}`}
                    cluster={{
                      latitude: lat,
                      longitude: lng,
                      count,
                      expansionZoom,
                    }}
                    onExpand={() => {}}
                  />
                );
              }

              const point = props as unknown as WarMapPoint;
              const isHot =
                point.isHot || point.historyCount90d >= HOT_THRESHOLD;

              return showHistory ? (
                <CircleMarker
                  key={`p-${point.id}-${idx}`}
                  center={[point.latitude, point.longitude]}
                  radius={isHot ? 10 : 7}
                  pathOptions={{
                    color: isHot ? '#dc2626' : '#2563eb',
                    fillColor: isHot ? '#dc2626' : '#2563eb',
                    fillOpacity: 0.65,
                    weight: 1.5,
                  }}
                  eventHandlers={{
                    click: () => handlePointSelect(point),
                  }}
                >
                  <Popup minWidth={260} maxWidth={320}>
                    <PointPopupContent
                      point={point}
                      historyData={historyData}
                      loading={historyLoading}
                      onOpenDetail={openDetail}
                    />
                  </Popup>
                </CircleMarker>
              ) : (
                <Marker
                  key={`p-${point.id}-${idx}`}
                  position={[point.latitude, point.longitude]}
                  icon={markerIcon(point)}
                  eventHandlers={{
                    click: () => handlePointSelect(point),
                  }}
                >
                  <Popup minWidth={260} maxWidth={320}>
                    <PointPopupContent
                      point={point}
                      historyData={historyData}
                      loading={historyLoading}
                      onOpenDetail={openDetail}
                    />
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>

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
    </div>
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
          Histori 90 hari:{' '}
          <span className='font-bold'>{point.historyCount90d}x</span>{' '}
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
