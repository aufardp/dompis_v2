import { useCallback, useState } from 'react';
import { Teknisi } from '@/app/types/teknisi';
import { fetchWithAuth } from '@/app/libs/fetcher';

type TechnicianMeta = {
  ticketId?: number;
  workzone?: string | null;
  serviceAreaId?: number | null;
  serviceAreaName?: string | null;
} | null;

interface RoleApiResponse {
  success: boolean;
  message?: string;
  data?: Teknisi[];
}

interface TicketTechApiResponse {
  success: boolean;
  message?: string;
  data?: {
    ticketId: number;
    workzone: string | null;
    serviceAreaId: number | null;
    serviceAreaName: string | null;
    technicians: Teknisi[];
  };
}

export function useTechnicians() {
  const [technicians, setTechnicians] = useState<Teknisi[]>([]);
  const [meta, setMeta] = useState<TechnicianMeta>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTechnicians = useCallback(
    async (opts?: { ticketId?: string | number; search?: string }) => {
      setLoading(true);
      setError(null);
      setTechnicians([]);
      setMeta(null);

      try {
        const search = opts?.search?.trim();
        const ticketId = opts?.ticketId;

        const query = ticketId
          ? `/api/tickets/${encodeURIComponent(String(ticketId))}/technicians${
              search ? `?search=${encodeURIComponent(search)}` : ''
            }`
          : search
            ? `/api/users/role/4?search=${encodeURIComponent(search)}`
            : `/api/users/role/4`;

        const res = await fetchWithAuth(query);

        if (!res || !res.ok) {
          const body = res ? await res.json().catch(() => null) : null;
          throw new Error(body?.message || 'Network response was not ok');
        }

        const data: RoleApiResponse | TicketTechApiResponse = await res.json();

        if (!data.success) {
          throw new Error(data.message || 'Failed to fetch technicians');
        }

        // Ticket-filtered endpoint
        if (ticketId) {
          const payload = (data as TicketTechApiResponse).data;
          const nextTechs = payload?.technicians ?? [];
          const nextMeta: TechnicianMeta = payload
            ? {
                ticketId: payload.ticketId,
                workzone: payload.workzone,
                serviceAreaId: payload.serviceAreaId,
                serviceAreaName: payload.serviceAreaName,
              }
            : null;

          setTechnicians(nextTechs);
          setMeta(nextMeta);
          return;
        }

        // Legacy role-based endpoint
        setMeta(null);
        setTechnicians((data as RoleApiResponse).data ?? []);
        return;
      } catch (err: any) {
        setError(err.message || 'Failed to load technicians');
        setTechnicians([]);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    technicians,
    meta,
    loading,
    error,
    fetchTechnicians,
  };
}
