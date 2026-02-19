'use client';

import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import Select from 'react-select';
import { fetchWithAuth } from '@/app/libs/fetcher';

export default function AreaServiceForm() {
  const { control, watch } = useForm();
  const selectedArea = watch('area');

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
    queryKey: ['serviceAreas', selectedArea?.value],
    queryFn: async () => {
      if (!selectedArea) return [];
      const res = await fetchWithAuth(`/api/sa?id_area=${selectedArea.value}`);
      if (!res) return [];
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!selectedArea,
  });

  return (
    <div className='max-w-md space-y-6'>
      {/* ROLES */}
      <div>
        <label className='mb-2 block font-medium'>Role</label>
        <Controller
          name='role'
          control={control}
          render={({ field }) => (
            <Select
              {...field}
              options={roles}
              isLoading={loadingRole}
              placeholder='Pilih Role...'
            />
          )}
        />
      </div>

      {/* AREA */}
      <div>
        <label className='mb-2 block font-medium'>Area</label>
        <Controller
          name='area'
          control={control}
          render={({ field }) => (
            <Select
              {...field}
              options={areas}
              isLoading={loadingArea}
              placeholder='Pilih Area...'
            />
          )}
        />
      </div>

      {/* SERVICE AREA */}
      <div>
        <label className='mb-2 block font-medium'>Service Area</label>
        <Controller
          name='serviceArea'
          control={control}
          render={({ field }) => (
            <Select
              {...field}
              options={serviceAreas}
              isLoading={loadingSA}
              placeholder={
                selectedArea ? 'Pilih Service Area...' : 'Pilih Area dulu'
              }
              isDisabled={!selectedArea}
            />
          )}
        />
      </div>
    </div>
  );
}
