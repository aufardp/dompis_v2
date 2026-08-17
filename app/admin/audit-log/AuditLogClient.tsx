'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Download, Filter, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useAdminToast } from '@/app/admin/components/dashboard/admin-toast';

type AuditLogRow = {
  id: string;
  actorId: number | null;
  actorRole: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  meta: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type AuditLogData = {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
};

type FilterOptions = {
  actions: string[];
  resourceTypes: string[];
  roles: string[];
};

const PAGE_SIZE = 25;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function actionBadgeClass(action: string) {
  if (action.includes('VIEW')) return 'border-blue-500/20 bg-blue-500/10 text-blue-500';
  if (action.includes('CREATE') || action.includes('INSERT')) return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500';
  if (action.includes('UPDATE') || action.includes('CHANGE')) return 'border-amber-500/20 bg-amber-500/10 text-amber-500';
  if (action.includes('DELETE') || action.includes('REMOVE')) return 'border-rose-500/20 bg-rose-500/10 text-rose-500';
  return 'border-(--border) bg-(--surface-2) text-(--text-secondary)';
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== 'all') q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export default function AuditLogClient() {
  const { showError } = useAdminToast();
  const [data, setData] = useState<AuditLogData | null>(null);
  const [options, setOptions] = useState<FilterOptions>({
    actions: [],
    resourceTypes: [],
    roles: [],
  });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [action, setAction] = useState('all');
  const [resourceType, setResourceType] = useState('all');
  const [actorRole, setActorRole] = useState('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [filtersDirty, setFiltersDirty] = useState(false);
  const requestIdRef = useRef(0);

  const fetchData = useCallback(
    async (nextPage: number, keepDirty: boolean) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/audit-log${buildQuery({
            action,
            resourceType,
            actorRole,
            search,
            from,
            to,
            page: nextPage,
            pageSize: PAGE_SIZE,
          })}`,
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.message || 'Gagal memuat audit log');
        }
        if (requestId !== requestIdRef.current) return;
        setData(json.data);
        setPage(json.data.page);
        if (!keepDirty) setFiltersDirty(false);
      } catch (error: unknown) {
        if (requestId !== requestIdRef.current) return;
        showError('Gagal memuat audit log', error instanceof Error ? error.message : undefined, { persist: true });
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [action, resourceType, actorRole, search, from, to],
  );

  useEffect(() => {
    fetchData(1, false);
  }, [fetchData]);

  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await fetch('/api/audit-log/options');
        const json = await res.json();
        if (json.success) setOptions(json.data);
      } catch {
        // non-fatal
      }
    }
    loadOptions();
  }, []);

  const onApplyFilters = useCallback(() => {
    setFiltersDirty(false);
    setPage(1);
    fetchData(1, false);
  }, [fetchData]);

  const goToPage = useCallback(
    (target: number) => {
      if (!data) return;
      const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
      if (target < 1 || target > totalPages) return;
      fetchData(target, false);
    },
    [data, fetchData],
  );

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1),
    [data],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exportCsv = useCallback(() => {
    if (!data) return;
    const header = ['waktu', 'aktor', 'role', 'action', 'resource_type', 'resource_id', 'ip'];
    const lines = data.rows.map((r) =>
      [r.createdAt, r.actorName ?? '', r.actorRole ?? '', r.action, r.resourceType, r.resourceId ?? '', r.ipAddress ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([`${header.join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-page-${data.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <div className="min-h-screen bg-(--bg) p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <div className="flex flex-col gap-5 overflow-hidden rounded-3xl border border-(--border) bg-(--surface) px-5 py-5 shadow-sm md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-violet-500 uppercase">
                Audit Trail
              </span>
              <span className="rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-muted) uppercase">
                Compliance & Akses Terpusat
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight tracking-[-0.3px] text-(--text-primary) md:text-3xl">
                Audit Log
              </h1>
              <p className="mt-1 text-sm text-(--text-secondary)">
                Riwayat akses data sensitif, pencarian tiket, ekspor, dan aksi sistem.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchData(page, false)}
              className="inline-flex items-center gap-2 rounded-xl border border-(--border) bg-(--surface-2) px-3.5 py-2 text-sm font-semibold text-(--text-secondary) transition-colors hover:text-(--text-primary)"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!data?.rows.length}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-(--border) bg-(--surface) p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-(--text-muted)">
              <Filter size={14} />
              <span className="text-xs font-semibold tracking-wide uppercase">Filter</span>
            </div>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setFiltersDirty(true);
              }}
              className="rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-sm text-(--text-primary)"
            >
              <option value="all">Semua Aksi</option>
              {options.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              value={resourceType}
              onChange={(e) => {
                setResourceType(e.target.value);
                setFiltersDirty(true);
              }}
              className="rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-sm text-(--text-primary)"
            >
              <option value="all">Semua Resource</option>
              {options.resourceTypes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={actorRole}
              onChange={(e) => {
                setActorRole(e.target.value);
                setFiltersDirty(true);
              }}
              className="rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-sm text-(--text-primary)"
            >
              <option value="all">Semua Role</option>
              {options.roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-(--text-muted)" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFiltersDirty(true);
                }}
                placeholder="Cari resource id / aktor"
                className="w-56 rounded-lg border border-(--border) bg-(--surface-2) py-1.5 pr-3 pl-9 text-sm text-(--text-primary) placeholder:text-(--text-muted)"
              />
            </div>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setFiltersDirty(true);
              }}
              className="rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-sm text-(--text-primary)"
            />
            <span className="text-xs text-(--text-muted)">s/d</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setFiltersDirty(true);
              }}
              className="rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-sm text-(--text-primary)"
            />
            <button
              type="button"
              onClick={onApplyFilters}
              className="rounded-lg bg-(--surface-2) px-3.5 py-1.5 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--border)"
            >
              Terapkan
            </button>
            {filtersDirty && (
              <span className="text-xs font-medium text-amber-500">Perubahan filter belum diterapkan</span>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-(--border) bg-(--surface)">
          <div className="flex items-center justify-between border-b border-(--border) px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-(--text-primary)">
              <Activity size={15} />
              {data ? `${data.total.toLocaleString('id-ID')} entri` : 'Memuat...'}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-(--border) text-[10px] font-bold tracking-[0.15em] text-(--text-muted) uppercase">
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Aktor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-(--text-muted)">
                      Memuat audit log...
                    </td>
                  </tr>
                ) : !data || data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-(--text-muted)">
                      Tidak ada data audit log.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="border-b border-(--border)/60 transition-colors hover:bg-(--surface-2)">
                        <td className="px-4 py-3 whitespace-nowrap text-(--text-secondary)">
                          {formatDate(r.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-(--text-primary)">{r.actorName ?? '—'}</div>
                          <div className="text-xs text-(--text-muted)">{r.actorRole ?? '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={clsx(
                              'inline-block rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide',
                              actionBadgeClass(r.action),
                            )}
                          >
                            {r.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-(--text-primary)">{r.resourceType}</div>
                          <div className="max-w-[220px] truncate font-mono text-xs text-(--text-muted)">
                            {r.resourceId ?? '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {r.meta ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(r.id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-violet-500 hover:text-violet-600"
                            >
                              {expanded.has(r.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              {expanded.has(r.id) ? 'Sembunyikan' : 'Lihat meta'}
                            </button>
                          ) : (
                            <span className="text-xs text-(--text-muted)">—</span>
                          )}
                        </td>
                      </tr>
                      {r.meta && expanded.has(r.id) && (
                        <tr key={`${r.id}-meta`}>
                          <td colSpan={5} className="bg-(--bg) px-6 py-4">
                            <div className="mb-2 flex flex-wrap gap-2">
                              {r.ipAddress && (
                                <span className="rounded-full border border-(--border) bg-(--surface-2) px-2.5 py-0.5 font-mono text-xs text-(--text-secondary)">
                                  IP: {r.ipAddress}
                                </span>
                              )}
                              {r.userAgent && (
                                <span className="max-w-[420px] truncate rounded-full border border-(--border) bg-(--surface-2) px-2.5 py-0.5 font-mono text-xs text-(--text-muted)">
                                  UA: {r.userAgent}
                                </span>
                              )}
                            </div>
                            <pre className="overflow-x-auto rounded-lg border border-(--border) bg-(--surface-2) p-3 font-mono text-xs text-(--text-secondary)">
                              {JSON.stringify(r.meta, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && data.rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--border) px-5 py-3">
              <span className="text-xs text-(--text-muted)">
                Hal {page} dari {totalPages} · {data.pageSize} per halaman
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-sm font-semibold text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-2 text-sm text-(--text-secondary)">{page}</span>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-sm font-semibold text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
