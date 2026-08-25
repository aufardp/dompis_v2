'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Landmark,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useAdminToast } from '@/app/admin/components/dashboard/admin-toast';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { normalizeRoleKey } from '@/app/libs/roles';

type Role = { id: number; label: string; key: string };

type Area = { id_area: number; nama_area: string };
type Branch = { id_branch: number; nama_branch: string; kode_branch: string; areas: Area[] };
type Region = { id_region: number; nama_region: string; is_active: boolean; branches: Branch[] };

type SaOption = { value: string; label: string };

type AreaOption = { value: number; label: string; branch?: string | null };

type UserRow = {
  id_user: number;
  nik: string | null;
  nama: string | null;
  jabatan: string | null;
  technician_segment: string | null;
  username: string | null;
  role_id: number | null;
  area_id: number | null;
  roles?: { key: string | null; name: string | null } | null;
  sa_names?: string[] | null;
};

const SEGMENT_OPTIONS: { value: '' | 'B2B' | 'B2C' | 'BOTH'; label: string }[] = [
  { value: '', label: 'Belum Diatur' },
  { value: 'B2B', label: 'B2B' },
  { value: 'B2C', label: 'B2C' },
  { value: 'BOTH', label: 'Both' },
];

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

const btnPrimary =
  'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50';

const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

const btnDanger =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50';

const btnIcon =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10';

const cardCls =
  'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900';

function canAssignRoleClient(actorRoleKey: string, targetRoleId: number): boolean {
  try {
    const normalized = normalizeRoleKey(actorRoleKey);
    const isSuperadmin = normalized === 'superadmin';

    if (targetRoleId === 1) return isSuperadmin;
    if (targetRoleId === 5) {
      return isSuperadmin || normalized === 'admin_branch';
    }
    if (targetRoleId === 6) return isSuperadmin;
    return true;
  } catch {
    return false;
  }
}

function canManageTargetClient(
  actorRoleKey: string,
  targetRoleId: number | null | undefined,
): boolean {
  if (targetRoleId === 1 || targetRoleId === 6) {
    return normalizeRoleKey(actorRoleKey) === 'superadmin';
  }
  return true;
}

