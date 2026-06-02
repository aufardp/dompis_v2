'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

interface Option {
  value: string;
  label: string;
}

interface UseDropdownOptionsReturn {
  options: Option[];
  loading: boolean;
  error: string | null;
}

export function useAreaOptions(): UseDropdownOptionsReturn {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dropdowns.area(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/area');
      if (!res) throw new Error('Failed to fetch area options');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch area options');
      return (json.data || []) as Option[];
    },
  });

  return {
    options: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}

export function useServiceAreaOptions(): UseDropdownOptionsReturn {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dropdowns.serviceArea(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/sa');
      if (!res) throw new Error('Failed to fetch service area options');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch service area options');
      return (json.data || []) as Option[];
    },
  });

  return {
    options: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}

export function useRcaOptions(): UseDropdownOptionsReturn {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dropdowns.serviceArea(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/sa');
      if (!res) throw new Error('Failed to fetch rca options');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch rca options');
      return (json.data || []) as Option[];
    },
  });

  return {
    options: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}

export function useSubRcaOptions(): UseDropdownOptionsReturn {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dropdowns.serviceArea(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/sa');
      if (!res) throw new Error('Failed to fetch sub rca options');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch sub rca options');
      return (json.data || []) as Option[];
    },
  });

  return {
    options: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}

export function useWorkzoneOptions() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dropdowns.workzone(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/workzone');
      if (!res) throw new Error('Failed to fetch workzones');
      const result = await res.json();
      if (!result.success) throw new Error(result.message || 'Failed to fetch workzones');
      return (result.data || []) as Option[];
    },
  });

  return {
    options: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}
