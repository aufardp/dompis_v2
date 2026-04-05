'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useClusterDetail } from '@/app/hooks/useClusterDetail';
import { useClusterAssignment } from '@/app/hooks/useClusterAssignment';

export default function ClusterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = useMemo(() => Number(params.id), [params.id]);

  const { cluster, areas, nodes, loading, refresh } = useClusterDetail(
    clusterId || null,
  );

  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeValue, setNewNodeValue] = useState('');
  const [newNodeAreaId, setNewNodeAreaId] = useState<number | null>(null);
  const [showAddArea, setShowAddArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [bulkImportText, setBulkImportText] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importRunning, setImportRunning] = useState(false);

  const handleAddNode = useCallback(async () => {
    if (!newNodeValue.trim()) {
      setMessage({ type: 'error', text: 'ODC value wajib diisi' });
      return;
    }

    try {
      const res = await fetch(`/api/clustering/${clusterId}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          odc_value: newNodeValue.trim(),
          cluster_area_id: newNodeAreaId,
        }),
        credentials: 'include',
      });

      const json = await res.json();

      if (json.success) {
        setMessage({ type: 'success', text: 'ODC berhasil ditambahkan' });
        setNewNodeValue('');
        setNewNodeAreaId(null);
        setShowAddNode(false);
        refresh();
      } else {
        setMessage({ type: 'error', text: json.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal menambahkan ODC' });
    }
  }, [clusterId, newNodeValue, newNodeAreaId, refresh]);

  const handleBulkImport = useCallback(async () => {
    if (!bulkImportText.trim()) {
      setMessage({ type: 'error', text: 'List ODC wajib diisi' });
      return;
    }

    setImportRunning(true);

    try {
      // Parse CSV or newline-separated values
      const lines = bulkImportText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Skip header if present
      const odcEntries = lines
        .filter((line, idx) => {
          if (idx === 0 && line.toLowerCase().includes('odc')) {
            return false;
          }
          return true;
        })
        .map((line) => {
          // Handle CSV format: odc_value,area_name
          const parts = line.split(',');
          const odc_value = parts[0].trim();
          const area_name = parts[1]?.trim();
          return { odc_value, area_name: area_name || undefined };
        });

      const res = await fetch(`/api/clustering/${clusterId}/nodes/bulk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          odc_values: odcEntries,
        }),
        credentials: 'include',
      });

      const json = await res.json();

      if (json.success) {
        setMessage({
          type: 'success',
          text: `Import selesai: ${json.data.inserted} inserted, ${json.data.skipped} skipped`,
        });
        setBulkImportText('');
        setShowBulkImport(false);
        refresh();
      } else {
        setMessage({ type: 'error', text: json.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal import ODC' });
    } finally {
      setImportRunning(false);
    }
  }, [clusterId, bulkImportText, refresh]);

  const handleDeleteNode = useCallback(
    async (nodeId: number) => {
      if (!confirm('Hapus ODC ini dari cluster?')) return;

      try {
        const res = await fetch(`/api/clustering/${clusterId}/nodes/${nodeId}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        const json = await res.json();

        if (json.success) {
          setMessage({ type: 'success', text: 'ODC berhasil dihapus' });
          refresh();
        } else {
          setMessage({ type: 'error', text: json.message });
        }
      } catch (err) {
        setMessage({ type: 'error', text: 'Gagal menghapus ODC' });
      }
    },
    [clusterId, refresh],
  );

  const handleUpdateNodeArea = useCallback(
    async (nodeId: number, areaId: number | null) => {
      try {
        const res = await fetch(
          `/api/clustering/${clusterId}/nodes/${nodeId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ cluster_area_id: areaId }),
            credentials: 'include',
          },
        );

        const json = await res.json();
        if (!json.success) {
          setMessage({ type: 'error', text: json.message });
        }
        // Always refresh after update
        refresh();
      } catch (err) {
        setMessage({ type: 'error', text: 'Gagal update area ODC' });
        refresh();
      }
    },
    [clusterId, refresh],
  );

  const handleAddArea = useCallback(async () => {
    if (!newAreaName.trim()) {
      setMessage({ type: 'error', text: 'Nama area wajib diisi' });
      return;
    }

    try {
      const res = await fetch(`/api/clustering/${clusterId}/areas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nama_area: newAreaName.trim(),
        }),
        credentials: 'include',
      });

      const json = await res.json();

      if (json.success) {
        setMessage({ type: 'success', text: 'Area berhasil ditambahkan' });
        setNewAreaName('');
        setShowAddArea(false);
        refresh();
      } else {
        setMessage({ type: 'error', text: json.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal menambahkan area' });
    }
  }, [clusterId, newAreaName, refresh]);

  const handleDeleteArea = useCallback(
    async (areaId: number) => {
      if (!confirm('Hapus area ini?')) return;

      try {
        const res = await fetch(`/api/clustering/${clusterId}/areas/${areaId}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        const json = await res.json();

        if (json.success) {
          setMessage({ type: 'success', text: 'Area berhasil dihapus' });
          refresh();
        } else {
          setMessage({ type: 'error', text: json.message });
        }
      } catch (err) {
        setMessage({ type: 'error', text: 'Gagal menghapus area' });
      }
    },
    [clusterId, refresh],
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className='flex items-center justify-center py-20'>
          <div className='text-(--text-secondary)'>Loading...</div>
        </div>
      </AdminLayout>
    );
  }

  if (!cluster) {
    return (
      <AdminLayout>
        <div className='flex items-center justify-center py-20'>
          <div className='text-red-500'>Cluster tidak ditemukan</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className='space-y-6'>
        <div className='flex items-center justify-between'>
          <div>
            <button
              onClick={() => router.push('/admin/clustering')}
              className='mb-2 text-sm text-(--text-secondary) hover:text-(--text-primary)'
            >
              ← Kembali ke Cluster
            </button>
            <h1 className='font-syne text-2xl font-bold text-(--text-primary)'>
              {cluster.nama_cluster}
            </h1>
            <p className='text-sm text-(--text-secondary)'>
              Kelola ODC nodes dan area wilayah
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${
                cluster.is_active
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-(--text-muted)/10 text-(--text-muted)'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  cluster.is_active ? 'bg-green-500' : 'bg-(--text-muted)'
                }`}
              />
              {cluster.is_active ? 'Aktif' : 'Tidak Aktif'}
            </span>
          </div>
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

        <div className='grid gap-6 lg:grid-cols-2'>
          {/* Panel Kiri: ODC Nodes */}
          <div className='bg-surface overflow-hidden rounded-2xl border border-(--border)'>
            <div className='bg-surface-2 px-4 py-3 md:px-5 md:py-3.5'>
              <div className='flex items-center justify-between'>
                <div>
                  <h2 className='font-syne text-lg font-bold text-(--text-primary)'>
                    ODC Nodes
                  </h2>
                  <p className='text-xs text-(--text-secondary)'>
                    {nodes.length} ODC terdaftar
                  </p>
                </div>
                <div className='flex gap-2'>
                  <button
                    onClick={() => setShowBulkImport(!showBulkImport)}
                    className='rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-(--text-primary) hover:bg-white/10'
                  >
                    {showBulkImport ? 'Tutup Import' : 'Import CSV'}
                  </button>
                  <button
                    onClick={() => setShowAddNode(!showAddNode)}
                    className='rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600'
                  >
                    + Tambah ODC
                  </button>
                </div>
              </div>
            </div>

            {showAddNode && (
              <div className='border-b border-(--border) p-4 md:p-5'>
                <div className='flex flex-col gap-3 md:flex-row md:items-end'>
                  <div className='flex-1'>
                    <label className='mb-1 block text-xs font-medium text-(--text-secondary)'>
                      ODC Value
                    </label>
                    <input
                      type='text'
                      value={newNodeValue}
                      onChange={(e) => setNewNodeValue(e.target.value)}
                      placeholder='Contoh: ODC-TDS-FEP'
                      className='w-full rounded-lg border border-(--border) bg-surface-2 px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500 focus:outline-none'
                    />
                  </div>
                  <div className='flex-1'>
                    <label className='mb-1 block text-xs font-medium text-(--text-secondary)'>
                      Area (opsional)
                    </label>
                    <select
                      value={newNodeAreaId ?? ''}
                      onChange={(e) =>
                        setNewNodeAreaId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className='w-full rounded-lg border border-(--border) bg-surface-2 px-3 py-2 text-sm text-(--text-primary) focus:border-blue-500 focus:outline-none'
                    >
                      <option value=''>-- Pilih Area --</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.nama_area}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className='flex gap-2'>
                    <button
                      onClick={handleAddNode}
                      className='rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600'
                    >
                      Simpan
                    </button>
                    <button
                      onClick={() => {
                        setShowAddNode(false);
                        setNewNodeValue('');
                        setNewNodeAreaId(null);
                      }}
                      className='rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-white/10'
                    >
                      Batal
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showBulkImport && (
              <div className='border-b border-(--border) p-4 md:p-5'>
                <div>
                  <label className='mb-1 block text-xs font-medium text-(--text-secondary)'>
                    List ODC (satu per baris atau CSV)
                  </label>
                  <textarea
                    value={bulkImportText}
                    onChange={(e) => setBulkImportText(e.target.value)}
                    placeholder='ODC-TDS-FEP,ROMOKALISARI&#10;ODC-KLN-FKY,TAMBAK OSOWILANGUN&#10;ODC-KLN-FBC'
                    rows={5}
                    className='w-full rounded-lg border border-(--border) bg-surface-2 px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500 focus:outline-none'
                  />
                  <div className='mt-2 flex gap-2'>
                    <button
                      onClick={handleBulkImport}
                      disabled={importRunning}
                      className='rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50'
                    >
                      {importRunning ? 'Importing...' : 'Import'}
                    </button>
                    <button
                      onClick={() => {
                        setShowBulkImport(false);
                        setBulkImportText('');
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
              <div className='overflow-x-auto'>
                <table className='w-full'>
                  <thead>
                    <tr className='border-b border-(--border)'>
                      <th className='px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase'>
                        ODC Value
                      </th>
                      <th className='px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase'>
                        Area
                      </th>
                      <th className='px-4 py-3 text-right text-xs font-semibold text-(--text-muted) uppercase'>
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((node) => (
                      <tr
                        key={node.id}
                        className='border-b border-(--border) last:border-0'
                      >
                        <td className='px-4 py-3 text-sm font-medium text-(--text-primary)'>
                          {node.odc_value}
                        </td>
                        <td className='px-4 py-3 text-sm text-(--text-secondary)'>
                          <select
                            value={node.cluster_area_id ?? ''}
                            onChange={async (e) => {
                              const areaId = e.target.value
                                ? Number(e.target.value)
                                : null;
                              await handleUpdateNodeArea(node.id, areaId);
                            }}
                            className='rounded-lg border border-(--border) bg-surface-2 px-2 py-1 text-xs text-(--text-primary) focus:border-blue-500 focus:outline-none'
                          >
                            <option value=''>-- Pilih Area --</option>
                            {areas.map((area) => (
                              <option key={area.id} value={area.id}>
                                {area.nama_area}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className='px-4 py-3 text-right'>
                          <button
                            onClick={() => handleDeleteNode(node.id)}
                            className='rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/20 dark:text-red-400'
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    {nodes.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className='px-4 py-8 text-center text-sm text-(--text-secondary)'
                        >
                          Belum ada ODC. Klik "Tambah ODC" atau "Import CSV" untuk
                          menambahkan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Panel Kanan: Deskripsi Wilayah */}
          <div className='bg-surface overflow-hidden rounded-2xl border border-(--border)'>
            <div className='bg-surface-2 px-4 py-3 md:px-5 md:py-3.5'>
              <div className='flex items-center justify-between'>
                <div>
                  <h2 className='font-syne text-lg font-bold text-(--text-primary)'>
                    Deskripsi Wilayah
                  </h2>
                  <p className='text-xs text-(--text-secondary)'>
                    {areas.length} area terdaftar
                  </p>
                </div>
                <button
                  onClick={() => setShowAddArea(!showAddArea)}
                  className='rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600'
                >
                  + Tambah Area
                </button>
              </div>
            </div>

            {showAddArea && (
              <div className='border-b border-(--border) p-4 md:p-5'>
                <div className='flex items-end gap-2'>
                  <div className='flex-1'>
                    <label className='mb-1 block text-xs font-medium text-(--text-secondary)'>
                      Nama Area
                    </label>
                    <input
                      type='text'
                      value={newAreaName}
                      onChange={(e) => setNewAreaName(e.target.value)}
                      placeholder='Contoh: ROMOKALISARI'
                      className='w-full rounded-lg border border-(--border) bg-surface-2 px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500 focus:outline-none'
                    />
                  </div>
                  <button
                    onClick={handleAddArea}
                    className='rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600'
                  >
                    Simpan
                  </button>
                </div>
              </div>
            )}

            <div className='p-4 md:p-5'>
              <div className='space-y-2'>
                {areas.map((area) => (
                  <div
                    key={area.id}
                    className='flex items-center justify-between rounded-lg border border-(--border) bg-surface-2 px-4 py-3'
                  >
                    <div>
                      <p className='font-medium text-(--text-primary)'>
                        {area.nama_area}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteArea(area.id)}
                      className='rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/20 dark:text-red-400'
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {areas.length === 0 && (
                  <div className='py-8 text-center text-sm text-(--text-secondary)'>
                    Belum ada area. Klik "Tambah Area" untuk menambahkan.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
