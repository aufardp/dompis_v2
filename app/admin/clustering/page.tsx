'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useClusterList } from '@/app/hooks/useClusterList';
import { useClusterAssignment } from '@/app/hooks/useClusterAssignment';
import { useUserManagedSAs } from '@/app/hooks/useUserManagedSAs';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { formatInTimeZone } from 'date-fns-tz';

interface ManagedServiceArea {
  id_sa: number;
  nama_sa: string | null;
}

export default function ClusteringPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(
    formatInTimeZone(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd'),
  );
  const [autoAssignRunning, setAutoAssignRunning] = useState(false);
  const [copyRunning, setCopyRunning] = useState(false);
  const [showCreateCluster, setShowCreateCluster] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [selectedSaId, setSelectedSaId] = useState<number | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Plot Teknisi Modal state
  const [plotModalOpen, setPlotModalOpen] = useState(false);
  const [plotModalCluster, setPlotModalCluster] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [plotModalSearch, setPlotModalSearch] = useState('');
  const [plotModalSelected, setPlotModalSelected] = useState<number[]>([]);
  const [plotModalTeknisi, setPlotModalTeknisi] = useState<
    Array<{
      id_user: number;
      nama: string | null;
      nik: string | null;
      active_tickets: number;
    }>
  >([]);
  const [plotModalLoading, setPlotModalLoading] = useState(false);

  // Edit & Delete Cluster state
  const [editModal, setEditModal] = useState<{
    open: boolean;
    cluster: { id: number; nama_cluster: string; is_active: boolean } | null;
  }>({ open: false, cluster: null });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    clusterId: number | null;
    clusterName: string;
  }>({ open: false, clusterId: null, clusterName: '' });

  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const { serviceAreas, loading: sasLoading } = useUserManagedSAs();
  const {
    clusters,
    loading: clustersLoading,
    refresh: refreshClusters,
  } = useClusterList();
  const {
    assignments,
    loading: assignmentsLoading,
    refresh: refreshAssignments,
    copyFromDate,
    plotTeknisi,
    removeAssignment,
  } = useClusterAssignment(selectedDate);

  // Auto-select first SA when data loads
  useEffect(() => {
    if (serviceAreas.length > 0 && !selectedSaId) {
      setSelectedSaId(serviceAreas[0].id_sa);
    }
  }, [serviceAreas, selectedSaId]);

  const handleCopyFromYesterday = useCallback(async () => {
    setCopyRunning(true);
    setMessage(null);

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = formatInTimeZone(
        new Date(Date.now() - 86400000),
        'Asia/Jakarta',
        'yyyy-MM-dd',
      );

      const result = await copyFromDate(yesterdayStr, selectedDate);

      setMessage({
        type: 'success',
        text: `Berhasil menyalin ${result.copied} assignment dari ${yesterdayStr}`,
      });

      refreshAssignments();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyalin assignment',
      });
    } finally {
      setCopyRunning(false);
    }
  }, [selectedDate, copyFromDate, refreshAssignments]);

  const handleRunAutoAssign = useCallback(async () => {
    setAutoAssignRunning(true);
    setMessage(null);

    try {
      const res = await fetch('/api/clustering/auto-assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      });

      const json = await res.json();

      if (json.success) {
        const { assigned, total, no_teknisi, no_cluster } = json.data;
        
        // Build detailed message
        const messages: string[] = [];
        if (assigned > 0) {
          messages.push(`✅ ${assigned} tiket berhasil di-assign`);
        }
        if (no_teknisi > 0) {
          messages.push(`⚠️ ${no_teknisi} tiket gagal: tidak ada teknisi hari ini`);
        }
        if (no_cluster > 0) {
          messages.push(`ℹ️ ${no_cluster} tiket tidak ada cluster`);
        }

        setMessage({
          type: assigned > 0 ? 'success' : 'error',
          text: messages.length > 0 ? messages.join(' · ') : json.data.message,
        });
      } else {
        setMessage({
          type: 'error',
          text: json.message,
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Gagal menjalankan auto-assign',
      });
    } finally {
      setAutoAssignRunning(false);
    }
  }, []);

  const handleCreateCluster = useCallback(async () => {
    if (!newClusterName.trim()) {
      setMessage({ type: 'error', text: 'Nama cluster wajib diisi' });
      return;
    }

    if (!selectedSaId) {
      setMessage({ type: 'error', text: 'Pilih service area terlebih dahulu' });
      return;
    }

    try {
      const res = await fetch('/api/clustering', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sa_id: selectedSaId,
          nama_cluster: newClusterName.trim(),
        }),
        credentials: 'include',
      });

      const json = await res.json();

      if (json.success) {
        setMessage({ type: 'success', text: 'Cluster berhasil dibuat' });
        setNewClusterName('');
        setShowCreateCluster(false);
        refreshClusters();
      } else {
        setMessage({ type: 'error', text: json.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal membuat cluster' });
    }
  }, [newClusterName, selectedSaId, refreshClusters]);

  const handleDetailClick = (clusterId: number) => {
    router.push(`/admin/clustering/${clusterId}`);
  };

  // ── Edit & Delete Cluster Handlers ────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteConfirm.clusterId) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(
        `/api/clustering/${deleteConfirm.clusterId}`,
        { method: 'DELETE' },
      );
      const json = await res?.json();
      if (!json?.success)
        throw new Error(json?.message || 'Gagal menghapus cluster');
      setDeleteConfirm({ open: false, clusterId: null, clusterName: '' });
      refreshClusters();
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus cluster');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (nama: string, isActive: boolean) => {
    if (!editModal.cluster) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(
        `/api/clustering/${editModal.cluster.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nama_cluster: nama,
            is_active: isActive,
          }),
        },
      );
      const json = await res?.json();
      if (!json?.success)
        throw new Error(json?.message || 'Gagal menyimpan cluster');
      setEditModal({ open: false, cluster: null });
      refreshClusters();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan cluster');
    } finally {
      setSaving(false);
    }
  };

  // ── Plot Teknisi Modal Handlers ───────────────────────────────────────────
  const handleOpenPlotModal = useCallback(
    async (clusterId: number, clusterName: string) => {
      setPlotModalCluster({ id: clusterId, name: clusterName });
      setPlotModalSelected([]);
      setPlotModalSearch('');
      setPlotModalOpen(true);
      setPlotModalLoading(true);

      try {
        // Fetch available technicians for this cluster (attendance-filtered)
        const res = await fetchWithAuth(
          `/api/clustering/assign/teknisi?cluster_id=${clusterId}&date=${selectedDate}`,
        );
        if (res && res.ok) {
          const json = await res.json();
          if (json.success) {
            setPlotModalTeknisi(json.data);
            // Pre-select teknisi that are already_plotted
            const preSelected = json.data
              .filter((t: { already_plotted: boolean }) => t.already_plotted)
              .map((t: { id_user: number }) => t.id_user);
            setPlotModalSelected(preSelected);
          }
        }
      } catch (err) {
        console.error('Failed to fetch teknisi:', err);
      } finally {
        setPlotModalLoading(false);
      }
    },
    [selectedDate],
  );

  const handleClosePlotModal = useCallback(() => {
    setPlotModalOpen(false);
    setPlotModalCluster(null);
    setPlotModalSelected([]);
    setPlotModalSearch('');
  }, []);

  const handleToggleTeknisi = useCallback((teknisiId: number) => {
    setPlotModalSelected((prev) =>
      prev.includes(teknisiId)
        ? prev.filter((id) => id !== teknisiId)
        : [...prev, teknisiId],
    );
  }, []);

  const handleSavePlot = useCallback(async () => {
    if (!plotModalCluster) return;

    setPlotModalLoading(true);
    try {
      const res = await fetchWithAuth('/api/clustering/assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cluster_id: plotModalCluster.id,
          teknisi_ids: plotModalSelected,
          assigned_date: selectedDate,
        }),
      });

      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message || 'Failed to save plot');
      }

      const json = await res.json();
      if (json.success) {
        setMessage({
          type: 'success',
          text: `Berhasil: ${json.data.created} teknisi di-plot, ${json.data.skipped} sudah ada`,
        });
        handleClosePlotModal();
        refreshAssignments();
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan plot',
      });
    } finally {
      setPlotModalLoading(false);
    }
  }, [
    plotModalCluster,
    plotModalSelected,
    selectedDate,
    handleClosePlotModal,
    refreshAssignments,
  ]);

  const filteredTeknisi = useMemo(() => {
    if (!plotModalSearch.trim()) return plotModalTeknisi;
    const q = plotModalSearch.toLowerCase();
    return plotModalTeknisi.filter(
      (t) =>
        t.nama?.toLowerCase().includes(q) || t.nik?.toLowerCase().includes(q),
    );
  }, [plotModalTeknisi, plotModalSearch]);

  const getWorkloadLabel = (
    activeTickets: number,
  ): { text: string; color: string } => {
    if (activeTickets === 0)
      return { text: 'Idle', color: 'text-green-600 dark:text-green-400' };
    if (activeTickets > 3)
      return { text: 'OVERLOAD', color: 'text-red-600 dark:text-red-400' };
    return { text: 'Aktif', color: 'text-blue-600 dark:text-blue-400' };
  };

  const getWorkloadBadge = (activeTickets: number): string => {
    if (activeTickets === 0)
      return 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400';
    if (activeTickets > 3)
      return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400';
    return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400';
  };

  // ── End Plot Teknisi Modal Handlers ───────────────────────────────────────

  const todayStr = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <AdminLayout>
      <div className='space-y-6'>
        <div>
          <h1 className='font-syne text-2xl font-bold text-(--text-primary)'>
            Cluster Management
          </h1>
          <p className='text-sm text-(--text-secondary)'>
            Kelola cluster ODC dan assignment teknisi
          </p>
        </div>

        {message && (
          <div
            className={`rounded-lg p-4 ${
              message.type === 'success'
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Panel Atas: Jadwal Hari Ini */}
        <div className='bg-surface overflow-hidden rounded-2xl border border-(--border)'>
          <div className='bg-surface-2 px-4 py-3 md:px-5 md:py-3.5'>
            <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
              <div>
                <h2 className='font-syne text-lg font-bold text-(--text-primary)'>
                  Jadwal Hari Ini
                </h2>
                <p className='text-xs text-(--text-secondary)'>{todayStr}</p>
              </div>
              <div className='flex items-center gap-2'>
                <button
                  onClick={handleCopyFromYesterday}
                  disabled={copyRunning}
                  className='rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-white/10 disabled:opacity-50'
                >
                  {copyRunning ? 'Menyalin...' : 'Copy dari Kemarin'}
                </button>
                <button
                  onClick={handleRunAutoAssign}
                  disabled={autoAssignRunning}
                  className='rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50'
                >
                  {autoAssignRunning
                    ? 'Menjalankan...'
                    : 'Jalankan Auto-Assign'}
                </button>
              </div>
            </div>
          </div>

          <div className='p-4 md:p-5'>
            {assignmentsLoading ? (
              <div className='py-8 text-center text-(--text-secondary)'>
                Loading...
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full'>
                  <thead>
                    <tr className='border-b border-(--border)'>
                      <th className='px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase'>
                        Cluster
                      </th>
                      <th className='px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase'>
                        Teknisi Terjadwal
                      </th>
                      <th className='px-4 py-3 text-right text-xs font-semibold text-(--text-muted) uppercase'>
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((cluster) => (
                      <tr
                        key={cluster.cluster_id}
                        className='border-b border-(--border) last:border-0'
                      >
                        <td className='px-4 py-3 text-sm font-medium text-(--text-primary)'>
                          {cluster.cluster_name}
                        </td>
                        <td className='px-4 py-3 text-sm text-(--text-secondary)'>
                          {cluster.assignments.length === 0 ? (
                            <span className='text-(--text-muted)'>
                              (belum ada teknisi)
                            </span>
                          ) : (
                            <div className='flex flex-wrap gap-1'>
                              {cluster.assignments.map((a) => (
                                <span
                                  key={a.teknisi_id}
                                  className='inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400'
                                >
                                  {a.teknisi_nama}
                                  <button
                                    onClick={() => removeAssignment(a.id)}
                                    className='hover:text-red-500'
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className='px-4 py-3 text-right'>
                          <button
                            onClick={() =>
                              handleOpenPlotModal(
                                cluster.cluster_id,
                                cluster.cluster_name,
                              )
                            }
                            className='rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-(--text-primary) hover:bg-white/10'
                          >
                            + Plot Teknisi
                          </button>
                        </td>
                      </tr>
                    ))}
                    {assignments.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className='px-4 py-8 text-center text-sm text-(--text-secondary)'
                        >
                          Belum ada cluster untuk SA Anda
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Panel Bawah: Manajemen Cluster */}
        <div className='bg-surface overflow-hidden rounded-2xl border border-(--border)'>
          <div className='bg-surface-2 px-4 py-3 md:px-5 md:py-3.5'>
            <div className='flex items-center justify-between'>
              <div>
                <h2 className='font-syne text-lg font-bold text-(--text-primary)'>
                  Manajemen Cluster
                </h2>
                <p className='text-xs text-(--text-secondary)'>
                  Kelola cluster ODC dan area wilayah
                </p>
              </div>
              <button
                onClick={() => setShowCreateCluster(!showCreateCluster)}
                className='rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600'
              >
                + Tambah Cluster
              </button>
            </div>
          </div>

          {showCreateCluster && (
            <div className='border-b border-(--border) p-4 md:p-5'>
              <div className='flex flex-col gap-3 md:flex-row md:items-end'>
                <div className='flex-1'>
                  <label className='mb-1 block text-xs font-medium text-(--text-secondary)'>
                    Service Area
                  </label>
                  <select
                    value={selectedSaId || ''}
                    onChange={(e) => setSelectedSaId(Number(e.target.value))}
                    disabled={sasLoading}
                    className='bg-surface-2 w-full rounded-lg border border-(--border) px-3 py-2 text-sm text-(--text-primary) focus:border-blue-500 focus:outline-none disabled:opacity-50'
                  >
                    {sasLoading ? (
                      <option>Loading...</option>
                    ) : serviceAreas.length === 0 ? (
                      <option value=''>Tidak ada SA yang dikelola</option>
                    ) : (
                      serviceAreas.map((sa) => (
                        <option key={sa.id_sa} value={sa.id_sa}>
                          {sa.nama_sa || `SA ${sa.id_sa}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className='flex-1'>
                  <label className='mb-1 block text-xs font-medium text-(--text-secondary)'>
                    Nama Cluster
                  </label>
                  <input
                    type='text'
                    value={newClusterName}
                    onChange={(e) => setNewClusterName(e.target.value)}
                    placeholder='Contoh: AREA 1'
                    className='bg-surface-2 w-full rounded-lg border border-(--border) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500 focus:outline-none'
                  />
                </div>
                <div className='flex gap-2'>
                  <button
                    onClick={handleCreateCluster}
                    className='rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600'
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateCluster(false);
                      setNewClusterName('');
                    }}
                    className='rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-white/10'
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className='p-4 md:p-5'>
            {clustersLoading ? (
              <div className='py-8 text-center text-(--text-secondary)'>
                Loading...
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full'>
                  <thead>
                    <tr className='border-b border-(--border)'>
                      <th className='px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase'>
                        Cluster
                      </th>
                      <th className='px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase'>
                        Area / Wilayah
                      </th>
                      <th className='px-4 py-3 text-center text-xs font-semibold text-(--text-muted) uppercase'>
                        ODC
                      </th>
                      <th className='px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase'>
                        Status
                      </th>
                      <th className='px-4 py-3 text-right text-xs font-semibold text-(--text-muted) uppercase'>
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusters.map((cluster) => (
                      <tr
                        key={cluster.id}
                        className='border-b border-(--border) last:border-0'
                      >
                        <td className='px-4 py-3 text-sm font-medium text-(--text-primary)'>
                          {cluster.nama_cluster}
                        </td>
                        <td className='px-4 py-3 text-sm text-(--text-secondary)'>
                          {cluster.area_names.length === 0 ? (
                            <span className='text-(--text-muted)'>
                              (belum ada area)
                            </span>
                          ) : (
                            <div className='flex flex-wrap gap-1'>
                              {cluster.area_names.slice(0, 5).map((name) => (
                                <span
                                  key={name}
                                  className='rounded-full bg-white/5 px-2 py-0.5 text-xs'
                                >
                                  {name}
                                </span>
                              ))}
                              {cluster.area_names.length > 5 && (
                                <span className='text-xs text-(--text-muted)'>
                                  +{cluster.area_names.length - 5} lainnya
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className='px-4 py-3 text-center'>
                          <span className='inline-flex items-center justify-center rounded-full bg-white/5 px-3 py-1 text-sm font-medium text-(--text-primary)'>
                            {cluster.node_count}
                          </span>
                        </td>
                        <td className='px-4 py-3 text-sm'>
                          {cluster.is_active ? (
                            <span className='inline-flex items-center gap-1.5 text-green-600 dark:text-green-400'>
                              <span className='h-2 w-2 rounded-full bg-green-500' />
                              Aktif
                            </span>
                          ) : (
                            <span className='text-(--text-muted)'>
                              Tidak Aktif
                            </span>
                          )}
                        </td>
                        <td className='px-4 py-3 text-right'>
                          <div className='inline-flex gap-2'>
                            {/* Detail — tetap ada */}
                            <button
                              onClick={() => handleDetailClick(cluster.id)}
                              className='rounded-lg border border-(--border) bg-white px-3 py-1.5 text-xs font-semibold text-(--text-primary) hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800'
                            >
                              Detail
                            </button>

                            {/* Edit — BARU */}
                            <button
                              onClick={() =>
                                setEditModal({
                                  open: true,
                                  cluster: {
                                    id: cluster.id,
                                    nama_cluster: cluster.nama_cluster,
                                    is_active: cluster.is_active,
                                  },
                                })
                              }
                              className='rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400'
                            >
                              Edit
                            </button>

                            {/* Delete — BARU */}
                            <button
                              onClick={() =>
                                setDeleteConfirm({
                                  open: true,
                                  clusterId: cluster.id,
                                  clusterName: cluster.nama_cluster,
                                })
                              }
                              className='rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {clusters.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className='px-4 py-8 text-center text-sm text-(--text-secondary)'
                        >
                          Belum ada cluster. Klik "Tambah Cluster" untuk membuat
                          cluster baru.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plot Teknisi Modal */}
      {plotModalOpen && plotModalCluster && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <div className='bg-surface w-full max-w-lg rounded-2xl border border-(--border) shadow-xl'>
            {/* Header */}
            <div className='flex items-center justify-between border-b border-(--border) px-5 py-4'>
              <div>
                <h3 className='font-syne text-lg font-bold text-(--text-primary)'>
                  Plot Teknisi — {plotModalCluster.name}
                </h3>
                <p className='text-xs text-(--text-secondary)'>
                  {new Date(selectedDate).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <button
                onClick={handleClosePlotModal}
                className='rounded-lg p-1 text-(--text-muted) hover:bg-white/5 hover:text-(--text-primary)'
              >
                <svg
                  className='h-5 w-5'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M6 18L18 6M6 6l12 12'
                  />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className='max-h-96 overflow-y-auto px-5 py-4'>
              {/* Selected technicians */}
              {plotModalSelected.length > 0 && (
                <div className='mb-4'>
                  <p className='mb-2 text-xs font-medium text-(--text-secondary)'>
                    Teknisi terpilih:
                  </p>
                  <div className='flex flex-wrap gap-2'>
                    {plotModalSelected.map((tid) => {
                      const t = plotModalTeknisi.find((x) => x.id_user === tid);
                      return (
                        <span
                          key={tid}
                          className='inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400'
                        >
                          {t?.nama || `#${tid}`}
                          <button
                            onClick={() => handleToggleTeknisi(tid)}
                            className='ml-0.5 hover:text-red-500'
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className='mb-3'>
                <input
                  type='text'
                  value={plotModalSearch}
                  onChange={(e) => setPlotModalSearch(e.target.value)}
                  placeholder='Cari nama atau NIK teknisi...'
                  className='bg-surface-2 w-full rounded-lg border border-(--border) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500 focus:outline-none'
                />
              </div>

              {/* Technician list */}
              {plotModalLoading ? (
                <div className='py-8 text-center text-sm text-(--text-secondary)'>
                  Loading...
                </div>
              ) : filteredTeknisi.length === 0 ? (
                <div className='py-8 text-center text-sm text-(--text-secondary)'>
                  Tidak ada teknisi ditemukan
                </div>
              ) : (
                <div className='space-y-1'>
                  {filteredTeknisi.map((t) => {
                    const isSelected = plotModalSelected.includes(t.id_user);
                    const workload = getWorkloadLabel(t.active_tickets);
                    const badge = getWorkloadBadge(t.active_tickets);
                    return (
                      <label
                        key={t.id_user}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-(--border) hover:bg-white/5'
                        }`}
                      >
                        <div className='flex items-center gap-3'>
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                              isSelected
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {isSelected && (
                              <svg
                                className='h-3 w-3 text-white'
                                fill='none'
                                viewBox='0 0 24 24'
                                stroke='currentColor'
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  d='M5 13l4 4L19 7'
                                />
                              </svg>
                            )}
                          </div>
                          <div>
                            <span className='text-sm font-medium text-(--text-primary)'>
                              {t.nama}
                            </span>
                            {t.nik && (
                              <p className='text-[10px] text-(--text-muted)'>
                                {t.nik}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className='flex items-center gap-2'>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}
                          >
                            {workload.text}
                          </span>
                          <span className='text-xs text-(--text-secondary)'>
                            {t.active_tickets} tiket
                          </span>
                        </div>
                        <input
                          type='checkbox'
                          checked={isSelected}
                          onChange={() => handleToggleTeknisi(t.id_user)}
                          className='sr-only'
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className='flex justify-end gap-2 border-t border-(--border) px-5 py-4'>
              <button
                onClick={handleClosePlotModal}
                className='rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-white/10'
              >
                Batal
              </button>
              <button
                onClick={handleSavePlot}
                disabled={plotModalLoading}
                className='rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50'
              >
                {plotModalLoading ? 'Menyimpan...' : 'Simpan Plot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Cluster Modal */}
      {editModal.open && editModal.cluster && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <div className='w-full max-w-md rounded-2xl bg-white p-6 dark:bg-slate-800'>
            <h3 className='mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100'>
              Edit Cluster
            </h3>
            <div className='space-y-4'>
              <div>
                <label className='mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300'>
                  Nama Cluster
                </label>
                <input
                  type='text'
                  defaultValue={editModal.cluster.nama_cluster}
                  id='edit-cluster-name'
                  className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                />
              </div>
              <div className='flex items-center gap-2'>
                <input
                  type='checkbox'
                  id='edit-cluster-active'
                  defaultChecked={editModal.cluster.is_active}
                />
                <label
                  htmlFor='edit-cluster-active'
                  className='text-sm text-slate-700 dark:text-slate-300'
                >
                  Aktif
                </label>
              </div>
            </div>
            <div className='mt-6 flex gap-3'>
              <button
                onClick={() => setEditModal({ open: false, cluster: null })}
                className='flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
              >
                Batal
              </button>
              <button
                disabled={saving}
                onClick={() => {
                  const nama = (
                    document.getElementById('edit-cluster-name') as HTMLInputElement
                  )?.value?.trim();
                  const isActive = (
                    document.getElementById('edit-cluster-active') as HTMLInputElement
                  )?.checked;
                  if (nama) handleSave(nama, isActive);
                }}
                className='flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.open && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <div className='w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-slate-800'>
            <h3 className='mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100'>
              Hapus Cluster
            </h3>
            <p className='mb-6 text-sm text-slate-600 dark:text-slate-300'>
              Apakah yakin ingin menghapus cluster{' '}
              <strong>"{deleteConfirm.clusterName}"</strong>? Tindakan ini tidak
              bisa dibatalkan.
            </p>
            <div className='flex gap-3'>
              <button
                onClick={() =>
                  setDeleteConfirm({
                    open: false,
                    clusterId: null,
                    clusterName: '',
                  })
                }
                className='flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
              >
                Batal
              </button>
              <button
                disabled={deleting}
                onClick={handleDelete}
                className='flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50'
              >
                {deleting ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
