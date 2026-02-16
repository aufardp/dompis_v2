import { Teknisi } from '@/app/types/teknisi';

interface Props {
  tech: Teknisi;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}

export default function TechnicianCard({
  tech,
  isSelected,
  isCurrent,
  onSelect,
}: Props) {
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border p-3 transition ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      }`}
    >
      <p className='font-medium'>{tech.nama}</p>
      <p className='text-xs text-gray-500'>NIK: {tech.nik}</p>

      {isCurrent && (
        <span className='mt-1 inline-block text-xs text-green-600'>
          Currently Assigned
        </span>
      )}
    </div>
  );
}
