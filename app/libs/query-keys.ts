export const queryKeys = {
  tickets: {
    all: ['tickets'] as const,
    lists: () => [...queryKeys.tickets.all, 'list'] as const,
    daily: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.tickets.all, 'daily', filters] as const)
        : ([...queryKeys.tickets.all, 'daily'] as const),
    semesta: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.tickets.all, 'semesta', filters] as const)
        : ([...queryKeys.tickets.all, 'semesta'] as const),
    detail: (id: number) => [...queryKeys.tickets.all, id] as const,
    expired: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.tickets.all, 'expired', filters] as const)
        : ([...queryKeys.tickets.all, 'expired'] as const),
    diamond: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.tickets.all, 'alert', 'diamond', filters] as const)
        : ([...queryKeys.tickets.all, 'alert', 'diamond'] as const),
  },
  dashboard: {
    all: ['dashboard'] as const,
    operations: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.dashboard.all, 'operations', filters] as const)
        : ([...queryKeys.dashboard.all, 'operations'] as const),
    semestaSummary: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.dashboard.all, 'semesta-summary', filters] as const)
        : ([...queryKeys.dashboard.all, 'semesta-summary'] as const),
    ticketManagementOverview: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.dashboard.all, 'ticket-management-overview', filters] as const)
        : ([...queryKeys.dashboard.all, 'ticket-management-overview'] as const),
    ttrComplianceOverview: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.dashboard.all, 'ttr-compliance-overview', filters] as const)
        : ([...queryKeys.dashboard.all, 'ttr-compliance-overview'] as const),
    sqmDailyTrend: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.dashboard.all, 'sqm-daily-trend', filters] as const)
        : ([...queryKeys.dashboard.all, 'sqm-daily-trend'] as const),
    assuranceGuarantee: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.dashboard.all, 'assurance-guarantee', filters] as const)
        : ([...queryKeys.dashboard.all, 'assurance-guarantee'] as const),
    durasi: (filters?: { bucket?: string; branch?: string }) => {
      const bucket = filters?.bucket ?? '';
      const branch = filters?.branch ?? '';
      return [
        ...queryKeys.dashboard.all,
        'durasi',
        bucket || 'all',
        branch || 'all',
      ] as const;
    },
    rekapWorkorder: () => [...queryKeys.dashboard.all, 'rekap-workorder'] as const,
    rekapWorkorderHourly: (bucket?: string) =>
      bucket
        ? ([...queryKeys.dashboard.all, 'rekap-workorder', 'hourly-close', bucket] as const)
        : ([...queryKeys.dashboard.all, 'rekap-workorder', 'hourly-close'] as const),
    rekapWorkorderTrend: (bucket?: string) =>
      bucket
        ? ([...queryKeys.dashboard.all, 'rekap-workorder', 'trend', bucket] as const)
        : ([...queryKeys.dashboard.all, 'rekap-workorder', 'trend'] as const),
  },
  notifications: {
    all: ['notifications'] as const,
    topbar: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.notifications.all, 'topbar', filters] as const)
        : ([...queryKeys.notifications.all, 'topbar'] as const),
  },
  clustering: {
    all: ['clustering'] as const,
    lists: () => [...queryKeys.clustering.all, 'list'] as const,
    detail: (id: number) => [...queryKeys.clustering.all, id] as const,
    assignments: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.clustering.all, 'assignments', filters] as const)
        : ([...queryKeys.clustering.all, 'assignments'] as const),
  },
  users: {
    me: () => ['users', 'me'] as const,
    managedSA: () => ['users', 'me', 'sa'] as const,
    role: (roleId: number) => ['users', 'role', roleId] as const,
  },
  dropdowns: {
    area: () => ['area'] as const,
    serviceArea: (area?: string) => (area ? (['sa', area] as const) : (['sa'] as const)),
    workzone: (branch?: string) =>
      branch ? (['workzone', branch] as const) : (['workzone'] as const),
    branch: () => ['branch'] as const,
  },
  warMap: {
    all: ['war-map'] as const,
    filterOptions: () => [...queryKeys.warMap.all, 'filters'] as const,
  },
  sync: {
    all: ['sync'] as const,
    status: () => [...queryKeys.sync.all, 'status'] as const,
  },
  technicians: {
    all: ['technicians'] as const,
    lists: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.technicians.all, 'list', filters] as const)
        : ([...queryKeys.technicians.all, 'list'] as const),
    detail: (id: number) => [...queryKeys.technicians.all, id] as const,
  },
};
