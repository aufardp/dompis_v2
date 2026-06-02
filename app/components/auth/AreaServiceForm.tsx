'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface Option {
  value: string;
  label: string;
}

export default function AreaServiceForm() {
  const [role, setRole] = useState('');
  const [area, setArea] = useState('');
  const [serviceArea, setServiceArea] = useState('');

  const { data: roles = [], isLoading: loadingRole } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/roles');
      if (!res) return [];
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: areas = [], isLoading: loadingArea } = useQuery({
    queryKey: ['areas'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/area');
      if (!res) return [];
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: serviceAreas = [], isLoading: loadingSA } = useQuery({
    queryKey: ['serviceAreas', area],
    queryFn: async () => {
      if (!area) return [];
      const res = await fetchWithAuth(`/api/sa?id_area=${area}`);
      if (!res) return [];
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!area,
  });

  const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setArea(e.target.value);
    setServiceArea('');
  };

  const selectClass =
    'h-11 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return (
    <div className='max-w-md space-y-6'>
      <div>
        <label className='mb-2 block font-medium'>Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={selectClass}
          disabled={loadingRole}
        >
          <option value=''>Pilih Role...</option>
          {roles.map((opt: Option) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className='mb-2 block font-medium'>Area</label>
        <select
          value={area}
          onChange={handleAreaChange}
          className={selectClass}
          disabled={loadingArea}
        >
          <option value=''>Pilih Area...</option>
          {areas.map((opt: Option) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className='mb-2 block font-medium'>Service Area</label>
        <select
          value={serviceArea}
          onChange={(e) => setServiceArea(e.target.value)}
          className={selectClass}
          disabled={!area || loadingSA}
        >
          <option value=''>
            {area ? 'Pilih Service Area...' : 'Pilih Area dulu'}
          </option>
          {serviceAreas.map((opt: Option) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
