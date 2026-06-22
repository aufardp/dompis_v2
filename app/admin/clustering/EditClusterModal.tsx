'use client';

interface EditClusterData {
  id: number;
  nama_cluster: string;
  is_active: boolean;
}

interface EditClusterModalProps {
  editModal: { open: boolean; cluster: EditClusterData | null };
  clusterNameRef: React.RefObject<HTMLInputElement | null>;
  clusterActiveRef: React.RefObject<HTMLInputElement | null>;
  saving: boolean;
  handleSave: (nama: string, isActive: boolean) => void;
  onClose: () => void;
}

export default function EditClusterModal({
  editModal,
  clusterNameRef,
  clusterActiveRef,
  saving,
  handleSave,
  onClose,
}: EditClusterModalProps) {
  if (!editModal.open || !editModal.cluster) return null;

  return (
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
              ref={clusterNameRef}
              defaultValue={editModal.cluster.nama_cluster}
              className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white'
            />
          </div>
          <div className='flex items-center gap-2'>
            <input
              type='checkbox'
              ref={clusterActiveRef}
              defaultChecked={editModal.cluster.is_active}
            />
            <label className='text-sm text-slate-700 dark:text-slate-300'>
              Aktif
            </label>
          </div>
        </div>
        <div className='mt-6 flex gap-3'>
          <button
            onClick={onClose}
            className='flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
          >
            Batal
          </button>
          <button
            disabled={saving}
            onClick={() => {
              const nama = clusterNameRef.current?.value?.trim();
              const isActive = clusterActiveRef.current?.checked ?? false;
              if (nama) handleSave(nama, isActive);
            }}
            className='flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
