'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

interface SingleTechnician {
  id_user: number;
  nama: string;
  nik: string | null;
  workzone: string;
  avatar_url: string | null;
  assigned_tickets: Array<{
    idTicket: number;
    ticket: string;
    contactName: string;
    ctype: string;
    serviceNo: string;
    reportedDate: string;
    hasilVisit: string;
    age: string;
    ageHours: number;
  }>;
  total_assigned: number;
  total_closed_today: number;
  total_closed_all: number;
  average_resolve_time_hours: number | null;
  status: 'IDLE' | 'AKTIF' | 'OVERLOAD';
  order_counts?: {
    assigned: number;
    on_progress: number;
    pending: number;
    closed: number;
  };
}

interface UseSingleTechnicianReturn {
  technician: SingleTechnician | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSingleTechnician(
  technicianId: number,
): UseSingleTechnicianReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.technicians.detail(technicianId),
    enabled: technicianId > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/technicians/${technicianId}`);
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message || 'Failed to fetch technician');
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch technician');
      return json.data as SingleTechnician;
    },
  });

  return {
    technician: data ?? null,
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: () => { refetch(); },
  };
}