function MultiSelect({
  title,
  hint,
  options,
  selected,
  onChange,
  compact = false,
}: {
  title: string;
  hint?: string;
  options: { value: number; label: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState('');

  const toggle = (v: number) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
        {title}
      </label>
      {options.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-950/40">
          {hint ?? 'Tidak ada data'}
        </div>
      ) : (
        <>
          {options.length > 8 && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari..."
                className={clsx(inputCls, 'pl-8')}
              />
            </div>
          )}
          <div
            className={clsx(
              'space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700',
              compact ? 'max-h-40' : 'max-h-56',
            )}
          >
            {filtered.length === 0 ? (
              <p className="px-2.5 py-1.5 text-sm text-slate-400">Tidak ada hasil</p>
            ) : (
              filtered.map((o) => {
                const checked = selected.includes(o.value);
                return (
                  <label
                    key={o.value}
                    className={clsx(
                      'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition',
                      checked
                        ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.value)}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    />
                    <span className="truncate">{o.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </>
      )}
      <p className="mt-1 text-[11px] text-slate-400">
        {selected.length > 0 ? `${selected.length} dipilih` : 'Belum ada yang dipilih'}
      </p>
    </div>
  );
}

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetchWithAuth(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res) return { success: false, message: 'Request gagal' };
  try {
    return await res.json();
  } catch {
    return { success: res.ok, message: res.ok ? 'OK' : 'Gagal' };
  }
}

export default function SuperadminUsersClient() {
  const { user: currentUser } = useCurrentUser();
  const roleKey = currentUser?.role_key ?? '';
  const isSuperAdmin = roleKey === 'superadmin';
  const tabs = useMemo(
    () =>
      [
        ['hierarchy', 'Kelola Hierarki', Building2],
        ['create', 'Buat User', UserPlus],
        ['list', 'Daftar User', Users],
      ].filter(([key]) => isSuperAdmin || key !== 'hierarchy') as Array<
        ['hierarchy' | 'create' | 'list', string, typeof Building2]
      >,
    [isSuperAdmin],
  );
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'create' | 'list'>(
    isSuperAdmin ? 'hierarchy' : 'create',
  );

  useEffect(() => {
    if (!isSuperAdmin && activeTab === 'hierarchy') setActiveTab('create');
  }, [isSuperAdmin, activeTab]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Manajemen User
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {isSuperAdmin
            ? 'Kelola hierarki region → branch → area → service area, buat user, dan kelola akun.'
            : 'Buat user dan kelola akun di area Anda.'}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
              activeTab === key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'hierarchy' && <HierarchyManager />}
      {activeTab === 'create' && <CreateUserPanel />}
      {activeTab === 'list' && <UserListPanel />}
    </div>
  );
}

/* ============================== TAB 1: HIERARKI ============================== */

function HierarchyManager() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRegion, setExpandedRegion] = useState<number | null>(null);
  const [expandedBranch, setExpandedBranch] = useState<number | null>(null);
  const [expandedArea, setExpandedArea] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // inline form state
  const [newRegion, setNewRegion] = useState('');
  const [newBranch, setNewBranch] = useState({ nama: '', kode: '' });
  const [newArea, setNewArea] = useState('');
  const [newSa, setNewSa] = useState('');
  const [editTarget, setEditTarget] = useState<{
    type: 'region' | 'branch' | 'area';
    id: number;
    nama: string;
    kode?: string;
  } | null>(null);

  const [saMap, setSaMap] = useState<Record<number, SaOption[]>>({});
  const [saLoading, setSaLoading] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await requestJson('/api/region?all=true');
    if (res.success === false || !Array.isArray(res)) {
      setRegions([]);
      setMsg({ ok: false, text: res.message || 'Gagal memuat hierarki' });
    } else {
      setRegions(res);
      setMsg(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const show = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    window.setTimeout(() => setMsg(null), 4000);
  };

  const loadSas = async (areaId: number) => {
    if (saMap[areaId]) return;
    setSaLoading((s) => ({ ...s, [areaId]: true }));
    const res = await requestJson(`/api/sa?id_area=${areaId}`);
    if (res.success) setSaMap((m) => ({ ...m, [areaId]: res.data ?? [] }));
    setSaLoading((s) => ({ ...s, [areaId]: false }));
  };

  const addRegion = async () => {
    const nama = newRegion.trim();
    if (!nama) return;
    const res = await requestJson('/api/region', {
      method: 'POST',
      body: JSON.stringify({ nama_region: nama }),
    });
    if (res.success) {
      setNewRegion('');
      show(true, 'Region berhasil dibuat');
      await load();
    } else show(false, res.message || 'Gagal membuat region');
  };

  const addBranch = async (regionId: number) => {
    if (!newBranch.nama.trim() || !newBranch.kode.trim()) return;
    const res = await requestJson('/api/branch', {
      method: 'POST',
      body: JSON.stringify({
        nama_branch: newBranch.nama.trim(),
        kode_branch: newBranch.kode.trim(),
        region_id: regionId,
      }),
    });
    if (res.success) {
      setNewBranch({ nama: '', kode: '' });
      show(true, 'Branch berhasil dibuat');
      await load();
    } else show(false, res.message || 'Gagal membuat branch');
  };

  const addArea = async (branchId: number) => {
    if (!newArea.trim()) return;
    const res = await requestJson('/api/area', {
      method: 'POST',
      body: JSON.stringify({ nama_area: newArea.trim(), branch_id: branchId }),
    });
    if (res.success) {
      setNewArea('');
      show(true, 'Area berhasil dibuat');
      await load();
    } else show(false, res.message || 'Gagal membuat area');
  };

  const addSa = async (areaId: number) => {
    if (!newSa.trim()) return;
    const res = await requestJson('/api/sa', {
      method: 'POST',
      body: JSON.stringify({ nama_sa: newSa.trim(), area_id: areaId }),
    });
    if (res.success) {
      setNewSa('');
      show(true, 'Service area berhasil dibuat');
      setSaMap((m) => {
        const next = { ...m };
        delete next[areaId];
        return next;
      });
      await loadSas(areaId);
    } else show(false, res.message || 'Gagal membuat service area');
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    let res: any;
    if (editTarget.type === 'region') {
      res = await requestJson('/api/region', {
        method: 'PUT',
        body: JSON.stringify({
          id_region: editTarget.id,
          nama_region: editTarget.nama.trim(),
        }),
      });
    } else if (editTarget.type === 'branch') {
      res = await requestJson('/api/branch', {
        method: 'PUT',
        body: JSON.stringify({
          id_branch: editTarget.id,
          nama_branch: editTarget.nama.trim(),
          kode_branch: editTarget.kode?.trim() || undefined,
        }),
      });
    } else {
      res = await requestJson('/api/area', {
        method: 'PUT',
        body: JSON.stringify({
          id_area: editTarget.id,
          nama_area: editTarget.nama.trim(),
        }),
      });
    }
    if (res.success) {
      show(true, 'Berhasil diperbarui');
      setEditTarget(null);
      await load();
    } else show(false, res.message || 'Gagal memperbarui');
  };

  const toggleRegionActive = async (region: Region) => {
    const res = await requestJson('/api/region', {
      method: 'PUT',
      body: JSON.stringify({
        id_region: region.id_region,
        is_active: !region.is_active,
      }),
    });
    if (res.success) {
      show(true, region.is_active ? 'Region dinonaktifkan' : 'Region diaktifkan');
      await load();
    } else show(false, res.message || 'Gagal mengubah status');
  };

  const del = async (
    type: 'region' | 'branch' | 'area' | 'sa',
    id: number,
    label: string,
  ) => {
    if (!window.confirm(`Hapus ${label} ini? Tindakan tidak dapat dibatalkan.`)) return;
    let res: any;
    if (type === 'region') res = await requestJson(`/api/region?id_region=${id}`, { method: 'DELETE' });
    else if (type === 'branch') res = await requestJson(`/api/branch?id_branch=${id}`, { method: 'DELETE' });
    else if (type === 'area') res = await requestJson(`/api/area?id=${id}`, { method: 'DELETE' });
    else res = await requestJson(`/api/sa?id=${id}`, { method: 'DELETE' });
    if (res.success) {
      show(true, `${label} dihapus`);
      await load();
    } else show(false, res.message || `Gagal menghapus ${label}`);
  };

  if (loading && regions.length === 0) {
    return (
      <div className={clsx(cardCls, 'p-8 text-center text-sm text-slate-500 dark:text-slate-400')}>
        Memuat hierarki...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={clsx(
            'rounded-xl border px-4 py-3 text-sm font-medium',
            msg.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
          )}
        >
          {msg.text}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Region</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Region → branch → area → service area
          </p>
        </div>
        <button type="button" onClick={load} className={btnGhost}>
          <RefreshCw className="h-4 w-4" /> Muat ulang
        </button>
      </div>

      {/* Add region */}
      <div className={clsx(cardCls, 'p-4')}>
        <div className="flex flex-wrap items-center gap-2">
          <Landmark className="h-4 w-4 text-slate-400" />
          <input
            value={newRegion}
            onChange={(e) => setNewRegion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRegion()}
            placeholder="Nama region baru"
            className={clsx(inputCls, 'min-w-56 flex-1')}
          />
          <button type="button" onClick={addRegion} className={btnPrimary}>
            <Plus className="h-4 w-4" /> Tambah Region
          </button>
        </div>
      </div>

      {regions.length === 0 && (
        <div className={clsx(cardCls, 'p-6 text-center text-sm text-slate-500 dark:text-slate-400')}>
          Belum ada region. Tambahkan region pertama di atas.
        </div>
      )}

      {regions.map((region) => (
        <div key={region.id_region} className={clsx(cardCls, 'overflow-hidden')}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setExpandedRegion(expandedRegion === region.id_region ? null : region.id_region)}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                {expandedRegion === region.id_region ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <Landmark className="h-4 w-4 text-blue-500" />
              <span className="truncate font-semibold text-slate-900 dark:text-white">
                {region.nama_region}
              </span>
              <span
                className={clsx(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  region.is_active
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                )}
              >
                {region.is_active ? 'Aktif' : 'Nonaktif'}
              </span>
              <span className="text-xs text-slate-400">{region.branches?.length ?? 0} branch</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={btnIcon}
                onClick={() =>
                  setEditTarget({
                    type: 'region',
                    id: region.id_region,
                    nama: region.nama_region,
                  })
                }
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button type="button" className={btnIcon} onClick={() => toggleRegionActive(region)}>
                {region.is_active ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              <button
                type="button"
                className={btnDanger}
                onClick={() => del('region', region.id_region, 'region')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {editTarget?.type === 'region' && editTarget.id === region.id_region && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <input
                value={editTarget.nama}
                onChange={(e) => setEditTarget({ ...editTarget, nama: e.target.value })}
                className={clsx(inputCls, 'min-w-56 flex-1')}
              />
              <button type="button" onClick={saveEdit} className={btnPrimary}>
                <Check className="h-4 w-4" /> Simpan
              </button>
              <button type="button" onClick={() => setEditTarget(null)} className={btnGhost}>
                <X className="h-4 w-4" /> Batal
              </button>
            </div>
          )}

          {expandedRegion === region.id_region && (
            <div className="space-y-3 bg-slate-50/60 px-4 py-4 dark:bg-slate-950/30">
              <div className="flex flex-wrap items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <input
                  value={newBranch.nama}
                  onChange={(e) => setNewBranch((b) => ({ ...b, nama: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addBranch(region.id_region)}
                  placeholder="Nama branch"
                  className={clsx(inputCls, 'min-w-40 flex-1')}
                />
                <input
                  value={newBranch.kode}
                  onChange={(e) => setNewBranch((b) => ({ ...b, kode: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addBranch(region.id_region)}
                  placeholder="Kode (mis. JKT01)"
                  className={clsx(inputCls, 'w-36')}
                />
                <button
                  type="button"
                  onClick={() => addBranch(region.id_region)}
                  className={btnGhost}
                >
                  <Plus className="h-4 w-4" /> Branch
                </button>
              </div>

              {(region.branches ?? []).map((branch) => (
                <div key={branch.id_branch} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBranch(expandedBranch === branch.id_branch ? null : branch.id_branch)
                        }
                        className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        {expandedBranch === branch.id_branch ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <Building2 className="h-4 w-4 text-indigo-500" />
                      <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {branch.nama_branch}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {branch.kode_branch}
                      </span>
                      <span className="text-xs text-slate-400">{branch.areas?.length ?? 0} area</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className={btnIcon}
                        onClick={() =>
                          setEditTarget({
                            type: 'branch',
                            id: branch.id_branch,
                            nama: branch.nama_branch,
                            kode: branch.kode_branch,
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        className={btnDanger}
                        onClick={() => del('branch', branch.id_branch, 'branch')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {editTarget?.type === 'branch' && editTarget.id === branch.id_branch && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                      <input
                        value={editTarget.nama}
                        onChange={(e) => setEditTarget({ ...editTarget, nama: e.target.value })}
                        className={clsx(inputCls, 'min-w-40 flex-1')}
                      />
                      <input
                        value={editTarget.kode ?? ''}
                        onChange={(e) => setEditTarget({ ...editTarget, kode: e.target.value })}
                        className={clsx(inputCls, 'w-32')}
                      />
                      <button type="button" onClick={saveEdit} className={btnPrimary}>
                        <Check className="h-4 w-4" /> Simpan
                      </button>
                      <button type="button" onClick={() => setEditTarget(null)} className={btnGhost}>
                        <X className="h-4 w-4" /> Batal
                      </button>
                    </div>
                  )}

                  {expandedBranch === branch.id_branch && (
                    <div className="space-y-3 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <input
                          value={newArea}
                          onChange={(e) => setNewArea(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addArea(branch.id_branch)}
                          placeholder="Nama area"
                          className={clsx(inputCls, 'min-w-40 flex-1')}
                        />
                        <button type="button" onClick={() => addArea(branch.id_branch)} className={btnGhost}>
                          <Plus className="h-4 w-4" /> Area
                        </button>
                      </div>

                      {(branch.areas ?? []).map((area) => (
                        <div
                          key={area.id_area}
                          className="rounded-lg border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-950/40"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = expandedArea === area.id_area ? null : area.id_area;
                                  setExpandedArea(next);
                                  if (next) loadSas(area.id_area);
                                }}
                                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                              >
                                {expandedArea === area.id_area ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <MapPin className="h-4 w-4 text-amber-500" />
                              <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                                {area.nama_area}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className={btnIcon}
                                onClick={() =>
                                  setEditTarget({
                                    type: 'area',
                                    id: area.id_area,
                                    nama: area.nama_area,
                                  })
                                }
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                type="button"
                                className={btnDanger}
                                onClick={() => del('area', area.id_area, 'area')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {editTarget?.type === 'area' && editTarget.id === area.id_area && (
                            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                              <input
                                value={editTarget.nama}
                                onChange={(e) => setEditTarget({ ...editTarget, nama: e.target.value })}
                                className={clsx(inputCls, 'min-w-40 flex-1')}
                              />
                              <button type="button" onClick={saveEdit} className={btnPrimary}>
                                <Check className="h-4 w-4" /> Simpan
                              </button>
                              <button type="button" onClick={() => setEditTarget(null)} className={btnGhost}>
                                <X className="h-4 w-4" /> Batal
                              </button>
                            </div>
                          )}

                          {expandedArea === area.id_area && (
                            <div className="space-y-2 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
                              <div className="flex flex-wrap items-center gap-2">
                                <CirclePlus className="h-4 w-4 text-slate-400" />
                                <input
                                  value={newSa}
                                  onChange={(e) => setNewSa(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && addSa(area.id_area)}
                                  placeholder="Nama service area"
                                  className={clsx(inputCls, 'min-w-40 flex-1')}
                                />
                                <button type="button" onClick={() => addSa(area.id_area)} className={btnGhost}>
                                  <Plus className="h-4 w-4" /> SA
                                </button>
                              </div>

                              {saLoading[area.id_area] ? (
                                <p className="px-1 text-xs text-slate-400">Memuat...</p>
                              ) : (
                                (saMap[area.id_area] ?? []).map((sa) => (
                                  <div
                                    key={sa.value}
                                    className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
                                  >
                                    <span className="truncate">{sa.label}</span>
                                    <button
                                      type="button"
                                      className={btnDanger}
                                      onClick={() => del('sa', Number(sa.value), 'service area')}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================== TAB 2: BUAT USER ============================== */

function CreateUserPanel() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [sas, setSas] = useState<SaOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { showSuccess, showError } = useAdminToast();
  const { user: currentUser } = useCurrentUser();
  const actorRoleKey = currentUser?.role_key ?? '';
  const assignableRoles = useMemo(
    () => roles.filter((r) => canAssignRoleClient(actorRoleKey, r.id)),
    [roles, actorRoleKey],
  );

  const [regionId, setRegionId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [saIds, setSaIds] = useState<number[]>([]);
  const [scopeRegionIds, setScopeRegionIds] = useState<number[]>([]);
  const [scopeBranchIds, setScopeBranchIds] = useState<number[]>([]);
  const [scopeAreaIds, setScopeAreaIds] = useState<number[]>([]);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [allAreas, setAllAreas] = useState<AreaOption[]>([]);
  const [form, setForm] = useState({
    nik: '',
    nama: '',
    jabatan: '',
    technicianSegment: '' as '' | 'B2B' | 'B2C' | 'BOTH',
    username: '',
    password: '',
    roleId: 2,
  });
  const [nikCheck, setNikCheck] = useState<
    | { status: 'idle' | 'checking' | 'available' }
    | { status: 'taken'; owner: { nama: string; username: string; role_name: string } }
  >({ status: 'idle' });

  useEffect(() => {
    (async () => {
      const [regionRes, roleRes, branchRes, areaRes] = await Promise.all([
        requestJson('/api/region?all=true'),
        requestJson('/api/roles'),
        requestJson('/api/branch'),
        requestJson('/api/area'),
      ]);
      if (Array.isArray(regionRes)) setRegions(regionRes);
      if (roleRes.success) setRoles(roleRes.data ?? []);
      if (branchRes.success) setAllBranches(branchRes.data ?? []);
      if (areaRes.success) setAllAreas(areaRes.data ?? []);
    })();
  }, []);

  useEffect(() => {
    const nik = form.nik.trim();
    if (nik.length < 4) {
      setNikCheck({ status: 'idle' });
      return;
    }

    setNikCheck({ status: 'checking' });

    const timer = setTimeout(async () => {
      try {
        const res = await requestJson(
          `/api/users/check-nik?nik=${encodeURIComponent(nik)}`,
        );
        if (res.success && res.exists) {
          setNikCheck({ status: 'taken', owner: res.user });
        } else {
          setNikCheck({ status: 'available' });
        }
      } catch {
        setNikCheck({ status: 'idle' });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [form.nik]);

  const branches = useMemo(
    () => regions.find((r) => r.id_region === regionId)?.branches ?? [],
    [regions, regionId],
  );
  const areas = useMemo(
    () => branches.find((b) => b.id_branch === branchId)?.areas ?? [],
    [branches, branchId],
  );

  const scopeRegionOptions = useMemo(
    () => regions.map((r) => ({ value: r.id_region, label: r.nama_region })),
    [regions],
  );
  const scopeBranchOptions = useMemo(
    () =>
      allBranches.map((b) => ({
        value: b.id_branch,
        label: `${b.nama_branch} (${b.kode_branch})`,
      })),
    [allBranches],
  );
  const scopeAreaOptions = useMemo(
    () =>
      allAreas.map((a) => ({
        value: a.value,
        label: a.branch ? `${a.label} — ${a.branch}` : a.label,
      })),
    [allAreas],
  );

  const onRegionChange = (v: string) => {
    const id = Number(v) || null;
    setRegionId(id);
    setBranchId(null);
    setAreaId(null);
    setSaIds([]);
  };

  const onBranchChange = (v: string) => {
    const id = Number(v) || null;
    setBranchId(id);
    setAreaId(null);
    setSaIds([]);
  };

  const onAreaChange = async (v: string) => {
    const id = Number(v) || null;
    setAreaId(id);
    setSaIds([]);
    if (id) {
      const res = await requestJson(`/api/sa?id_area=${id}`);
      setSas(res.success ? (res.data ?? []) : []);
    } else {
      setSas([]);
    }
  };

  const toggleSa = (value: number) => {
    setSaIds((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const submit = async () => {
    if (!regionId || !branchId || !areaId) {
      showError('Periksa form', 'Pilih region, branch, dan area terlebih dahulu');
      return;
    }
    if (saIds.length === 0) {
      showError('Periksa form', 'Pilih minimal 1 service area');
      return;
    }
    if (!form.nik.trim() || !form.nama.trim() || !form.jabatan.trim()) {
      showError('Periksa form', 'NIK, Nama, dan Jabatan wajib diisi');
      return;
    }
    if (form.username.trim().length < 4) {
      showError('Periksa form', 'Username minimal 4 karakter');
      return;
    }
    if (form.password.length < 6) {
      showError('Periksa form', 'Password minimal 6 karakter');
      return;
    }
    if (nikCheck.status === 'taken') {
      showError(
        'NIK sudah terpakai',
        `NIK sudah digunakan oleh ${nikCheck.owner.nama} (${nikCheck.owner.username})`,
      );
      return;
    }

    setSubmitting(true);
    const res = await requestJson('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        nik: form.nik.trim(),
        nama: form.nama.trim(),
        jabatan: form.jabatan.trim(),
        technician_segment: form.technicianSegment || null,
        username: form.username.trim(),
        password: form.password,
        role_id: form.roleId,
        area_id: areaId,
        sa_ids: saIds,
        region_ids: scopeRegionIds,
        branch_ids: scopeBranchIds,
        area_ids: scopeAreaIds,
      }),
    });
    setSubmitting(false);

    if (res.success) {
      showSuccess('User berhasil dibuat', `${form.username.trim()} berhasil dibuat`);
      setForm({
        nik: '',
        nama: '',
        jabatan: '',
        technicianSegment: '',
        username: '',
        password: '',
        roleId: form.roleId,
      });
      setSaIds([]);
      setScopeRegionIds([]);
      setScopeBranchIds([]);
      setScopeAreaIds([]);
      setScopeExpanded(false);
      setNikCheck({ status: 'idle' });
    } else {
      showError('Gagal membuat user', res.message || 'Terjadi kesalahan');
    }
  };

  const selectCls = inputCls;

  return (
    <div className={clsx(cardCls, 'p-6')}>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Buat User Baru</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Lengkapi Data User, lalu tentukan Penempatan. Scope Akses opsional untuk cakupan lebih luas.
        </p>
      </div>

      {/* ── 1. DATA USER ─────────────────────────────────────────────── */}
      <div className="mb-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Data User
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Role
            </label>
            <select
              value={form.roleId}
              onChange={(e) => setForm((f) => ({ ...f, roleId: Number(e.target.value) }))}
              className={selectCls}
            >
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              NIK
            </label>
            <input
              value={form.nik}
              onChange={(e) => setForm((f) => ({ ...f, nik: e.target.value }))}
              placeholder="NIK"
              className={inputCls}
            />
            {nikCheck.status === 'checking' && (
              <p className="mt-1 text-[11px] text-slate-400">Memeriksa NIK…</p>
            )}
            {nikCheck.status === 'available' && (
              <p className="mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                NIK tersedia
              </p>
            )}
            {nikCheck.status === 'taken' && (
              <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                NIK sudah digunakan oleh {nikCheck.owner.nama} (
                {nikCheck.owner.username} · {nikCheck.owner.role_name})
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Nama Lengkap
            </label>
            <input
              value={form.nama}
              onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
              placeholder="Nama lengkap"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Jabatan
            </label>
            <input
              value={form.jabatan}
              onChange={(e) => setForm((f) => ({ ...f, jabatan: e.target.value }))}
              placeholder="Jabatan"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Spesialisasi Teknisi
            </label>
            <select
              value={form.technicianSegment}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  technicianSegment: e.target.value as '' | 'B2B' | 'B2C' | 'BOTH',
                }))
              }
              className={selectCls}
            >
              {SEGMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Username
            </label>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="Username"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Minimal 6 karakter"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ── 2. PENEMPATAN (WAJIB) ────────────────────────────────────── */}
      <div className="mb-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Penempatan <span className="text-amber-600 dark:text-amber-400">(wajib)</span>
          </h3>
          <span className="text-[11px] text-slate-400">Service area wajib dipilih (bisa lebih dari satu)</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Region
            </label>
            <select value={regionId ?? ''} onChange={(e) => onRegionChange(e.target.value)} className={selectCls}>
              <option value="">Pilih region</option>
              {regions.map((r) => (
                <option key={r.id_region} value={r.id_region}>
                  {r.nama_region}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Branch
            </label>
            <select value={branchId ?? ''} onChange={(e) => onBranchChange(e.target.value)} className={selectCls}>
              <option value="">Pilih branch</option>
              {branches.map((b) => (
                <option key={b.id_branch} value={b.id_branch}>
                  {b.nama_branch} ({b.kode_branch})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Area
            </label>
            <select value={areaId ?? ''} onChange={(e) => onAreaChange(e.target.value)} className={selectCls}>
              <option value="">Pilih area</option>
              {areas.map((a) => (
                <option key={a.id_area} value={a.id_area}>
                  {a.nama_area}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Service Area (wajib, bisa pilih lebih dari satu)
            </label>
            {!areaId ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-950/40">
                Pilih area terlebih dahulu
              </div>
            ) : sas.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-950/40">
                Tidak ada service area di area ini
              </div>
            ) : (
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700 sm:grid-cols-2">
                {sas.map((sa) => {
                  const checked = saIds.includes(Number(sa.value));
                  return (
                    <label
                      key={sa.value}
                      className={clsx(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition',
                        checked
                          ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSa(Number(sa.value))}
                        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                      />
                      <span className="truncate">{sa.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              {saIds.length > 0 ? `${saIds.length} service area dipilih` : 'Belum ada service area dipilih'}
            </p>
          </div>
        </div>
      </div>

      {/* ── 3. SCOPE AKSES (OPSIONAL) ────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setScopeExpanded((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <span className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Scope Akses <span className="normal-case">(opsional)</span>
            {scopeRegionIds.length + scopeBranchIds.length + scopeAreaIds.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                {scopeRegionIds.length + scopeBranchIds.length + scopeAreaIds.length} dipilih
              </span>
            )}
          </span>
          <ChevronDown
            className={clsx(
              'h-4 w-4 text-slate-400 transition-transform',
              scopeExpanded && 'rotate-180',
            )}
          />
        </button>
        {scopeExpanded && (
          <>
            <p className="mb-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
              Akses mencakup semua turunan secara otomatis: region → semua branch/area/SA; branch →
              semua area/SA; area → semua SA.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <MultiSelect
                title="Scope Region"
                options={scopeRegionOptions}
                selected={scopeRegionIds}
                onChange={setScopeRegionIds}
              />
              <MultiSelect
                title="Scope Branch"
                options={scopeBranchOptions}
                selected={scopeBranchIds}
                onChange={setScopeBranchIds}
              />
              <MultiSelect
                title="Scope Area (tambahan)"
                options={scopeAreaOptions}
                selected={scopeAreaIds}
                onChange={setScopeAreaIds}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
          Service area wajib untuk semua role
        </span>
        <button type="button" onClick={submit} disabled={submitting} className={btnPrimary}>
          {submitting ? 'Menyimpan...' : 'Simpan User'}
        </button>
      </div>
    </div>
  );
}

/* ============================== TAB 3: DAFTAR USER ============================== */

function UserListPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [areaNameMap, setAreaNameMap] = useState<Record<number, string>>({});
  const [roleFilter, setRoleFilter] = useState<number | 0>(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { showSuccess, showError } = useAdminToast();
  const { user: currentUser } = useCurrentUser();
  const actorRoleKey = currentUser?.role_key ?? '';
  const assignableRoles = useMemo(
    () => roles.filter((r) => canAssignRoleClient(actorRoleKey, r.id)),
    [roles, actorRoleKey],
  );
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [editFields, setEditFields] = useState({
    role_id: 0,
    area_id: 0,
    technician_segment: '' as '' | 'B2B' | 'B2C' | 'BOTH',
    sa_ids: [] as number[],
    region_ids: [] as number[],
    branch_ids: [] as number[],
    area_ids: [] as number[],
    password: '',
  });
  const [editSaGroups, setEditSaGroups] = useState<
    { areaId: number; areaName: string; sas: SaOption[] }[]
  >([]);
  const [addingArea, setAddingArea] = useState<number>(0);
  const [addAreaQuery, setAddAreaQuery] = useState('');
  const [editRegions, setEditRegions] = useState<Region[]>([]);
  const [editBranches, setEditBranches] = useState<Branch[]>([]);
  const [editAreaOptions, setEditAreaOptions] = useState<AreaOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (roleFilter) params.set('role_id', String(roleFilter));
    if (search.trim()) params.set('search', search.trim());
    const res = await requestJson(`/api/users?${params.toString()}`);
    if (res.success) setUsers(res.data ?? []);
    setLoading(false);
  }, [roleFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const [roleRes, areaRes, regionRes, branchRes] = await Promise.all([
        requestJson('/api/roles'),
        requestJson('/api/area'),
        requestJson('/api/region?all=true'),
        requestJson('/api/branch'),
      ]);
      if (roleRes.success) setRoles(roleRes.data ?? []);
      if (areaRes.success) {
        const map: Record<number, string> = {};
        (areaRes.data ?? []).forEach((a: { value: number; label: string }) => {
          map[a.value] = a.label;
        });
        setAreaNameMap(map);
        setEditAreaOptions(areaRes.data ?? []);
      }
      if (Array.isArray(regionRes)) setEditRegions(regionRes);
      if (branchRes.success) setEditBranches(branchRes.data ?? []);
    })();
  }, []);

  const editScopeRegionOptions = useMemo(
    () => editRegions.map((r) => ({ value: r.id_region, label: r.nama_region })),
    [editRegions],
  );
  const editScopeBranchOptions = useMemo(
    () =>
      editBranches.map((b) => ({
        value: b.id_branch,
        label: `${b.nama_branch} (${b.kode_branch})`,
      })),
    [editBranches],
  );
  const editScopeAreaOptions = useMemo(
    () =>
      editAreaOptions.map((a) => ({
        value: a.value,
        label: a.branch ? `${a.label} — ${a.branch}` : a.label,
      })),
    [editAreaOptions],
  );

  const addAreaOptions = useMemo(() => {
    const remaining = editAreaOptions.filter(
      (a) => !editSaGroups.some((g) => g.areaId === a.value),
    );
    const q = addAreaQuery.trim().toLowerCase();
    if (!q) return remaining;
    return remaining.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        (a.branch ?? '').toLowerCase().includes(q),
    );
  }, [editAreaOptions, editSaGroups, addAreaQuery]);

  const openEdit = async (user: UserRow) => {
    setEditUser(user);
    setScopeExpanded(false);
    setEditFields({
      role_id: user.role_id ?? 0,
      area_id: user.area_id ?? 0,
      technician_segment: (user.technician_segment ?? '') as '' | 'B2B' | 'B2C' | 'BOTH',
      sa_ids: [],
      region_ids: [],
      branch_ids: [],
      area_ids: [],
      password: '',
    });
    setEditSaGroups([]);
    setAddingArea(0);
    setAddAreaQuery('');
    const detail = await requestJson(`/api/users/${user.id_user}`);
    if (detail.success) {
      const d = detail.data ?? {};
      setEditFields((f) => ({
        ...f,
        sa_ids: Array.isArray(d.sa_ids) ? d.sa_ids : [],
        region_ids: Array.isArray(d.region_ids) ? d.region_ids : [],
        branch_ids: Array.isArray(d.branch_ids) ? d.branch_ids : [],
        area_ids: Array.isArray(d.area_ids) ? d.area_ids : [],
      }));

      const saAreas: { sa_id: number; area_id: number | null; nama_sa: string | null; nama_area: string | null }[] =
        Array.isArray(d.sa_areas) ? d.sa_areas : [];
      const byArea = new Map<
        number,
        { areaId: number; areaName: string }
      >();
      saAreas.forEach((item) => {
        const aid = item.area_id ?? 0;
        if (!byArea.has(aid)) {
          byArea.set(aid, {
            areaId: aid,
            areaName: item.nama_area ?? areaNameMap[aid] ?? `Area #${aid}`,
          });
        }
      });

      const groups: { areaId: number; areaName: string; sas: SaOption[] }[] =
        [];
      for (const g of byArea.values()) {
        const res = await requestJson(`/api/sa?id_area=${g.areaId}`);
        groups.push({
          areaId: g.areaId,
          areaName: g.areaName,
          sas: res.success ? (res.data ?? []) : [],
        });
      }
      setEditSaGroups(groups);
    }
  };

  const onAreaForEdit = async (areaId: number) => {
    setEditFields((f) => ({ ...f, area_id: areaId }));
  };

  const addEditAreaGroup = async (areaId: number) => {
    if (!areaId) return;
    const area = editAreaOptions.find((a) => a.value === areaId);
    const res = await requestJson(`/api/sa?id_area=${areaId}`);
    setEditSaGroups((g) => [
      ...g,
      {
        areaId,
        areaName: area?.label ?? areaNameMap[areaId] ?? `Area #${areaId}`,
        sas: res.success ? (res.data ?? []) : [],
      },
    ]);
    setAddingArea(0);
    setAddAreaQuery('');
  };

  const removeEditAreaGroup = (areaId: number) => {
    setEditSaGroups((g) => g.filter((group) => group.areaId !== areaId));
    setEditFields((f) => {
      const removeIds = new Set(
        editSaGroups.find((grp) => grp.areaId === areaId)?.sas.map((s) => Number(s.value)) ?? [],
      );
      return {
        ...f,
        sa_ids: f.sa_ids.filter((id) => !removeIds.has(id)),
      };
    });
  };

  const toggleEditSa = (value: number) => {
    setEditFields((f) => ({
      ...f,
      sa_ids: f.sa_ids.includes(value)
        ? f.sa_ids.filter((v) => v !== value)
        : [...f.sa_ids, value],
    }));
  };

  const saveUser = async () => {
    if (!editUser) return;
    if (editFields.sa_ids.length === 0) {
      showError('Periksa form', 'Pilih minimal 1 service area');
      return;
    }
    const body: Record<string, any> = {
      role_id: editFields.role_id,
      area_id: editFields.area_id,
      technician_segment: editFields.technician_segment || null,
      sa_ids: editFields.sa_ids,
      region_ids: editFields.region_ids,
      branch_ids: editFields.branch_ids,
      area_ids: editFields.area_ids,
    };
    if (editFields.password) body.password = editFields.password;

    const res = await requestJson(`/api/users/${editUser.id_user}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (res.success) {
      showSuccess('User diperbarui', `${editUser.username ?? editUser.nama} berhasil diperbarui`);
      setEditUser(null);
      await load();
    } else {
      showError('Gagal memperbarui user', res.message || 'Terjadi kesalahan');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const user = deleteTarget;
    setDeleteTarget(null);
    const res = await requestJson(`/api/users/${user.id_user}`, { method: 'DELETE' });
    if (res.success) {
      showSuccess('User dihapus', `${user.username ?? user.nama} berhasil dihapus`);
      await load();
    } else {
      showError('Gagal menghapus user', res.message || 'Terjadi kesalahan');
    }
  };

  const removeUser = (user: UserRow) => {
    setDeleteTarget(user);
  };

  const confirmReset = async () => {
    if (!resetTarget) return;
    const user = resetTarget;
    setResetTarget(null);
    const res = await requestJson(`/api/users/${user.id_user}/reset-password`, {
      method: 'POST',
    });
    if (res.success) {
      showSuccess(
        'Password berhasil direset',
        `${user.username ?? user.nama} — password default: ${user.username ?? ''}`,
      );
    } else {
      showError('Gagal reset password', res.message || 'Terjadi kesalahan');
    }
  };

  const roleLabel = (roleId: number | null) =>
    roles.find((r) => r.id === roleId)?.label ?? '-';

  return (
    <div className="space-y-4">
      <div className={clsx(cardCls, 'flex flex-wrap items-center gap-3 p-4')}>
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Cari username / nama / NIK"
            className={clsx(inputCls, 'pl-9')}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(Number(e.target.value))}
          className={clsx(inputCls, 'w-44')}
        >
          <option value={0}>Semua role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={load} className={btnGhost}>
          <RefreshCw className="h-4 w-4" /> Cari
        </button>
      </div>

      <div className={clsx(cardCls, 'overflow-x-auto')}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">NIK</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">SA</th>
              <th className="px-4 py-3">Spesialisasi</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Memuat...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Tidak ada user
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id_user}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                    {user.username}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{user.nama}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{user.nik}</td>
                  <td className="px-4 py-3">
                    {user.role_id === 1 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                        <ShieldCheck className="h-3 w-3" />
                        {roleLabel(user.role_id)}
                      </span>
                    ) : user.role_id === 5 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <ShieldCheck className="h-3 w-3" />
                        {roleLabel(user.role_id)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {roleLabel(user.role_id)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {user.area_id ? areaNameMap[user.area_id] ?? `Area #${user.area_id}` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {user.sa_names && user.sa_names.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.sa_names.map((sa, i) => (
                          <span
                            key={`${user.id_user}-sa-${i}`}
                            className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                          >
                            {sa}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.technician_segment === 'B2B' ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                        B2B
                      </span>
                    ) : user.technician_segment === 'B2C' ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        B2C
                      </span>
                    ) : user.technician_segment === 'BOTH' ? (
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                        Both
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canManageTargetClient(actorRoleKey, user.role_id) ? (
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" className={btnIcon} onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button type="button" className={btnIcon} onClick={() => setResetTarget(user)}>
                          <RefreshCw className="h-3.5 w-3.5" /> Reset PW
                        </button>
                        <button
                          type="button"
                          className={btnDanger}
                          onClick={() => removeUser(user)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="flex items-center justify-end text-[11px] text-slate-400">
                        Hanya superadmin
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={clsx(cardCls, 'flex w-full max-w-2xl flex-col p-5 max-h-[calc(100dvh-2rem)]')}>
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Edit User: {editUser.username}
              </h3>
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Penempatan <span className="text-amber-600 dark:text-amber-400">(wajib)</span>
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Role
                  </label>
                  <select
                    value={editFields.role_id}
                    onChange={(e) => setEditFields((f) => ({ ...f, role_id: Number(e.target.value) }))}
                    className={inputCls}
                  >
                    {assignableRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Area
                  </label>
                  <select
                    value={editFields.area_id}
                    onChange={(e) => onAreaForEdit(Number(e.target.value))}
                    className={inputCls}
                  >
                    <option value={0}>Pilih area</option>
                    {Object.entries(areaNameMap).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Spesialisasi Teknisi
                  </label>
                  <select
                    value={editFields.technician_segment}
                    onChange={(e) =>
                      setEditFields((f) => ({
                        ...f,
                        technician_segment: e.target.value as '' | 'B2B' | 'B2C' | 'BOTH',
                      }))
                    }
                    className={inputCls}
                  >
                    {SEGMENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Service Area (wajib, bisa pilih lebih dari satu)
                </label>
                {editSaGroups.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-950/40">
                    Belum ada service area. Pilih area di bawah untuk menambahkan.
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    {editSaGroups.map((group) => (
                      <div key={group.areaId}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            {group.areaName}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeEditAreaGroup(group.areaId)}
                            className="text-[11px] font-medium text-red-500 hover:text-red-700 dark:hover:text-red-400"
                          >
                            Hapus area
                          </button>
                        </div>
                        {group.sas.length === 0 ? (
                          <p className="px-1 py-1.5 text-sm text-slate-400">
                            Tidak ada service area di area ini
                          </p>
                        ) : (
                          <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
                            {group.sas.map((sa) => {
                              const checked = editFields.sa_ids.includes(Number(sa.value));
                              return (
                                <label
                                  key={sa.value}
                                  className={clsx(
                                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition',
                                    checked
                                      ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
                                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleEditSa(Number(sa.value))}
                                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                                  />
                                  <span className="truncate">{sa.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={addAreaQuery}
                      onChange={(e) => setAddAreaQuery(e.target.value)}
                      placeholder="Cari area untuk ditambahkan…"
                      className={clsx(inputCls, 'pl-8')}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={addingArea}
                      onChange={(e) => setAddingArea(Number(e.target.value))}
                      className={inputCls}
                    >
                      <option value={0}>
                        {addAreaOptions.length > 0
                          ? '+ Pilih area lain untuk menambah SA…'
                          : 'Tidak ada area yang cocok'}
                      </option>
                      {addAreaOptions.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => addEditAreaGroup(addingArea)}
                      disabled={!addingArea}
                      className={btnGhost}
                    >
                      Tambah
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {editFields.sa_ids.length > 0
                    ? `${editFields.sa_ids.length} service area dipilih`
                    : 'Belum ada service area dipilih'}
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setScopeExpanded((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950/40"
                >
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Scope Akses (opsional)
                    {editFields.region_ids.length +
                      editFields.branch_ids.length +
                      editFields.area_ids.length >
                      0 && (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                        {editFields.region_ids.length +
                          editFields.branch_ids.length +
                          editFields.area_ids.length}{' '}
                        dipilih
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={clsx(
                      'h-4 w-4 text-slate-400 transition-transform',
                      scopeExpanded && 'rotate-180',
                    )}
                  />
                </button>
                {scopeExpanded && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <MultiSelect
                      compact
                      title="Region"
                      options={editScopeRegionOptions}
                      selected={editFields.region_ids}
                      onChange={(ids) => setEditFields((f) => ({ ...f, region_ids: ids }))}
                    />
                    <MultiSelect
                      compact
                      title="Branch"
                      options={editScopeBranchOptions}
                      selected={editFields.branch_ids}
                      onChange={(ids) => setEditFields((f) => ({ ...f, branch_ids: ids }))}
                    />
                    <MultiSelect
                      compact
                      title="Area (tambahan)"
                      options={editScopeAreaOptions}
                      selected={editFields.area_ids}
                      onChange={(ids) => setEditFields((f) => ({ ...f, area_ids: ids }))}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Password baru (opsional)
                </label>
                <input
                  type="password"
                  value={editFields.password}
                  onChange={(e) => setEditFields((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Kosongkan jika tidak diubah"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="mt-5 flex shrink-0 justify-end gap-2">
              <button type="button" onClick={() => setEditUser(null)} className={btnGhost}>
                Batal
              </button>
              <button type="button" onClick={saveUser} className={btnPrimary}>
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={clsx(cardCls, 'w-full max-w-md p-6')}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Hapus User</h3>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Yakin ingin menghapus user{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {deleteTarget.username ?? deleteTarget.nama}
              </span>
              ? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className={btnGhost}>
                Batal
              </button>
              <button type="button" onClick={confirmDelete} className={btnPrimary}>
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={clsx(cardCls, 'w-full max-w-md p-6')}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Reset Password</h3>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Yakin ingin mereset password{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {resetTarget.username ?? resetTarget.nama}
              </span>
              ? Password akan di-set sama dengan username:{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {resetTarget.username}
              </span>
              .
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setResetTarget(null)} className={btnGhost}>
                Batal
              </button>
              <button type="button" onClick={confirmReset} className={btnPrimary}>
                Ya, Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
