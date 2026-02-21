import { useCallback, useState, useEffect } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

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
}

interface UseSingleTechnicianReturn {
  technician: SingleTechnician | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSingleTechnician(
  technicianId: number,
): UseSingleTechnicianReturn {
  const [technician, setTechnician] = useState<SingleTechnician | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!technicianId) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetchWithAuth(`/api/technicians/${technicianId}`);
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message || 'Failed to fetch technician');
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch technician');
      }

      setTechnician(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setTechnician(null);
    } finally {
      setLoading(false);
    }
  }, [technicianId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    technician,
    loading,
    error,
    refresh: fetchData,
  };
}
