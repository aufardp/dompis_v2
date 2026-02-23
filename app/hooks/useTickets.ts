import useSWR from 'swr';

interface TicketRow {
  idTicket: number;
  ticket: string;
  summary: string | null;
  reportedDate: string | null;
  ownerGroup: string | null;
  serviceType: string | null;
  customerType: string | null;
  serviceNo: string | null;
  contactName: string | null;
  contactPhone: string | null;
  bookingDate: string | null;
  sourceTicket: string | null;
  jenisTiket: string | null;
  workzone: string | null;
  status: string | null;
  hasilVisit: string | null;
  closedAt: string | null;
  maxTtrReguler: string | null;
  maxTtrGold: string | null;
  maxTtrPlatinum: string | null;
  maxTtrDiamond: string | null;
  teknisiUserId: number | null;
  technicianName: string | null;
}

interface ApiResponse {
  success: boolean;
  data: {
    tickets: TicketRow[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  timestamp: string;
}

interface UseTicketsReturn {
  tickets: TicketRow[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  lastUpdated: string | null;
  total: number;
  pagination: {
    currentPage: number;
    totalPages: number;
    total: number;
    limit: number;
  };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useTickets(
  page: number = 1,
  limit: number = 50,
): UseTicketsReturn {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/tickets?monitoring=true&page=${page}&limit=${limit}`,
    fetcher,
    {
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 0,
      onSuccess: (data) => {
        console.log('[useTickets] Data received:', {
          total: data?.data?.total,
          ticketsCount: data?.data?.tickets?.length,
          page: data?.data?.page,
        });
      },
      onError: (err) => {
        console.error('[useTickets] Error:', err);
      },
    },
  );

  console.log('[useTickets] Hook render:', {
    hasData: !!data,
    ticketsCount: data?.data?.tickets?.length ?? 0,
    isLoading,
    error: error ? error.message : null,
  });

  return {
    tickets: data?.data?.tickets ?? [],
    isLoading,
    error: error ?? null,
    refresh: mutate,
    lastUpdated: data?.timestamp ?? null,
    total: data?.data?.total ?? 0,
    pagination: {
      currentPage: data?.data?.page ?? 1,
      totalPages: data?.data?.totalPages ?? 1,
      total: data?.data?.total ?? 0,
      limit: data?.data?.limit ?? 50,
    },
  };
}
