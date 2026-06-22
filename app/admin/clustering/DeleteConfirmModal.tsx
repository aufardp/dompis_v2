'use client';

interface DeleteConfirmModalProps {
  open: boolean;
  clusterId: number | null;
  clusterName: string;
  deleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}

export default function DeleteConfirmModal({
  open,
  clusterId,
  clusterName,
  deleting,
  onDelete,
  onClose,
}: DeleteConfirmModalProps) {
  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <div className='w-full max-w-sm rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-xl dark:border-(--border) dark:bg-(--surface)'>
        <h3 className='mb-2 text-lg font-semibold text-(--text-primary) dark:text-(--text-primary)'>
          Hapus Cluster
        </h3>
        <p className='mb-6 text-sm text-(--text-secondary) dark:text-(--text-secondary)'>
          Apakah yakin ingin menghapus cluster{' '}
          <strong>"{clusterName}"</strong>? Tindakan ini tidak
          bisa dibatalkan.
        </p>
        <div className='flex gap-3'>
          <button
            onClick={onClose}
            className='flex-1 rounded-lg border border-(--border) py-2 text-sm font-medium text-(--text-primary) hover:bg-(--surface-2) dark:border-(--border) dark:text-(--text-primary) dark:hover:bg-(--surface-2)'
          >
            Batal
          </button>
          <button
            disabled={deleting}
            onClick={onDelete}
            className='flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50'
          >
            {deleting ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}
